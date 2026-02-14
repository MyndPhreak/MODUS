import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  ChannelType,
  User,
  AutocompleteInteraction,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";

// ── Types ──────────────────────────────────────────────────────────

export interface ModerationSettings {
  modLogChannelId?: string;
  muteRoleId?: string;
  /** Number of warnings before auto-action triggers */
  warnThreshold: number;
  /** Action to take when warn threshold is reached: 'timeout' | 'kick' | 'ban' | 'none' */
  warnAction: "timeout" | "kick" | "ban" | "none";
  /** Timeout duration in minutes for auto-timeout action */
  autoTimeoutDuration: number;
  /** Whether to DM users when they are moderated */
  dmOnAction: boolean;
  /** Roles exempt from moderation (by ID) */
  exemptRoleIds: string[];
  /** Whether to delete the invoking command message (for legacy prefix commands) */
  deleteCommandMessage: boolean;
  /** Per-command-group role permissions (key = group, value = array of role IDs) */
  commandPermissions?: {
    ban?: string[];
    kick?: string[];
    timeout?: string[];
    warn?: string[];
    purge?: string[];
    channel?: string[];
  };
}

export interface ModerationCase {
  caseId: number;
  guildId: string;
  moderatorId: string;
  moderatorTag: string;
  targetId: string;
  targetTag: string;
  action: "warn" | "kick" | "ban" | "unban" | "timeout" | "untimeout" | "purge";
  reason: string;
  timestamp: string;
  duration?: number; // For timeouts, in minutes
  messageCount?: number; // For purge actions
}

const DEFAULT_SETTINGS: ModerationSettings = {
  warnThreshold: 3,
  warnAction: "timeout",
  autoTimeoutDuration: 60,
  dmOnAction: true,
  exemptRoleIds: [],
  deleteCommandMessage: false,
};

// ── Helpers ────────────────────────────────────────────────────────

const COLORS = {
  warn: 0xfee75c,
  kick: 0xe67e22,
  ban: 0xed4245,
  unban: 0x57f287,
  timeout: 0x5865f2,
  untimeout: 0x57f287,
  purge: 0x3498db,
};

function buildModLogEmbed(modCase: ModerationCase, target: User): EmbedBuilder {
  const actionEmojis: Record<string, string> = {
    warn: "⚠️",
    kick: "👢",
    ban: "🔨",
    unban: "✅",
    timeout: "🔇",
    untimeout: "🔊",
    purge: "🗑️",
  };

  const embed = new EmbedBuilder()
    .setColor(COLORS[modCase.action] || 0x5865f2)
    .setTitle(
      `${actionEmojis[modCase.action] || "📋"} ${modCase.action.charAt(0).toUpperCase() + modCase.action.slice(1)} | Case #${modCase.caseId}`,
    )
    .setThumbnail(target.displayAvatarURL({ extension: "png", size: 128 }))
    .addFields(
      {
        name: "User",
        value: `${target.tag} (<@${target.id}>)`,
        inline: true,
      },
      {
        name: "Moderator",
        value: `<@${modCase.moderatorId}>`,
        inline: true,
      },
      {
        name: "Reason",
        value: modCase.reason || "No reason provided",
        inline: false,
      },
    )
    .setFooter({ text: `User ID: ${target.id}` })
    .setTimestamp();

  if (modCase.duration) {
    embed.addFields({
      name: "Duration",
      value: formatDuration(modCase.duration),
      inline: true,
    });
  }

  if (modCase.messageCount !== undefined) {
    embed.addFields({
      name: "Messages Deleted",
      value: `${modCase.messageCount}`,
      inline: true,
    });
  }

  return embed;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) {
    return `${hours} hour${hours !== 1 ? "s" : ""}${mins > 0 ? ` ${mins}m` : ""}`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days} day${days !== 1 ? "s" : ""}${remHours > 0 ? ` ${remHours}h` : ""}`;
}

function parseDuration(input: string): number | null {
  const match = input.match(
    /^(\d+)\s*(m|min|mins|minutes?|h|hrs?|hours?|d|days?)$/i,
  );
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("m")) return value;
  if (unit.startsWith("h")) return value * 60;
  if (unit.startsWith("d")) return value * 1440;
  return null;
}

async function getSettings(
  moduleManager: ModuleManager,
  guildId: string,
): Promise<ModerationSettings> {
  const saved = await moduleManager.appwriteService.getModuleSettings(
    guildId,
    "moderation",
  );
  return { ...DEFAULT_SETTINGS, ...saved };
}

async function getNextCaseId(
  moduleManager: ModuleManager,
  guildId: string,
): Promise<number> {
  const settings = await getSettings(moduleManager, guildId);
  const currentCase = (settings as any).lastCaseId || 0;
  const nextCase = currentCase + 1;
  await moduleManager.appwriteService.setModuleSettings(guildId, "moderation", {
    ...settings,
    lastCaseId: nextCase,
  });
  return nextCase;
}

async function sendModLog(
  moduleManager: ModuleManager,
  guildId: string,
  modCase: ModerationCase,
  target: User,
  interaction: ChatInputCommandInteraction,
) {
  const settings = await getSettings(moduleManager, guildId);

  // Send to mod log channel if configured
  if (settings.modLogChannelId) {
    try {
      const channel = interaction.guild?.channels.cache.get(
        settings.modLogChannelId,
      );
      if (channel && channel instanceof TextChannel) {
        const embed = buildModLogEmbed(modCase, target);
        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.warn("[Moderation] Failed to send mod log:", err);
    }
  }

  // Log to Appwrite
  moduleManager.logger.info(
    `[${modCase.action.toUpperCase()}] ${target.tag} (${target.id}) by ${modCase.moderatorTag}: ${modCase.reason || "No reason"}`,
    guildId,
    "moderation",
  );
}

async function dmUser(
  target: User | GuildMember,
  action: string,
  guildName: string,
  reason: string,
  duration?: string,
): Promise<boolean> {
  try {
    const user = target instanceof GuildMember ? target.user : target;
    const embed = new EmbedBuilder()
      .setColor(COLORS[action as keyof typeof COLORS] || 0x5865f2)
      .setTitle(
        `You have been ${action}${action === "ban" ? "ned" : action === "kick" ? "ed" : action === "warn" ? "ed" : action === "timeout" ? "ed" : "ed"} in ${guildName}`,
      )
      .addFields({ name: "Reason", value: reason || "No reason provided" })
      .setTimestamp();

    if (duration) {
      embed.addFields({ name: "Duration", value: duration });
    }

    await user.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

function canModerate(
  moderator: GuildMember,
  target: GuildMember,
  interaction: ChatInputCommandInteraction,
): string | null {
  // Can't moderate yourself
  if (moderator.id === target.id) {
    return "You cannot moderate yourself.";
  }

  // Can't moderate the bot
  if (target.id === interaction.client.user?.id) {
    return "I cannot moderate myself.";
  }

  // Can't moderate server owner
  if (target.id === interaction.guild?.ownerId) {
    return "You cannot moderate the server owner.";
  }

  // Role hierarchy check
  if (
    target.roles.highest.position >= moderator.roles.highest.position &&
    moderator.id !== interaction.guild?.ownerId
  ) {
    return "You cannot moderate a member with an equal or higher role than you.";
  }

  // Bot role hierarchy check
  const botMember = interaction.guild?.members.me;
  if (
    botMember &&
    target.roles.highest.position >= botMember.roles.highest.position
  ) {
    return "I cannot moderate this member — their highest role is equal or above mine.";
  }

  return null;
}

// Maps each command name to a permission group key
const COMMAND_GROUP_MAP: Record<
  string,
  keyof NonNullable<ModerationSettings["commandPermissions"]>
> = {
  kick: "kick",
  ban: "ban",
  unban: "ban",
  timeout: "timeout",
  untimeout: "timeout",
  warn: "warn",
  warnings: "warn",
  clearwarnings: "warn",
  purge: "purge",
  slowmode: "channel",
  lock: "channel",
  unlock: "channel",
};

/**
 * Checks if the moderator has permission to use this command based on
 * the guild's configured command permissions. If no roles are set for
 * the command group, falls through to Discord's default permissions.
 * Returns an error string if denied, or null if allowed.
 */
function checkCommandPermission(
  commandName: string,
  moderator: GuildMember,
  settings: ModerationSettings,
): string | null {
  const group = COMMAND_GROUP_MAP[commandName];
  if (!group || !settings.commandPermissions) return null;

  const allowedRoles = settings.commandPermissions[group];
  // If no roles are configured (empty array or undefined), allow default Discord permissions
  if (!allowedRoles || allowedRoles.length === 0) return null;

  // Check if the moderator has any of the allowed roles
  const hasRole = allowedRoles.some((roleId) =>
    moderator.roles.cache.has(roleId),
  );
  if (hasRole) return null;

  // Server owner always has permission
  if (moderator.id === moderator.guild.ownerId) return null;

  return `You don't have the required role to use \`/${commandName}\`. Contact a server admin to configure permissions.`;
}

// ── Command Definitions ────────────────────────────────────────────

const kickCommand = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a member from the server")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The user to kick").setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("Reason for the kick"),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .toJSON();

const banCommand = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a member from the server")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The user to ban").setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("Reason for the ban"),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("delete_days")
      .setDescription("Number of days of messages to delete (0-7)")
      .setMinValue(0)
      .setMaxValue(7),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .toJSON();

const unbanCommand = new SlashCommandBuilder()
  .setName("unban")
  .setDescription("Unban a user from the server")
  .addStringOption((opt) =>
    opt
      .setName("user_id")
      .setDescription("The user ID to unban")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("Reason for the unban"),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .toJSON();

const timeoutCommand = new SlashCommandBuilder()
  .setName("timeout")
  .setDescription("Timeout a member (prevent them from chatting)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The user to timeout").setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("duration")
      .setDescription("Duration (e.g. 10m, 1h, 1d). Max 28 days.")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("Reason for the timeout"),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .toJSON();

const untimeoutCommand = new SlashCommandBuilder()
  .setName("untimeout")
  .setDescription("Remove a timeout from a member")
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("The user to untimeout")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("Reason for removing the timeout"),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .toJSON();

const warnCommand = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Issue a warning to a member")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The user to warn").setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("reason")
      .setDescription("Reason for the warning")
      .setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .toJSON();

const warningsCommand = new SlashCommandBuilder()
  .setName("warnings")
  .setDescription("View warnings for a member")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The user to check").setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .toJSON();

const clearwarningsCommand = new SlashCommandBuilder()
  .setName("clearwarnings")
  .setDescription("Clear all warnings for a member")
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("The user to clear warnings for")
      .setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .toJSON();

const purgeCommand = new SlashCommandBuilder()
  .setName("purge")
  .setDescription("Bulk delete messages from a channel")
  .addIntegerOption((opt) =>
    opt
      .setName("amount")
      .setDescription("Number of messages to delete (1-100)")
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true),
  )
  .addUserOption((opt) =>
    opt.setName("user").setDescription("Only delete messages from this user"),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .toJSON();

const slowmodeCommand = new SlashCommandBuilder()
  .setName("slowmode")
  .setDescription("Set slowmode for a channel")
  .addIntegerOption((opt) =>
    opt
      .setName("seconds")
      .setDescription("Slowmode delay in seconds (0 = off, max 21600)")
      .setMinValue(0)
      .setMaxValue(21600)
      .setRequired(true),
  )
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("The channel (defaults to current)")
      .addChannelTypes(ChannelType.GuildText),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .toJSON();

const lockCommand = new SlashCommandBuilder()
  .setName("lock")
  .setDescription("Lock a channel (prevent @everyone from sending messages)")
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("The channel to lock (defaults to current)")
      .addChannelTypes(ChannelType.GuildText),
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("Reason for locking"),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .toJSON();

const unlockCommand = new SlashCommandBuilder()
  .setName("unlock")
  .setDescription("Unlock a channel (allow @everyone to send messages)")
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("The channel to unlock (defaults to current)")
      .addChannelTypes(ChannelType.GuildText),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .toJSON();

const modlogCommand = new SlashCommandBuilder()
  .setName("modlog")
  .setDescription("Set the moderation log channel")
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("The channel for mod logs")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

// ── Module Definition ──────────────────────────────────────────────

const moderationModule: BotModule = {
  name: "moderation",
  description:
    "Comprehensive moderation toolkit: kick, ban, timeout, warn, purge, slowmode, lock/unlock",
  commands: [
    kickCommand,
    banCommand,
    unbanCommand,
    timeoutCommand,
    untimeoutCommand,
    warnCommand,
    warningsCommand,
    clearwarningsCommand,
    purgeCommand,
    slowmodeCommand,
    lockCommand,
    unlockCommand,
    modlogCommand,
  ],

  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => {
    const { commandName, guildId, guild } = interaction;
    if (!guildId || !guild) {
      await interaction.editReply("This command can only be used in a server.");
      return;
    }

    const moderator = interaction.member as GuildMember;
    const settings = await getSettings(moduleManager, guildId);

    // Check command permissions (skip for modlog — always requires Administrator)
    if (commandName !== "modlog") {
      const permCheck = checkCommandPermission(
        commandName,
        moderator,
        settings,
      );
      if (permCheck) {
        await interaction.editReply(`❌ ${permCheck}`);
        return;
      }
    }

    switch (commandName) {
      // ── KICK ──────────────────────────────────────────
      case "kick": {
        const target = interaction.options.getMember(
          "user",
        ) as GuildMember | null;
        const reason =
          interaction.options.getString("reason") || "No reason provided";

        if (!target) {
          await interaction.editReply("❌ User not found in this server.");
          return;
        }

        const check = canModerate(moderator, target, interaction);
        if (check) {
          await interaction.editReply(`❌ ${check}`);
          return;
        }

        if (!target.kickable) {
          await interaction.editReply(
            "❌ I cannot kick this user. Check my role permissions.",
          );
          return;
        }

        // DM before kicking
        if (settings.dmOnAction) {
          await dmUser(target, "kick", guild.name, reason);
        }

        await target.kick(reason);

        const caseId = await getNextCaseId(moduleManager, guildId);
        const modCase: ModerationCase = {
          caseId,
          guildId,
          moderatorId: moderator.id,
          moderatorTag: moderator.user.tag,
          targetId: target.id,
          targetTag: target.user.tag,
          action: "kick",
          reason,
          timestamp: new Date().toISOString(),
        };

        await sendModLog(
          moduleManager,
          guildId,
          modCase,
          target.user,
          interaction,
        );
        await interaction.editReply(
          `👢 **${target.user.tag}** has been kicked. | Case #${caseId}\n**Reason:** ${reason}`,
        );
        break;
      }

      // ── BAN ───────────────────────────────────────────
      case "ban": {
        const targetUser = interaction.options.getUser("user", true);
        const reason =
          interaction.options.getString("reason") || "No reason provided";
        const deleteDays = interaction.options.getInteger("delete_days") ?? 0;

        const targetMember = guild.members.cache.get(targetUser.id);

        if (targetMember) {
          const check = canModerate(moderator, targetMember, interaction);
          if (check) {
            await interaction.editReply(`❌ ${check}`);
            return;
          }

          if (!targetMember.bannable) {
            await interaction.editReply(
              "❌ I cannot ban this user. Check my role permissions.",
            );
            return;
          }

          // DM before banning
          if (settings.dmOnAction) {
            await dmUser(targetMember, "ban", guild.name, reason);
          }
        }

        await guild.members.ban(targetUser, {
          reason,
          deleteMessageSeconds: deleteDays * 86400,
        });

        const caseId = await getNextCaseId(moduleManager, guildId);
        const modCase: ModerationCase = {
          caseId,
          guildId,
          moderatorId: moderator.id,
          moderatorTag: moderator.user.tag,
          targetId: targetUser.id,
          targetTag: targetUser.tag,
          action: "ban",
          reason,
          timestamp: new Date().toISOString(),
        };

        await sendModLog(
          moduleManager,
          guildId,
          modCase,
          targetUser,
          interaction,
        );
        await interaction.editReply(
          `🔨 **${targetUser.tag}** has been banned. | Case #${caseId}\n**Reason:** ${reason}`,
        );
        break;
      }

      // ── UNBAN ─────────────────────────────────────────
      case "unban": {
        const userId = interaction.options.getString("user_id", true);
        const reason =
          interaction.options.getString("reason") || "No reason provided";

        try {
          const ban = await guild.bans.fetch(userId);
          await guild.members.unban(userId, reason);

          const caseId = await getNextCaseId(moduleManager, guildId);
          const modCase: ModerationCase = {
            caseId,
            guildId,
            moderatorId: moderator.id,
            moderatorTag: moderator.user.tag,
            targetId: ban.user.id,
            targetTag: ban.user.tag,
            action: "unban",
            reason,
            timestamp: new Date().toISOString(),
          };

          await sendModLog(
            moduleManager,
            guildId,
            modCase,
            ban.user,
            interaction,
          );
          await interaction.editReply(
            `✅ **${ban.user.tag}** has been unbanned. | Case #${caseId}`,
          );
        } catch {
          await interaction.editReply(
            "❌ User is not banned or ID is invalid.",
          );
        }
        break;
      }

      // ── TIMEOUT ───────────────────────────────────────
      case "timeout": {
        const target = interaction.options.getMember(
          "user",
        ) as GuildMember | null;
        const durationStr = interaction.options.getString("duration", true);
        const reason =
          interaction.options.getString("reason") || "No reason provided";

        if (!target) {
          await interaction.editReply("❌ User not found in this server.");
          return;
        }

        const check = canModerate(moderator, target, interaction);
        if (check) {
          await interaction.editReply(`❌ ${check}`);
          return;
        }

        const minutes = parseDuration(durationStr);
        if (!minutes || minutes <= 0) {
          await interaction.editReply(
            "❌ Invalid duration. Use formats like `10m`, `1h`, `7d`.",
          );
          return;
        }

        // Discord max timeout is 28 days (40320 minutes)
        if (minutes > 40320) {
          await interaction.editReply(
            "❌ Timeout duration cannot exceed 28 days.",
          );
          return;
        }

        const durationMs = minutes * 60 * 1000;

        if (settings.dmOnAction) {
          await dmUser(
            target,
            "timeout",
            guild.name,
            reason,
            formatDuration(minutes),
          );
        }

        await target.timeout(durationMs, reason);

        const caseId = await getNextCaseId(moduleManager, guildId);
        const modCase: ModerationCase = {
          caseId,
          guildId,
          moderatorId: moderator.id,
          moderatorTag: moderator.user.tag,
          targetId: target.id,
          targetTag: target.user.tag,
          action: "timeout",
          reason,
          timestamp: new Date().toISOString(),
          duration: minutes,
        };

        await sendModLog(
          moduleManager,
          guildId,
          modCase,
          target.user,
          interaction,
        );
        await interaction.editReply(
          `🔇 **${target.user.tag}** has been timed out for **${formatDuration(minutes)}**. | Case #${caseId}\n**Reason:** ${reason}`,
        );
        break;
      }

      // ── UNTIMEOUT ─────────────────────────────────────
      case "untimeout": {
        const target = interaction.options.getMember(
          "user",
        ) as GuildMember | null;
        const reason =
          interaction.options.getString("reason") || "No reason provided";

        if (!target) {
          await interaction.editReply("❌ User not found in this server.");
          return;
        }

        if (!target.isCommunicationDisabled()) {
          await interaction.editReply(
            "❌ This user is not currently timed out.",
          );
          return;
        }

        await target.timeout(null, reason);

        const caseId = await getNextCaseId(moduleManager, guildId);
        const modCase: ModerationCase = {
          caseId,
          guildId,
          moderatorId: moderator.id,
          moderatorTag: moderator.user.tag,
          targetId: target.id,
          targetTag: target.user.tag,
          action: "untimeout",
          reason,
          timestamp: new Date().toISOString(),
        };

        await sendModLog(
          moduleManager,
          guildId,
          modCase,
          target.user,
          interaction,
        );
        await interaction.editReply(
          `🔊 **${target.user.tag}**'s timeout has been removed. | Case #${caseId}`,
        );
        break;
      }

      // ── WARN ──────────────────────────────────────────
      case "warn": {
        const target = interaction.options.getMember(
          "user",
        ) as GuildMember | null;
        const reason = interaction.options.getString("reason", true);

        if (!target) {
          await interaction.editReply("❌ User not found in this server.");
          return;
        }

        const check = canModerate(moderator, target, interaction);
        if (check) {
          await interaction.editReply(`❌ ${check}`);
          return;
        }

        // Store warning
        const currentSettings =
          await moduleManager.appwriteService.getModuleSettings(
            guildId,
            "moderation",
          );
        const warnings: ModerationCase[] = currentSettings.warnings || [];

        const caseId = await getNextCaseId(moduleManager, guildId);
        const modCase: ModerationCase = {
          caseId,
          guildId,
          moderatorId: moderator.id,
          moderatorTag: moderator.user.tag,
          targetId: target.id,
          targetTag: target.user.tag,
          action: "warn",
          reason,
          timestamp: new Date().toISOString(),
        };

        warnings.push(modCase);

        // Save updated warnings
        await moduleManager.appwriteService.setModuleSettings(
          guildId,
          "moderation",
          { ...currentSettings, warnings, lastCaseId: caseId },
        );

        // DM the user
        if (settings.dmOnAction) {
          await dmUser(target, "warn", guild.name, reason);
        }

        await sendModLog(
          moduleManager,
          guildId,
          modCase,
          target.user,
          interaction,
        );

        // Count this user's active warnings
        const userWarnings = warnings.filter(
          (w) => w.targetId === target.id && w.action === "warn",
        );
        const warnCountMsg = `They now have **${userWarnings.length}** warning(s).`;

        let autoActionMsg = "";

        // Check threshold
        if (
          settings.warnThreshold > 0 &&
          userWarnings.length >= settings.warnThreshold &&
          settings.warnAction !== "none"
        ) {
          const thresholdReason = `Auto-action: Reached ${settings.warnThreshold} warnings`;

          try {
            switch (settings.warnAction) {
              case "timeout": {
                const duration = settings.autoTimeoutDuration * 60 * 1000;
                await target.timeout(duration, thresholdReason);
                autoActionMsg = `\n⚡ **Auto-action:** Timed out for ${formatDuration(settings.autoTimeoutDuration)} (threshold reached).`;
                break;
              }
              case "kick": {
                if (target.kickable) {
                  if (settings.dmOnAction) {
                    await dmUser(target, "kick", guild.name, thresholdReason);
                  }
                  await target.kick(thresholdReason);
                  autoActionMsg =
                    "\n⚡ **Auto-action:** Kicked from server (threshold reached).";
                }
                break;
              }
              case "ban": {
                if (target.bannable) {
                  if (settings.dmOnAction) {
                    await dmUser(target, "ban", guild.name, thresholdReason);
                  }
                  await guild.members.ban(target, { reason: thresholdReason });
                  autoActionMsg =
                    "\n⚡ **Auto-action:** Banned from server (threshold reached).";
                }
                break;
              }
            }
          } catch (err) {
            console.error("[Moderation] Auto-action failed:", err);
            autoActionMsg = "\n⚠️ Auto-action failed — check bot permissions.";
          }
        }

        await interaction.editReply(
          `⚠️ **${target.user.tag}** has been warned. | Case #${caseId}\n**Reason:** ${reason}\n${warnCountMsg}${autoActionMsg}`,
        );
        break;
      }

      // ── WARNINGS ──────────────────────────────────────
      case "warnings": {
        const targetUser = interaction.options.getUser("user", true);

        const currentSettings =
          await moduleManager.appwriteService.getModuleSettings(
            guildId,
            "moderation",
          );
        const warnings: ModerationCase[] = currentSettings.warnings || [];
        const userWarnings = warnings.filter(
          (w) => w.targetId === targetUser.id && w.action === "warn",
        );

        if (userWarnings.length === 0) {
          await interaction.editReply(
            `✅ **${targetUser.tag}** has no warnings.`,
          );
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle(`⚠️ Warnings for ${targetUser.tag}`)
          .setThumbnail(
            targetUser.displayAvatarURL({ extension: "png", size: 128 }),
          )
          .setFooter({
            text: `${userWarnings.length} warning(s) | Threshold: ${settings.warnThreshold > 0 ? settings.warnThreshold : "Disabled"}`,
          })
          .setTimestamp();

        // Show last 10 warnings
        const recentWarnings = userWarnings.slice(-10);
        for (const w of recentWarnings) {
          const date = new Date(w.timestamp);
          embed.addFields({
            name: `Case #${w.caseId} — ${date.toLocaleDateString()}`,
            value: `**Reason:** ${w.reason}\n**By:** <@${w.moderatorId}>`,
            inline: false,
          });
        }

        if (userWarnings.length > 10) {
          embed.setDescription(
            `Showing last 10 of ${userWarnings.length} warnings.`,
          );
        }

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      // ── CLEARWARNINGS ─────────────────────────────────
      case "clearwarnings": {
        const targetUser = interaction.options.getUser("user", true);

        const currentSettings =
          await moduleManager.appwriteService.getModuleSettings(
            guildId,
            "moderation",
          );
        const warnings: ModerationCase[] = currentSettings.warnings || [];
        const filtered = warnings.filter(
          (w) => !(w.targetId === targetUser.id && w.action === "warn"),
        );

        const removedCount = warnings.length - filtered.length;

        await moduleManager.appwriteService.setModuleSettings(
          guildId,
          "moderation",
          { ...currentSettings, warnings: filtered },
        );

        await interaction.editReply(
          `✅ Cleared **${removedCount}** warning(s) for **${targetUser.tag}**.`,
        );
        break;
      }

      // ── PURGE ─────────────────────────────────────────
      case "purge": {
        const amount = interaction.options.getInteger("amount", true);
        const targetUser = interaction.options.getUser("user");
        const channel = interaction.channel as TextChannel;

        if (!channel || !(channel instanceof TextChannel)) {
          await interaction.editReply(
            "❌ This command can only be used in text channels.",
          );
          return;
        }

        try {
          let messages = await channel.messages.fetch({ limit: amount });

          if (targetUser) {
            messages = messages.filter((m) => m.author.id === targetUser.id);
          }

          // Filter out messages older than 14 days (Discord limitation)
          const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
          messages = messages.filter((m) => m.createdTimestamp > twoWeeksAgo);

          const deleted = await channel.bulkDelete(messages, true);

          const caseId = await getNextCaseId(moduleManager, guildId);
          const modCase: ModerationCase = {
            caseId,
            guildId,
            moderatorId: moderator.id,
            moderatorTag: moderator.user.tag,
            targetId: targetUser?.id || "all",
            targetTag: targetUser?.tag || "All Users",
            action: "purge",
            reason: targetUser
              ? `Bulk deleted ${deleted.size} message(s) from ${targetUser.tag}`
              : `Bulk deleted ${deleted.size} message(s)`,
            timestamp: new Date().toISOString(),
            messageCount: deleted.size,
          };

          await sendModLog(
            moduleManager,
            guildId,
            modCase,
            targetUser || interaction.user,
            interaction,
          );

          await interaction.editReply(
            `🗑️ Deleted **${deleted.size}** message(s).${targetUser ? ` (from ${targetUser.tag})` : ""}`,
          );
        } catch (err) {
          console.error("[Moderation] Purge failed:", err);
          await interaction.editReply(
            "❌ Failed to delete messages. Messages older than 14 days cannot be bulk-deleted.",
          );
        }
        break;
      }

      // ── SLOWMODE ──────────────────────────────────────
      case "slowmode": {
        const seconds = interaction.options.getInteger("seconds", true);
        const target =
          (interaction.options.getChannel("channel") as TextChannel) ||
          (interaction.channel as TextChannel);

        if (!target || !(target instanceof TextChannel)) {
          await interaction.editReply(
            "❌ Invalid channel. Must be a text channel.",
          );
          return;
        }

        await target.setRateLimitPerUser(seconds);

        if (seconds === 0) {
          await interaction.editReply(
            `✅ Slowmode has been **disabled** in <#${target.id}>.`,
          );
        } else {
          await interaction.editReply(
            `✅ Slowmode set to **${seconds} second(s)** in <#${target.id}>.`,
          );
        }
        break;
      }

      // ── LOCK ──────────────────────────────────────────
      case "lock": {
        const target =
          (interaction.options.getChannel("channel") as TextChannel) ||
          (interaction.channel as TextChannel);
        const reason =
          interaction.options.getString("reason") ||
          "Channel locked by moderator";

        if (!target || !(target instanceof TextChannel)) {
          await interaction.editReply(
            "❌ Invalid channel. Must be a text channel.",
          );
          return;
        }

        const everyoneRole = guild.roles.everyone;
        await target.permissionOverwrites.edit(everyoneRole, {
          SendMessages: false,
        });

        const embed = new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(
            `🔒 This channel has been locked.\n**Reason:** ${reason}`,
          )
          .setTimestamp();

        await target.send({ embeds: [embed] });
        await interaction.editReply(`🔒 <#${target.id}> has been locked.`);
        break;
      }

      // ── UNLOCK ────────────────────────────────────────
      case "unlock": {
        const target =
          (interaction.options.getChannel("channel") as TextChannel) ||
          (interaction.channel as TextChannel);

        if (!target || !(target instanceof TextChannel)) {
          await interaction.editReply(
            "❌ Invalid channel. Must be a text channel.",
          );
          return;
        }

        const everyoneRole = guild.roles.everyone;
        await target.permissionOverwrites.edit(everyoneRole, {
          SendMessages: null,
        });

        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription("🔓 This channel has been unlocked.")
          .setTimestamp();

        await target.send({ embeds: [embed] });
        await interaction.editReply(`🔓 <#${target.id}> has been unlocked.`);
        break;
      }

      // ── MODLOG ────────────────────────────────────────
      case "modlog": {
        const channel = interaction.options.getChannel("channel", true);

        const currentSettings =
          await moduleManager.appwriteService.getModuleSettings(
            guildId,
            "moderation",
          );

        await moduleManager.appwriteService.setModuleSettings(
          guildId,
          "moderation",
          {
            ...currentSettings,
            modLogChannelId: channel.id,
          },
        );

        await interaction.editReply(
          `✅ Moderation logs will be sent to <#${channel.id}>.`,
        );
        break;
      }
    }
  },
};

export default moderationModule;
