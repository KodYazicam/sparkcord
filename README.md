<p align="center">
  <img src="assets/banner.svg" alt="sparkcord" width="100%">
</p>

<p align="center">
  <strong>File-based Discord.js v14 framework.</strong><br/>
  Drop a file in <code>commands/</code>. Slash, prefix, cooldowns, and permissions come free.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="discord.js">
  <img src="https://img.shields.io/badge/license-KYAL--1.0-7C3AED?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/author-KodYazicam-0D0D0D?style=flat-square" alt="Author">
</p>

---

sparkcord is a thin layer on top of Discord.js. You write command modules. The framework loads them, registers slash commands, and routes both `/ping` and `!ping`.

```ts
import type { CommandDefinition } from "sparkcord";

const ping: CommandDefinition = {
  name: "ping",
  description: "Pong with latency.",
  kind: "both",
  cooldown: 3,
  async run({ raw }) {
    return raw.reply("Pong");
  },
};

export default ping;
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

## Features

| | |
| --- | --- |
| File-based commands & events | Recursively loads `commands/` and `events/` |
| Slash + prefix | `kind: "slash" \| "prefix" \| "both"` |
| Cooldowns | Per user, per command |
| Permissions | `guildOnly`, `ownerOnly`, Discord permission names |
| Dev guild | Instant slash updates while iterating |
| Scaffold | `npx sparkcord init my-bot` (Node 22.6+, loads `.env` automatically) |

## Command module

```ts
export default {
  name: "ban",
  description: "Ban a member",
  kind: "slash",
  guildOnly: true,
  permissions: ["BanMembers"],
  options: [
    { name: "user", description: "Target", type: "user", required: true },
    { name: "reason", description: "Why", type: "string" },
  ],
  async run(ctx) { /* ... */ },
};
```

## Event module

```ts
export default {
  name: "ready",
  once: true,
  run(_ctx, client) {
    console.log(`ready as ${client.user.tag}`);
  },
};
```

## Why not a mega-bot

Stribog-Bot and discord-music-panel are products. sparkcord is the reusable core: loaders, registry, cooldowns, slash payload, prefix parser. Tests run without a Discord token.

## License — KYAL-1.0

Free to use and modify. **Attribution is mandatory.**

```
Author : Batuhan (KodYazicam)
Project: sparkcord
Source : https://github.com/KodYazicam/sparkcord
```

Public bots should credit sparkcord in their README or `/about` command.

See [LICENSE](./LICENSE).

<p align="center"><sub>Built by <a href="https://github.com/KodYazicam">KodYazicam</a></sub></p>
