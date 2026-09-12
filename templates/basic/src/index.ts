import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, GatewayIntentBits } from "discord.js";
import { createSparkBot } from "sparkcord";
import { loadEnv } from "./load-env.ts";

loadEnv(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"));

const here = dirname(fileURLToPath(import.meta.url));
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const bot = await createSparkBot({
  client,
  commandsDir: join(here, "commands"),
  eventsDir: join(here, "events"),
  prefix: "!",
  owners: (process.env.OWNER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  devGuildId: process.env.DEV_GUILD_ID || undefined,
});

bot.attach(client);
await client.login(token);
