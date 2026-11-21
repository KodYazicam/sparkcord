import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SparkBot } from "../src/client.js";
import type { CommandDefinition } from "../src/types.js";

const OWNER = "111111111111111111";
const MEMBER = "222222222222222222";

function makeBot(command: CommandDefinition): { bot: SparkBot; calls: () => number } {
  const bot = new SparkBot({
    commandsDir: mkdtempSync(join(tmpdir(), "sparkcord-")),
    autoRegister: false,
    owners: [OWNER],
  });
  bot.commands.register({ definition: command, path: `${command.name}.ts` });
  let calls = 0;
  bot.interactions.onAutocomplete({
    command: command.name,
    run: () => {
      calls += 1;
      return [{ name: "leaked-value", value: "leaked-value" }];
    },
  });
  return { bot, calls: () => calls };
}

function autocompleteInteraction(options: {
  commandName: string;
  userId?: string;
  guildId?: string | null;
  permissions?: string[];
}): unknown {
  return {
    isAutocomplete: () => true,
    commandName: options.commandName,
    user: { id: options.userId ?? MEMBER },
    guildId: options.guildId === undefined ? "333333333333333333" : options.guildId,
    member: { permissions: { toArray: () => options.permissions ?? [] } },
    options: { getFocused: () => "le" },
  };
}

describe("autocomplete access checks", () => {
  it("does not run an ownerOnly autocomplete handler for a non-owner", async () => {
    const { bot, calls } = makeBot({
      name: "secret",
      description: "owner only",
      ownerOnly: true,
      run: () => "ok",
    });

    const result = await bot.handleInteraction(autocompleteInteraction({ commandName: "secret" }));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("This command is owner-only.");
    expect(result.value).toBeUndefined();
    expect(calls()).toBe(0);
  });

  it("still runs an ownerOnly autocomplete handler for a configured owner", async () => {
    const { bot, calls } = makeBot({
      name: "secret",
      description: "owner only",
      ownerOnly: true,
      run: () => "ok",
    });

    const result = await bot.handleInteraction(
      autocompleteInteraction({ commandName: "secret", userId: OWNER }),
    );

    expect(result.ok).toBe(true);
    expect(calls()).toBe(1);
  });

  it("does not run a guildOnly autocomplete handler in a DM", async () => {
    const { bot, calls } = makeBot({
      name: "roles",
      description: "guild only",
      guildOnly: true,
      run: () => "ok",
    });

    const result = await bot.handleInteraction(
      autocompleteInteraction({ commandName: "roles", guildId: null }),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("This command can only be used in a server.");
    expect(calls()).toBe(0);
  });

  it("does not run an autocomplete handler without the required permission", async () => {
    const { bot, calls } = makeBot({
      name: "moderate",
      description: "needs manage guild",
      permissions: ["ManageGuild"],
      run: () => "ok",
    });

    const result = await bot.handleInteraction(
      autocompleteInteraction({ commandName: "moderate", permissions: ["SendMessages"] }),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Missing permission: ManageGuild");
    expect(calls()).toBe(0);
  });

  it("runs an autocomplete handler when the member holds the required permission", async () => {
    const { bot, calls } = makeBot({
      name: "moderate",
      description: "needs manage guild",
      permissions: ["ManageGuild"],
      run: () => "ok",
    });

    const result = await bot.handleInteraction(
      autocompleteInteraction({ commandName: "moderate", permissions: ["ManageGuild"] }),
    );

    expect(result.ok).toBe(true);
    expect(calls()).toBe(1);
  });

  it("runs an autocomplete handler for a command with no restrictions", async () => {
    const { bot, calls } = makeBot({
      name: "search",
      description: "search the catalog",
      run: () => "ok",
    });

    const result = await bot.handleInteraction(autocompleteInteraction({ commandName: "search" }));

    expect(result.ok).toBe(true);
    expect(calls()).toBe(1);
  });
});
