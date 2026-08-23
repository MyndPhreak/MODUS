import { PermissionFlagsBits } from "discord.js";

export function getChannelLockOverwrites(exemptRoleIds: string[]) {
  return [
    { id: "@everyone", allow: [], deny: [PermissionFlagsBits.SendMessages] },
    ...exemptRoleIds.map((id) => ({
      id,
      allow: [PermissionFlagsBits.SendMessages],
      deny: [],
    })),
  ];
}
