import { PermissionFlagsBits } from "discord.js";

type ChannelLockOverwrite = {
  id: string;
  allow: bigint[];
  deny: bigint[];
};

export function getChannelLockOverwrites(
  exemptRoleIds: string[],
): ChannelLockOverwrite[] {
  return [
    { id: "@everyone", allow: [], deny: [PermissionFlagsBits.SendMessages] },
    ...exemptRoleIds.map((id) => ({
      id,
      allow: [PermissionFlagsBits.SendMessages],
      deny: [],
    })),
  ];
}
