# Security Policy

sparkcord is a Discord.js framework. The **library** never logs in. Your bot token stays in *your* `Client.login` call.

## Invite permissions

Do not invite bots with Administrator (`permissions=8`) unless you understand the blast radius. The starter README lists a least-privilege set.

## Command modules

`loadCommands` dynamically `import()`s files under `commandsDir`. That directory is trusted code. Do not point it at a world-writable folder.

TypeScript command files need Node 22.6+ (`--experimental-strip-types`) or a compile step. On Node 20 the loader throws instead of silently skipping.

## Token-less tests

`npm test` in this repository never opens a Discord gateway and never reads `DISCORD_TOKEN`.

## Reporting

Open a private advisory on [KodYazicam/sparkcord](https://github.com/KodYazicam/sparkcord/security/advisories/new).
