import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCommands, validateDefinition } from "../src/validate.js";
import { validateDir } from "../src/cli.js";
import type { CommandDefinition } from "../src/types.js";

const ping: CommandDefinition = {
  name: "ping",
  description: "pong",
  run: () => "pong",
};

function messages(definition: unknown, path = "cmd.js"): string[] {
  return validateDefinition(definition as CommandDefinition, path).map((issue) => issue.message);
}

describe("validate command field types", () => {
  it("accepts a fully valid command", () => {
    expect(validateDefinition(ping, "ping.js")).toEqual([]);
  });

  it("rejects a non-string command name instead of testing its string coercion", () => {
    const numberName = messages({ ...ping, name: 42 });
    expect(numberName.some((m) => m.includes("name must be a string"))).toBe(true);

    const objectName = messages({ ...ping, name: { toString: () => "ping" } });
    expect(objectName.some((m) => m.includes("name must be a string"))).toBe(true);
  });

  it("rejects a non-string command description", () => {
    for (const description of [42, {}, [], true]) {
      const found = messages({ ...ping, description });
      expect(found.some((m) => m.includes("description must be a string")), JSON.stringify(description)).toBe(true);
    }
  });

  it("rejects a non-string option name", () => {
    const found = messages({ ...ping, options: [{ name: 42, description: "d" }] });
    expect(found.some((m) => m.includes("option 42") && m.includes("name must be a string"))).toBe(true);
  });

  it("rejects a non-string option description", () => {
    const found = messages({ ...ping, options: [{ name: "target", description: 42 }] });
    expect(found.some((m) => m.includes('option "target"') && m.includes("description must be a string"))).toBe(true);
  });

  it("keeps the existing string checks for valid types", () => {
    expect(messages({ ...ping, name: "Ping" }).some((m) => m.includes("name must be"))).toBe(true);
    expect(messages({ ...ping, description: "" }).some((m) => m.includes("description is required"))).toBe(true);
  });

  it("loads a real module with a numeric description and reports it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sparkcord-field-types-"));
    writeFileSync(
      join(dir, "broken.js"),
      'export default { name: "broken", description: 42, run: () => "x" };\n',
    );
    const { issues, commands } = await validateCommands(dir);
    expect(commands).toBe(1);
    expect(issues.some((issue) => issue.message.includes("description must be a string"))).toBe(true);
  });

  it("the validate CLI exits 1 for a numeric description and 0 for a valid one", async () => {
    const bad = mkdtempSync(join(tmpdir(), "sparkcord-cli-field-bad-"));
    writeFileSync(
      join(bad, "broken.js"),
      'export default { name: "broken", description: 42, run: () => 1 };\n',
    );
    expect(await validateDir(bad, bad)).toBe(1);

    const good = mkdtempSync(join(tmpdir(), "sparkcord-cli-field-good-"));
    writeFileSync(
      join(good, "ok.js"),
      'export default { name: "ping", description: "pong", run: () => "pong" };\n',
    );
    expect(await validateDir(good, good)).toBe(0);
  });
});
