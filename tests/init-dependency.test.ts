import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sparkcord-init-"));
  dirs.push(dir);
  return dir;
}

describe("sparkcord init dependency", () => {
  it("points the generated project at this checkout", () => {
    const parent = tempDir();
    const target = join(parent, "my-bot");

    expect(run(["init", target], parent)).toBe(0);

    const packagePath = join(target, "package.json");
    const generated = JSON.parse(readFileSync(packagePath, "utf8")) as {
      dependencies: Record<string, string>;
    };
    const spec = generated.dependencies.sparkcord;

    expect(spec).toMatch(/^file:/);
    const resolved = resolve(dirname(packagePath), spec.slice("file:".length));
    expect(realpathSync(resolved)).toBe(realpathSync(root));

    const packageRoot = JSON.parse(readFileSync(join(resolved, "package.json"), "utf8")) as {
      name: string;
    };
    expect(packageRoot.name).toBe("sparkcord");
  });

  it("leaves an existing package.json alone without --force", () => {
    const parent = tempDir();
    const target = join(parent, "my-bot");
    const packagePath = join(target, "package.json");
    const original = JSON.stringify({ dependencies: { sparkcord: "1.2.3" } }, null, 2);

    mkdirSync(target, { recursive: true });
    writeFileSync(packagePath, original);

    expect(run(["init", target], parent)).toBe(1);
    expect(readFileSync(packagePath, "utf8")).toBe(original);
  });
});
