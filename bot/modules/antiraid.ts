import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  ChannelType,
  PermissionsBitField,
  TextChannel,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";
import { AntiRaidSettingsSchema, AntiRaidSettingsType } from "../lib/schemas";
import { parseSettings } from "../lib/validateSettings";

// ── In-Memory State ────────────────────────────────────────────────

/** Guild ID → array of join timestamps (ms) */
const joinLogs: Map<string, number[]> = new Map();

/** Guild ID → set of channel IDs that were locked during a raid */
const lockedChannels: Map<string, Set<string>> = new Map();

/**
 * Periodic cleanup: remove stale entries from guilds with no recent joins.
 * Runs every 5 minutes to prevent unbounded memory growth.
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_STALE_AGE_MS = 10 * 60 * 1000; // 10 minutes without activity

setInterval(() => {
  const now = Date.now();
  for (const [guildId, timestamps] of joinLogs) {
    if (timestamps.length === 0 || timestamps[timestamps.length - 1] < now - MAX_STALE_AGE_MS) {
      joinLogs.delete(guildId);
    }
  }
}, CLEANUP_INTERVAL_MS);

// ── Module Definition ──────────────────────────────────────────────

const antiraidModule: BotModule = {
  name: "antiraid",
  description: "Protects the server from sudden bot raids and join floods",
  data: new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Configure Anti-Raid protection")
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Set the Anti-Raid triggers")
        .addIntegerOption((opt) =>
          opt
            .setName("threshold")
            .setDescription("Number of joins to trigger action")
            .setMinValue(2)
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("window")
            .setDescription("Time window in seconds")
            .setMinValue(1)
            .setMaxValue(300)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("action")
            .setDescription("Action to take when triggered")
            .addChoices(
              { name: "Lockdown Server", value: "lockdown" },
              { name: "Kick Raiders", value: "kick" },
              { name: "Ban Raiders", value: "ban" }
            )
            .setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName("alert_channel")
            .setDescription("Channel to send raid alerts")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("unlock")
        .setDescription("Lift a raid lockdown and restore channel permissions")
    )
    .addSubcommand((sub) =>
      sub
        .setName("disable")
        .setDescription("Disable Anti-Raid protection")
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .toJSON(),

  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager
  ) => {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.editReply("This command can only be used in a server.");
      return;
    }

    const appwrite = moduleManager.appwriteService;

    if (subcommand === "config") {
      const threshold = interaction.options.getInteger("threshold", true);
      const window = interaction.options.getInteger("window", true);
      const action = interaction.options.getString("action", true) as "lockdown" | "kick" | "ban";
      const alertChannel = interaction.options.getChannel("alert_channel", false);

      const settings: AntiRaidSettingsType = {
        joinThreshold: threshold,
        timeWindow: window,
        action: action,
        alertChannelId: alertChannel ? alertChannel.id : undefined,
      };

      await appwrite.setModuleSettings(guildId, "antiraid", settings);
      await appwrite.setModuleStatus(guildId, "antiraid", true);

      await interaction.editReply(`✅ Anti-Raid configured! Trigger: **${threshold} joins in ${window}s**. Action: **${action}**.`);

    } else if (subcommand === "unlock") {
      const locked = lockedChannels.get(guildId);
      if (!locked || locked.size === 0) {
        await interaction.editReply("ℹ️ No channels are currently locked by Anti-Raid.");
        return;
      }

      const guild = interaction.guild;
      if (!guild) return;

      const everyoneRole = guild.roles.everyone;
      let restored = 0;

      for (const channelId of locked) {
        try {
          const channel = guild.channels.cache.get(channelId);
          if (channel instanceof TextChannel) {
            await channel.permissionOverwrites.edit(everyoneRole, {
              SendMessages: null, // Reset to inherit (not force-grant)
            });
            restored++;
          }
        } catch {
          // Channel may have been deleted
        }
      }

      lockedChannels.delete(guildId);
      await interaction.editReply(`✅ Lockdown lifted. Restored **${restored}** channel(s) to their original permissions.`);
      moduleManager.logger.info(`Lockdown lifted by ${interaction.user.tag}, ${restored} channels restored.`, guildId, "antiraid");

    } else if (subcommand === "disable") {
      await appwrite.setModuleStatus(guildId, "antiraid", false);
      await interaction.editReply("✅ Anti-Raid protection disabled.");
    }
  },
};

// ── Event Registration ─────────────────────────────────────────────

export function registerAntiRaidEvents(moduleManager: ModuleManager) {
  const client = moduleManager["client"];

  client.on("guildMemberAdd", async (member: GuildMember) => {
    try {
      const guildId = member.guild.id;
      const appwrite = moduleManager.appwriteService;

      const isEnabled = await appwrite.isModuleEnabled(guildId, "antiraid");
      if (!isEnabled) return;

      const rawSettings = await appwrite.getModuleSettings(guildId, "antiraid");
      const settings = parseSettings(AntiRaidSettingsSchema, rawSettings, "antiraid", guildId);
      if (!settings) return;

      const now = Date.now();
      const cutoff = now - (settings.timeWindow * 1000);

      // Update join logs
      if (!joinLogs.has(guildId)) {
        joinLogs.set(guildId, []);
      }

      let logs = joinLogs.get(guildId)!;
      logs.push(now);

      // Prune entries outside the time window
      logs = logs.filter(timestamp => timestamp > cutoff);
      joinLogs.set(guildId, logs);

      // Check if raid threshold is met
      if (logs.length >= settings.joinThreshold) {
        const triggeredCount = logs.length;

        moduleManager.logger.warn(
          `Raid detected! ${triggeredCount} joins in ${settings.timeWindow}s. Action: ${settings.action}`,
          guildId,
          "antiraid",
        );

        // Clear logs to prevent re-triggering on every subsequent join
        joinLogs.set(guildId, []);

        // ── Send alert ──
        if (settings.alertChannelId) {
          const alertChannel = member.guild.channels.cache.get(settings.alertChannelId);
          if (alertChannel instanceof TextChannel) {
            await alertChannel.send(
              `🚨 **RAID DETECTED!** \`${triggeredCount}\` users joined within \`${settings.timeWindow}s\`. Executing \`${settings.action}\` action.`
            ).catch(() => {});
          }
        }

        // ── Execute action ──
        if (settings.action === "lockdown") {
          const everyoneRole = member.guild.roles.everyone;
          const locked = new Set<string>();

          for (const channel of member.guild.channels.cache.values()) {
            if (channel instanceof TextChannel) {
              const currentPerms = channel.permissionsFor(everyoneRole);
              if (currentPerms && currentPerms.has(PermissionsBitField.Flags.SendMessages)) {
                try {
                  await channel.permissionOverwrites.edit(everyoneRole, {
                    SendMessages: false,
                  });
                  locked.add(channel.id);
                } catch {
                  // Missing permissions on this channel
                }
              }
            }
          }

          lockedChannels.set(guildId, locked);
          moduleManager.logger.info(`Locked ${locked.size} channel(s) during raid response.`, guildId, "antiraid");

        } else if (settings.action === "kick" || settings.action === "ban") {
          // Only target members who:
          // 1. Joined within the time window
          // 2. Have no roles beyond @everyone (not yet established)
          // 3. Are not bots (could be verified bots invited legitimately)
          const recentMembers = member.guild.members.cache.filter(m => {
            if (!m.joinedTimestamp) return false;
            if (m.joinedTimestamp <= cutoff) return false;
            if (m.user.bot) return false;
            // Only target members with just the @everyone role (no assigned roles)
            if (m.roles.cache.size > 1) return false;
            return true;
          });

          let actioned = 0;
          for (const [, m] of recentMembers) {
            try {
              if (settings.action === "kick") {
                await m.kick("Anti-Raid: rapid join flood detected");
              } else {
                await m.ban({ reason: "Anti-Raid: rapid join flood detected" });
              }
              actioned++;
            } catch {
              // Ignore hierarchy errors (can't kick/ban higher-role members)
            }
          }

          moduleManager.logger.info(
            `${settings.action === "kick" ? "Kicked" : "Banned"} ${actioned} suspected raiders.`,
            guildId,
            "antiraid",
          );
        }
      }

    } catch (err) {
      moduleManager.logger.error("Error handling guildMemberAdd", member.guild?.id, err, "antiraid");
    }
  });

  moduleManager.logger.info("guildMemberAdd event listener registered.", undefined, "antiraid");
}

export default antiraidModule;
