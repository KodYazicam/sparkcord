#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { invokedDirectly } from "./main.js";
import { packageVersion } from "./version.js";

function help(): string {
  return `
sparkcord — file-based Discord.js v14 framework

Drop a file in commands/. Slash, prefix, cooldowns, and permissions
are wired for you. Tests never need a Discord token.

Usage:
  node dist/cli.js init [dir]     Scaffold a starter bot (Node 22.6+)
  node dist/cli.js --help
  node dist/cli.js --version

The library itself runs on Node 20+ with compiled .js command files.
The starter uses --experimental-strip-types, so it needs Node 22.6+.

Existing files are never overwritten. If the directory already has a
package.json, init refuses unless you pass --force.

License: KYAL-1.0 — free to use, attribution required.
https://github.com/KodYazicam/sparkcord
`.trim();
}

export function run(argv: string[], cwd = process.cwd()): number {
  const cmd = argv[0];
  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log(help());
    return 0;
  }
  if (cmd === "-v" || cmd === "--version") {
    console.log(packageVersion());
    return 0;
  }
  if (cmd !== "init") {
    console.error(`unknown command: ${cmd}`);
    return 1;
  }
  const force = argv.includes("--force");
  const requested = argv.find((a, i) => i >= 1 && !a.startsWith("-")) ?? ".";
  const target = isAbsolute(requested) ? requested : join(cwd, requested);
  mkdirSync(target, { recursive: true });
  if (existsSync(join(target, "package.json")) && !force) {
    console.error(`refusing to overwrite existing project in ${target} (pass --force)`);
    return 1;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const template = join(here, "..", "templates", "basic");
  if (!existsSync(template)) {
    console.error("sparkcord template is missing from the package (templates/basic). Reinstall sparkcord.");
    return 1;
  }
  for (const name of readdirSync(template)) {
    const dest = join(target, name);
    if (existsSync(dest) && !force) continue;
    cpSync(join(template, name), dest, {
      recursive: true,
      force,
    });
  }
  if (!existsSync(join(target, "package.json"))) {
    writeFileSync(
      join(target, "package.json"),
      JSON.stringify(
        {
          name: "sparkcord-bot",
          private: true,
          type: "module",
          dependencies: { sparkcord: "file:..", "discord.js": "^14.16.0" },
        },
        null,
        2,
      ),
    );
  }
  console.log(`sparkcord project ready in ${target}`);
  console.log("Next: cp .env.example .env  &&  npm install  &&  npm start");
  return 0;
}

if (invokedDirectly(import.meta.url)) process.exitCode = run(process.argv.slice(2));
