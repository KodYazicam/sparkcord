import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
  files: string[];
  main: string;
  types: string;
  exports: Record<string, { types?: string; import?: string }>;
};

describe("package contract", () => {
  it("declares a prepare build so git dependencies ship dist", () => {
    expect(pkg.scripts.prepare).toBeDefined();
    expect(pkg.scripts.prepare).toContain("build");
    expect(pkg.files).toContain("dist");
    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg.types).toBe("./dist/index.d.ts");
    expect(pkg.exports["."]?.import).toBe("./dist/index.js");
  });

  it("ships dist in the packed tarball", () => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const out = execFileSync(npm, ["pack", "--json", "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });

    const [result] = JSON.parse(out) as [{ files: { path: string }[] }];
    const paths = result.files.map((file) => file.path);

    expect(paths).toContain("dist/index.js");
    expect(paths).toContain("dist/index.d.ts");
    expect(paths).toContain("dist/cli.js");
    expect(paths.some((path) => path.startsWith("templates/"))).toBe(true);
  }, 30_000);
});
