const ping = {
  name: "ping",
  description: "Replies with Pong!",
  kind: "both",

  async run(ctx) {
    return ctx.reply("Pong!");
  }
};

export default ping;