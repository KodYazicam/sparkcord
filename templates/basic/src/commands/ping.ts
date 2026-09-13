import type { CommandDefinition } from "sparkcord";

const ping: CommandDefinition = {
  name: "ping",
  description: "Pong with latency.",
  kind: "both",
  cooldown: 3,
  async run(ctx) {
    const raw = ctx.raw as { createdTimestamp?: number };
    const start = Date.now();
    const text = `Pong · ${raw.createdTimestamp ? start - raw.createdTimestamp : 0}ms`;
    return ctx.reply(text);
  },
};

export default ping;
