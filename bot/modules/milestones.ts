import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  Interaction,
  MessageFlags,
  TextChannel,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";
import { MilestoneSettingsSchema } from "../lib/schemas";
import { parseSettings } from "../lib/validateSettings";

// ── Types ──────────────────────────────────────────────────────────────

export interface MilestoneConfig {
  threshold: number;
  message: string;
}

interface CachedUserState {
  docId: string | null;
  charCount: number;
  pendingChars: number;
  lastMilestone: number;
  notificationPref: "public" | "private" | "silent";
  optedIn: boolean;
  prompted: boolean; // Whether we've already sent the opt-in prompt
  username: string;
}

// ── Default Milestone Definitions ──────────────────────────────────────

export const DEFAULT_MILESTONES: MilestoneConfig[] = [
  {
    threshold: 1_000,
    message: "That's about as long as a short email! 📧",
  },
  {
    threshold: 5_000,
    message: "You've written a college essay's worth of text! 📝",
  },
  {
    threshold: 10_000,
    message: "That's roughly the length of a short story! 📖",
  },
  {
    threshold: 25_000,
    message:
      "You've typed more than the US Constitution's preamble… many times over! 🇺🇸",
  },
  {
    threshold: 50_000,
    message: "You've written a novella's worth of messages! 📚",
  },
  {
    threshold: 100_000,
    message: "That's about as long as a short novel! 🏅",
  },
  {
    threshold: 250_000,
    message:
      "You've typed more than the entire Declaration of Independence — 40 times over! 🗽",
  },
  {
    threshold: 500_000,
    message:
      "Half a million characters! You could fill a full-length novel! ✍️",
  },
  {
    threshold: 1_000_000,
    message:
      "A MILLION characters?! You've written more than War and Peace! 🏆",
  },
];

const MIN_MESSAGE_LENGTH = 5;
const FLUSH_INTERVAL_MS = 30_000;
const LEADERBOARD_PAGE_SIZE = 10;

// ── In-Memory Cache & Buffer ───────────────────────────────────────────

/** key = "guildId:userId" */
const userCache: Map<string, CachedUserState> = new Map();
let flushTimer: NodeJS.Timeout | null = null;

function cacheKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Count visible characters in a message.
 * - Skips messages starting with / (slash commands)
 * - Normalises custom Discord emojis (<:name:id> / <a:name:id>) to 1 char each
 * - Returns code-point length (handles multi-byte emoji correctly)
 */
function countVisibleChars(content: string): number {
  if (content.startsWith("/")) return 0;
  let text = content;
  // Normalise custom Discord emojis to 1 char each
  text = text.replace(/<a?:\w+:\d+>/g, "E");
  return [...text].length;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function progressBar(current: number, target: number, length = 20): string {
  const ratio = Math.min(current / target, 1);
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

function getMedalEmoji(rank: number): string {
  switch (rank) {
    case 1:
      return "🥇";
    case 2:
      return "🥈";
    case 3:
      return "🥉";
    default:
      return `\`${rank}.\``;
  }
}

/**
 * Get the active milestone config for a guild.
 * Falls back to DEFAULT_MILESTONES if the guild hasn't customised them.
 */
async function getGuildMilestones(
  appwrite: ModuleManager["appwriteService"],
  guildId: string,
): Promise<MilestoneConfig[]> {
  const raw = await appwrite.getModuleSettings(guildId, "milestones");
  const parsed = parseSettings(
    MilestoneSettingsSchema,
    raw,
    "milestones",
    guildId,
  );
  if (parsed?.milestones && parsed.milestones.length > 0) {
    return parsed.milestones;
  }
  return DEFAULT_MILESTONES;
}

/**
 * Find the next milestone for a given character count.
 * Returns null if the user has passed all defined milestones.
 */
function getNextMilestone(
  charCount: number,
  milestones: MilestoneConfig[],
): MilestoneConfig | null {
  const sorted = [...milestones].sort((a, b) => a.threshold - b.threshold);
  return sorted.find((m) => m.threshold > charCount) ?? null;
}

/**
 * Find all milestones crossed between oldCount and newCount.
 */
function getCrossedMilestones(
  oldCount: number,
  newCount: number,
  milestones: MilestoneConfig[],
): MilestoneConfig[] {
  return milestones
    .filter((m) => m.threshold > oldCount && m.threshold <= newCount)
    .sort((a, b) => a.threshold - b.threshold);
}

// ── Buffer Flush Logic ─────────────────────────────────────────────────

async function flushBuffer(appwrite: ModuleManager["appwriteService"]) {
  const entries = Array.from(userCache.entries()).filter(
    ([, state]) => state.pendingChars > 0 && state.docId && state.optedIn,
  );

  if (entries.length === 0) return;

  const promises = entries.map(async ([key, state]) => {
    try {
      const newTotal = state.charCount + state.pendingChars;
      await appwrite.updateMilestoneUser(state.docId!, {
        char_count: newTotal,
        username: state.username,
      });
      state.charCount = newTotal;
      state.pendingChars = 0;
    } catch (error) {
      console.error(`[Milestones] Error flushing buffer for ${key}:`, error);
    }
  });

  await Promise.allSettled(promises);
}

function startFlushTimer(appwrite: ModuleManager["appwriteService"]) {
  if (flushTimer) return;
  flushTimer = setInterval(() => flushBuffer(appwrite), FLUSH_INTERVAL_MS);
  console.log(
    `[Milestones] Buffer flush timer started (every ${FLUSH_INTERVAL_MS / 1000}s)`,
  );
}

// ── Opt-In Prompt ──────────────────────────────────────────────────────

async function sendOptInPrompt(message: Message, charCount: number) {
  const { author, guild } = message;
  if (!guild) return;

  const guildId = guild.id;
  const userId = author.id;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📊 Character Milestone Tracker")
    .setDescription(
      `Hey **${author.displayName}**! You just typed **${formatNumber(charCount)}** characters.\n\n` +
        `Would you like to start tracking your character milestones in **${guild.name}**? ` +
        `Earn achievements as you type and compete on the server leaderboard! 🏆`,
    )
    .setFooter({ text: "This is completely opt-in — your choice!" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ms_optin_${guildId}_${userId}`)
      .setLabel("Track Me! (Public)")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ms_private_${guildId}_${userId}`)
      .setLabel("Track (Private)")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ms_silent_${guildId}_${userId}`)
      .setLabel("Track (Silent)")
      .setEmoji("🔕")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ms_optout_${guildId}_${userId}`)
      .setLabel("No Thanks")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger),
  );

  // Try DM first, fall back to channel message
  try {
    await author.send({ embeds: [embed], components: [row] });
  } catch {
    // DMs disabled — send in channel
    try {
      await message.reply({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error("[Milestones] Failed to send opt-in prompt:", err);
    }
  }
}

// ── Milestone Notification ─────────────────────────────────────────────

async function sendMilestoneNotification(
  message: Message,
  milestone: MilestoneConfig,
  totalChars: number,
  rank: number,
  pref: "public" | "private" | "silent",
) {
  if (pref === "silent") return;

  const { author, guild, channel } = message;
  if (!guild) return;

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🎉 Milestone Reached!")
    .setThumbnail(author.displayAvatarURL({ size: 128 }))
    .addFields(
      {
        name: "📊 Total Characters",
        value: `**${formatNumber(totalChars)}**`,
        inline: true,
      },
      {
        name: "🏅 Server Rank",
        value: `**#${rank}**`,
        inline: true,
      },
    )
    .setFooter({
      text: `${guild.name} • Character Milestones`,
      iconURL: guild.iconURL({ size: 64 }) ?? undefined,
    })
    .setTimestamp();

  if (pref === "public") {
    embed.setDescription(
      `**${author.displayName}** has typed **${formatNumber(milestone.threshold)}** characters!\n\n` +
        `> _"${milestone.message}"_`,
    );

    // Check for announcement channel in guild settings
    const appwrite = (message.client as any).__milestoneAppwrite;
    let announcementChannel: TextChannel | null = null;
    if (appwrite) {
      const settings = await appwrite.getModuleSettings(guild.id, "milestones");
      if (settings?.announcementChannel) {
        const ch = guild.channels.cache.get(settings.announcementChannel);
        if (ch instanceof TextChannel) {
          announcementChannel = ch;
        }
      }
    }

    const targetChannel = announcementChannel || channel;
    try {
      await (targetChannel as TextChannel).send({ embeds: [embed] });
    } catch (err) {
      console.error("[Milestones] Failed to send public notification:", err);
    }
  } else {
    // Private — DM the user
    embed.setDescription(
      `You've typed **${formatNumber(milestone.threshold)}** characters in **${guild.name}**!\n\n` +
        `> _"${milestone.message}"_`,
    );

    try {
      await author.send({ embeds: [embed] });
    } catch {
      // DMs disabled — can't send private notification
    }
  }
}

// ── Leaderboard Builder ────────────────────────────────────────────────

function buildLeaderboardEmbed(
  users: any[],
  total: number,
  page: number,
  guildName: string,
  guildIconUrl: string | null,
  milestones: MilestoneConfig[],
): EmbedBuilder {
  const offset = page * LEADERBOARD_PAGE_SIZE;
  const totalPages = Math.ceil(total / LEADERBOARD_PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🏆 Character Milestones Leaderboard")
    .setFooter({
      text: `${guildName} • Page ${page + 1}/${totalPages || 1} • ${total} tracked user${total !== 1 ? "s" : ""}`,
      iconURL: guildIconUrl ?? undefined,
    })
    .setTimestamp();

  if (users.length === 0) {
    embed.setDescription(
      "No one has opted in to character tracking yet!\nBe the first — just start typing! 💬",
    );
    return embed;
  }

  const lines: string[] = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const rank = offset + i + 1;
    const medal = getMedalEmoji(rank);
    const charCount = user.char_count || 0;
    const nextMs = getNextMilestone(charCount, milestones);

    let line = `${medal} <@${user.user_id}> — **${formatNumber(charCount)}** chars`;

    // Show progress bar for top 5
    if (rank <= 5 && nextMs) {
      const pct = Math.round((charCount / nextMs.threshold) * 100);
      line += `\n   ${progressBar(charCount, nextMs.threshold, 16)} ${pct}% → ${formatNumber(nextMs.threshold)}`;
    }

    lines.push(line);
  }

  embed.setDescription(lines.join("\n\n"));

  return embed;
}

function buildLeaderboardButtons(
  page: number,
  totalPages: number,
  guildId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ms_lb_prev_${guildId}_${page}`)
      .setLabel("Previous")
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`ms_lb_next_${guildId}_${page}`)
      .setLabel("Next")
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}

// ── Module Definition ──────────────────────────────────────────────────

const milestonesModule: BotModule = {
  name: "milestones",
  description:
    "Track character milestones, earn achievements, and climb the leaderboard!",
  deferReply: true,

  data: new SlashCommandBuilder()
    .setName("milestones")
    .setDescription("Character milestone tracker")
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("View the server's character milestone leaderboard"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("check")
        .setDescription("Check your character stats")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to check (defaults to yourself)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("optin")
        .setDescription("Opt in to character milestone tracking"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("optout")
        .setDescription("Opt out of character milestone tracking"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("preferences")
        .setDescription("Set your milestone notification preference")
        .addStringOption((opt) =>
          opt
            .setName("mode")
            .setDescription("How you want to be notified about milestones")
            .setRequired(true)
            .addChoices(
              {
                name: "🎉 Public — Announce in channel for everyone",
                value: "public",
              },
              {
                name: "🔒 Private — Send me a DM only",
                value: "private",
              },
              {
                name: "🔕 Silent — Track only, no notifications",
                value: "silent",
              },
            ),
        ),
    )
    .toJSON(),

  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.editReply("This command can only be used in a server.");
      return;
    }

    const appwrite = moduleManager.appwriteService;

    switch (subcommand) {
      // ── Leaderboard ──
      case "leaderboard": {
        const milestones = await getGuildMilestones(appwrite, guildId);
        const { users, total } = await appwrite.getMilestoneLeaderboard(
          guildId,
          LEADERBOARD_PAGE_SIZE,
          0,
        );

        const guild = interaction.guild!;
        const totalPages = Math.ceil(total / LEADERBOARD_PAGE_SIZE);

        const embed = buildLeaderboardEmbed(
          users,
          total,
          0,
          guild.name,
          guild.iconURL({ size: 64 }),
          milestones,
        );

        const components =
          totalPages > 1
            ? [buildLeaderboardButtons(0, totalPages, guildId)]
            : [];

        await interaction.editReply({ embeds: [embed], components });
        break;
      }

      // ── Check Stats ──
      case "check": {
        const targetUser =
          interaction.options.getUser("user") ?? interaction.user;
        const milestones = await getGuildMilestones(appwrite, guildId);
        const msUser = await appwrite.getMilestoneUser(guildId, targetUser.id);

        if (!msUser) {
          await interaction.editReply({
            content:
              targetUser.id === interaction.user.id
                ? "You haven't been tracked yet! Just type a message and you'll get an invite to opt in."
                : `${targetUser.displayName} hasn't opted in to character tracking.`,
          });
          return;
        }

        if (!msUser.opted_in) {
          await interaction.editReply({
            content:
              targetUser.id === interaction.user.id
                ? "You've opted out of character tracking. Use `/milestones optin` to re-enable!"
                : `${targetUser.displayName} has opted out of character tracking.`,
          });
          return;
        }

        // Include pending buffer chars
        const key = cacheKey(guildId, targetUser.id);
        const cached = userCache.get(key);
        const totalChars = msUser.char_count + (cached?.pendingChars ?? 0);
        const rank = await appwrite.getMilestoneUserRank(guildId, totalChars);
        const nextMs = getNextMilestone(totalChars, milestones);

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📊 ${targetUser.displayName}'s Character Stats`)
          .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
          .addFields(
            {
              name: "Total Characters",
              value: `**${formatNumber(totalChars)}**`,
              inline: true,
            },
            {
              name: "Server Rank",
              value: `**#${rank}**`,
              inline: true,
            },
            {
              name: "Notification Mode",
              value:
                msUser.notification_pref === "public"
                  ? "🎉 Public"
                  : msUser.notification_pref === "private"
                    ? "🔒 Private"
                    : "🔕 Silent",
              inline: true,
            },
          );

        if (nextMs) {
          const pct = Math.round((totalChars / nextMs.threshold) * 100);
          embed.addFields({
            name: "Next Milestone",
            value: `${progressBar(totalChars, nextMs.threshold)} **${pct}%** → ${formatNumber(nextMs.threshold)}`,
            inline: false,
          });
        } else {
          embed.addFields({
            name: "🏆 Achievement",
            value: "All milestones completed! You're a legend!",
            inline: false,
          });
        }

        embed
          .setFooter({
            text: `${interaction.guild!.name} • Character Milestones`,
            iconURL: interaction.guild!.iconURL({ size: 64 }) ?? undefined,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      // ── Opt In ──
      case "optin": {
        const userId = interaction.user.id;
        const existing = await appwrite.getMilestoneUser(guildId, userId);

        if (existing) {
          if (existing.opted_in) {
            await interaction.editReply(
              "You're already opted in! 🎉 Use `/milestones check` to see your stats.",
            );
          } else {
            await appwrite.updateMilestoneUser(existing.$id, {
              opted_in: true,
            });
            // Update cache
            const key = cacheKey(guildId, userId);
            const cached = userCache.get(key);
            if (cached) cached.optedIn = true;

            await interaction.editReply(
              "Welcome back! ✅ Your character tracking is re-enabled.",
            );
          }
        } else {
          const docId = await appwrite.createMilestoneUser({
            guild_id: guildId,
            user_id: userId,
            username: interaction.user.displayName,
            char_count: 0,
            last_milestone: 0,
            notification_pref: "public",
            opted_in: true,
          });

          // Seed cache
          userCache.set(cacheKey(guildId, userId), {
            docId,
            charCount: 0,
            pendingChars: 0,
            lastMilestone: 0,
            notificationPref: "public",
            optedIn: true,
            prompted: true,
            username: interaction.user.displayName,
          });

          await interaction.editReply(
            "You're all set! ✅ Your characters will now be tracked. Type away! 🚀",
          );
        }
        break;
      }

      // ── Opt Out ──
      case "optout": {
        const userId = interaction.user.id;
        const existing = await appwrite.getMilestoneUser(guildId, userId);

        if (!existing) {
          await interaction.editReply(
            "You weren't being tracked. Nothing to opt out of! 👍",
          );
          return;
        }

        await appwrite.updateMilestoneUser(existing.$id, { opted_in: false });

        // Update cache
        const key = cacheKey(guildId, userId);
        const cached = userCache.get(key);
        if (cached) cached.optedIn = false;

        await interaction.editReply(
          "✅ You've opted out. Your data is preserved in case you change your mind.\n" +
            "Use `/milestones optin` to re-enable tracking anytime.",
        );
        break;
      }

      // ── Preferences ──
      case "preferences": {
        const mode = interaction.options.getString("mode", true) as
          | "public"
          | "private"
          | "silent";
        const userId = interaction.user.id;
        const existing = await appwrite.getMilestoneUser(guildId, userId);

        if (!existing) {
          await interaction.editReply(
            "You need to opt in first! Send a message and look for the opt-in prompt, or use `/milestones optin`.",
          );
          return;
        }

        await appwrite.updateMilestoneUser(existing.$id, {
          notification_pref: mode,
        });

        // Update cache
        const key = cacheKey(guildId, userId);
        const cached = userCache.get(key);
        if (cached) cached.notificationPref = mode;

        const label =
          mode === "public"
            ? "🎉 Public — Milestones announced in channel"
            : mode === "private"
              ? "🔒 Private — Milestones sent via DM"
              : "🔕 Silent — No notifications, tracking only";

        await interaction.editReply(
          `✅ Notification preference updated!\n**Mode:** ${label}`,
        );
        break;
      }
    }
  },
};

// ── Event Registration ─────────────────────────────────────────────────

export function registerMilestoneEvents(moduleManager: ModuleManager) {
  const client = moduleManager["client"];
  const appwrite = moduleManager.appwriteService;

  // Store appwrite reference on client for notification use
  (client as any).__milestoneAppwrite = appwrite;

  // Start the buffer flush timer
  startFlushTimer(appwrite);

  // ── Message Handler ──
  client.on("messageCreate", async (message: Message) => {
    try {
      // Ignore bots, DMs, and system messages
      if (message.author.bot) return;
      if (!message.guild) return;
      if (!message.content) return;

      const guildId = message.guild.id;
      const userId = message.author.id;

      // Count visible characters
      const chars = countVisibleChars(message.content);
      if (chars < MIN_MESSAGE_LENGTH) return;

      // Check if milestones module is enabled for this guild
      const isEnabled = await appwrite.isModuleEnabled(guildId, "milestones");
      if (!isEnabled) return;

      const key = cacheKey(guildId, userId);
      let state = userCache.get(key);

      // ── First encounter: load from DB ──
      if (!state) {
        const dbUser = await appwrite.getMilestoneUser(guildId, userId);

        if (!dbUser) {
          // Brand new user — send opt-in prompt
          state = {
            docId: null,
            charCount: 0,
            pendingChars: 0,
            lastMilestone: 0,
            notificationPref: "public",
            optedIn: false,
            prompted: true,
            username: message.author.displayName,
          };
          userCache.set(key, state);

          await sendOptInPrompt(message, chars);
          return;
        }

        // Existing user — load state
        state = {
          docId: dbUser.$id,
          charCount: dbUser.char_count || 0,
          pendingChars: 0,
          lastMilestone: dbUser.last_milestone || 0,
          notificationPref: dbUser.notification_pref || "public",
          optedIn: dbUser.opted_in ?? true,
          prompted: true,
          username: message.author.displayName,
        };
        userCache.set(key, state);
      }

      // Skip opted-out users
      if (!state.optedIn) return;

      // No doc yet (user was prompted but hasn't responded) — skip
      if (!state.docId) return;

      // ── Accumulate characters ──
      const oldTotal = state.charCount + state.pendingChars;
      state.pendingChars += chars;
      state.username = message.author.displayName;
      const newTotal = state.charCount + state.pendingChars;

      // ── Check for milestone crossings ──
      const milestones = await getGuildMilestones(appwrite, guildId);
      const crossed = getCrossedMilestones(oldTotal, newTotal, milestones);

      if (crossed.length > 0) {
        // Flush this user immediately so milestone data is accurate
        const flushedTotal = state.charCount + state.pendingChars;
        try {
          await appwrite.updateMilestoneUser(state.docId!, {
            char_count: flushedTotal,
            last_milestone: crossed[crossed.length - 1].threshold,
            username: state.username,
          });
          state.charCount = flushedTotal;
          state.pendingChars = 0;
          state.lastMilestone = crossed[crossed.length - 1].threshold;
        } catch (err) {
          console.error("[Milestones] Error flushing user on milestone:", err);
        }

        // Get rank for notification
        const rank = await appwrite.getMilestoneUserRank(guildId, flushedTotal);

        // Notify for the highest milestone crossed
        const topMilestone = crossed[crossed.length - 1];
        await sendMilestoneNotification(
          message,
          topMilestone,
          flushedTotal,
          rank,
          state.notificationPref,
        );
      }
    } catch (err) {
      // Fail silently to avoid disrupting message flow
      console.error("[Milestones] Error in messageCreate handler:", err);
    }
  });

  // ── Button Interaction Handler ──
  client.on("interactionCreate", async (interaction: Interaction) => {
    if (!interaction.isButton()) return;
    const customId = interaction.customId;
    if (!customId.startsWith("ms_")) return;

    try {
      // ── Opt-in/Opt-out Buttons ──
      if (
        customId.startsWith("ms_optin_") ||
        customId.startsWith("ms_private_") ||
        customId.startsWith("ms_silent_") ||
        customId.startsWith("ms_optout_")
      ) {
        const parts = customId.split("_");
        // ms_optin_guildId_userId  OR  ms_private_guildId_userId
        const action = parts[1];
        const guildId = parts[2];
        const targetUserId = parts[3];

        // Only the target user can click
        if (interaction.user.id !== targetUserId) {
          await interaction.reply({
            content: "This button isn't for you! 👀",
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        await interaction.deferUpdate();

        const key = cacheKey(guildId, targetUserId);

        if (action === "optout") {
          // Mark as opted out in cache
          const cached = userCache.get(key);
          if (cached) cached.optedIn = false;

          await interaction.editReply({
            content:
              "Got it! 👍 You won't be tracked. You can always join later with `/milestones optin`.",
            embeds: [],
            components: [],
          });
          return;
        }

        // Determine notification preference
        const pref: "public" | "private" | "silent" =
          action === "private"
            ? "private"
            : action === "silent"
              ? "silent"
              : "public";

        // Create the user document in DB
        try {
          const docId = await appwrite.createMilestoneUser({
            guild_id: guildId,
            user_id: targetUserId,
            username: interaction.user.displayName,
            char_count: 0,
            last_milestone: 0,
            notification_pref: pref,
            opted_in: true,
          });

          // Update cache
          userCache.set(key, {
            docId,
            charCount: 0,
            pendingChars: 0,
            lastMilestone: 0,
            notificationPref: pref,
            optedIn: true,
            prompted: true,
            username: interaction.user.displayName,
          });
        } catch (err: any) {
          // Might already exist if they clicked too fast
          if (err?.code !== 409) {
            console.error("[Milestones] Error creating milestone user:", err);
          }
        }

        const prefLabel =
          pref === "public"
            ? "🎉 Public announcements"
            : pref === "private"
              ? "🔒 Private DMs"
              : "🔕 Silent tracking";

        await interaction.editReply({
          content: `You're all set! ✅ Character tracking is now active.\n**Mode:** ${prefLabel}\n\nUse \`/milestones check\` to see your stats anytime!`,
          embeds: [],
          components: [],
        });
        return;
      }

      // ── Leaderboard Pagination ──
      if (
        customId.startsWith("ms_lb_prev_") ||
        customId.startsWith("ms_lb_next_")
      ) {
        const parts = customId.split("_");
        const direction = parts[2]; // "prev" or "next"
        const guildId = parts[3];
        const currentPage = parseInt(parts[4], 10);

        const newPage =
          direction === "next" ? currentPage + 1 : currentPage - 1;

        await interaction.deferUpdate();

        const milestones = await getGuildMilestones(appwrite, guildId);
        const { users, total } = await appwrite.getMilestoneLeaderboard(
          guildId,
          LEADERBOARD_PAGE_SIZE,
          newPage * LEADERBOARD_PAGE_SIZE,
        );

        const guild = interaction.guild!;
        const totalPages = Math.ceil(total / LEADERBOARD_PAGE_SIZE);

        const embed = buildLeaderboardEmbed(
          users,
          total,
          newPage,
          guild.name,
          guild.iconURL({ size: 64 }),
          milestones,
        );

        await interaction.editReply({
          embeds: [embed],
          components: [buildLeaderboardButtons(newPage, totalPages, guildId)],
        });
      }
    } catch (err) {
      console.error("[Milestones] Error handling button interaction:", err);
    }
  });

  console.log(
    "[Milestones] messageCreate + button interaction listeners registered.",
  );
}

export default milestonesModule;
