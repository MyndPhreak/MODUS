import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  Interaction,
  ButtonInteraction,
  AttachmentBuilder,
  TextChannel,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";
import { XpSettingsSchema } from "../lib/schemas";
import { parseSettings } from "../lib/validateSettings";
import { getXpProgress, getLevelFromXp } from "@modus/db/rank-cards";

// ── Types ──────────────────────────────────────────────────────────────

interface CachedUserState {
  docId: string | null;
  xp: number;
  level: number;
  messageCount: number;
  charCount: number;
  pendingXp: number;
  pendingMessages: number;
  pendingChars: number;
  lastXpGain: number; // Unix ms
  notificationPref: "public" | "private" | "silent";
  optedIn: boolean;
  hiddenFromLeaderboard: boolean;
  prompted: boolean;
  username: string;
  avatar: string | null;
}

// ── In-Memory Cache & Buffer ───────────────────────────────────────────

/** key = "guildId:userId" */
const userCache: Map<string, CachedUserState> = new Map();
const userCacheLastAccess: Map<string, number> = new Map();
let flushTimer: NodeJS.Timeout | null = null;
let cleanupTimer: NodeJS.Timeout | null = null;

const FLUSH_INTERVAL_MS = 30_000;
const CACHE_TTL_MS = 30 * 60_000; // 30 mins
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60_000;
const LEADERBOARD_PAGE_SIZE = 10;

let _moduleManager: ModuleManager | null = null;

function cacheKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3000";
const RENDER_API_KEY = process.env.RENDER_API_KEY || "";
// PUBLIC_WEB_URL is the externally accessible dashboard URL used in Discord
// Link buttons. It must be a valid https:// URL. Falls back to DASHBOARD_URL
// so local dev (where both point to localhost) still works without extra config.
const PUBLIC_URL = process.env.PUBLIC_WEB_URL || DASHBOARD_URL;

// ── Helpers ────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function progressBar(current: number, target: number, length = 18): string {
  const ratio = Math.min(Math.max(0, current / (target || 1)), 1);
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
      return `\`#${rank}\``;
  }
}

function countVisibleChars(content: string): number {
  if (content.startsWith("/")) return 0;
  let text = content.replace(/<a?:\w+:\d+>/g, "E");
  return [...text].length;
}

async function renderRankCardViaApi(
  guildId: string,
  member: GuildMember,
  xp: number,
  rank: number,
  messageCount: number,
): Promise<Buffer> {
  const avatarUrl = member.user.displayAvatarURL({
    extension: "png",
    size: 256,
  });

  const response = await fetch(`${DASHBOARD_URL}/api/xp/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(RENDER_API_KEY ? { "X-Render-Key": RENDER_API_KEY } : {}),
    },
    body: JSON.stringify({
      guildId,
      avatarUrl,
      username: member.user.username,
      displayName: member.displayName,
      tag: member.user.tag,
      serverName: member.guild.name,
      xp,
      rank,
      totalMembers: member.guild.memberCount,
      messageCount,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Rank card render API returned ${response.status}: ${errText}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

function buildRankEmbed(
  targetUser: { displayName: string; displayAvatarURL: (options: { size: number }) => string },
  guild: { name: string; iconURL: (options: { size: number }) => string | null },
  totalXp: number,
  rank: number,
): EmbedBuilder {
  const progress = getXpProgress(totalXp);
  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle(`⭐ ${targetUser.displayName}'s Rank & Level`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: "Rank", value: `**#${rank}**`, inline: true },
      { name: "Level", value: `**Level ${progress.level}**`, inline: true },
      { name: "Total XP", value: `**${formatNumber(totalXp)} XP**`, inline: true },
      {
        name: "Level Progress",
        value: `${progressBar(progress.xpInCurrentLevel, progress.xpNeededForNextLevel)} **${progress.progressPercent}%** (${formatNumber(progress.xpInCurrentLevel)}/${formatNumber(progress.xpNeededForNextLevel)} XP)`,
        inline: false,
      },
    )
    .setFooter({
      text: `${guild.name} • XP Leaderboard`,
      iconURL: guild.iconURL({ size: 64 }) ?? undefined,
    })
    .setTimestamp();
}

async function buildRankCardPayload(
  guildId: string,
  member: GuildMember,
  totalXp: number,
  rank: number,
  messageCount: number,
  moduleManager: ModuleManager,
): Promise<{ files?: AttachmentBuilder[]; embeds?: EmbedBuilder[] }> {
  try {
    const imageBuffer = await renderRankCardViaApi(
      guildId,
      member,
      totalXp,
      rank,
      messageCount,
    );
    return {
      files: [new AttachmentBuilder(imageBuffer, { name: `rank-${member.user.username}.png` })],
    };
  } catch (err) {
    moduleManager.logger.error("Failed to render rank card", guildId, err, "xp");
    return { embeds: [buildRankEmbed(member, member.guild, totalXp, rank)] };
  }
}

export function buildXpShareRow(
  guildId: string,
  targetUserId: string,
  type: "rank" | "check",
  leaderboardUrl?: string,
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`xp:share-${type}:${guildId}:${targetUserId}`)
      .setLabel("Share")
      .setEmoji("📤")
      .setStyle(ButtonStyle.Secondary),
  );

  if (leaderboardUrl) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel(type === "rank" ? "View Full Leaderboard" : "View Web Leaderboard")
        .setEmoji(type === "rank" ? "🏆" : "🌐")
        .setStyle(ButtonStyle.Link)
        .setURL(leaderboardUrl),
    );
  }

  return row;
}

// ── Opt-In Prompt ──────────────────────────────────────────────────────

async function sendXpOptInPrompt(message: Message) {
  const { author, guild } = message;
  if (!guild) return;

  const guildId = guild.id;
  const userId = author.id;
  const leaderboardUrl = `${PUBLIC_URL}/xp/${guildId}`;

  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle("✨ Server Leveling & XP System")
    .setDescription(
      `Hey **${author.displayName}**! Welcome to **${guild.name}**'s leveling system.\n\n` +
        `Would you like to opt in to earn XP and level up as you chat in the server? ` +
        `You'll unlock custom visual rank cards and climb the server leaderboard! 🏆\n\n` +
        `_This is completely opt-in for privacy. You can always change your preferences anytime._`,
    )
    .setFooter({ text: "Opt in or out anytime with /xp optin or /xp optout" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`xp:optin:${guildId}:${userId}`)
      .setLabel("Opt In & Track XP")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`xp:optout:${guildId}:${userId}`)
      .setLabel("No Thanks (Opt Out)")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel("View Leaderboard")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Link)
      .setURL(leaderboardUrl),
  );

  try {
    await author.send({ embeds: [embed], components: [row] });
  } catch {
    // If DMs closed, reply in channel
    try {
      await message.reply({ embeds: [embed], components: [row] });
    } catch (err) {
      _moduleManager?.logger.error("Failed to send XP opt-in prompt", undefined, err, "xp");
    }
  }
}

// ── Buffer Flush Logic ─────────────────────────────────────────────────

async function flushBuffer(db: ModuleManager["databaseService"]) {
  const entries = Array.from(userCache.entries()).filter(
    ([, state]) =>
      (state.pendingXp > 0 || state.pendingMessages > 0) &&
      state.docId &&
      state.optedIn,
  );

  if (entries.length === 0) return;

  const promises = entries.map(async ([key, state]) => {
    try {
      const newXp = state.xp + state.pendingXp;
      const newLevel = getLevelFromXp(newXp);
      const newMessages = state.messageCount + state.pendingMessages;
      const newChars = state.charCount + state.pendingChars;

      await db.updateXpUser(state.docId!, {
        xp: newXp,
        level: newLevel,
        message_count: newMessages,
        char_count: newChars,
        username: state.username,
        avatar: state.avatar,
        last_xp_gain_at: new Date(state.lastXpGain),
      });

      state.xp = newXp;
      state.level = newLevel;
      state.messageCount = newMessages;
      state.charCount = newChars;
      state.pendingXp = 0;
      state.pendingMessages = 0;
      state.pendingChars = 0;
    } catch (error) {
      _moduleManager?.logger.error(
        `Error flushing XP buffer for ${key}`,
        undefined,
        error,
        "xp",
      );
    }
  });

  await Promise.allSettled(promises);
}

function startFlushTimer(db: ModuleManager["databaseService"]) {
  if (flushTimer) return;
  flushTimer = setInterval(() => flushBuffer(db), FLUSH_INTERVAL_MS);
}

function startCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, lastAccess] of userCacheLastAccess.entries()) {
      if (now - lastAccess > CACHE_TTL_MS) {
        const cached = userCache.get(key);
        if (cached && (cached.pendingXp > 0 || cached.pendingMessages > 0)) {
          continue;
        }
        userCache.delete(key);
        userCacheLastAccess.delete(key);
      }
    }
  }, CACHE_CLEANUP_INTERVAL_MS);
}

// ── Level Up Announcement ──────────────────────────────────────────────

async function sendLevelUpNotification(
  message: Message,
  newLevel: number,
  pref: "public" | "private" | "silent",
  settings: any,
) {
  if (pref === "silent") return;

  const { author, guild, channel } = message;
  if (!guild) return;

  const templateMsg =
    settings?.levelUpMessage ||
    "🎉 Congratulations {user}, you leveled up to **Level {level}**!";
  const content = templateMsg
    .replace(/\{user\}/g, `<@${author.id}>`)
    .replace(/\{username\}/g, author.displayName)
    .replace(/\{level\}/g, String(newLevel))
    .replace(/\{server\}/g, guild.name);

  const embed = new EmbedBuilder()
    .setColor(0x818cf8)
    .setTitle("⭐ Level Up!")
    .setDescription(content)
    .setThumbnail(author.displayAvatarURL({ size: 128 }))
    .setFooter({
      text: `${guild.name} • XP & Leveling`,
      iconURL: guild.iconURL({ size: 64 }) ?? undefined,
    })
    .setTimestamp();

  if (pref === "public") {
    let targetChannel: TextChannel | null = null;
    if (settings?.announcementChannel) {
      const ch = guild.channels.cache.get(settings.announcementChannel);
      if (ch instanceof TextChannel) {
        targetChannel = ch;
      }
    }
    const sendChannel = targetChannel || (channel as TextChannel);
    try {
      await sendChannel.send({ embeds: [embed] });
    } catch (err) {
      _moduleManager?.logger.error(
        "Failed to send level-up notification",
        guild.id,
        err,
        "xp",
      );
    }
  } else {
    try {
      await author.send({ embeds: [embed] });
    } catch {
      // DM disabled, ignore
    }
  }
}

// ── Leaderboard Embed Builder ──────────────────────────────────────────

function buildLeaderboardEmbed(
  users: any[],
  total: number,
  page: number,
  guildName: string,
  guildIconUrl: string | null,
  guildId: string,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const offset = page * LEADERBOARD_PAGE_SIZE;
  const totalPages = Math.ceil(total / LEADERBOARD_PAGE_SIZE) || 1;

  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle(`🏆 ${guildName} — XP Leaderboard`)
    .setFooter({
      text: `Page ${page + 1} of ${totalPages} • ${formatNumber(total)} ranked member${total !== 1 ? "s" : ""}`,
      iconURL: guildIconUrl ?? undefined,
    })
    .setTimestamp();

  if (users.length === 0) {
    embed.setDescription(
      "No members on the leaderboard yet! Start chatting in the server to gain XP and climb the ranks. 💬",
    );
  } else {
    const lines: string[] = [];
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const rank = offset + i + 1;
      const medal = getMedalEmoji(rank);
      const progress = getXpProgress(u.xp);

      let line = `${medal} <@${u.user_id}> • **Level ${progress.level}** (${formatNumber(u.xp)} XP)`;
      if (rank <= 5) {
        line += `\n   ${progressBar(progress.xpInCurrentLevel, progress.xpNeededForNextLevel, 14)} \`${progress.progressPercent}%\``;
      }
      lines.push(line);
    }
    embed.setDescription(lines.join("\n\n"));
  }

  const webUrl = `${PUBLIC_URL}/xp/${guildId}`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`xp:lb-prev:${guildId}:${page}`)
      .setLabel("Previous")
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`xp:lb-next:${guildId}:${page}`)
      .setLabel("Next")
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setLabel("View Web Leaderboard")
      .setEmoji("🌐")
      .setStyle(ButtonStyle.Link)
      .setURL(webUrl),
  );

  return { embed, row };
}

// ── Module Definition ──────────────────────────────────────────────────

const rankCommand = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("View your or another member's custom visual rank card")
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("User whose rank card you want to view")
      .setRequired(false),
  );

const xpCommand = new SlashCommandBuilder()
  .setName("xp")
  .setDescription("XP and Leveling system commands")
  .addSubcommand((sub) =>
    sub
      .setName("check")
      .setDescription("Check XP, Level, and rank stats for a user")
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("User to check (defaults to yourself)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("leaderboard")
      .setDescription("View the server XP leaderboard"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("optin")
      .setDescription("Opt in to XP tracking and leaderboard rankings"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("optout")
      .setDescription("Opt out of XP tracking and leaderboard rankings"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("privacy")
      .setDescription("Toggle your visibility on the public web leaderboard")
      .addBooleanOption((opt) =>
        opt
          .setName("hidden")
          .setDescription("Hide your profile, rank, and stats from the public web leaderboard")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("preferences")
      .setDescription("Configure level-up notification preference")
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("How you want to receive level-up notifications")
          .setRequired(true)
          .addChoices(
            { name: "🎉 Public — Announce in server channel", value: "public" },
            { name: "🔒 Private — Send direct message only", value: "private" },
            { name: "🔕 Silent — No notifications, track quietly", value: "silent" },
          ),
      ),
  );

const xpModule: BotModule = {
  name: "xp",
  registerEvents: registerXpEvents,
  description: "Leveling, XP tracking, custom rank cards, and public leaderboards!",
  meta: {
    displayName: "XP & Leveling",
    category: "engagement",
    icon: "i-lucide-trophy",
    color: "indigo",
    tags: ["xp", "levels", "rank", "leaderboard", "card", "rewards"],
  },
  deferReply: true,
  commands: [rankCommand.toJSON(), xpCommand.toJSON()],

  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => {
    const guildId = interaction.guildId;
    if (!guildId || !interaction.guild) {
      await interaction.editReply("This command can only be used inside a Discord server.");
      return;
    }

    const db = moduleManager.databaseService;
    const commandName = interaction.commandName;

    // ── /rank command ──
    if (commandName === "rank") {
      const targetUser = interaction.options.getUser("user") ?? interaction.user;
      const member =
        interaction.guild.members.cache.get(targetUser.id) ??
        (await interaction.guild.members.fetch(targetUser.id).catch(() => null));

      if (!member) {
        await interaction.editReply("Could not locate that server member.");
        return;
      }

      const key = cacheKey(guildId, targetUser.id);
      const cached = userCache.get(key);
      let dbUser = await db.getXpUser(guildId, targetUser.id);

      if (!dbUser && !cached) {
        await interaction.editReply({
          content:
            targetUser.id === interaction.user.id
              ? "You haven't earned any XP yet! Send messages in chat to get started."
              : `${targetUser.displayName} hasn't earned any XP in this server yet.`,
        });
        return;
      }

      const totalXp = (dbUser?.xp ?? 0) + (cached?.pendingXp ?? 0);
      const messageCount = (dbUser?.message_count ?? 0) + (cached?.pendingMessages ?? 0);
      const rank = await db.getXpUserRank(guildId, totalXp);

      const rankCard = await buildRankCardPayload(
        guildId,
        member,
        totalXp,
        rank,
        messageCount,
        moduleManager,
      );
      await interaction.editReply({
        ...rankCard,
        components: [buildXpShareRow(guildId, targetUser.id, "rank", `${PUBLIC_URL}/xp/${guildId}`)],
      });
      return;
    }

    // ── /xp subcommands ──
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "leaderboard": {
        const { users, total } = await db.getXpLeaderboard(
          guildId,
          LEADERBOARD_PAGE_SIZE,
          0,
        );

        const { embed, row } = buildLeaderboardEmbed(
          users,
          total,
          0,
          interaction.guild.name,
          interaction.guild.iconURL({ size: 64 }),
          guildId,
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
        break;
      }

      case "check": {
        const targetUser = interaction.options.getUser("user") ?? interaction.user;
        const key = cacheKey(guildId, targetUser.id);
        const cached = userCache.get(key);
        const dbUser = await db.getXpUser(guildId, targetUser.id);

        if (!dbUser && !cached) {
          await interaction.editReply({
            content:
              targetUser.id === interaction.user.id
                ? "You haven't earned any XP yet! Start typing to gain XP."
                : `${targetUser.displayName} hasn't earned any XP in this server yet.`,
          });
          return;
        }

        const totalXp = (dbUser?.xp ?? 0) + (cached?.pendingXp ?? 0);
        const messageCount = (dbUser?.message_count ?? 0) + (cached?.pendingMessages ?? 0);
        const rank = await db.getXpUserRank(guildId, totalXp);
        const progress = getXpProgress(totalXp);

        const embed = new EmbedBuilder()
          .setColor(0x6366f1)
          .setTitle(`⭐ ${targetUser.displayName}'s XP Stats`)
          .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
          .addFields(
            { name: "Server Rank", value: `**#${rank}**`, inline: true },
            { name: "Current Level", value: `**Level ${progress.level}**`, inline: true },
            { name: "Total XP", value: `**${formatNumber(totalXp)} XP**`, inline: true },
            {
              name: "Progress to Level " + (progress.level + 1),
              value: `${progressBar(progress.xpInCurrentLevel, progress.xpNeededForNextLevel)} **${progress.progressPercent}%**\n` +
                `\`${formatNumber(progress.xpInCurrentLevel)} / ${formatNumber(progress.xpNeededForNextLevel)} XP\` (Need **${formatNumber(progress.xpNeededForNextLevel - progress.xpInCurrentLevel)} XP**)`,
              inline: false,
            },
            {
              name: "Messages Counted",
              value: `**${formatNumber(messageCount)}** messages`,
              inline: true,
            },
            {
              name: "Notification Mode",
              value:
                dbUser?.notification_pref === "private"
                  ? "🔒 Private"
                  : dbUser?.notification_pref === "silent"
                    ? "🔕 Silent"
                    : "🎉 Public",
              inline: true,
            },
          )
          .setFooter({
            text: `${interaction.guild.name} • Tip: Use /rank to see your graphical rank card`,
            iconURL: interaction.guild.iconURL({ size: 64 }) ?? undefined,
          })
          .setTimestamp();

        const row = buildXpShareRow(
          guildId,
          targetUser.id,
          "check",
          `${PUBLIC_URL}/xp/${guildId}`,
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
        break;
      }

      case "optin": {
        const userId = interaction.user.id;
        const existing = await db.getXpUser(guildId, userId);

        if (existing) {
          if (existing.opted_in) {
            await interaction.editReply("You're already tracking XP! 🎉 Use `/rank` to view your card.");
          } else {
            await db.updateXpUser(existing.$id, { opted_in: true });
            const cached = userCache.get(cacheKey(guildId, userId));
            if (cached) cached.optedIn = true;
            await interaction.editReply("Welcome back! ✅ Your XP tracking and ranking have been re-enabled.");
          }
        } else {
          const avatarUrl = interaction.user.displayAvatarURL({ extension: "png", size: 128 });
          const docId = await db.createXpUser({
            guild_id: guildId,
            user_id: userId,
            username: interaction.user.displayName,
            avatar: avatarUrl,
            xp: 0,
            level: 0,
            message_count: 0,
            char_count: 0,
            notification_pref: "public",
            opted_in: true,
          });

          userCache.set(cacheKey(guildId, userId), {
            docId,
            xp: 0,
            level: 0,
            messageCount: 0,
            charCount: 0,
            pendingXp: 0,
            pendingMessages: 0,
            pendingChars: 0,
            lastXpGain: 0,
            notificationPref: "public",
            optedIn: true,
            hiddenFromLeaderboard: false,
            prompted: true,
            username: interaction.user.displayName,
            avatar: avatarUrl,
          });

          await interaction.editReply("You're all set! ✅ You will now earn XP as you chat in the server.");
        }
        break;
      }

      case "optout": {
        const userId = interaction.user.id;
        const existing = await db.getXpUser(guildId, userId);
        if (!existing) {
          await interaction.editReply("You weren't being tracked. Nothing to opt out of! 👍");
          return;
        }

        await db.updateXpUser(existing.$id, { opted_in: false });
        const cached = userCache.get(cacheKey(guildId, userId));
        if (cached) cached.optedIn = false;

        await interaction.editReply(
          "✅ You've opted out of XP tracking. Your progress is saved if you choose to return later.\n" +
            "Use `/xp optin` anytime to re-enable.",
        );
        break;
      }

      case "privacy": {
        const hidden = interaction.options.getBoolean("hidden", true);
        const userId = interaction.user.id;
        const existing = await db.getXpUser(guildId, userId);

        if (!existing) {
          await interaction.editReply("You haven't earned any XP yet! Send a message first or use `/xp optin`.");
          return;
        }

        await db.updateXpUser(existing.$id, { hidden_from_leaderboard: hidden });
        const cached = userCache.get(cacheKey(guildId, userId));
        if (cached) cached.hiddenFromLeaderboard = hidden;

        if (hidden) {
          await interaction.editReply(
            "🔒 **Privacy Updated**: You are now hidden from the public web leaderboard. You will still earn XP and can view your rank internally with `/rank`.",
          );
        } else {
          await interaction.editReply(
            "🌐 **Privacy Updated**: You are now visible on the web leaderboard.",
          );
        }
        break;
      }

      case "preferences": {
        const mode = interaction.options.getString("mode", true) as
          | "public"
          | "private"
          | "silent";
        const userId = interaction.user.id;
        const existing = await db.getXpUser(guildId, userId);

        if (!existing) {
          await interaction.editReply("You haven't earned any XP yet! Send a message first or use `/xp optin`.");
          return;
        }

        await db.updateXpUser(existing.$id, { notification_pref: mode });
        const cached = userCache.get(cacheKey(guildId, userId));
        if (cached) cached.notificationPref = mode;

        const label =
          mode === "public"
            ? "🎉 Public — Level ups announced in server"
            : mode === "private"
              ? "🔒 Private — Level ups sent via direct message"
              : "🔕 Silent — No level up notifications";

        await interaction.editReply(`✅ Preference updated!\n**Mode:** ${label}`);
        break;
      }
    }
  },

  handleButton: async (
    interaction: ButtonInteraction,
    moduleManager: ModuleManager,
  ): Promise<void> => {
    const customId = interaction.customId;
    if (!customId.startsWith("xp:")) return;

    const parts = customId.split(":");
    const action = parts[1]; // "optin", "optout", "lb-prev", "lb-next"
    const guildId = parts[2];
    const targetUserId = parts[3];

    // ── Share private rank / XP check ──
    if (action === "share-rank" || action === "share-check") {
      if (!interaction.channel?.isSendable()) {
        await interaction.reply({
          content: "I can't share this result in this channel.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await interaction.deferUpdate();

      if (action === "share-check") {
        await interaction.channel.send({ embeds: interaction.message.embeds });
      } else {
        const guild = interaction.guild;
        if (!guild || !targetUserId) {
          await interaction.editReply({
            content: "That rank card is no longer available to share.",
            components: [],
          });
          return;
        }

        const member =
          guild.members.cache.get(targetUserId) ??
          (await guild.members.fetch(targetUserId).catch(() => null));
        const cached = userCache.get(cacheKey(guildId, targetUserId));
        const dbUser = await moduleManager.databaseService.getXpUser(guildId, targetUserId);

        if (!member || (!dbUser && !cached)) {
          await interaction.editReply({
            content: "That rank card is no longer available to share.",
            components: [],
          });
          return;
        }

        const totalXp = (dbUser?.xp ?? 0) + (cached?.pendingXp ?? 0);
        const messageCount =
          (dbUser?.message_count ?? 0) + (cached?.pendingMessages ?? 0);
        const rank = await moduleManager.databaseService.getXpUserRank(guildId, totalXp);
        const rankCard = await buildRankCardPayload(
          guildId,
          member,
          totalXp,
          rank,
          messageCount,
          moduleManager,
        );
        await interaction.channel.send(rankCard);
      }

      await interaction.editReply({
        content: "✅ Shared in this channel.",
        components: [],
      });
      return;
    }

    // ── Opt-in / Opt-out Buttons ──
    if (action === "optin" || action === "optout") {
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({
          content: "This prompt isn't for you! 👀",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await interaction.deferUpdate();
      const key = cacheKey(guildId, targetUserId);
      const db = moduleManager.databaseService;

      if (action === "optout") {
        const cached = userCache.get(key);
        if (cached) {
          cached.optedIn = false;
          cached.prompted = true;
        }
        const existing = await db.getXpUser(guildId, targetUserId);
        if (existing) {
          await db.updateXpUser(existing.$id, { opted_in: false });
        }

        await interaction.editReply({
          content:
            "Got it! 👍 You won't be tracked for XP.\n\n" +
            "💡 _You can start tracking anytime with `/xp optin` or hide from public leaderboards with `/xp privacy`._",
          embeds: [],
          components: [],
        });
        return;
      }

      // Action: optin
      let docId: string;
      const avatarUrl = interaction.user.displayAvatarURL({ extension: "png", size: 128 });
      const existing = await db.getXpUser(guildId, targetUserId);
      if (existing) {
        docId = existing.$id;
        await db.updateXpUser(docId, {
          opted_in: true,
          username: interaction.user.displayName,
          avatar: avatarUrl,
        });
      } else {
        docId = await db.createXpUser({
          guild_id: guildId,
          user_id: targetUserId,
          username: interaction.user.displayName,
          avatar: avatarUrl,
          xp: 0,
          level: 0,
          message_count: 0,
          char_count: 0,
          notification_pref: "public",
          opted_in: true,
          hidden_from_leaderboard: false,
        });
      }

      userCache.set(key, {
        docId,
        xp: existing?.xp || 0,
        level: existing?.level || 0,
        messageCount: existing?.message_count || 0,
        charCount: existing?.char_count || 0,
        pendingXp: 0,
        pendingMessages: 0,
        pendingChars: 0,
        lastXpGain: 0,
        notificationPref: (existing?.notification_pref as any) || "public",
        optedIn: true,
        hiddenFromLeaderboard: existing?.hidden_from_leaderboard ?? false,
        prompted: true,
        username: interaction.user.displayName,
        avatar: avatarUrl,
      });

      await interaction.editReply({
        content:
          "🎉 **You're all set!** XP tracking and leveling are now active. Chat in the server to earn XP and level up!\n\n" +
          "💡 _Useful commands:_\n" +
          "• `/rank` — View your custom visual rank card\n" +
          "• `/xp optout` — Stop tracking XP anytime\n" +
          "• `/xp privacy` — Hide your profile from public web leaderboards\n" +
          "• `/xp preferences` — Customize level-up announcements",
        embeds: [],
        components: [],
      });
      return;
    }

    // ── Leaderboard pagination ──
    const currentPage = parseInt(parts[3] ?? "0", 10);
    const newPage = action === "lb-next" ? currentPage + 1 : Math.max(0, currentPage - 1);
    const db = moduleManager.databaseService;

    const { users, total } = await db.getXpLeaderboard(
      guildId,
      LEADERBOARD_PAGE_SIZE,
      newPage * LEADERBOARD_PAGE_SIZE,
    );

    const guild = interaction.guild!;
    const { embed, row } = buildLeaderboardEmbed(
      users,
      total,
      newPage,
      guild.name,
      guild.iconURL({ size: 64 }),
      guildId,
    );

    await interaction.update({ embeds: [embed], components: [row] });
  },
};

// ── Event Registration ─────────────────────────────────────────────────

export function registerXpEvents(moduleManager: ModuleManager) {
  _moduleManager = moduleManager;
  const client = moduleManager.client;
  const db = moduleManager.databaseService;

  startFlushTimer(db);
  startCleanupTimer();

  // ── Message Handler for XP Gain ──
  client.on("messageCreate", async (message: Message) => {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;
      if (!message.content) return;

      const guildId = message.guild.id;
      const userId = message.author.id;

      const isEnabled = await db.isModuleEnabled(guildId, "xp");
      if (!isEnabled) return;

      const rawSettings = await db.getModuleSettings(guildId, "xp");
      const settings = parseSettings(XpSettingsSchema, rawSettings, "xp", guildId);
      if (!settings) return;

      // Excluded channel / role checks
      if (settings.excludedChannelIds?.includes(message.channel.id)) return;
      if (
        message.member?.roles.cache.some((role) =>
          settings.excludedRoleIds?.includes(role.id),
        )
      ) {
        return;
      }

      const chars = countVisibleChars(message.content);
      if (chars < (settings.minMessageLength ?? 5)) return;

      const key = cacheKey(guildId, userId);
      const now = Date.now();
      let state = userCache.get(key);
      userCacheLastAccess.set(key, now);
      const avatarUrl = message.author.displayAvatarURL({ extension: "png", size: 128 });

      if (!state) {
        const dbUser = await db.getXpUser(guildId, userId);
        if (!dbUser) {
          // Brand new user: initialize in memory as opted-out and prompt
          state = {
            docId: null,
            xp: 0,
            level: 0,
            messageCount: 0,
            charCount: 0,
            pendingXp: 0,
            pendingMessages: 0,
            pendingChars: 0,
            lastXpGain: 0,
            notificationPref: "public",
            optedIn: false,
            hiddenFromLeaderboard: false,
            prompted: true,
            username: message.author.displayName,
            avatar: avatarUrl,
          };
          userCache.set(key, state);
          userCacheLastAccess.set(key, now);

          await sendXpOptInPrompt(message);
          return;
        } else {
          state = {
            docId: dbUser.$id,
            xp: dbUser.xp,
            level: dbUser.level,
            messageCount: dbUser.message_count,
            charCount: dbUser.char_count,
            pendingXp: 0,
            pendingMessages: 0,
            pendingChars: 0,
            lastXpGain: dbUser.last_xp_gain_at ? new Date(dbUser.last_xp_gain_at).getTime() : 0,
            notificationPref: (dbUser.notification_pref as any) || "public",
            optedIn: dbUser.opted_in ?? false,
            hiddenFromLeaderboard: dbUser.hidden_from_leaderboard ?? false,
            prompted: true,
            username: message.author.displayName,
            avatar: dbUser.avatar ?? avatarUrl,
          };
          userCache.set(key, state);
          userCacheLastAccess.set(key, now);
        }
      }

      state.avatar = avatarUrl;
      state.username = message.author.displayName;

      if (!state.optedIn) return;

      // Check XP cooldown
      const cooldownMs = (settings.cooldownSeconds ?? 60) * 1000;
      if (now - state.lastXpGain < cooldownMs) {
        // Increment message/char count without giving XP
        state.pendingMessages += 1;
        state.pendingChars += chars;
        return;
      }

      // Calculate XP to grant
      const minXp = settings.minXpPerMessage ?? 15;
      const maxXp = settings.maxXpPerMessage ?? 25;
      const gainedXp = Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;

      const oldTotalXp = state.xp + state.pendingXp;
      const newTotalXp = oldTotalXp + gainedXp;
      const oldLevel = getLevelFromXp(oldTotalXp);
      const newLevel = getLevelFromXp(newTotalXp);

      state.pendingXp += gainedXp;
      state.pendingMessages += 1;
      state.pendingChars += chars;
      state.lastXpGain = now;

      // Check level-up
      if (newLevel > oldLevel) {
        state.level = newLevel;
        void sendLevelUpNotification(
          message,
          newLevel,
          state.notificationPref,
          settings,
        );
      }
    } catch (err) {
      _moduleManager?.logger.error(
        "Error in XP message handler",
        message.guild?.id,
        err,
        "xp",
      );
    }
  });
}

export default xpModule;
