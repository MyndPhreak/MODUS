import {
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  TextChannel,
  ThreadChannel,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";
import {
  TicketsSettingsSchema,
  type TicketsSettingsType,
  type TicketTypeConfig,
  type TicketQuestionConfig,
} from "../../../lib/schemas";
import { parseSettings } from "../../../lib/validateSettings";
import { formatTicketName, encodeMeta } from "../lib/utils";
import { PRIORITY_CONFIG, type TicketMeta } from "../lib/types";

// ── Per-guild settings cache ──────────────────────────────────────────────────
// Avoids extra Appwrite round-trips during button clicks that must respond within
// Discord's 3-second interaction window.

interface SettingsCacheEntry {
  settings: TicketsSettingsType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawSettings: Record<string, any>;
  expiresAt: number;
}

const settingsCache = new Map<string, SettingsCacheEntry>();
const CACHE_TTL_MS = 60_000; // 1 minute

async function loadSettings(
  guildId: string,
  moduleManager: ModuleManager,
): Promise<SettingsCacheEntry | null> {
  const cached = settingsCache.get(guildId);
  if (cached && Date.now() < cached.expiresAt) return cached;

  const appwrite = moduleManager.appwriteService;
  const rawSettings = await appwrite.getModuleSettings(guildId, "tickets");
  const settings = parseSettings(TicketsSettingsSchema, rawSettings, "tickets", guildId);
  if (!settings) return null;

  const entry: SettingsCacheEntry = {
    settings,
    rawSettings,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  settingsCache.set(guildId, entry);
  return entry;
}

/**
 * Bust the settings cache for a guild.
 * Call this after any `/tickets config` change so the next open reflects
 * the updated questions / parent channel immediately.
 */
export function invalidateSettingsCache(guildId: string): void {
  settingsCache.delete(guildId);
}

// ── Thread action row ─────────────────────────────────────────────────────────

function buildThreadActions(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("tickets:close")
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒"),
    new ButtonBuilder()
      .setCustomId("tickets:claim")
      .setLabel("Claim")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🙋"),
    new ButtonBuilder()
      .setCustomId("tickets:priority")
      .setLabel("Set Priority")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🏷️"),
  );
}

// ── Info embed (pinned at top of thread) ──────────────────────────────────────

function buildInfoEmbed(
  meta: TicketMeta,
  member: { tag: string },
  ticketType: TicketTypeConfig | undefined,
  settings: TicketsSettingsType,
): EmbedBuilder {
  const priority = PRIORITY_CONFIG[meta.priority];

  const colorHex =
    ticketType?.embed?.color ??
    settings.panelEmbed?.color ??
    "#5865F2";
  const color = parseInt(colorHex.replace("#", ""), 16);

  return new EmbedBuilder()
    .setTitle(`📋 Ticket #${String(meta.ticketId).padStart(4, "0")}`)
    .setColor(color)
    .addFields(
      { name: "👤 Opened By", value: `<@${meta.ownerId}>`, inline: true },
      { name: "🏷️ Type", value: ticketType?.name ?? "General Support", inline: true },
      {
        name: "📅 Opened",
        value: `<t:${Math.floor(new Date(meta.openedAt).getTime() / 1000)}:R>`,
        inline: true,
      },
      { name: "⚡ Status", value: "🔵 Open", inline: true },
      { name: "🏷️ Priority", value: `${priority.emoji} ${priority.label}`, inline: true },
      { name: "👷 Claimed By", value: "Unclaimed", inline: true },
    )
    .setFooter({ text: encodeMeta(meta) });
}

// ── Pre-open modal ────────────────────────────────────────────────────────────

function buildOpenModal(
  questions: TicketQuestionConfig[],
  typeId: string | undefined,
): ModalBuilder {
  const capped = questions.slice(0, 5); // Discord allows max 5 action rows in a modal
  const customId = typeId ? `tickets:open-modal:${typeId}` : "tickets:open-modal";

  const rows = capped.map((q) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(q.id)
        .setLabel(q.label.substring(0, 45))
        .setStyle(q.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(q.required)
        .setPlaceholder(q.placeholder?.substring(0, 100) ?? "")
        .setMinLength(q.minLength ?? 0)
        .setMaxLength(q.maxLength ?? (q.style === "paragraph" ? 1000 : 200)),
    ),
  );

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle("Open a Ticket")
    .addComponents(...rows);
}

// ── Shared thread-creation core ──────────────────────────────────────────────
// Both handleOpen (no modal) and handleModalOpen call this after deferring.

type TicketInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

async function createTicketThread(
  interaction: TicketInteraction,
  moduleManager: ModuleManager,
  settings: TicketsSettingsType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawSettings: Record<string, any>,
  ticketType: TicketTypeConfig | undefined,
  answers: Record<string, string>,
): Promise<void> {
  const { guildId, guild } = interaction;
  if (!guildId || !guild) return;

  // ── Resolve parent channel ─────────────────────────────────────────────────
  const parentChannelId = ticketType?.parentChannelId ?? settings.defaultParentChannelId;
  if (!parentChannelId) {
    await interaction.editReply(
      "❌ Ticket system is not fully configured — no parent channel set.",
    );
    return;
  }

  const parentChannel = guild.channels.cache.get(parentChannelId) as TextChannel | undefined;
  if (!parentChannel || parentChannel.type !== ChannelType.GuildText) {
    await interaction.editReply(
      "❌ The configured support channel is missing or is not a text channel.",
    );
    return;
  }

  // ── Duplicate guard ────────────────────────────────────────────────────────
  const maxTickets = settings.maxTicketsPerUser ?? 1;
  if (maxTickets > 0) {
    try {
      const activeThreads = await parentChannel.threads.fetchActive();
      let openCount = 0;
      let firstFound: ThreadChannel | undefined;
      for (const t of activeThreads.threads.values()) {
        if (
          t.type === ChannelType.PrivateThread &&
          !t.archived &&
          t.members.cache.has(interaction.user.id)
        ) {
          openCount++;
          firstFound = firstFound ?? (t as ThreadChannel);
        }
      }
      if (openCount >= maxTickets) {
        await interaction.editReply(
          firstFound
            ? `❌ You already have an open ticket: <#${firstFound.id}>`
            : `❌ You have reached the maximum of ${maxTickets} open ticket(s).`,
        );
        return;
      }
    } catch {
      // Non-fatal — proceed even if the thread scan fails
    }
  }

  // ── Counter + thread name ──────────────────────────────────────────────────
  const newCounter = (settings.ticketCounter ?? 0) + 1;
  const typeName = ticketType?.name ?? "Support";
  const threadName = formatTicketName(settings, interaction.user.username, typeName, newCounter);

  // ── Create private thread ──────────────────────────────────────────────────
  let thread: ThreadChannel;
  try {
    thread = (await parentChannel.threads.create({
      name: threadName,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: `Support ticket for ${interaction.user.tag}`,
    })) as ThreadChannel;
  } catch (err) {
    moduleManager.logger.error("Failed to create ticket thread", guildId, err, "tickets");
    await interaction.editReply(
      "❌ Failed to create your ticket. Please check that I have the **Create Private Threads** permission.",
    );
    return;
  }

  // Add opener to thread (fire-and-forget to avoid blocking)
  thread.members.add(interaction.user.id).catch(() => {});

  // Persist incremented counter (fire-and-forget)
  moduleManager.appwriteService
    .setModuleSettings(guildId, "tickets", { ...rawSettings, ticketCounter: newCounter })
    .catch((err) =>
      moduleManager.logger.error("Failed to update ticket counter", guildId, err, "tickets"),
    );

  // ── Build + pin the info embed ─────────────────────────────────────────────
  const staffRoleIds = ticketType?.staffRoleIds?.length
    ? ticketType.staffRoleIds
    : settings.staffRoleIds;

  const meta: TicketMeta = {
    ticketId: newCounter,
    ownerId: interaction.user.id,
    typeId: ticketType?.id ?? null,
    priority: "normal",
    status: "open",
    claimedById: null,
    openedAt: new Date().toISOString(),
  };

  const infoEmbed = buildInfoEmbed(meta, { tag: interaction.user.tag }, ticketType, settings);
  const infoMsg = await thread.send({ embeds: [infoEmbed.toJSON()] });
  await infoMsg.pin().catch(() => {});

  // ── Post pre-open modal answers (if any) ───────────────────────────────────
  const effectiveQuestions = ticketType?.questions?.length
    ? ticketType.questions
    : settings.questions;

  const filledAnswers = effectiveQuestions.filter((q) => answers[q.id]);
  if (filledAnswers.length > 0) {
    const answersEmbed = new EmbedBuilder()
      .setTitle("📝 Ticket Details")
      .setColor(parseInt((ticketType?.embed?.color ?? settings.panelEmbed?.color ?? "#5865F2").replace("#", ""), 16))
      .setDescription(
        filledAnswers.map((q) => `**${q.label}**\n${answers[q.id]}`).join("\n\n"),
      );
    await thread.send({ embeds: [answersEmbed.toJSON()] }).catch(() => {});
  }

  // ── Welcome message + action row ───────────────────────────────────────────
  const staffPings = staffRoleIds.map((r) => `<@&${r}>`).join(" ");
  const welcomeContent = [
    `Welcome <@${interaction.user.id}>! A staff member will be with you shortly.`,
    staffPings ? `\n${staffPings}` : "",
  ]
    .join("")
    .trim();

  await thread.send({ content: welcomeContent, components: [buildThreadActions()] });

  await interaction.editReply(`✅ Your ticket has been created: <#${thread.id}>`);
  moduleManager.logger.info(
    `Ticket #${newCounter} (${threadName}) opened by ${interaction.user.tag}`,
    guildId,
    "tickets",
  );
}

// ── handleOpen — button / select-menu entry point ────────────────────────────
// Loads settings first (using cache), then either shows the pre-open modal
// (when questions are configured) or creates the thread directly.

export async function handleOpen(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  moduleManager: ModuleManager,
  typeId?: string,
): Promise<void> {
  const { guildId } = interaction;
  if (!guildId) return;

  // Load settings via cache — must stay under Discord's 3-second interaction window.
  const cached = await loadSettings(guildId, moduleManager);
  if (!cached) {
    await interaction.reply({
      content: "❌ Ticket system is not configured.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  const { settings, rawSettings } = cached;

  // Resolve ticket type
  const ticketType: TicketTypeConfig | undefined =
    typeId && settings.types.length > 0
      ? settings.types.find((t) => t.id === typeId)
      : undefined;

  if (typeId && settings.types.length > 0 && !ticketType) {
    await interaction.reply({
      content: "❌ Unknown ticket type.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Effective questions: type-specific → global fallback
  const effectiveQuestions = ticketType?.questions?.length
    ? ticketType.questions
    : settings.questions;

  // If questions configured → show modal and wait for submission
  if (effectiveQuestions.length > 0) {
    await interaction.showModal(buildOpenModal(effectiveQuestions, typeId));
    return;
  }

  // No questions → create thread directly
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  await createTicketThread(interaction, moduleManager, settings, rawSettings, ticketType, {});
}

// ── handleModalOpen — modal submit entry point ────────────────────────────────
// Called by the module's handleModal method after the user submits answers.

export async function handleModalOpen(
  interaction: ModalSubmitInteraction,
  moduleManager: ModuleManager,
  typeId?: string,
): Promise<void> {
  const { guildId } = interaction;
  if (!guildId) return;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const cached = await loadSettings(guildId, moduleManager);
  if (!cached) {
    await interaction.editReply("❌ Ticket system is not configured.");
    return;
  }
  const { settings, rawSettings } = cached;

  const ticketType: TicketTypeConfig | undefined =
    typeId && settings.types.length > 0
      ? settings.types.find((t) => t.id === typeId)
      : undefined;

  // Extract answers keyed by question id
  const effectiveQuestions = ticketType?.questions?.length
    ? ticketType.questions
    : settings.questions;

  const answers: Record<string, string> = {};
  for (const q of effectiveQuestions) {
    try {
      const value = interaction.fields.getTextInputValue(q.id).trim();
      if (value) answers[q.id] = value;
    } catch {
      // Field not present (optional + left empty) — skip
    }
  }

  await createTicketThread(interaction, moduleManager, settings, rawSettings, ticketType, answers);
}
