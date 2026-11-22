import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = join(root, "templates", "basic");
const starterPackage = JSON.parse(readFileSync(join(template, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

function read(file: string): string {
  return readFileSync(file, "utf8");
}

function writeStub(dir: string, name: string, source: string): void {
  const packageDir = join(dir, "node_modules", name);
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify({ name, type: "module", main: "index.js" }),
  );
  writeFileSync(join(packageDir, "index.js"), source);
}

describe("starter start script", () => {
  it("does not pass --env-file, which would exit before load-env.ts runs", () => {
    expect(starterPackage.scripts.start).toBe("node --experimental-strip-types src/index.ts");
    expect(starterPackage.scripts.start).not.toContain("--env-file");
  });

  it("documents the command that the template actually ships", () => {
    for (const file of ["README.md", "README.tr.md", "README.de.md"]) {
      expect(read(join(root, file)), file).not.toContain("--env-file");
    }
    expect(read(join(template, "README.md"))).toContain("node --experimental-strip-types src/index.ts");
    expect(read(join(root, "README.md"))).toContain(
      "start = node --experimental-strip-types src/index.ts",
    );
  });

  it("reaches the project's missing-token message when .env is absent", () => {
    const parent = mkdtempSync(join(tmpdir(), "sparkcord-start-"));
    const dir = join(parent, "app");
    cpSync(template, dir, { recursive: true });
    // The template imports these before checking the token; stubs keep the
    // test focused on module evaluation order instead of installing npm deps.
    writeStub(
      dir,
      "discord.js",
      "export class Client {}\nexport const GatewayIntentBits = { Guilds: 1, GuildMessages: 2, MessageContent: 3 };\n",
    );
    writeStub(dir, "sparkcord", "export async function createSparkBot() { return { attach() {} }; }\n");

    const argv = starterPackage.scripts.start.split(/\s+/);
    expect(argv[0]).toBe("node");
    const result = spawnSync(process.execPath, argv.slice(1), {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, DISCORD_TOKEN: "" },
      timeout: 30_000,
    });

    expect(result.stderr).not.toContain(".env: not found");
    expect(result.stderr).toContain(
      "Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.",
    );
    expect(result.status).toBe(1);
  });
});
