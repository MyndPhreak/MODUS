import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";
import { GiveawaySettingsSchema } from "../../../lib/schemas";
import { parseSettings } from "../../../lib/validateSettings";
import { hasAnyRole, isAdminOrManageGuild } from "../../../lib/discord-utils";
import { drawWinners } from "../lib/draw";
import { dmWinners } from "../lib/drawAndAnnounce";
import { buildGiveawayComponents, buildGiveawayEmbed } from "../lib/embed";
import type { GiveawayStatus, PrizeKind } from "../lib/embed";

export async function handleReroll(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): Promise<void> {
  const guildId = interaction.guildId!;
  const rawSettings = await moduleManager.databaseService.getModuleSettings(guildId, "giveaways");
  const settings = parseSettings(GiveawaySettingsSchema, rawSettings, "giveaways", guildId);
  const member = interaction.member as GuildMember;
  if (!settings || (!isAdminOrManageGuild(member) && !hasAnyRole(member, settings.hostRoleIds))) {
    await interaction.editReply("❌ You don't have permission to manage giveaways.");
    return;
  }

  const messageId = interaction.options.getString("message_id", true);
  const count = interaction.options.getInteger("count") ?? 1;

  const db = moduleManager.databaseService;
  const giveaway = await db.giveaways.getByMessageId(messageId);
  if (!giveaway || giveaway.guildId !== guildId) {
    await interaction.editReply("❌ No giveaway found with that message ID in this server.");
    return;
  }
  if (giveaway.status !== "ended") {
    await interaction.editReply("❌ Only an ended giveaway can be rerolled.");
    return;
  }

  const allEntrants = await db.giveawayEntries.listEntrantIds(giveaway.id);
  const remaining = allEntrants.filter((id) => !giveaway.winnerIds.includes(id));
  const newWinners = drawWinners(remaining, count);

  if (newWinners.length === 0) {
    await interaction.editReply("❌ No remaining eligible entrants to reroll.");
    return;
  }

  const mergedWinnerIds = [...giveaway.winnerIds, ...newWinners];
  await db.giveaways.update(giveaway.id, { winnerIds: mergedWinnerIds });

  if (interaction.channel?.isTextBased() && "send" in interaction.channel) {
    await interaction.channel.send(
      `🔁 Reroll for **${giveaway.title}**: ${newWinners.map((id) => `<@${id}>`).join(", ")}`,
    );
  }

  // Only the *new* winners get DMed — the originals already received theirs on
  // the initial draw. Without this a rerolled "key" winner would have no way to
  // obtain their code.
  await dmWinners(
    moduleManager.client,
    giveaway,
    newWinners,
    interaction.guild?.name ?? "a server",
  );

  // Refresh the live giveaway message so its Winner(s) field reflects the
  // reroll. Status stays "ended". Never let a refresh failure fail the command.
  try {
    const channel = await moduleManager.client.channels.fetch(giveaway.channelId);
    if (channel?.isTextBased() && "messages" in channel) {
      const message = await channel.messages.fetch(giveaway.messageId);
      const entrantCount = await db.giveawayEntries.countEntries(giveaway.id);
      const embed = buildGiveawayEmbed({
        id: giveaway.id,
        title: giveaway.title,
        description: giveaway.description,
        prizeKind: giveaway.prizeKind as PrizeKind,
        prizeValue: giveaway.prizeValue,
        imageUrl: giveaway.imageUrl,
        winnerCount: giveaway.winnerCount,
        entrantCount,
        endsAt: giveaway.endsAt,
        status: giveaway.status as GiveawayStatus,
        winnerIds: mergedWinnerIds,
        requirements: giveaway.requirements,
      });
      const components = buildGiveawayComponents(giveaway.id, giveaway.status as GiveawayStatus);
      await message.edit({ embeds: [embed], components: components as any });
    }
  } catch (err) {
    moduleManager.logger.warn(
      `Failed to refresh giveaway embed after reroll: ${err instanceof Error ? err.message : err}`,
      giveaway.guildId,
      "giveaways",
    );
  }

  await interaction.editReply(
    `✅ Rerolled. New winner(s): ${newWinners.map((id) => `<@${id}>`).join(", ")}`,
  );
}
