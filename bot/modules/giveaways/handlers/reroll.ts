import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";
import { GiveawaySettingsSchema } from "../../../lib/schemas";
import { parseSettings } from "../../../lib/validateSettings";
import { hasAnyRole, isAdminOrManageGuild } from "../../../lib/discord-utils";
import { drawWinners } from "../lib/draw";

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

  await db.giveaways.update(giveaway.id, { winnerIds: [...giveaway.winnerIds, ...newWinners] });

  if (interaction.channel?.isTextBased() && "send" in interaction.channel) {
    await interaction.channel.send(
      `🔁 Reroll for **${giveaway.title}**: ${newWinners.map((id) => `<@${id}>`).join(", ")}`,
    );
  }

  await interaction.editReply(
    `✅ Rerolled. New winner(s): ${newWinners.map((id) => `<@${id}>`).join(", ")}`,
  );
}
