import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { SparkBot } from "../src/client.js";
import { CommandRegistry } from "../src/handlers/registry.js";
import { checkCommandAccess } from "../src/utils/permissions.js";
import { CooldownStore } from "../src/utils/cooldown.js";
import { parsePrefixArgs, toSlashPayload } from "../src/utils/slash.js";
import { listModules } from "../src/loaders/files.js";
import { run } from "../src/cli.js";
import type { CommandDefinition } from "../src/types.js";

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

  it("tracks cooldown windows", () => {
    const store = new CooldownStore();
    expect(store.remaining("ping:1", 5, 1000)).toBe(0);
    expect(store.remaining("ping:1", 5, 2000)).toBeGreaterThan(0);
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
    const bot = new SparkBot({ commandsDir: dir, owners: ["owner"], prefix: "!" });
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
      raw: {},
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

  it("handles prefix messages", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-"));
    const bot = new SparkBot({ commandsDir: dir, prefix: "!" });
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
});
