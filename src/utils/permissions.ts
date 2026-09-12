import type { CommandDefinition } from "../types.js";

export interface PermissionContext {
  userId: string;
  inGuild: boolean;
  memberPermissions?: Set<string>;
}

export function checkCommandAccess(
  command: CommandDefinition,
  ctx: PermissionContext,
  owners: string[] = [],
): string | null {
  if (command.ownerOnly && !owners.includes(ctx.userId)) {
    return "This command is owner-only.";
  }
  if (command.guildOnly && !ctx.inGuild) {
    return "This command can only be used in a server.";
  }
  if (command.permissions?.length) {
    if (!ctx.inGuild) return "This command can only be used in a server.";
    const missing = command.permissions.filter((p) => !ctx.memberPermissions?.has(p));
    if (missing.length) return `Missing permission: ${missing.join(", ")}`;
  }
  return null;
}
