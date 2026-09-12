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
