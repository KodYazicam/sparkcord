import { Client, GatewayIntentBits } from "discord.js";
import { createSparkBot } from "sparkcord";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const bot = await createSparkBot({
  client,
  commandsDir: new URL("./commands", import.meta.url).pathname,
  eventsDir: new URL("./events", import.meta.url).pathname,
  prefix: "!",
  owners: process.env.OWNER_IDS?.split(",") ?? [],
  devGuildId: process.env.DEV_GUILD_ID,
});

bot.attach(client);
await client.login(process.env.DISCORD_TOKEN);
