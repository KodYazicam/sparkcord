import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PERMISSION_BITS } from "../src/utils/discord-permissions.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const READMES = ["README.md", "README.tr.md", "README.de.md"] as const;

// The invite link prose in every README names exactly these permissions.
const INVITE_PERMISSIONS = [
  "ViewChannel",
  "SendMessages",
  "EmbedLinks",
  "ReadMessageHistory",
  "UseApplicationCommands",
] as const;
const INVITE_BITFIELD = INVITE_PERMISSIONS.reduce(
  (total, name) => total | PERMISSION_BITS[name],
  0n,
).toString();

function read(file: string): string {
  return readFileSync(join(root, file), "utf8");
}

function fences(text: string): string[] {
  return [...text.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map((match) => match[1].trim());
}

describe("translated READMEs", () => {
  it("ships every translation", () => {
    for (const file of READMES) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
  });

  it("links every language from every README", () => {
    for (const file of READMES) {
      const text = read(file);
      for (const target of READMES) {
        expect(text, `${file} must link ${target}`).toContain(`href="./${target}"`);
      }
    }
  });

  it("marks each translation as non-canonical", () => {
    for (const file of ["README.tr.md", "README.de.md"]) {
      const text = read(file);
      expect(text, file).toMatch(/^> .*README\.md/m);
      expect(text, file).toMatch(/İngilizce|englischen/);
    }
  });

  it("keeps code fences balanced", () => {
    for (const file of READMES) {
      const count = (read(file).match(/^```/gm) ?? []).length;
      expect(count % 2, `${file} has ${count} fence markers`).toBe(0);
    }
  });

  it("keeps every command snippet identical to the English source", () => {
    const english = new Set(fences(read("README.md")));
    for (const file of ["README.tr.md", "README.de.md"]) {
      for (const block of fences(read(file))) {
        expect(english.has(block), `${file} snippet drifted: ${block.split("\n")[0]}`).toBe(true);
      }
    }
  });

  it("keeps the library install snippet identical in every language", () => {
    const english = fences(read("README.md")).find((block) => block.includes("npm install ../sparkcord"));
    expect(english, "README.md must document the library install").toBeDefined();
    for (const file of READMES) {
      const snippet = fences(read(file)).find((block) => block.includes("npm install ../sparkcord"));
      expect(snippet, `${file} library install snippet`).toBe(english);
    }
  });

  it("keeps versions, identifiers and links in sync", () => {
    for (const file of READMES) {
      const text = read(file);
      expect(text, file).toContain("Node **20+**");
      expect(text, file).toContain("Node **22.6+**");
      expect(text, file).toContain(`permissions=${INVITE_BITFIELD}`);
      expect(text, file).toContain("Apache-2.0");
      expect(text, file).toContain("./LICENSE");
    }
    for (const file of ["README.tr.md", "README.de.md"]) {
      const text = read(file);
      expect(text, file).toContain("./CONTRIBUTING.md");
      expect(text, file).toContain("./SECURITY.md");
    }
  });

  it("documents an invite bitfield that matches the permissions it names", () => {
    expect(INVITE_BITFIELD).toBe("2147568640");
    for (const file of READMES) {
      const text = read(file);
      expect(text, file).toContain(`permissions=${INVITE_BITFIELD}`);
      expect(text, file).not.toContain("permissions=274877975552");
    }
  });
});
