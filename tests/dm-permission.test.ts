import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SparkBot } from "../src/client.js";
import { toSlashPayload } from "../src/utils/slash.js";
import type { CommandDefinition } from "../src/types.js";

const guildOnly: CommandDefinition = {
  name: "ban",
  description: "Ban a member",
  kind: "slash",
  guildOnly: true,
  run: () => "ok",
};

describe("guild-only slash registration", () => {
  it("sets dm_permission false so Discord hides the command in DMs", () => {
    expect(toSlashPayload(guildOnly).dm_permission).toBe(false);
  });

  it("omits dm_permission for commands that work in DMs", () => {
    expect(toSlashPayload({ ...guildOnly, guildOnly: false })).not.toHaveProperty("dm_permission");
    expect(toSlashPayload({ ...guildOnly, guildOnly: undefined })).not.toHaveProperty("dm_permission");
  });

  it("keeps the flag when SparkBot builds the registration payload", () => {
    const bot = new SparkBot({ commandsDir: mkdtempSync(join(tmpdir(), "sparkcord-")), autoRegister: false });
    bot.commands.register({ definition: guildOnly, path: "ban.ts" });
    const [payload] = bot.slashPayload();
    expect(payload.dm_permission).toBe(false);
  });
});
