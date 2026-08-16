import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";
import { GiveawaySettingsSchema } from "../../../lib/schemas";
import { parseSettings } from "../../../lib/validateSettings";
import { hasAnyRole, isAdminOrManageGuild } from "../../../lib/discord-utils";
import { drawAndAnnounce } from "../lib/drawAndAnnounce";

export async function handleEnd(
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
  const giveaway = await moduleManager.databaseService.giveaways.getByMessageId(messageId);
  if (!giveaway || giveaway.guildId !== guildId) {
    await interaction.editReply("❌ No giveaway found with that message ID in this server.");
    return;
  }

  const result = await drawAndAnnounce(
    moduleManager.client,
    moduleManager.databaseService,
    moduleManager.logger,
    giveaway.id,
  );
  if ("error" in result) {
    await interaction.editReply(`❌ ${result.error}`);
    return;
  }

  await interaction.editReply(
    result.winnerIds.length > 0
      ? `✅ Giveaway ended. Winner(s): ${result.winnerIds.map((id) => `<@${id}>`).join(", ")}`
      : "✅ Giveaway ended with no eligible entrants.",
  );
}
