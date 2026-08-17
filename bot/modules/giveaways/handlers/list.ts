import type { ChatInputCommandInteraction } from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";

export async function handleList(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): Promise<void> {
  const guildId = interaction.guildId!;
  const giveaways = await moduleManager.databaseService.giveaways.listByGuild(guildId);
  const active = giveaways.filter((g) => g.status === "active");

  if (active.length === 0) {
    await interaction.editReply("No active giveaways in this server.");
    return;
  }

  const lines = active.map(
    (g) =>
      `• **${g.title}** — <#${g.channelId}> — ends <t:${Math.floor(g.endsAt.getTime() / 1000)}:R> — \`${g.messageId}\``,
  );
  await interaction.editReply(lines.join("\n"));
}
