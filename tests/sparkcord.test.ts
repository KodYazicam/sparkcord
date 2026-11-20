import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { SparkBot } from "../src/client.js";
import { CommandRegistry } from "../src/handlers/registry.js";
import { checkCommandAccess, isAdministrator } from "../src/utils/permissions.js";
import { CooldownStore } from "../src/utils/cooldown.js";
import { optionsFromPrefix, optionsFromSlash, parsePrefixArgs, replyTo, toSlashPayload } from "../src/utils/slash.js";
import { InteractionRouter, customIdHead, interactionKind } from "../src/utils/interactions.js";
import { PERMISSION_BITS } from "../src/utils/discord-permissions.js";
import { CommandInteractionOptionResolver, PermissionFlagsBits } from "discord.js";
import { listModules } from "../src/loaders/files.js";
import { run, validateDir } from "../src/cli.js";
import { validateDefinition, validateCommands } from "../src/validate.js";
import { packageVersion } from "../src/version.js";
import type { CommandDefinition, LoadedEvent } from "../src/types.js";

const ping: CommandDefinition = {
  name: "ping",
  description: "pong",
  kind: "both",
  cooldown: 5,
  aliases: ["p"],
  run: async () => "pong",
};

const secret: CommandDefinition = {
  name: "secret",
  description: "owner",
  ownerOnly: true,
  run: async () => "ok",
};

describe("registry + slash", () => {
  it("resolves aliases and builds slash payload", () => {
    const reg = new CommandRegistry();
    reg.register({ definition: ping, path: "ping.ts" });
    expect(reg.resolve("p")?.definition.name).toBe("ping");
    expect(toSlashPayload(ping).name).toBe("ping");
  });

  it("maps slash and prefix options", () => {
    expect(optionsFromSlash({ options: { data: [{ name: "a", value: 1 }] } })).toEqual({ a: 1 });
    expect(optionsFromSlash({})).toEqual({});
    expect(
      optionsFromPrefix(
        ["5", "true", "hello"],
        [
          { name: "count", description: "count", type: "integer" },
          { name: "flag", description: "flag", type: "boolean" },
          { name: "text", description: "text", type: "string" },
        ],
      ),
    ).toEqual({ count: 5, flag: true, text: "hello" });
  });

  it("reports the package version with a fallback", () => {
    expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+/);
    expect(packageVersion("file:///nonexistent/version.js")).toBe("1.0.0");
  });
});

describe("permissions + cooldown", () => {
  it("blocks owner-only and guild-only", () => {
    expect(
      checkCommandAccess(secret, { userId: "1", inGuild: true }, ["2"]),
    ).toMatch(/owner/i);
    expect(
      checkCommandAccess(
        { ...ping, guildOnly: true, permissions: ["BanMembers"] },
        { userId: "1", inGuild: true, memberPermissions: new Set() },
      ),
    ).toMatch(/BanMembers/);
  });

  it("lets Administrator satisfy the command permissions", () => {
    const mod: CommandDefinition = { ...ping, guildOnly: true, permissions: ["ManageMessages", "BanMembers"] };
    const admin = { userId: "1", inGuild: true, memberPermissions: new Set(["Administrator"]) };
    expect(checkCommandAccess(mod, admin)).toBeNull();
    expect(checkCommandAccess(mod, { ...admin, inGuild: false })).toMatch(/server/i);
    expect(
      checkCommandAccess({ ...ping, ownerOnly: true, permissions: ["ManageMessages"] }, admin, []),
    ).toMatch(/owner/i);
    expect(
      checkCommandAccess(mod, { ...admin, memberPermissions: new Set(["ManageMessages"]) }),
    ).toMatch(/BanMembers/);
  });

  it("matches declared permissions case-insensitively and by bit", () => {
    expect(
      checkCommandAccess(
        { ...ping, guildOnly: true, permissions: ["banmembers"] },
        { userId: "1", inGuild: true, memberPermissions: new Set(["BanMembers"]) },
      ),
    ).toBeNull();
    expect(
      checkCommandAccess(
        { ...ping, guildOnly: true, permissions: ["ManageEmojisAndStickers"] },
        { userId: "1", inGuild: true, memberPermissions: new Set(["ManageGuildExpressions"]) },
      ),
    ).toBeNull();
  });

  it("still denies a missing or unknown permission", () => {
    expect(
      checkCommandAccess(
        { ...ping, guildOnly: true, permissions: ["banmembers"] },
        { userId: "1", inGuild: true, memberPermissions: new Set(["SendMessages"]) },
      ),
    ).toMatch(/banmembers/);
    expect(
      checkCommandAccess(
        { ...ping, guildOnly: true, permissions: ["FuturePermission"] },
        { userId: "1", inGuild: true, memberPermissions: new Set(["SendMessages"]) },
      ),
    ).toMatch(/FuturePermission/);
    expect(
      checkCommandAccess(
        { ...ping, guildOnly: true, permissions: ["futurepermission"] },
        { userId: "1", inGuild: true, memberPermissions: new Set(["FuturePermission"]) },
      ),
    ).toBeNull();
  });

  it("detects the Administrator flag in any capitalisation", () => {
    expect(isAdministrator(new Set(["Administrator"]))).toBe(true);
    expect(isAdministrator(new Set(["ADMINISTRATOR", "SendMessages"]))).toBe(true);
    expect(isAdministrator(new Set(["ManageGuild", "SendMessages"]))).toBe(false);
    expect(isAdministrator(new Set())).toBe(false);
    expect(isAdministrator(undefined)).toBe(false);
  });

  it("tracks cooldown windows", () => {
    const store = new CooldownStore();
    expect(store.remaining("ping:1", 5, 1000)).toBe(0);
    expect(store.remaining("ping:1", 5, 2000)).toBeGreaterThan(0);
  });
});

describe("slash permission visibility", () => {
  const gated: CommandDefinition = { ...ping, permissions: ["BanMembers", "ManageMessages"] };

  it("sends default_member_permissions for gated commands", () => {
    expect(toSlashPayload(gated).default_member_permissions).toBe("8196");
    expect(toSlashPayload({ ...ping, permissions: ["Administrator"] }).default_member_permissions).toBe("8");
  });

  it("omits the field when no permissions are declared", () => {
    expect(toSlashPayload(ping)).not.toHaveProperty("default_member_permissions");
    expect(toSlashPayload({ ...ping, permissions: [] })).not.toHaveProperty("default_member_permissions");
  });

  it("matches names case-insensitively and ORs duplicates", () => {
    expect(
      toSlashPayload({ ...ping, permissions: ["banmembers", "BANMEMBERS", "ManageMessages"] })
        .default_member_permissions,
    ).toBe("8196");
  });

  it("throws on an unknown permission instead of registering a public command", () => {
    expect(() => toSlashPayload({ ...ping, permissions: ["BanMember"] })).toThrow(/BanMember/);
  });

  it("carries the field through SparkBot.slashPayload", () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-"));
    const bot = new SparkBot({ commandsDir: dir, prefix: "!" });
    bot.commands.register({ definition: gated, path: "gated.ts" });
    expect(bot.slashPayload()).toEqual([
      expect.objectContaining({ name: "ping", default_member_permissions: "8196" }),
    ]);
  });

  it("keeps every mapped flag in sync with discord.js", () => {
    for (const [name, bits] of Object.entries(PERMISSION_BITS)) {
      expect({ name, bits }).toEqual({
        name,
        bits: PermissionFlagsBits[name as keyof typeof PermissionFlagsBits],
      });
    }
  });
});

describe("interaction router", () => {
  it("routes allowlisted custom ids and rejects path-like ids", async () => {
    const router = new InteractionRouter();
    let seen = "";
    router.onComponent({
      customId: "ticket",
      run: ({ args }) => {
        seen = args.join(",");
        return "ok";
      },
    });
    expect(customIdHead({ customId: "../etc/passwd" })).toBeNull();
    expect(interactionKind({ isButton: () => true })).toBe("button");
    const result = await router.dispatch({ isButton: () => true, customId: "ticket_close_12" }, null);
    expect(result.ok).toBe(true);
    expect(seen).toBe("close,12");
  });

  it("routes every Discord select menu flavour to component handlers", async () => {
    const flavours = [
      "isStringSelectMenu",
      "isUserSelectMenu",
      "isRoleSelectMenu",
      "isMentionableSelectMenu",
      "isChannelSelectMenu",
    ] as const;

    for (const flavour of flavours) {
      expect(interactionKind({ [flavour]: () => true })).toBe("select");
    }
    expect(interactionKind({ isAnySelectMenu: () => true })).toBe("select");

    const router = new InteractionRouter();
    let seen = "";
    router.onComponent({
      customId: "settings",
      run: ({ args }) => {
        seen = args.join(",");
        return "ok";
      },
    });

    const result = await router.dispatch(
      { isChannelSelectMenu: () => true, customId: "settings_channel_7" },
      null,
    );
    expect(result).toEqual({ ok: true, value: "ok" });
    expect(seen).toBe("channel,7");
  });

  it("passes the typed focused value to autocomplete handlers", async () => {
    // Use discord.js' real resolver: getFocused(true) returns the whole option
    // object, so only getFocused() yields what the user typed.
    const Resolver = CommandInteractionOptionResolver as unknown as new (
      client: unknown,
      options: readonly unknown[],
      resolved: unknown,
    ) => { getFocused: (getFull?: boolean) => unknown };
    const options = new Resolver(
      {},
      [{ name: "query", type: 3, value: "spark", focused: true }],
      null,
    );
    expect(options.getFocused()).toBe("spark");

    const router = new InteractionRouter();
    let focused = "";
    router.onAutocomplete({
      command: "search",
      run: ({ focused: value }) => {
        focused = value;
        return [];
      },
    });

    const result = await router.dispatch(
      { isAutocomplete: () => true, commandName: "search", options },
      null,
    );
    expect(result.ok).toBe(true);
    expect(focused).toBe("spark");
  });

  it("reads .value from a resolver that returns the full focused option", async () => {
    const resolver = {
      getFocused: () => ({ name: "query", value: "spark", focused: true }),
    };
    const router = new InteractionRouter();
    let focused = "";
    router.onAutocomplete({
      command: "search",
      run: ({ focused: value }) => {
        focused = value;
        return [];
      },
    });

    await router.dispatch(
      { isAutocomplete: () => true, commandName: "search", options: resolver },
      null,
    );
    expect(focused).toBe("spark");
  });

  it("falls back to an empty query when no focused option exists", async () => {
    const resolver = {
      getFocused: () => {
        throw new Error("focused option not found");
      },
    };
    const router = new InteractionRouter();
    let focused = "unset";
    router.onAutocomplete({
      command: "search",
      run: ({ focused: value }) => {
        focused = value;
        return [];
      },
    });

    const result = await router.dispatch(
      { isAutocomplete: () => true, commandName: "search", options: resolver },
      null,
    );
    expect(result.ok).toBe(true);
    expect(focused).toBe("");
  });
});

describe("prefix parser", () => {
  it("parses name and args", () => {
    expect(parsePrefixArgs("!ban 123 spam", "!")).toEqual({
      name: "ban",
      args: ["123", "spam"],
    });
    expect(parsePrefixArgs("hello", "!")).toBeNull();
  });
});

describe("reply helper", () => {
  function interaction(overrides: Record<string, unknown> = {}) {
    const calls: string[] = [];
    const raw = {
      deferred: false,
      replied: false,
      reply: async (payload: unknown) => {
        calls.push("reply");
        return payload;
      },
      editReply: async (payload: unknown) => {
        calls.push("editReply");
        return payload;
      },
      followUp: async (payload: unknown) => {
        calls.push("followUp");
        return payload;
      },
      ...overrides,
    };
    return { raw, calls };
  }

  it("completes a deferred interaction with editReply", async () => {
    const { raw, calls } = interaction({ deferred: true });
    await replyTo(raw, "done");
    expect(calls).toEqual(["editReply"]);
  });

  it("keeps the ephemeral flag when editing a deferred reply", async () => {
    const { raw, calls } = interaction({ deferred: true });
    const payload = await replyTo(raw, "only you", { ephemeral: true });
    expect(calls).toEqual(["editReply"]);
    expect(payload).toEqual({ content: "only you", ephemeral: true });
  });

  it("replies once and then follows up", async () => {
    const first = interaction();
    await replyTo(first.raw, "hello");
    expect(first.calls).toEqual(["reply"]);

    const second = interaction({ replied: true });
    await replyTo(second.raw, "again");
    expect(second.calls).toEqual(["followUp"]);
  });

  it("edits the placeholder when a command replies after deferReply()", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-"));
    const bot = new SparkBot({ commandsDir: dir, prefix: "!", denyReplies: false });
    bot.commands.register({
      definition: {
        name: "slow",
        description: "slow",
        kind: "slash",
        run: async (ctx) => ctx.reply("finished"),
      },
      path: "slow.ts",
    });
    const { raw, calls } = interaction({ deferred: true });
    const result = await bot.invoke("slow", {
      userId: "u1",
      inGuild: true,
      memberPermissions: new Set(),
      raw,
      kind: "slash",
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["editReply"]);
  });
});

describe("SparkBot invoke", () => {
  it("runs commands, enforces cooldown and owners", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-"));
    const bot = new SparkBot({ commandsDir: dir, owners: ["owner"], prefix: "!", denyReplies: false });
    bot.commands.register({ definition: ping, path: "ping.ts" });
    bot.commands.register({ definition: secret, path: "secret.ts" });

    const ok = await bot.invoke("ping", {
      userId: "u1",
      inGuild: true,
      memberPermissions: new Set(),
      raw: {},
      kind: "slash",
    });
    expect(ok).toEqual({ ok: true, value: "pong" });

    const cd = await bot.invoke("ping", {
      userId: "u1",
      inGuild: true,
      memberPermissions: new Set(),
      raw: {},
      kind: "slash",
    });
    expect(cd.ok).toBe(false);
    expect(cd.reason).toBe("cooldown");

    const denied = await bot.invoke("secret", {
      userId: "u1",
      inGuild: true,
      memberPermissions: new Set(),
      raw: { reply: async () => undefined },
      kind: "slash",
    });
    expect(denied.ok).toBe(false);

    const owner = await bot.invoke("secret", {
      userId: "owner",
      inGuild: true,
      memberPermissions: new Set(),
      raw: {},
      kind: "slash",
    });
    expect(owner.ok).toBe(true);
  });

  it("registers slash commands if the client is already ready", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-"));
    const bot = new SparkBot({ commandsDir: dir, prefix: "!" });
    bot.commands.register({ definition: ping, path: "ping.ts" });
    let registered = 0;
    const client = {
      user: { id: "1", tag: "bot#0000" },
      on: () => client,
      once: () => client,
      application: {
        commands: {
          set: async () => {
            registered += 1;
            return [];
          },
        },
      },
    };
    bot.attach(client);
    await new Promise((r) => setTimeout(r, 0));
    expect(registered).toBe(1);
    expect(bot.ready).toBe(true);
  });

  it("handles prefix messages", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-"));
    const bot = new SparkBot({ commandsDir: dir, prefix: "!", denyReplies: false });
    bot.commands.register({ definition: ping, path: "ping.ts" });
    const result = await bot.handleMessage({
      author: { bot: false, id: "u2" },
      content: "!p",
      guildId: "g",
      member: { permissions: { toArray: () => [] } },
    });
    expect(result.ok).toBe(true);
  });
});

describe("command failure logging", () => {
  const boom: CommandDefinition = {
    name: "boom",
    description: "always throws",
    run: () => {
      throw new Error("boom exploded");
    },
  };

  async function captureErrors<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
    const original = console.error;
    const lines: string[] = [];
    console.error = (...args: unknown[]) => {
      lines.push(args.map((arg) => String(arg)).join(" "));
    };
    try {
      return { result: await fn(), lines };
    } finally {
      console.error = original;
    }
  }

  it("logs a prefix command failure with the command name", async () => {
    const bot = new SparkBot({
      commandsDir: mkdtempSync(join(tmpdir(), "sparkcord-")),
      prefix: "!",
      denyReplies: false,
    });
    bot.commands.register({ definition: boom, path: "boom.ts" });

    const { result, lines } = await captureErrors(() =>
      bot.handleMessage({
        author: { bot: false, id: "u3" },
        content: "!boom",
        guildId: "g",
        member: { permissions: { toArray: () => [] } },
      }),
    );

    expect(result).toEqual({ ok: false, reason: "boom exploded" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[sparkcord]");
    expect(lines[0]).toContain("command boom failed");
    expect(lines[0]).toContain("boom exploded");
  });

  it("logs a slash command failure and still replies generically", async () => {
    const bot = new SparkBot({
      commandsDir: mkdtempSync(join(tmpdir(), "sparkcord-")),
      denyReplies: true,
    });
    bot.commands.register({ definition: boom, path: "boom.ts" });
    const replies: unknown[] = [];

    const { result, lines } = await captureErrors(() =>
      bot.handleInteraction({
        isChatInputCommand: () => true,
        commandName: "boom",
        user: { id: "u4" },
        guildId: "g",
        member: { permissions: { toArray: () => [] } },
        options: { data: [] },
        reply: async (payload: unknown) => {
          replies.push(payload);
        },
      }),
    );

    expect(result).toEqual({ ok: false, reason: "boom exploded" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("command boom failed");
    expect(replies).toEqual([{ content: "Command failed. Check the bot logs.", ephemeral: true }]);
  });
});

describe("file listing + cli", () => {
  it("lists command modules and prints help", () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-mod-"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "ping.ts"), "export default {}");
    writeFileSync(join(dir, "skip.d.ts"), "export {}");
    expect(listModules(dir).some((p) => p.endsWith("ping.ts"))).toBe(true);
    expect(listModules(dir).some((p) => p.endsWith(".d.ts"))).toBe(false);
    expect(run(["--help"])).toBe(0);
    expect(pathToFileURL(dir).href).toContain("file:");
  });

  it("scaffolds a starter bot", () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-init-"));
    expect(run(["init", dir])).toBe(0);
    expect(existsSync(join(dir, "package.json"))).toBe(true);
    expect(existsSync(join(dir, "src", "commands", "ping.ts"))).toBe(true);
    expect(existsSync(join(dir, "src", "load-env.ts"))).toBe(true);
  });
});

describe("loader test/spec exclusion", () => {
  const rel = (dir: string) => listModules(dir).map((p) => p.slice(dir.length + 1));

  it("skips test and spec modules for every code extension it scans", () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-skip-"));
    const files = [
      "ping.js",
      "latest.js",
      "contest.js",
      "inspect.js",
      "ping.test.js",
      "ping.spec.mjs",
      "ping.test.cjs",
      "ping.spec.ts",
      "ping.d.ts",
      "ping.d.mts",
      "ping.test.mts",
    ];
    for (const name of files) {
      writeFileSync(join(dir, name), "export default { name: 'x', description: 'x', run: () => 1 };\n");
    }
    expect(rel(dir)).toEqual(["contest.js", "inspect.js", "latest.js", "ping.js"]);
  });

  it("validateCommands ignores colocated test files instead of aborting", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-validate-skip-"));
    writeFileSync(
      join(dir, "ping.js"),
      'export default { name: "ping", description: "pong", run: () => "pong" };\n',
    );
    writeFileSync(join(dir, "ping.test.js"), "export const cases = [];\n");
    const { issues, commands } = await validateCommands(dir);
    expect(issues).toEqual([]);
    expect(commands).toBe(1);
  });
});

describe("validate", () => {
  it("reports definition problems without touching Discord", () => {
    const bad = {
      name: "Ping",
      description: "",
      kind: "global" as const,
      cooldown: -2,
      guildOnly: "yes",
      aliases: ["P"],
      options: [{ name: "User Input!", description: "", type: "text" }],
      run: () => undefined,
    };
    const messages = validateDefinition(bad as unknown as CommandDefinition, "bad.js").map((i) => i.message);
    expect(messages.some((m) => m.includes("name must be"))).toBe(true);
    expect(messages.some((m) => m.includes("description is required"))).toBe(true);
    expect(messages.some((m) => m.includes("kind must be"))).toBe(true);
    expect(messages.some((m) => m.includes("cooldown must be"))).toBe(true);
    expect(messages.some((m) => m.includes("guildOnly must be"))).toBe(true);
    expect(messages.some((m) => m.includes("lowercase"))).toBe(true);
    expect(messages.some((m) => m.includes("unknown type"))).toBe(true);
    expect(validateDefinition(ping, "ping.js")).toEqual([]);
  });

  it("flags unknown Discord permission names", () => {
    const messages = validateDefinition(
      { ...ping, permissions: ["BanMembers", "BanMember"] },
      "ban.js",
    ).map((i) => i.message);
    expect(messages.some((m) => m.includes("BanMember"))).toBe(true);
  });

  it("loads a real directory, catches duplicates, and counts commands", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-validate-"));
    writeFileSync(
      join(dir, "good.js"),
      'export default { name: "ping", description: "pong", run: () => "pong" };\n',
    );
    writeFileSync(
      join(dir, "bad.js"),
      'export default { name: "Ping", description: "", run: () => "x" };\n',
    );
    writeFileSync(
      join(dir, "dupe.js"),
      'export default { name: "ping", description: "again", run: () => "x" };\n',
    );
    const { issues, commands } = await validateCommands(dir);
    expect(commands).toBe(3);
    const messages = issues.map((i) => i.message);
    expect(messages.some((m) => m.includes("name must be"))).toBe(true);
    expect(messages.some((m) => m.includes("description is required"))).toBe(true);
    expect(messages.some((m) => m.includes("Duplicate command"))).toBe(true);

    const clean = mkdtempSync(join(tmpdir(), "sparkcord-clean-"));
    writeFileSync(
      join(clean, "only.js"),
      'export default { name: "ping", description: "pong", run: () => "pong" };\n',
    );
    const ok = await validateCommands(clean);
    expect(ok.issues).toEqual([]);
    expect(ok.commands).toBe(1);
  });

  it("the validate CLI command exits 1 on a bad directory and 0 on a clean one", async () => {
    const bad = mkdtempSync(join(tmpdir(), "sparkcord-cli-bad-"));
    writeFileSync(
      join(bad, "bad.js"),
      'export default { name: "Nope", description: "", run: () => 1 };\n',
    );
    expect(await validateDir(bad, bad)).toBe(1);

    const good = mkdtempSync(join(tmpdir(), "sparkcord-cli-good-"));
    mkdirSync(join(good, "commands"));
    writeFileSync(
      join(good, "commands", "ok.js"),
      'export default { name: "ping", description: "pong", run: () => "pong" };\n',
    );
    expect(await validateDir(undefined, good)).toBe(0);
  });
});

describe("validate Discord option limits", () => {
  it("rejects a required option that follows an optional one", () => {
    const messages = validateDefinition(
      {
        ...ping,
        options: [
          { name: "reason", description: "why", type: "string" },
          { name: "target", description: "who", type: "user", required: true },
        ],
      },
      "warn.js",
    ).map((i) => i.message);
    expect(messages.some((m) => m.includes('option "target"') && m.includes("required"))).toBe(true);
  });

  it("rejects option descriptions longer than Discord's 100 character cap", () => {
    const messages = validateDefinition(
      { ...ping, options: [{ name: "reason", description: "x".repeat(101), type: "string" }] },
      "warn.js",
    ).map((i) => i.message);
    expect(messages.some((m) => m.includes("100"))).toBe(true);
  });

  it("rejects more than 25 options like Discord does", () => {
    const options = Array.from({ length: 26 }, (_, i) => ({
      name: `opt${i}`,
      description: "an option",
      type: "string" as const,
    }));
    const messages = validateDefinition({ ...ping, options }, "many.js").map((i) => i.message);
    expect(messages.some((m) => m.includes("25"))).toBe(true);
  });

  it("rejects choices on an option type that cannot carry them", () => {
    const messages = validateDefinition(
      {
        ...ping,
        options: [
          { name: "target", description: "who", type: "user", choices: [{ name: "me", value: "1" }] },
        ],
      },
      "warn.js",
    ).map((i) => i.message);
    expect(messages.some((m) => m.includes("choices") && m.includes("string"))).toBe(true);
  });

  it("rejects more than 25 choices and overlong choice values", () => {
    const tooMany = Array.from({ length: 26 }, (_, i) => ({ name: `c${i}`, value: `v${i}` }));
    const manyMessages = validateDefinition(
      { ...ping, options: [{ name: "pick", description: "pick", type: "string", choices: tooMany }] },
      "pick.js",
    ).map((i) => i.message);
    expect(manyMessages.some((m) => m.includes("25"))).toBe(true);

    const longValue = validateDefinition(
      {
        ...ping,
        options: [
          { name: "pick", description: "pick", type: "string", choices: [{ name: "long", value: "v".repeat(101) }] },
        ],
      },
      "pick.js",
    ).map((i) => i.message);
    expect(longValue.some((m) => m.includes("100"))).toBe(true);
  });

  it("still accepts a well-formed command with choices", () => {
    expect(
      validateDefinition(
        {
          ...ping,
          options: [
            { name: "mode", description: "play mode", type: "string", required: true, choices: [{ name: "fast", value: "fast" }] },
            { name: "note", description: "optional note", type: "string" },
          ],
        },
        "good.js",
      ),
    ).toEqual([]);
  });
});

describe("validate option names and value types", () => {
  const messagesFor = (definition: CommandDefinition) =>
    validateDefinition(definition, "options.js").map((issue) => issue.message);

  it("rejects duplicate option names in one command", () => {
    const messages = messagesFor({
      ...ping,
      options: [
        { name: "user", description: "first target", type: "user" },
        { name: "user", description: "second target", type: "user" },
      ],
    });
    expect(
      messages.some((message) => message.includes('option "user"') && message.includes("duplicat")),
    ).toBe(true);
  });

  it("rejects a non-boolean required flag", () => {
    const messages = messagesFor({
      ...ping,
      options: [{ name: "user", description: "who", type: "user", required: "yes" as unknown as boolean }],
    });
    expect(
      messages.some(
        (message) =>
          message.includes('option "user"') && message.includes("required") && message.includes("boolean"),
      ),
    ).toBe(true);
  });

  it("rejects a string choice value on an integer option", () => {
    const messages = messagesFor({
      ...ping,
      options: [{ name: "count", description: "how many", type: "integer", choices: [{ name: "one", value: "1" }] }],
    });
    expect(
      messages.some((message) => message.includes('option "count"') && message.includes("integer")),
    ).toBe(true);
  });

  it("rejects fractional and out-of-range choice values on an integer option", () => {
    const fractional = messagesFor({
      ...ping,
      options: [{ name: "count", description: "how many", type: "integer", choices: [{ name: "half", value: 1.5 }] }],
    });
    expect(fractional.some((message) => message.includes('choice "half"'))).toBe(true);

    const tooLarge = messagesFor({
      ...ping,
      options: [
        {
          name: "count",
          description: "how many",
          type: "integer",
          choices: [{ name: "huge", value: Number.MAX_SAFE_INTEGER + 2 }],
        },
      ],
    });
    expect(tooLarge.some((message) => message.includes('choice "huge"'))).toBe(true);
  });

  it("rejects non-numeric choice values on a number option", () => {
    const messages = messagesFor({
      ...ping,
      options: [{ name: "score", description: "how much", type: "number", choices: [{ name: "na", value: "n/a" }] }],
    });
    expect(messages.some((message) => message.includes('option "score"') && message.includes("number"))).toBe(
      true,
    );
  });

  it("rejects non-string choice values on a string option", () => {
    const messages = messagesFor({
      ...ping,
      options: [{ name: "mode", description: "play mode", type: "string", choices: [{ name: "one", value: 1 }] }],
    });
    expect(
      messages.some((message) => message.includes('option "mode"') && message.includes("string")),
    ).toBe(true);
  });

  it("accepts unique names, boolean required, and matching choice value types", () => {
    expect(
      messagesFor({
        ...ping,
        options: [
          { name: "mode", description: "play mode", type: "string", required: true, choices: [{ name: "fast", value: "fast" }] },
          { name: "count", description: "how many", type: "integer", required: false, choices: [{ name: "one", value: 1 }] },
          { name: "score", description: "how much", type: "number", choices: [{ name: "half", value: 0.5 }] },
        ],
      }),
    ).toEqual([]);
  });
});

describe("handler error containment", () => {
  const boom = {
    customId: "boom",
    run: () => {
      throw new Error("handler exploded");
    },
  };

  async function captureErrors<T>(fn: () => Promise<T>): Promise<T> {
    const original = console.error;
    console.error = () => undefined;
    try {
      return await fn();
    } finally {
      console.error = original;
    }
  }

  it("returns ok:false when a component handler throws", async () => {
    const bot = new SparkBot({ commandsDir: mkdtempSync(join(tmpdir(), "sparkcord-")), autoRegister: false });
    bot.interactions.onComponent(boom);
    const result = await captureErrors(() =>
      bot.handleInteraction({ isButton: () => true, customId: "boom_42", user: { id: "u1" } }),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("handler exploded");
  });

  it("returns ok:false when an autocomplete handler throws", async () => {
    const bot = new SparkBot({ commandsDir: mkdtempSync(join(tmpdir(), "sparkcord-")), autoRegister: false });
    bot.interactions.onAutocomplete({
      command: "search",
      run: () => {
        throw new Error("autocomplete exploded");
      },
    });
    const result = await captureErrors(() =>
      bot.handleInteraction({ isAutocomplete: () => true, commandName: "search", user: { id: "u1" } }),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("autocomplete exploded");
  });

  it("keeps a handler failure in a gateway listener off the unhandled-rejection path", async () => {
    const bot = new SparkBot({ commandsDir: mkdtempSync(join(tmpdir(), "sparkcord-")), autoRegister: false });
    bot.interactions.onComponent(boom);
    const listeners: Record<string, Array<(arg: unknown) => unknown>> = {};
    const client = {
      user: null,
      on: (event: string, fn: (arg: unknown) => unknown) => {
        (listeners[event] ??= []).push(fn);
        return client;
      },
      once: () => client,
    };
    bot.attach(client);

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    const original = console.error;
    console.error = () => undefined;
    process.on("unhandledRejection", onUnhandled);
    try {
      listeners.interactionCreate[0]({ isButton: () => true, customId: "boom_1", user: { id: "u1" } });
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      process.off("unhandledRejection", onUnhandled);
      console.error = original;
    }
    expect(unhandled).toEqual([]);
  });
});

describe("event error containment", () => {
  function attachEvents(events: LoadedEvent[]) {
    const bot = new SparkBot({
      commandsDir: mkdtempSync(join(tmpdir(), "sparkcord-")),
      autoRegister: false,
    });
    bot.events = events;
    const registered: Array<{ mode: string; name: string; listener: (...args: unknown[]) => unknown }> = [];
    const client = {
      user: null,
      on: (name: string, listener: (...args: unknown[]) => unknown) => {
        registered.push({ mode: "on", name, listener });
        return client;
      },
      once: (name: string, listener: (...args: unknown[]) => unknown) => {
        registered.push({ mode: "once", name, listener });
        return client;
      },
    };
    bot.attach(client);
    return { bot, registered };
  }

  function captureErrors<T>(fn: () => T): { result: T; logs: string[] } {
    const original = console.error;
    const logs: string[] = [];
    console.error = (...args: unknown[]) => {
      logs.push(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" "));
    };
    try {
      return { result: fn(), logs };
    } finally {
      console.error = original;
    }
  }

  const syncBoom: LoadedEvent = {
    path: "boom.ts",
    definition: {
      name: "boom",
      run: () => {
        throw new Error("event exploded");
      },
    },
  };

  const asyncBoom: LoadedEvent = {
    path: "async-boom.ts",
    definition: {
      name: "asyncBoom",
      once: true,
      run: async () => {
        throw new Error("async event exploded");
      },
    },
  };

  it("contains a synchronous throw from an event handler", () => {
    const { registered } = attachEvents([syncBoom]);
    const registration = registered.find((entry) => entry.name === "boom");
    expect(registration?.mode).toBe("on");

    const { logs } = captureErrors(() => {
      expect(() => registration?.listener()).not.toThrow();
      return null;
    });

    expect(logs.some((line) => line.includes("event boom failed"))).toBe(true);
    expect(logs.some((line) => line.includes("event exploded"))).toBe(true);
  });

  it("contains a rejected promise from an async event handler", async () => {
    const { registered } = attachEvents([asyncBoom]);
    const registration = registered.find((entry) => entry.name === "asyncBoom");
    expect(registration?.mode).toBe("once");

    const original = console.error;
    const logs: string[] = [];
    console.error = (...args: unknown[]) => {
      logs.push(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" "));
    };
    try {
      await expect(Promise.resolve(registration?.listener())).resolves.toBeUndefined();
    } finally {
      console.error = original;
    }

    expect(logs.some((line) => line.includes("event asyncBoom failed"))).toBe(true);
    expect(logs.some((line) => line.includes("async event exploded"))).toBe(true);
  });

  it("forwards the bot context and arguments and keeps successful return values", () => {
    let seen: unknown[] = [];
    const ok: LoadedEvent = {
      path: "ok.ts",
      definition: {
        name: "ok",
        run: (ctx, ...args) => {
          seen = [ctx, ...args];
          return "done";
        },
      },
    };
    const { bot, registered } = attachEvents([ok]);
    const registration = registered.find((entry) => entry.name === "ok");
    expect(registration?.listener("a", 1)).toBe("done");
    expect(seen[0]).toEqual({ bot, client: expect.anything() });
    expect(seen.slice(1)).toEqual(["a", 1]);
  });
});
