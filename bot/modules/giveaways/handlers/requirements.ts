import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  ModalSubmitInteraction,
  RoleSelectMenuInteraction,
} from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";
import type { DatabaseService } from "../../../DatabaseService";
import { GiveawaySettingsSchema } from "../../../lib/schemas";
import { parseSettings } from "../../../lib/validateSettings";
import { hasAnyRole, isAdminOrManageGuild } from "../../../lib/discord-utils";
import { buildGiveawayComponents, buildGiveawayEmbed } from "../lib/embed";
import type { GiveawayStatus, PrizeKind } from "../lib/embed";

type LoadedGiveaway = NonNullable<Awaited<ReturnType<DatabaseService["giveaways"]["getById"]>>>;

async function requireHost(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): Promise<boolean> {
  const guildId = interaction.guildId!;
  const rawSettings = await moduleManager.databaseService.getModuleSettings(guildId, "giveaways");
  const settings = parseSettings(GiveawaySettingsSchema, rawSettings, "giveaways", guildId);
  const member = interaction.member as GuildMember;
  if (!settings || (!isAdminOrManageGuild(member) && !hasAnyRole(member, settings.hostRoleIds))) {
    await interaction.editReply("❌ You don't have permission to manage giveaways.");
    return false;
  }
  return true;
}

async function refreshGiveawayMessage(moduleManager: ModuleManager, giveaway: LoadedGiveaway): Promise<void> {
  try {
    const channel = await moduleManager.client.channels.fetch(giveaway.channelId);
    if (!channel?.isTextBased() || !("messages" in channel)) return;
    const message = await channel.messages.fetch(giveaway.messageId);

    const entrantCount = await moduleManager.databaseService.giveawayEntries.countEntries(giveaway.id);
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
      winnerIds: giveaway.winnerIds,
      requirements: giveaway.requirements,
    });
    const components = buildGiveawayComponents(giveaway.id, giveaway.status as GiveawayStatus);
    await message.edit({ embeds: [embed], components: components as any });
  } catch (err) {
    moduleManager.logger.warn(
      `Failed to refresh giveaway embed after requirements update: ${err instanceof Error ? err.message : err}`,
      giveaway.guildId,
      "giveaways",
    );
  }
}

export async function handleRequirementsCommand(
  interaction: ChatInputCommandInteraction,
  moduleManager: ModuleManager,
): Promise<void> {
  if (!(await requireHost(interaction, moduleManager))) return;

  const messageId = interaction.options.getString("message_id", true);
  const giveaway = await moduleManager.databaseService.giveaways.getByMessageId(messageId);
  if (!giveaway || giveaway.guildId !== interaction.guildId) {
    await interaction.editReply("❌ No giveaway found with that message ID in this server.");
    return;
  }
  if (giveaway.status !== "active") {
    await interaction.editReply("❌ Requirements can only be edited on an active giveaway.");
    return;
  }

  const requiredRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`giveaways:req-required:${giveaway.id}`)
      .setPlaceholder("Required roles (leave empty to clear)")
      .setMinValues(0)
      .setMaxValues(10),
  );
  const blockedRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`giveaways:req-blocked:${giveaway.id}`)
      .setPlaceholder("Blocked roles (leave empty to clear)")
      .setMinValues(0)
      .setMaxValues(10),
  );
  const ageButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaways:req-age:${giveaway.id}`)
      .setLabel("Set Age Requirements")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({
    content: `Configuring requirements for **${giveaway.title}**. Selections save immediately.`,
    components: [requiredRow, blockedRow, ageButtonRow],
  });
}

export async function handleRoleSelect(
  interaction: RoleSelectMenuInteraction,
  moduleManager: ModuleManager,
  kind: "required" | "blocked",
  giveawayId: string,
): Promise<void> {
  const db = moduleManager.databaseService;
  const giveaway = await db.giveaways.getById(giveawayId);
  if (!giveaway) {
    await interaction.reply({ content: "❌ Giveaway not found.", flags: [MessageFlags.Ephemeral] });
    return;
  }

  const roleIds = interaction.values;
  const requirements = {
    ...giveaway.requirements,
    ...(kind === "required" ? { requiredRoleIds: roleIds } : { blockedRoleIds: roleIds }),
  };
  await db.giveaways.update(giveawayId, { requirements });

  await interaction.reply({
    content: `✅ ${kind === "required" ? "Required" : "Blocked"} roles updated (${roleIds.length}).`,
    flags: [MessageFlags.Ephemeral],
  });

  await refreshGiveawayMessage(moduleManager, { ...giveaway, requirements });
}

export async function handleAgeButton(interaction: ButtonInteraction, giveawayId: string): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`giveaways:req-age-modal:${giveawayId}`)
    .setTitle("Age Requirements");

  const makeRow = (input: TextInputBuilder) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(input);

  modal.addComponents(
    makeRow(
      new TextInputBuilder()
        .setCustomId("min_account_age_days")
        .setLabel("Min. Discord account age (days, blank = off)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(4),
    ),
    makeRow(
      new TextInputBuilder()
        .setCustomId("min_server_age_days")
        .setLabel("Min. server membership age (days, blank = off)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(4),
    ),
  );

  await interaction.showModal(modal);
}

export async function handleAgeModal(
  interaction: ModalSubmitInteraction,
  moduleManager: ModuleManager,
  giveawayId: string,
): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const db = moduleManager.databaseService;
  const giveaway = await db.giveaways.getById(giveawayId);
  if (!giveaway) {
    await interaction.editReply("❌ Giveaway not found.");
    return;
  }

  const parseField = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const minAccountAgeDays = parseField(interaction.fields.getTextInputValue("min_account_age_days"));
  const minServerAgeDays = parseField(interaction.fields.getTextInputValue("min_server_age_days"));

  const requirements = { ...giveaway.requirements, minAccountAgeDays, minServerAgeDays };
  await db.giveaways.update(giveawayId, { requirements });
  await refreshGiveawayMessage(moduleManager, { ...giveaway, requirements });

  await interaction.editReply("✅ Age requirements updated.");
}
