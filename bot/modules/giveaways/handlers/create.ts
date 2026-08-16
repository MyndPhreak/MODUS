import type { ChatInputCommandInteraction, GuildMember, TextChannel } from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";
import { GiveawaySettingsSchema } from "../../../lib/schemas";
import { parseSettings } from "../../../lib/validateSettings";
import { hasAnyRole, isAdminOrManageGuild } from "../../../lib/discord-utils";
import { parseGiveawayDuration } from "../lib/duration";
import { buildGiveawayComponents, buildGiveawayEmbed } from "../lib/embed";
import type { PrizeKind } from "../lib/embed";

const VALID_PRIZE_KINDS: PrizeKind[] = ["key", "gift", "physical", "other"];

export async function handleCreate(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): Promise<void> {
  const guildId = interaction.guildId!;
  const member = interaction.member as GuildMember;
  const db = moduleManager.databaseService;

  const rawSettings = await db.getModuleSettings(guildId, "giveaways");
  const settings = parseSettings(GiveawaySettingsSchema, rawSettings, "giveaways", guildId);
  if (!settings) {
    await interaction.editReply("❌ Failed to load giveaway settings.");
    return;
  }
  if (!isAdminOrManageGuild(member) && !hasAnyRole(member, settings.hostRoleIds)) {
    await interaction.editReply("❌ You don't have permission to run giveaways.");
    return;
  }

  const channel = interaction.options.getChannel("channel", true) as TextChannel;
  const title = interaction.options.getString("title", true);
  const durationInput = interaction.options.getString("duration", true);
  const winners = interaction.options.getInteger("winners") ?? 1;
  const prizeKind = interaction.options.getString("prize_kind", true) as PrizeKind;
  const prizeValue = interaction.options.getString("prize_value", true);
  const description = interaction.options.getString("description") ?? undefined;
  const imageUrl = interaction.options.getString("image_url") ?? undefined;

  if (!VALID_PRIZE_KINDS.includes(prizeKind)) {
    await interaction.editReply("❌ Invalid prize kind.");
    return;
  }
  if (winners < 1 || winners > 50) {
    await interaction.editReply("❌ Winner count must be between 1 and 50.");
    return;
  }

  const parsedDuration = parseGiveawayDuration(durationInput);
  if ("error" in parsedDuration) {
    const message =
      parsedDuration.error === "unparseable"
        ? "Couldn't understand that duration. Try something like 'in 1 hour' or '3 days'."
        : parsedDuration.error === "too_short"
          ? "Duration must be at least 5 minutes."
          : "Duration can't exceed 30 days.";
    await interaction.editReply(`❌ ${message}`);
    return;
  }

  const id = crypto.randomUUID();
  const requirements = { requiredRoleIds: [] as string[], blockedRoleIds: [] as string[] };
  const embed = buildGiveawayEmbed({
    id,
    title,
    description,
    prizeKind,
    prizeValue,
    imageUrl,
    winnerCount: winners,
    entrantCount: 0,
    endsAt: parsedDuration.endsAt,
    status: "active",
    requirements,
  });
  const components = buildGiveawayComponents(id, "active");

  let messageId: string;
  try {
    const message = await channel.send({ embeds: [embed], components: components as any });
    messageId = message.id;
  } catch (err) {
    moduleManager.logger.error("Failed to post giveaway", guildId, err, "giveaways");
    await interaction.editReply(
      "❌ Failed to post the giveaway. Check bot permissions in that channel.",
    );
    return;
  }

  await db.giveaways.create({
    id,
    guildId,
    channelId: channel.id,
    messageId,
    hostId: interaction.user.id,
    title,
    description,
    prizeKind,
    prizeValue,
    imageUrl,
    winnerCount: winners,
    requirements,
    endsAt: parsedDuration.endsAt,
    source: "slash",
  });

  await interaction.editReply(
    `✅ Giveaway posted in <#${channel.id}>. Use \`/giveaway requirements message_id:${messageId}\` to add entry requirements.`,
  );
}
