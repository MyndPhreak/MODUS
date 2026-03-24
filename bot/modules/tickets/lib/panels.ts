import {
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  APIEmbed,
} from "discord.js";
import type { TicketsSettingsType } from "../../../lib/schemas";
import { parseHexColor, deployOrUpdateMessage } from "../../../lib/discord-utils";

// ── Embed builder ───────────────────────────────────────────────────────────

function buildPanelEmbed(settings: TicketsSettingsType): APIEmbed {
  return {
    title: settings.panelEmbed?.title ?? "🎫 Support Tickets",
    description:
      settings.panelEmbed?.description ??
      "Need help? Click a button below to open a private support ticket with our staff.",
    color: parseHexColor(settings.panelEmbed?.color ?? "") ?? 0x5865f2,
  };
}

// ── Component builder ───────────────────────────────────────────────────────

function buildPanelComponents(settings: TicketsSettingsType) {
  const { types } = settings;

  // Single-mode (no types configured) — one generic Open Ticket button
  if (types.length === 0) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("tickets:open")
          .setLabel("Open Ticket")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🎫"),
      ),
    ];
  }

  // ≤5 types → one button per type (up to 5 per row)
  if (types.length <= 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const type of types) {
      const style =
        (ButtonStyle as unknown as Record<string, ButtonStyle>)[type.buttonStyle] ??
        ButtonStyle.Primary;
      const btn = new ButtonBuilder()
        .setCustomId(`tickets:open:${type.id}`)
        .setLabel(type.name)
        .setStyle(style);
      if (type.emoji) btn.setEmoji(type.emoji);
      row.addComponents(btn);
    }
    return [row];
  }

  // >5 types → select menu (max 25 options)
  const select = new StringSelectMenuBuilder()
    .setCustomId("tickets:type-select")
    .setPlaceholder("Choose a ticket type…");

  for (const type of types.slice(0, 25)) {
    const opt = new StringSelectMenuOptionBuilder()
      .setValue(type.id)
      .setLabel(type.name);
    if (type.description) opt.setDescription(type.description);
    if (type.emoji) opt.setEmoji(type.emoji);
    select.addOptions(opt);
  }

  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)];
}

// ── Deploy / update ─────────────────────────────────────────────────────────

/**
 * Deploys the panel to `channel`. If `settings.panelMessageId` points to an
 * existing message it edits that message in-place; otherwise sends a new one.
 * Returns the final message ID (caller should persist it to Appwrite).
 */
export async function deployOrUpdatePanel(
  channel: TextChannel,
  settings: TicketsSettingsType,
): Promise<string> {
  const embed = buildPanelEmbed(settings);
  const components = buildPanelComponents(settings) as any[];
  return deployOrUpdateMessage(
    channel,
    { embeds: [embed], components },
    settings.panelMessageId,
    settings.panelChannelId ?? channel.id,
  );
}
