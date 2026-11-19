import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SparkBot } from "../src/client.js";
import { toSlashPayload } from "../src/utils/slash.js";
import { validateDefinition } from "../src/validate.js";
import type { CommandDefinition } from "../src/types.js";

const search: CommandDefinition = {
  name: "search",
  description: "Search the catalog",
  kind: "slash",
  options: [
    { name: "query", description: "What to search for", type: "string", required: true, autocomplete: true },
  ],
  run: () => "ok",
};

describe("autocomplete option registration", () => {
  it("registers the option as autocompletable so Discord sends autocomplete interactions", () => {
    const payload = toSlashPayload(search);
    const options = payload.options as Array<Record<string, unknown>>;
    expect(options[0].autocomplete).toBe(true);
  });

  it("keeps the flag when SparkBot builds the registration payload", () => {
    const bot = new SparkBot({ commandsDir: mkdtempSync(join(tmpdir(), "sparkcord-")), autoRegister: false });
    bot.commands.register({ definition: search, path: "search.ts" });
    bot.interactions.onAutocomplete({ command: "search", run: () => [] });
    const [payload] = bot.slashPayload();
    const options = payload.options as Array<Record<string, unknown>>;
    expect(options[0].autocomplete).toBe(true);
  });

  it("leaves the payload shape unchanged for options that do not opt in", () => {
    const plain = toSlashPayload({ ...search, options: [{ name: "query", description: "q", type: "string" }] });
    const options = plain.options as Array<Record<string, unknown>>;
    expect(options[0]).not.toHaveProperty("autocomplete");
  });

  it("rejects autocomplete combined with choices", () => {
    const issues = validateDefinition(
      {
        ...search,
        options: [
          {
            name: "query",
            description: "What to search for",
            type: "string",
            autocomplete: true,
            choices: [{ name: "one", value: "one" }],
          },
        ],
      },
      "search.ts",
    );
    expect(issues.some((issue) => /autocomplete/i.test(issue.message) && /choices/i.test(issue.message))).toBe(true);
  });

  it("rejects autocomplete on a type Discord does not autocomplete", () => {
    const issues = validateDefinition(
      { ...search, options: [{ name: "flag", description: "toggle", type: "boolean", autocomplete: true }] },
      "search.ts",
    );
    expect(issues.some((issue) => /autocomplete/i.test(issue.message))).toBe(true);
  });

  it("rejects a non-boolean autocomplete flag", () => {
    const issues = validateDefinition(
      { ...search, options: [{ name: "query", description: "q", type: "string", autocomplete: "yes" as never }] },
      "search.ts",
    );
    expect(issues.some((issue) => /autocomplete/i.test(issue.message))).toBe(true);
  });

  it("still accepts autocomplete on integer and number options", () => {
    for (const type of ["integer", "number"] as const) {
      const issues = validateDefinition(
        { ...search, options: [{ name: "query", description: "q", type, autocomplete: true }] },
        "search.ts",
      );
      expect(issues.filter((issue) => /autocomplete/i.test(issue.message))).toHaveLength(0);
    }
  });
});
