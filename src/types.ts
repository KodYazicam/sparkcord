export type CommandKind = "slash" | "prefix" | "both";

export interface CommandOption {
  name: string;
  description: string;
  type?: "string" | "integer" | "boolean" | "user" | "channel" | "role" | "number";
  required?: boolean;
  choices?: Array<{ name: string; value: string | number }>;
}

export interface CommandContext {
  bot: unknown;
  command: CommandDefinition<CommandContext>;
  userId: string;
  inGuild: boolean;
  memberPermissions: Set<string>;
  raw: unknown;
  args?: string[];
  options: Record<string, unknown>;
  kind: "slash" | "prefix";
  reply: (content: string, extra?: { ephemeral?: boolean }) => Promise<unknown> | unknown;
}

export interface CommandDefinition<Ctx = CommandContext> {
  name: string;
  description: string;
  kind?: CommandKind;
  category?: string;
  cooldown?: number;
  guildOnly?: boolean;
  ownerOnly?: boolean;
  permissions?: string[];
  options?: CommandOption[];
  aliases?: string[];
  run: (ctx: Ctx) => unknown | Promise<unknown>;
}

export interface EventDefinition<Ctx = unknown> {
  name: string;
  once?: boolean;
  run: (ctx: Ctx, ...args: unknown[]) => unknown | Promise<unknown>;
}

export interface SparkOptions {
  commandsDir: string;
  eventsDir?: string;
  prefix?: string;
  owners?: string[];
  devGuildId?: string;
  client?: SparkClientLike;
  autoRegister?: boolean;
  denyReplies?: boolean;
  componentsDir?: string;
}

export interface SparkClientLike {
  user?: { id: string; tag: string } | null;
  on: (event: string, listener: (...args: unknown[]) => unknown) => unknown;
  once: (event: string, listener: (...args: unknown[]) => unknown) => unknown;
  application?: {
    commands: {
      set: (data: unknown, guildId?: string) => Promise<unknown>;
    };
  };
}

export interface CooldownRecord {
  until: number;
}

export interface LoadedCommand {
  definition: CommandDefinition;
  path: string;
}

export interface LoadedEvent {
  definition: EventDefinition;
  path: string;
}
