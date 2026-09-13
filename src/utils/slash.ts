import type { CommandDefinition, CommandOption } from "../types.js";

const TYPE_MAP: Record<NonNullable<CommandOption["type"]>, number> = {
  string: 3,
  integer: 4,
  boolean: 5,
  user: 6,
  channel: 7,
  role: 8,
  number: 10,
};

export function toSlashPayload(command: CommandDefinition): Record<string, unknown> {
  return {
    name: command.name,
    description: command.description,
    options: (command.options ?? []).map((option) => ({
      name: option.name,
      description: option.description,
      type: TYPE_MAP[option.type ?? "string"],
      required: option.required ?? false,
      choices: option.choices,
    })),
  };
}

export function parsePrefixArgs(content: string, prefix: string): { name: string; args: string[] } | null {
  if (!content.startsWith(prefix)) return null;
  const body = content.slice(prefix.length).trim();
  if (!body) return null;
  const [name, ...args] = body.split(/\s+/);
  return { name: name.toLowerCase(), args };
}

export function optionsFromSlash(raw: unknown): Record<string, unknown> {
  const ix = raw as {
    options?: { data?: Array<{ name: string; value?: unknown }>; get?: (name: string) => { value?: unknown } | null };
  };
  const out: Record<string, unknown> = {};
  const data = ix.options?.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item?.name) out[item.name] = item.value;
    }
    return out;
  }
  return out;
}

export function optionsFromPrefix(args: string[], spec: CommandOption[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  spec.forEach((option, index) => {
    const raw = args[index];
    if (raw === undefined) return;
    if (option.type === "integer" || option.type === "number") {
      const n = Number(raw);
      out[option.name] = Number.isFinite(n) ? n : raw;
      return;
    }
    if (option.type === "boolean") {
      out[option.name] = ["1", "true", "yes", "on"].includes(raw.toLowerCase());
      return;
    }
    out[option.name] = raw;
  });
  return out;
}

export async function replyTo(raw: unknown, content: string, extra?: { ephemeral?: boolean }): Promise<unknown> {
  const target = raw as {
    reply?: (payload: unknown) => unknown;
    followUp?: (payload: unknown) => unknown;
    deferred?: boolean;
    replied?: boolean;
    channel?: { send?: (payload: unknown) => unknown };
  };
  const payload = extra?.ephemeral ? { content, ephemeral: true } : content;
  try {
    if (target.deferred || target.replied) {
      if (typeof target.followUp === "function") return await target.followUp(payload);
    }
    if (typeof target.reply === "function") return await target.reply(payload);
    if (typeof target.channel?.send === "function") return await target.channel.send(content);
  } catch {
    return undefined;
  }
  return undefined;
}
