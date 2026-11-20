import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { invokedDirectly } from "../src/main.js";

const originalEntry = process.argv[1];

afterEach(() => {
  process.argv[1] = originalEntry ?? "";
});

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "sparkcord-cli-"));
}

describe("CLI entry detection", () => {
  it("recognises an npm bin symlink as the same file", () => {
    const dir = tempDir();
    try {
      const real = join(dir, "cli.mjs");
      const link = join(dir, "sparkcord");
      writeFileSync(real, "#!/usr/bin/env node\n");
      // npm installs package bin entries as symlinks; Node resolves the module
      // but keeps process.argv[1] on the link path.
      symlinkSync(real, link);
      process.argv[1] = link;
      expect(invokedDirectly(pathToFileURL(real).href)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still recognises a direct real-path invocation", () => {
    const dir = tempDir();
    try {
      const real = join(dir, "cli.mjs");
      writeFileSync(real, "#!/usr/bin/env node\n");
      process.argv[1] = real;
      expect(invokedDirectly(pathToFileURL(real).href)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still rejects a different entry file", () => {
    const dir = tempDir();
    try {
      const real = join(dir, "cli.mjs");
      const other = join(dir, "other.mjs");
      writeFileSync(real, "#!/usr/bin/env node\n");
      writeFileSync(other, "#!/usr/bin/env node\n");
      process.argv[1] = other;
      expect(invokedDirectly(pathToFileURL(real).href)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
