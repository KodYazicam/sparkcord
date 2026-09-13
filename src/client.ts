import { CommandRegistry } from "./handlers/registry.js";
import { loadCommands, loadEvents } from "./loaders/files.js";
import { checkCommandAccess } from "./utils/permissions.js";
import { CooldownStore, cooldownKey } from "./utils/cooldown.js";
import { parsePrefixArgs, toSlashPayload, optionsFromPrefix, optionsFromSlash, replyTo } from "./utils/slash.js";
import type {
  LoadedEvent,
  SparkClientLike,
  SparkOptions,
} from "./types.js";

export interface InvokeResult {
  ok: boolean;
  reason?: string;
  remainingMs?: number;
  value?: unknown;
}

export class SparkBot {
  readonly options: Required<Pick<SparkOptions, "commandsDir" | "prefix">> & SparkOptions;
  readonly commands = new CommandRegistry();
  readonly cooldowns = new CooldownStore();
  events: LoadedEvent[] = [];
  ready = false;
  private attached = false;
  private registering = false;

  constructor(options: SparkOptions) {
    this.options = {
      prefix: "!",
      autoRegister: true,
      denyReplies: true,
      ...options,
      commandsDir: options.commandsDir,
    };
  }

  async load(): Promise<this> {
    const cmds = await loadCommands(this.options.commandsDir);
    for (const cmd of cmds) this.commands.register(cmd);
    if (this.options.eventsDir) {
      this.events = await loadEvents(this.options.eventsDir);
    }
    return this;
  }

  slashPayload(): Record<string, unknown>[] {
    return this.commands.slashable().map(toSlashPayload);
  }

  async registerSlash(client: SparkClientLike = this.options.client as SparkClientLike): Promise<void> {
    if (!client?.application?.commands) {
      throw new Error("client.application.commands is not available yet. Wait for ready.");
    }
    const payload = this.slashPayload();
    if (this.options.devGuildId) {
      await client.application.commands.set(payload, this.options.devGuildId);
    } else {
      await client.application.commands.set(payload);
    }
  }

  attach(client: SparkClientLike = this.options.client as SparkClientLike): this {
    if (!client) throw new Error("No Discord client provided.");
    if (this.attached && this.options.client === client) return this;
    this.options.client = client;
    this.attached = true;
    const onReady = async () => {
      this.ready = true;
      if (this.options.autoRegister === false) return;
      if (this.registering) return;
      this.registering = true;
      try {
        await this.registerSlash(client);
      } catch (error) {
        console.error("[sparkcord] slash registration failed:", (error as Error).message);
      } finally {
        this.registering = false;
      }
    };
    client.once("ready", onReady);
    if (client.user) void onReady();
    client.on("interactionCreate", (interaction) => {
      void this.handleInteraction(interaction);
    });
    client.on("messageCreate", (message) => {
      void this.handleMessage(message);
    });
    for (const event of this.events) {
      const method = event.definition.once ? "once" : "on";
      client[method](event.definition.name, (...args: unknown[]) =>
        event.definition.run({ bot: this, client }, ...args),
      );
    }
    return this;
  }

  async handleInteraction(interaction: unknown): Promise<InvokeResult> {
    const ix = interaction as {
      isChatInputCommand?: () => boolean;
      commandName?: string;
      user?: { id: string };
      guildId?: string | null;
      member?: { permissions?: { toArray?: () => string[] } };
    };
    if (typeof ix.isChatInputCommand === "function" && !ix.isChatInputCommand()) {
      return { ok: false, reason: "not-slash" };
    }
    if (!ix.commandName) return { ok: false, reason: "not-slash" };
    return this.invoke(ix.commandName, {
      userId: ix.user?.id ?? "",
      inGuild: Boolean(ix.guildId),
      memberPermissions: new Set(ix.member?.permissions?.toArray?.() ?? []),
      raw: interaction,
      kind: "slash",
      options: optionsFromSlash(interaction),
    });
  }

  async handleMessage(message: unknown): Promise<InvokeResult> {
    const msg = message as {
      author?: { bot?: boolean; id: string };
      content?: string;
      guildId?: string | null;
      member?: { permissions?: { toArray?: () => string[] } };
    };
    if (msg.author?.bot) return { ok: false, reason: "bot" };
    const parsed = parsePrefixArgs(msg.content ?? "", this.options.prefix);
    if (!parsed) return { ok: false, reason: "not-command" };
    const loaded = this.commands.prefixable(parsed.name);
    if (!loaded) return { ok: false, reason: "unknown" };
    return this.invoke(loaded.definition.name, {
      userId: msg.author?.id ?? "",
      inGuild: Boolean(msg.guildId),
      memberPermissions: new Set(msg.member?.permissions?.toArray?.() ?? []),
      raw: message,
      args: parsed.args,
      kind: "prefix",
      options: optionsFromPrefix(parsed.args, loaded.definition.options),
    });
  }

  async invoke(
    name: string,
    ctx: {
      userId: string;
      inGuild: boolean;
      memberPermissions: Set<string>;
      raw: unknown;
      args?: string[];
      kind: "slash" | "prefix";
      options?: Record<string, unknown>;
    },
  ): Promise<InvokeResult> {
    const loaded =
      ctx.kind === "prefix" ? this.commands.prefixable(name) : this.commands.resolve(name);
    if (!loaded) return { ok: false, reason: "unknown" };
    const denied = checkCommandAccess(loaded.definition, ctx, this.options.owners ?? []);
    if (denied) {
      if (this.options.denyReplies !== false) await replyTo(ctx.raw, denied, { ephemeral: true });
      return { ok: false, reason: denied };
    }
    if (loaded.definition.cooldown && loaded.definition.cooldown > 0) {
      const left = this.cooldowns.remaining(
        cooldownKey(loaded.definition.name, ctx.userId),
        loaded.definition.cooldown,
      );
      if (left > 0) {
        const seconds = Math.ceil(left / 1000);
        if (this.options.denyReplies !== false) {
          await replyTo(ctx.raw, `Please wait ${seconds}s before using /${loaded.definition.name} again.`, {
            ephemeral: true,
          });
        }
        return { ok: false, reason: "cooldown", remainingMs: left };
      }
    }
    try {
      const value = await loaded.definition.run({
        ...ctx,
        bot: this,
        command: loaded.definition,
        options: ctx.options ?? {},
        reply: (content, extra) => replyTo(ctx.raw, content, extra),
      });
      return { ok: true, value };
    } catch (error) {
      const message = (error as Error).message || "command-error";
      if (this.options.denyReplies !== false) {
        await replyTo(ctx.raw, "Command failed. Check the bot logs.", { ephemeral: true });
      }
      return { ok: false, reason: message };
    }
  }
}

export async function createSparkBot(options: SparkOptions): Promise<SparkBot> {
  const bot = new SparkBot(options);
  await bot.load();
  return bot;
}
