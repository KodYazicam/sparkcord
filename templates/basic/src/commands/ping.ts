import type { CommandDefinition } from "sparkcord";

const ping: CommandDefinition = {
  name: "ping",
  description: "Pong with latency.",
  kind: "both",
  cooldown: 3,
  async run(ctx) {
    const raw = ctx.raw as { reply?: (content: string) => unknown; createdTimestamp?: number };
    const start = Date.now();
    const text = `Pong · ${raw.createdTimestamp ? start - raw.createdTimestamp : 0}ms`;
    if (typeof raw.reply === "function") return raw.reply(text);
    return text;
  },
};

export default ping;
