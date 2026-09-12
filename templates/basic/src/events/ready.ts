import type { EventDefinition } from "sparkcord";

const ready: EventDefinition = {
  name: "ready",
  once: true,
  run(_ctx, client) {
    const c = client as { user?: { tag?: string } };
    console.log(`sparkcord ready as ${c.user?.tag ?? "bot"}`);
  },
};

export default ready;
