import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDir } from "../src/cli.js";
import { CommandRegistry } from "../src/handlers/registry.js";
import { validateCommands } from "../src/validate.js";
import type { CommandDefinition } from "../src/types.js";

function command(
  overrides: Partial<CommandDefinition> & Pick<CommandDefinition, "name">,
): CommandDefinition {
  return { description: "test command", run: () => "ok", ...overrides };
}

describe("registry name/alias collisions", () => {
  it("rejects a command name that is already an alias and keeps the alias working", () => {
    const reg = new CommandRegistry();
    const ban = command({ name: "ban", aliases: ["b"] });
    reg.register({ definition: ban, path: "ban.ts" });

    expect(() => reg.register({ definition: command({ name: "b" }), path: "z-b.ts" })).toThrow(
      /Duplicate command: b \(already an alias of ban\)/,
    );
    expect(reg.resolve("b")?.definition).toBe(ban);
  });

  it("keeps rejecting an alias that is already a command name", () => {
    const reg = new CommandRegistry();
    reg.register({ definition: command({ name: "ping" }), path: "ping.ts" });

    expect(() =>
      reg.register({ definition: command({ name: "other", aliases: ["ping"] }), path: "other.ts" }),
    ).toThrow(/Duplicate alias: ping/);
  });

  it("does not register a command when one of its aliases collides", () => {
    const reg = new CommandRegistry();
    reg.register({ definition: command({ name: "a", aliases: ["x"] }), path: "a.ts" });

    expect(() =>
      reg.register({ definition: command({ name: "b", aliases: ["z", "x"] }), path: "b.ts" }),
    ).toThrow(/Duplicate alias: x/);
    expect(reg.resolve("b")).toBeUndefined();
    expect(reg.resolve("z")).toBeUndefined();
    expect(reg.resolve("a")).toBeDefined();
  });

  it("rejects duplicate aliases inside one definition without keeping the first", () => {
    const reg = new CommandRegistry();

    expect(() =>
      reg.register({ definition: command({ name: "dup", aliases: ["same", "same"] }), path: "dup.ts" }),
    ).toThrow(/Duplicate alias: same/);
    expect(reg.resolve("dup")).toBeUndefined();
    expect(reg.resolve("same")).toBeUndefined();
  });

  it("rejects a malformed aliases field with a clear error instead of a TypeError", () => {
    const reg = new CommandRegistry();
    const malformed = { ...command({ name: "oops" }), aliases: 42 } as unknown as CommandDefinition;

    expect(() => reg.register({ definition: malformed, path: "oops.ts" })).toThrow(/Invalid aliases/);
    expect(reg.resolve("oops")).toBeUndefined();
  });
});

describe("validate name/alias collisions", () => {
  it("reports a command name that shadows an earlier alias and fails the CLI", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-alias-collision-"));
    writeFileSync(
      join(dir, "ban.js"),
      'export default { name: "ban", description: "ban", aliases: ["b"], run: () => "ok" };\n',
    );
    writeFileSync(
      join(dir, "z-b.js"),
      'export default { name: "b", description: "b", run: () => "ok" };\n',
    );

    const { issues, commands } = await validateCommands(dir);
    expect(commands).toBe(2);
    expect(issues.some((issue) => issue.message.includes("Duplicate command: b"))).toBe(true);
    expect(await validateDir(dir, dir)).toBe(1);
  });
});
