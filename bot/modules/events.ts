import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionsBitField,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventEntityType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  MessageFlags,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";

// ─── Timezone Abbreviation Map ───────────────────────────────────────────────
// Maps common timezone abbreviations to UTC offset in minutes.
const TIMEZONE_OFFSETS: Record<string, number> = {
  // North America
  EST: -300, EDT: -240,
  CST: -360, CDT: -300,
  MST: -420, MDT: -360,
  PST: -480, PDT: -420,
  AKST: -540, AKDT: -480,
  HST: -600,
  // Europe
  GMT: 0, UTC: 0,
  WET: 0, WEST: 60,
  CET: 60, CEST: 120,
  EET: 120, EEST: 180,
  // Asia / Oceania
  IST: 330,   // India
  CST_CN: 480, // China (use "CST" context-dependently or "HKT")
  HKT: 480,
  JST: 540,
  KST: 540,
  AEST: 600, AEDT: 660,
  ACST: 570, ACDT: 630,
  AWST: 480,
  NZST: 720, NZDT: 780,
  // South America
  BRT: -180, BRST: -120,
  ART: -180,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Store pending event data between showModal → modal submit (description from slash option) */
const pendingDescriptions = new Map<string, string>();

/**
 * Parse a user-friendly date string into { month, day, year }.
 * Accepts:  MM/DD/YYYY, MM-DD-YYYY, DD.MM.YYYY, "Dec 31, 2026", "31 Dec 2026"
 */
function parseDate(input: string): { month: number; day: number; year: number } | null {
  const trimmed = input.trim();

  // Try MM/DD/YYYY or MM-DD-YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (slashMatch) {
    return { month: parseInt(slashMatch[1]), day: parseInt(slashMatch[2]), year: parseInt(slashMatch[3]) };
  }

  // Try YYYY-MM-DD (ISO-like)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return { month: parseInt(isoMatch[2]), day: parseInt(isoMatch[3]), year: parseInt(isoMatch[1]) };
  }

  // Try named month: "Dec 31, 2026" or "December 31, 2026" or "31 Dec 2026"
  const months: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };

  // "Dec 31, 2026" or "December 31 2026"
  const namedMatch1 = trimmed.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (namedMatch1) {
    const m = months[namedMatch1[1].toLowerCase()];
    if (m) return { month: m, day: parseInt(namedMatch1[2]), year: parseInt(namedMatch1[3]) };
  }

  // "31 Dec 2026"
  const namedMatch2 = trimmed.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (namedMatch2) {
    const m = months[namedMatch2[2].toLowerCase()];
    if (m) return { month: m, day: parseInt(namedMatch2[1]), year: parseInt(namedMatch2[3]) };
  }

  return null;
}

/**
 * Parse a user-friendly time string into { hours (0-23), minutes }.
 * Accepts: "8:00 PM", "8PM", "20:00", "8:30pm", "3:00 am"
 */
function parseTime(input: string): { hours: number; minutes: number } | null {
  const trimmed = input.trim().toLowerCase();

  // Match "8:30 PM", "8:30PM", "8PM", "8 PM"
  const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hours = parseInt(match12[1]);
    const minutes = match12[2] ? parseInt(match12[2]) : 0;
    const period = match12[3];

    if (hours < 1 || hours > 12) return null;
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;

    return { hours, minutes };
  }

  // Match 24h format "20:00", "8:30"
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1]);
    const minutes = parseInt(match24[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }

  return null;
}

/**
 * Parse timezone input and return UTC offset in minutes.
 * Accepts abbreviations (EST, PST) or explicit offsets (UTC+5, UTC-4:30, +5, -4).
 * Returns null if unrecognized.
 */
function parseTimezone(input: string): number | null {
  const trimmed = input.trim().toUpperCase();

  // Check abbreviation map
  if (TIMEZONE_OFFSETS[trimmed] !== undefined) return TIMEZONE_OFFSETS[trimmed];

  // Try explicit offset: "UTC+5", "UTC-4:30", "+5", "-4", "UTC+05:30"
  const offsetMatch = trimmed.match(/^(?:UTC|GMT)?\s*([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (offsetMatch) {
    const sign = offsetMatch[1] === "+" ? 1 : -1;
    const hours = parseInt(offsetMatch[2]);
    const minutes = offsetMatch[3] ? parseInt(offsetMatch[3]) : 0;
    return sign * (hours * 60 + minutes);
  }

  return null;
}

// ─── Command Definition ──────────────────────────────────────────────────────

const eventsModule: BotModule = {
  name: "events",
  description: "Schedule server events natively",
  skipDefer: true, // We need to showModal before any defer
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Manage server events")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new scheduled event (opens a form)")
        .addStringOption((opt) =>
          opt.setName("description").setDescription("Optional event description")
        )
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageEvents)
    .toJSON(),

  // ─── Slash command handler — opens the modal ─────────────────────────────
  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager
  ) => {
    const guild = interaction.guild;
    const subcommand = interaction.options.getSubcommand();

    if (!guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (subcommand === "create") {
      // Stash the optional description (modal only has 5 slots)
      const description = interaction.options.getString("description") || "";
      const key = `${guild.id}-${interaction.user.id}`;
      if (description) {
        pendingDescriptions.set(key, description);
        setTimeout(() => pendingDescriptions.delete(key), 10 * 60 * 1000);
      }

      // Build the modal with user-friendly fields
      const modal = new ModalBuilder()
        .setCustomId(`events:create_${interaction.user.id}`)
        .setTitle("📅 Create Server Event");

      const nameInput = new TextInputBuilder()
        .setCustomId("event_name")
        .setLabel("Event Name")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. Community Game Night")
        .setMaxLength(100)
        .setRequired(true);

      const dateInput = new TextInputBuilder()
        .setCustomId("event_date")
        .setLabel("Date (MM/DD/YYYY or Dec 31, 2026)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("12/31/2026")
        .setMaxLength(30)
        .setRequired(true);

      const timeInput = new TextInputBuilder()
        .setCustomId("event_time")
        .setLabel("Time (e.g. 8:00 PM or 20:00)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("8:00 PM")
        .setMaxLength(15)
        .setRequired(true);

      const timezoneInput = new TextInputBuilder()
        .setCustomId("event_timezone")
        .setLabel("Timezone (e.g. EST, PST, UTC, UTC+5)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("EST")
        .setMaxLength(15)
        .setRequired(false);

      const locationInput = new TextInputBuilder()
        .setCustomId("event_location")
        .setLabel("Location (URL or text)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("https://discord.gg/... or Voice Channel")
        .setMaxLength(100)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(dateInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(timezoneInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(locationInput),
      );

      await interaction.showModal(modal);
    }
  },

  // ─── Modal submit handler — parses fields and creates the event ──────────
  handleModal: async (
    interaction: ModalSubmitInteraction,
    moduleManager: ModuleManager
  ) => {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply("❌ This command can only be used in a server.");
      return;
    }

    // Retrieve the pending description (if any)
    const key = `${guild.id}-${interaction.user.id}`;
    const description = pendingDescriptions.get(key) || "";
    pendingDescriptions.delete(key);

    // Parse form fields
    const name = interaction.fields.getTextInputValue("event_name");
    const dateRaw = interaction.fields.getTextInputValue("event_date");
    const timeRaw = interaction.fields.getTextInputValue("event_time");
    const timezoneRaw = interaction.fields.getTextInputValue("event_timezone") || "UTC";
    const location = interaction.fields.getTextInputValue("event_location");

    // Parse date
    const dateParsed = parseDate(dateRaw);
    if (!dateParsed) {
      await interaction.editReply(
        "❌ Couldn't understand the date. Try formats like `12/31/2026`, `2026-12-31`, or `Dec 31, 2026`."
      );
      return;
    }

    // Parse time
    const timeParsed = parseTime(timeRaw);
    if (!timeParsed) {
      await interaction.editReply(
        "❌ Couldn't understand the time. Try formats like `8:00 PM`, `20:00`, or `3:30 AM`."
      );
      return;
    }

    // Parse timezone
    const tzOffset = parseTimezone(timezoneRaw);
    if (tzOffset === null) {
      await interaction.editReply(
        `❌ Unknown timezone \`${timezoneRaw}\`. Try abbreviations like \`EST\`, \`PST\`, \`CET\`, \`UTC\`, or offsets like \`UTC+5\`, \`UTC-4:30\`.`
      );
      return;
    }

    // Build the UTC Date
    // Create date in UTC, then subtract the timezone offset to get the correct UTC time
    const utcDate = new Date(Date.UTC(
      dateParsed.year,
      dateParsed.month - 1,
      dateParsed.day,
      timeParsed.hours,
      timeParsed.minutes,
    ));
    // Subtract offset: if timezone is EST (-300 min), user meant local time,
    // so we add 300 minutes to get UTC
    utcDate.setMinutes(utcDate.getMinutes() - tzOffset);

    if (isNaN(utcDate.getTime())) {
      await interaction.editReply("❌ The resulting date/time is invalid. Please check your inputs.");
      return;
    }

    if (utcDate <= new Date()) {
      await interaction.editReply(
        `❌ The event time must be in the future. You entered <t:${Math.floor(utcDate.getTime() / 1000)}:F> which is in the past.`
      );
      return;
    }

    // Create the scheduled event
    try {
      const event = await guild.scheduledEvents.create({
        name,
        scheduledStartTime: utcDate,
        scheduledEndTime: new Date(utcDate.getTime() + 60 * 60 * 1000),
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: { location },
        description,
        reason: `Created via MODUS events module by ${interaction.user.tag}`,
      });

      const unixTs = Math.floor(utcDate.getTime() / 1000);
      await interaction.editReply(
        `✅ Event **${event.name}** successfully scheduled!\n` +
        `📅 <t:${unixTs}:F> (<t:${unixTs}:R>)\n` +
        `📍 ${location}`
      );
    } catch (err) {
      moduleManager.logger.error("Failed to create scheduled event", guild.id, err, "events");
      await interaction.editReply(
        "❌ Failed to create event. Make sure I have the **Manage Events** permission and the provided data is valid."
      );
    }
  },
};

export function registerEventsEvents(moduleManager: ModuleManager) {
  // Stub: no passive event listeners needed at the moment
}

export default eventsModule;
