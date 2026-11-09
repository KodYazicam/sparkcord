import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, GatewayIntentBits } from "discord.js";
import { createSparkBot } from "sparkcord";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("Missing DISCORD_TOKEN environment variable.");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const bot = await createSparkBot({
  client,
  commandsDir: join(here, "commands"),
  prefix: "!",
  autoRegister: true
});

bot.attach(client);

await client.login(token);