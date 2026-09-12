<p align="center">
  <img src="assets/banner.svg" alt="sparkcord" width="100%">
</p>

<p align="center">
  <strong>File-based Discord.js v14 framework.</strong><br/>
  Drop a file in <code>commands/</code>. Slash, prefix, cooldowns, and permissions come free.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="discord.js">
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square" alt="Node">
  <img src="https://img.shields.io/badge/license-KYAL--1.0-7C3AED?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/author-KodYazicam-0D0D0D?style=flat-square" alt="Author">
</p>

---

sparkcord is a thin layer on top of Discord.js. You write command modules. The framework loads them, registers slash commands, and routes both `/ping` and `!ping`.

Stribog-Bot and discord-music-panel are full products. sparkcord is the reusable core: loaders, registry, cooldowns, slash payload, prefix parser. Tests run **without a Discord token**.

## Table of contents

- [Requirements](#requirements)
- [Scaffold a bot (recommended)](#scaffold-a-bot-recommended)
- [Install as a library](#install-as-a-library)
- [Command modules](#command-modules)
- [Event modules](#event-modules)
- [Command context](#command-context)
- [Permissions and cooldowns](#permissions-and-cooldowns)
- [Slash registration](#slash-registration)
- [CLI](#cli)
- [Intents](#intents)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [License](#license--kyal-10)

## Requirements

| Piece | Version |
| --- | --- |
| sparkcord library | Node **20+** |
| Starter from `sparkcord init` | Node **22.6+** (`--experimental-strip-types` + `--env-file`) |
| discord.js | **v14** (peer dependency) |

You need a bot token from the [Discord Developer Portal](https://discord.com/developers/applications). Enable **Message Content Intent** if you use prefix commands.

## Scaffold a bot (recommended)

```bash
npx sparkcord init my-bot
cd my-bot
cp .env.example .env
# put DISCORD_TOKEN=... in .env
# optional: DEV_GUILD_ID, OWNER_IDS (comma-separated snowflakes)
npm install
npm start
```

What you get:

```
my-bot/
  .env.example
  package.json          # start = node --env-file=.env --experimental-strip-types src/index.ts
  src/
    index.ts            # Client + createSparkBot + attach + login
    load-env.ts         # parses .env even if --env-file is missing
    commands/ping.ts
    events/ready.ts
```

`.env` is loaded by `src/load-env.ts` (and `--env-file` on `npm start`). You do **not** need `dotenv` or `tsx` on Node 22.6+.

Invite URL (replace `CLIENT_ID`):

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=8
```

Start with a **dev guild** (`DEV_GUILD_ID`) so slash commands update in seconds instead of up to an hour globally.

## Install as a library

```bash
npm install sparkcord discord.js
```

```ts
import { Client, GatewayIntentBits } from "discord.js";
import { createSparkBot } from "sparkcord";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const bot = await createSparkBot({
  client,
  commandsDir: "./src/commands",
  eventsDir: "./src/events",
  prefix: "!",
  owners: ["your-user-id"],
  devGuildId: process.env.DEV_GUILD_ID,
});

bot.attach(client);
await client.login(process.env.DISCORD_TOKEN);
```

`commandsDir` / `eventsDir` should be **filesystem paths**, not `file://` URLs. Use `join(dirname(fileURLToPath(import.meta.url)), "commands")` from ESM.

If the client is already `ready` when you call `attach`, slash commands register immediately (no missed `ready` event).

## Command modules

One default export per file. Nested folders are loaded. Files named `*.test.ts`, `*.spec.ts`, or `*.d.ts` are skipped.

```ts
import type { CommandDefinition } from "sparkcord";

const ping: CommandDefinition = {
  name: "ping",
  description: "Pong with latency.",
  kind: "both",          // "slash" | "prefix" | "both" (default both)
  cooldown: 3,           // seconds per user
  guildOnly: false,
  ownerOnly: false,
  permissions: [],       // Discord permission names, e.g. "BanMembers"
  aliases: ["p"],        // prefix only
  options: [
    { name: "user", description: "Target", type: "user", required: true },
    { name: "reason", description: "Why", type: "string" },
  ],
  async run(ctx) {
    const raw = ctx.raw as { reply: (s: string) => unknown };
    return raw.reply("Pong");
  },
};

export default ping;
```

Option `type` values: `string` (default), `integer`, `boolean`, `user`, `channel`, `role`, `number`.

`kind: "slash"` will **not** respond to `!name`. `kind: "prefix"` is not registered as a slash command.

## Event modules

```ts
export default {
  name: "ready",
  once: true,
  run(_ctx, client) {
    console.log(`ready as ${client.user.tag}`);
  },
};
```

`once: true` uses `client.once`. Extra Discord arguments are forwarded after `ctx`.

## Command context

```ts
import type { CommandContext } from "sparkcord";

// ctx.bot              SparkBot
// ctx.command          the definition
// ctx.userId           author / interaction user
// ctx.inGuild
// ctx.memberPermissions  Set<string> of permission names
// ctx.raw              Message or ChatInputCommandInteraction
// ctx.args             prefix args (string[])
// ctx.kind             "slash" | "prefix"
```

If `run` throws, sparkcord catches it and returns `{ ok: false, reason }` instead of crashing the process.

## Permissions and cooldowns

Checked in this order:

1. `ownerOnly` vs `options.owners`
2. `guildOnly`
3. `permissions` (guild only; names like `BanMembers`, `ManageMessages`)
4. cooldown (`command:userId`)

Denied invocations do not execute `run`. Cooldown remaining time is `remainingMs` on the result.

## Slash registration

On `ready` (or immediately if already ready), sparkcord calls `application.commands.set(payload, devGuildId?)`.

- With `devGuildId`: guild commands (instant).
- Without: global commands (can take up to an hour).

Payload is built from `toSlashPayload`. You can also call `bot.registerSlash(client)` yourself after ready.

## CLI

```bash
npx sparkcord init [dir]
npx sparkcord --help
npx sparkcord --version
```

`init` copies `templates/basic` into `dir` (`.` if omitted). Absolute paths work. Existing files are not force-overwritten.

## Intents

| Feature | Intent |
| --- | --- |
| Slash commands | `Guilds` |
| Prefix commands | `Guilds` + `GuildMessages` + **Message Content** (privileged) |
| Member cache | `GuildMembers` (not required by sparkcord itself) |

If prefix commands silently do nothing, Message Content is off in the portal.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing DISCORD_TOKEN` | Copy `.env.example` → `.env`. Node 22.6+ `npm start` loads it. |
| Slash commands missing | Set `DEV_GUILD_ID`. Wait for global, or re-invite with `applications.commands`. |
| Prefix ignored | Enable Message Content Intent; include `GatewayIntentBits.MessageContent`. |
| `Duplicate command` | Two files export the same `name`. |
| Starter fails on Node 20 | Use Node 22.6+ or add `tsx` yourself. Library still supports 20. |
| `commandsDir` empty | Path must exist and contain `.ts`/`.js` files with `name` + `run`. |

## FAQ

**Does sparkcord log in for me?** No. You create the Discord.js `Client` and call `login`.

**Can I mix slash and prefix?** Yes. `kind: "both"` is the default.

**TypeScript only?** JS works. Default export a plain object with `name`, `description`, `run`.

**Tests?** `npm test` in this repo uses vitest and never opens a gateway.

## License — KYAL-1.0

Free to use and modify. **Attribution is mandatory.**

```
Author : Batuhan (KodYazicam)
Project: sparkcord
Source : https://github.com/KodYazicam/sparkcord
```

Public bots should credit sparkcord in their README or an `/about` command. See [LICENSE](./LICENSE).

<p align="center"><sub>Built by <a href="https://github.com/KodYazicam">KodYazicam</a></sub></p>
