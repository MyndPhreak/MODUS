import { MessageFlags } from "discord.js";
import type { ButtonInteraction, GuildMember } from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";
import { checkRequirements, describeRequirementFailure } from "../lib/requirements";
import { buildGiveawayComponents, buildGiveawayEmbed } from "../lib/embed";
import type { PrizeKind } from "../lib/embed";

export async function handleEnter(
  interaction: ButtonInteraction,
  moduleManager: ModuleManager,
  giveawayId: string,
): Promise<void> {
  const db = moduleManager.databaseService;
  const giveaway = await db.giveaways.getById(giveawayId);

  if (!giveaway || giveaway.status !== "active" || giveaway.endsAt.getTime() <= Date.now()) {
    await interaction.reply({
      content: "❌ This giveaway isn't accepting entries anymore.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const member = interaction.member as GuildMember;
  const failure = checkRequirements(giveaway.requirements, {
    roleIds: [...member.roles.cache.keys()],
    accountCreatedAt: new Date(interaction.user.createdTimestamp),
    serverJoinedAt: member.joinedTimestamp ? new Date(member.joinedTimestamp) : null,
  });

  if (failure) {
    await interaction.reply({
      content: `❌ ${describeRequirementFailure(failure)}`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const { added } = await db.giveawayEntries.addEntry(giveawayId, interaction.user.id);
  if (!added) {
    await interaction.reply({
      content: "ℹ️ You're already entered in this giveaway.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.reply({ content: "🎉 You're entered! Good luck.", flags: [MessageFlags.Ephemeral] });

  try {
    const entrantCount = await db.giveawayEntries.countEntries(giveawayId);
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
      status: "active",
      requirements: giveaway.requirements,
    });
    const components = buildGiveawayComponents(giveaway.id, "active");
    await interaction.message.edit({ embeds: [embed], components: components as any });
  } catch (err) {
    moduleManager.logger.warn(
      `Failed to refresh giveaway embed entrant count: ${err instanceof Error ? err.message : err}`,
      giveaway.guildId,
      "giveaways",
    );
  }
}
