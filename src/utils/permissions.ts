import type { CommandDefinition } from "../types.js";

export interface PermissionContext {
  userId: string;
  inGuild: boolean;
  memberPermissions?: Set<string>;
}

/**
 * Discord's ADMINISTRATOR bit implies every other guild permission and
 * bypasses channel overwrites. discord.js reports exactly that flag for a
 * guild owner, so the check must be case-insensitive and explicit.
 */
export function isAdministrator(permissions?: Set<string>): boolean {
  if (!permissions) return false;
  for (const name of permissions) {
    if (name.toLowerCase() === "administrator") return true;
  }
  return false;
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
    const admin = isAdministrator(ctx.memberPermissions);
    const missing = command.permissions.filter((p) => !admin && !ctx.memberPermissions?.has(p));
    if (missing.length) return `Missing permission: ${missing.join(", ")}`;
  }
  return null;
}
