#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function help(): string {
  return `
sparkcord — file-based Discord.js framework

Usage:
  sparkcord init [dir]     Scaffold a starter bot
  sparkcord --help
  sparkcord --version

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
    console.log("1.0.0");
    return 0;
  }
  if (cmd !== "init") {
    console.error(`unknown command: ${cmd}`);
    return 1;
  }
  const target = join(cwd, argv[1] && !argv[1].startsWith("-") ? argv[1] : ".");
  mkdirSync(target, { recursive: true });
  const here = dirname(fileURLToPath(import.meta.url));
  const template = join(here, "..", "templates", "basic");
  if (existsSync(template)) {
    cpSync(template, target, { recursive: true, force: false });
  } else {
    writeFileSync(
      join(target, "package.json"),
      JSON.stringify(
        {
          name: "sparkcord-bot",
          private: true,
          type: "module",
          dependencies: { sparkcord: "^1.0.0", "discord.js": "^14.16.0" },
        },
        null,
        2,
      ),
    );
  }
  console.log(`sparkcord project ready in ${target}`);
  return 0;
}

const isDirect = process.argv[1]?.includes("cli");
if (isDirect) process.exitCode = run(process.argv.slice(2));
