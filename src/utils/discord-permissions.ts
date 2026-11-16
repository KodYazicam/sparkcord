import type { CommandDefinition } from "../types.js";

const bit = (shift: number): bigint => 1n << BigInt(shift);

/**
 * Discord guild permission flags mapped to their bit values.
 * Names match `PermissionFlagsBits` in discord.js; aliases Discord still
 * documents are kept next to the current name.
 *
 * https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags
 */
export const PERMISSION_BITS: Readonly<Record<string, bigint>> = Object.freeze({
  CreateInstantInvite: bit(0),
  KickMembers: bit(1),
  BanMembers: bit(2),
  Administrator: bit(3),
  ManageChannels: bit(4),
  ManageGuild: bit(5),
  AddReactions: bit(6),
  ViewAuditLog: bit(7),
  PrioritySpeaker: bit(8),
  Stream: bit(9),
  ViewChannel: bit(10),
  SendMessages: bit(11),
  SendTTSMessages: bit(12),
  ManageMessages: bit(13),
  EmbedLinks: bit(14),
  AttachFiles: bit(15),
  ReadMessageHistory: bit(16),
  MentionEveryone: bit(17),
  UseExternalEmojis: bit(18),
  ViewGuildInsights: bit(19),
  Connect: bit(20),
  Speak: bit(21),
  MuteMembers: bit(22),
  DeafenMembers: bit(23),
  MoveMembers: bit(24),
  UseVAD: bit(25),
  ChangeNickname: bit(26),
  ManageNicknames: bit(27),
  ManageRoles: bit(28),
  ManageWebhooks: bit(29),
  ManageGuildExpressions: bit(30),
  ManageEmojisAndStickers: bit(30),
  UseApplicationCommands: bit(31),
  RequestToSpeak: bit(32),
  ManageEvents: bit(33),
  ManageThreads: bit(34),
  CreatePublicThreads: bit(35),
  CreatePrivateThreads: bit(36),
  UseExternalStickers: bit(37),
  SendMessagesInThreads: bit(38),
  UseEmbeddedActivities: bit(39),
  ModerateMembers: bit(40),
  ViewCreatorMonetizationAnalytics: bit(41),
  UseSoundboard: bit(42),
  CreateGuildExpressions: bit(43),
  CreateEvents: bit(44),
  UseExternalSounds: bit(45),
  SendVoiceMessages: bit(46),
  SetVoiceChannelStatus: bit(48),
  SendPolls: bit(49),
  UseExternalApps: bit(50),
  PinMessages: bit(51),
  BypassSlowmode: bit(52),
});

const LOOKUP = new Map(
  Object.entries(PERMISSION_BITS).map(([name, value]) => [name.toLowerCase(), value] as const),
);

/** Bit value for a Discord permission name (case-insensitive), or undefined. */
export function permissionBits(name: string): bigint | undefined {
  if (typeof name !== "string") return undefined;
  return LOOKUP.get(name.toLowerCase());
}

export function isKnownPermission(name: string): boolean {
  return permissionBits(name) !== undefined;
}

/**
 * ORs permission names into the decimal string Discord expects in
 * `default_member_permissions`. Unknown names throw: silently dropping one
 * would register the command as visible to everyone while runtime access is
 * still denied.
 */
export function toPermissionBitfield(names: readonly string[]): string {
  let bits = 0n;
  const unknown: string[] = [];
  for (const name of names) {
    const value = permissionBits(name);
    if (value === undefined) {
      unknown.push(String(name));
      continue;
    }
    bits |= value;
  }
  if (unknown.length) {
    throw new TypeError(
      `Unknown Discord permission name(s): ${unknown.join(", ")}. ` +
        "Use current permission flags such as BanMembers or ManageGuild.",
    );
  }
  return bits.toString();
}

/** `default_member_permissions` for a command, or undefined when it is public. */
export function defaultMemberPermissions(command: CommandDefinition): string | undefined {
  if (!command.permissions?.length) return undefined;
  return toPermissionBitfield(command.permissions);
}
