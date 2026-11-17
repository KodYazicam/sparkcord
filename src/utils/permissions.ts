import type { CommandDefinition } from "../types.js";
import { permissionBits } from "./discord-permissions.js";

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

/** OR of every permission name the member holds that sparkcord can resolve. */
function memberBits(permissions?: Set<string>): bigint {
  let bits = 0n;
  if (!permissions) return bits;
  for (const name of permissions) {
    const value = permissionBits(name);
    if (value !== undefined) bits |= value;
  }
  return bits;
}

/**
 * Runtime counterpart of `toPermissionBitfield`: resolve both sides through the
 * same case-insensitive, alias-aware table so a name that validated and
 * registered cannot deny the member who actually holds that bit.
 */
function grants(permission: string, permissions: Set<string> | undefined, bits: bigint): boolean {
  const value = permissionBits(permission);
  if (value !== undefined) return (bits & value) !== 0n;
  // Not in the table (a future flag): stay fail-closed, but match the name
  // case-insensitively like the rest of the permission API.
  const wanted = permission.toLowerCase();
  for (const name of permissions ?? []) {
    if (name.toLowerCase() === wanted) return true;
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
    const bits = memberBits(ctx.memberPermissions);
    const missing = command.permissions.filter((p) => !admin && !grants(p, ctx.memberPermissions, bits));
    if (missing.length) return `Missing permission: ${missing.join(", ")}`;
  }
  return null;
}
