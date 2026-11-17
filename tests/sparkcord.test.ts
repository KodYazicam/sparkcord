import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { SparkBot } from "../src/client.js";
import { CommandRegistry } from "../src/handlers/registry.js";
import { checkCommandAccess, isAdministrator } from "../src/utils/permissions.js";
import { CooldownStore } from "../src/utils/cooldown.js";
import { optionsFromPrefix, optionsFromSlash, parsePrefixArgs, toSlashPayload } from "../src/utils/slash.js";
import { InteractionRouter, customIdHead, interactionKind } from "../src/utils/interactions.js";
import { PERMISSION_BITS } from "../src/utils/discord-permissions.js";
import { PermissionFlagsBits } from "discord.js";
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
