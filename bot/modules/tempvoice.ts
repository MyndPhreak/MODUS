import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ChannelType,
  VoiceState,
  VoiceChannel,
  PermissionFlagsBits,
  GuildMember,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";

// ── Types ──────────────────────────────────────────────────────────

export interface TempChannelInfo {
  guildId: string;
  ownerId: string;
  lobbyChannelId: string;
  channelId: string;
  createdAt: number;
}

interface TempVoiceSettings {
  lobbyChannelIds: string[];
  defaultUserLimit: number;
  namingTemplate: string;
  categoryId?: string;
}

const DEFAULT_SETTINGS: TempVoiceSettings = {
  lobbyChannelIds: [],
  defaultUserLimit: 0,
  namingTemplate: "{username}'s Channel",
};

// ── In-Memory Tracking ─────────────────────────────────────────────

/** Map<channelId, TempChannelInfo> — fast O(1) lookup on every voice state update */
const activeChannels = new Map<string, TempChannelInfo>();

// ── Helpers ────────────────────────────────────────────────────────

function resolveChannelName(template: string, member: GuildMember): string {
  return template
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{displayname\}/g, member.displayName)
    .replace(/\{tag\}/g, member.user.tag);
}

async function getSettings(
  moduleManager: ModuleManager,
  guildId: string,
): Promise<TempVoiceSettings> {
  const raw = await moduleManager.appwriteService.getModuleSettings(
    guildId,
    "tempvoice",
  );
  return { ...DEFAULT_SETTINGS, ...raw };
}

// ── Module Definition ──────────────────────────────────────────────

const tempvoiceModule: BotModule = {
  name: "tempvoice",
  description: "Temporary voice channels — join a lobby to create your own VC",
  data: new SlashCommandBuilder()
    .setName("tempvoice")
    .setDescription("Manage temporary voice channels")
    .addSubcommand((sub) =>
      sub
        .setName("lobby")
        .setDescription("Set a voice channel as a Join-to-Create lobby")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The voice channel to use as the lobby")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove-lobby")
        .setDescription("Remove a lobby channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The lobby channel to remove")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("rename")
        .setDescription("Rename your temporary voice channel")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("The new name for your channel")
            .setRequired(true)
            .setMaxLength(100),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("lock")
        .setDescription("Lock your temp channel — prevent others from joining"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unlock")
        .setDescription("Unlock your temp channel — allow others to join"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("claim")
        .setDescription(
          "Claim ownership of the temp channel you're in (if owner left)",
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("info")
        .setDescription("Show info about the current temp channel"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("template")
        .setDescription("Set the default naming template for new temp channels")
        .addStringOption((opt) =>
          opt
            .setName("pattern")
            .setDescription(
              "Name pattern — use {username} or {displayname} as placeholders",
            )
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("limit")
        .setDescription("Set the default user limit for new temp channels")
        .addIntegerOption((opt) =>
          opt
            .setName("count")
            .setDescription("Default user limit (0 = unlimited)")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(99),
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
    const member = interaction.member as GuildMember;

    switch (subcommand) {
      // ─── lobby ─────────────────────────────────────────────────────
      case "lobby": {
        // Admin-only
        if (
          !member.permissions.has(PermissionFlagsBits.ManageChannels) &&
          !member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          await interaction.editReply(
            "❌ You need **Manage Channels** permission to set lobbies.",
          );
          return;
        }

        const channel = interaction.options.getChannel("channel", true);
        const settings = await getSettings(moduleManager, guildId);

        if (settings.lobbyChannelIds.includes(channel.id)) {
          await interaction.editReply(
            `<#${channel.id}> is already a lobby channel.`,
          );
          return;
        }

        settings.lobbyChannelIds.push(channel.id);
        await appwrite.setModuleSettings(guildId, "tempvoice", settings as any);

        await interaction.editReply(
          `✅ <#${channel.id}> is now a Join-to-Create lobby!`,
        );
        break;
      }

      // ─── remove-lobby ──────────────────────────────────────────────
      case "remove-lobby": {
        if (
          !member.permissions.has(PermissionFlagsBits.ManageChannels) &&
          !member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          await interaction.editReply(
            "❌ You need **Manage Channels** permission to remove lobbies.",
          );
          return;
        }

        const channel = interaction.options.getChannel("channel", true);
        const settings = await getSettings(moduleManager, guildId);

        const idx = settings.lobbyChannelIds.indexOf(channel.id);
        if (idx === -1) {
          await interaction.editReply(
            `<#${channel.id}> is not a lobby channel.`,
          );
          return;
        }

        settings.lobbyChannelIds.splice(idx, 1);
        await appwrite.setModuleSettings(guildId, "tempvoice", settings as any);

        await interaction.editReply(
          `✅ <#${channel.id}> is no longer a lobby.`,
        );
        break;
      }

      // ─── rename ────────────────────────────────────────────────────────
      case "rename": {
        const vc = member.voice.channel;
        if (!vc || !activeChannels.has(vc.id)) {
          await interaction.editReply(
            "❌ You must be in your temp channel to rename it.",
          );
          return;
        }

        const info = activeChannels.get(vc.id)!;
        if (info.ownerId !== member.id) {
          await interaction.editReply(
            "❌ Only the channel owner can rename it.",
          );
          return;
        }

        const newName = interaction.options.getString("name", true);
        await (vc as VoiceChannel).setName(newName);
        await interaction.editReply(`✅ Channel renamed to **${newName}**.`);
        break;
      }

      // ─── lock ──────────────────────────────────────────────────────
      case "lock": {
        const vc = member.voice.channel;
        if (!vc || !activeChannels.has(vc.id)) {
          await interaction.editReply(
            "❌ You must be in your temp channel to lock it.",
          );
          return;
        }

        const info = activeChannels.get(vc.id)!;
        if (info.ownerId !== member.id) {
          await interaction.editReply("❌ Only the channel owner can lock it.");
          return;
        }

        await (vc as VoiceChannel).permissionOverwrites.edit(
          vc.guild.roles.everyone,
          { Connect: false },
        );

        await interaction.editReply("🔒 Your channel is now **locked**.");
        break;
      }

      // ─── unlock ────────────────────────────────────────────────────
      case "unlock": {
        const vc = member.voice.channel;
        if (!vc || !activeChannels.has(vc.id)) {
          await interaction.editReply(
            "❌ You must be in your temp channel to unlock it.",
          );
          return;
        }

        const info = activeChannels.get(vc.id)!;
        if (info.ownerId !== member.id) {
          await interaction.editReply(
            "❌ Only the channel owner can unlock it.",
          );
          return;
        }

        await (vc as VoiceChannel).permissionOverwrites.edit(
          vc.guild.roles.everyone,
          { Connect: null }, // Reset to inherit
        );

        await interaction.editReply("🔓 Your channel is now **unlocked**.");
        break;
      }

      // ─── claim ─────────────────────────────────────────────────────
      case "claim": {
        const vc = member.voice.channel;
        if (!vc || !activeChannels.has(vc.id)) {
          await interaction.editReply(
            "❌ You must be in a temp channel to claim it.",
          );
          return;
        }

        const info = activeChannels.get(vc.id)!;

        // Check if the current owner is still in the channel
        const ownerStillHere = vc.members.has(info.ownerId);
        if (ownerStillHere) {
          await interaction.editReply(
            "❌ The channel owner is still here. You can't claim it.",
          );
          return;
        }

        // Transfer ownership
        info.ownerId = member.id;
        activeChannels.set(vc.id, info);

        try {
          await appwrite.updateTempChannelOwner(vc.id, member.id);
        } catch (err) {
          console.error("[TempVoice] Failed to update owner in Appwrite:", err);
        }

        await interaction.editReply(`👑 You are now the owner of <#${vc.id}>!`);
        break;
      }

      // ─── info ──────────────────────────────────────────────────────
      case "info": {
        const vc = member.voice.channel;
        if (!vc || !activeChannels.has(vc.id)) {
          await interaction.editReply(
            "❌ You must be in a temp channel to see its info.",
          );
          return;
        }

        const info = activeChannels.get(vc.id)!;
        const userLimit =
          (vc as VoiceChannel).userLimit === 0
            ? "Unlimited"
            : `${(vc as VoiceChannel).userLimit}`;

        await interaction.editReply(
          `🎤 **Channel Info**\n` +
            `> **Name:** ${vc.name}\n` +
            `> **Owner:** <@${info.ownerId}>\n` +
            `> **User Limit:** ${userLimit}\n` +
            `> **Members:** ${vc.members.size}\n` +
            `> **Created:** <t:${Math.floor(info.createdAt / 1000)}:R>`,
        );
        break;
      }

      // ─── template ──────────────────────────────────────────────────
      case "template": {
        if (
          !member.permissions.has(PermissionFlagsBits.ManageChannels) &&
          !member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          await interaction.editReply(
            "❌ You need **Manage Channels** permission.",
          );
          return;
        }

        const pattern = interaction.options.getString("pattern", true);
        const settings = await getSettings(moduleManager, guildId);
        settings.namingTemplate = pattern;
        await appwrite.setModuleSettings(guildId, "tempvoice", settings as any);

        await interaction.editReply(
          `✅ Naming template set to: \`${pattern}\`\n` +
            `Preview: **${resolveChannelName(pattern, member)}**`,
        );
        break;
      }

      // ─── limit (default) ───────────────────────────────────────────
      case "limit": {
        // Check if user is in their own temp channel (personal limit)
        const vc = member.voice.channel;
        const info = vc ? activeChannels.get(vc.id) : undefined;

        if (info && info.ownerId === member.id) {
          // Personal: edit the current channel's limit
          const count = interaction.options.getInteger("count", true);
          await (vc as VoiceChannel).setUserLimit(count);
          await interaction.editReply(
            `✅ User limit set to **${count === 0 ? "unlimited" : count}** for <#${vc!.id}>.`,
          );
        } else if (
          member.permissions.has(PermissionFlagsBits.ManageChannels) ||
          member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          // Admin: set server default
          const count = interaction.options.getInteger("count", true);
          const settings = await getSettings(moduleManager, guildId);
          settings.defaultUserLimit = count;
          await appwrite.setModuleSettings(
            guildId,
            "tempvoice",
            settings as any,
          );
          await interaction.editReply(
            `✅ Default user limit set to **${count === 0 ? "unlimited" : count}**.`,
          );
        } else {
          await interaction.editReply(
            "❌ You must be in your own temp channel, or have **Manage Channels** permission to set the server default.",
          );
        }
        break;
      }
    }
  },
};

// ── Event Registration ─────────────────────────────────────────────

export async function registerTempVoiceEvents(moduleManager: ModuleManager) {
  const client = (moduleManager as any).client;
  const appwrite = moduleManager.appwriteService;

  // ── Boot-time hydration: load all tracked temp channels from Appwrite ──
  try {
    const records = await appwrite.getAllTempChannels();
    let orphaned = 0;

    for (const record of records) {
      const guild = client.guilds.cache.get(record.guild_id);
      if (!guild) {
        // Guild no longer accessible — clean up record
        try {
          await appwrite.deleteTempChannel(record.channel_id);
        } catch {}
        orphaned++;
        continue;
      }

      // Check if the channel still exists in Discord
      const channel = guild.channels.cache.get(record.channel_id);
      if (!channel) {
        // Channel was deleted while bot was offline — clean up record
        try {
          await appwrite.deleteTempChannel(record.channel_id);
        } catch {}
        orphaned++;
        continue;
      }

      // Channel still exists — populate in-memory map
      activeChannels.set(record.channel_id, {
        guildId: record.guild_id,
        ownerId: record.owner_id,
        lobbyChannelId: record.lobby_channel_id,
        channelId: record.channel_id,
        createdAt: new Date(record.created_at).getTime(),
      });

      // If the channel is now empty, delete it
      if (
        channel.type === ChannelType.GuildVoice &&
        (channel as VoiceChannel).members.size === 0
      ) {
        try {
          await channel.delete("Temp voice channel empty after bot restart");
          activeChannels.delete(record.channel_id);
          await appwrite.deleteTempChannel(record.channel_id);
          moduleManager.logger.info(
            `[TempVoice] Cleaned up empty orphan channel: ${channel.name}`,
            record.guild_id,
            "tempvoice",
          );
        } catch (err) {
          console.error("[TempVoice] Failed to clean up orphan channel:", err);
        }
      }
    }

    if (orphaned > 0) {
      moduleManager.logger.info(
        `[TempVoice] Cleaned up ${orphaned} orphaned temp channel record(s)`,
      );
    }
    moduleManager.logger.info(
      `[TempVoice] Hydrated ${activeChannels.size} active temp channel(s)`,
    );
  } catch (err) {
    console.error("[TempVoice] Failed to hydrate temp channels:", err);
  }

  // ── Voice State Update Listener ──────────────────────────────────
  client.on(
    "voiceStateUpdate",
    async (oldState: VoiceState, newState: VoiceState) => {
      try {
        const guildId = newState.guild.id;

        // Check if module is enabled for this guild
        const isEnabled = await appwrite.isModuleEnabled(guildId, "tempvoice");
        if (!isEnabled) return;

        // ── User joined a channel ──────────────────────────────────
        if (newState.channelId && newState.channelId !== oldState.channelId) {
          const settings = await getSettings(moduleManager, guildId);

          // Is this a lobby channel?
          if (settings.lobbyChannelIds.includes(newState.channelId)) {
            const member = newState.member;
            if (!member) return;

            const lobbyChannel = newState.channel;
            if (!lobbyChannel) return;

            // Determine target category (same as lobby, or override)
            const parentId = settings.categoryId || lobbyChannel.parentId;

            // Create the temp voice channel
            const channelName = resolveChannelName(
              settings.namingTemplate || DEFAULT_SETTINGS.namingTemplate,
              member,
            );

            try {
              const tempChannel = await newState.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildVoice,
                parent: parentId || undefined,
                userLimit: settings.defaultUserLimit || 0,
                permissionOverwrites: [
                  {
                    id: member.id,
                    allow: [
                      PermissionFlagsBits.ManageChannels,
                      PermissionFlagsBits.MoveMembers,
                      PermissionFlagsBits.MuteMembers,
                      PermissionFlagsBits.DeafenMembers,
                    ],
                  },
                ],
                reason: `Temp voice channel for ${member.user.tag}`,
              });

              // Move the user into the new channel
              await member.voice.setChannel(
                tempChannel,
                "Moved to personal temp channel",
              );

              // Track in-memory
              const info: TempChannelInfo = {
                guildId,
                ownerId: member.id,
                lobbyChannelId: newState.channelId,
                channelId: tempChannel.id,
                createdAt: Date.now(),
              };
              activeChannels.set(tempChannel.id, info);

              // Persist to Appwrite
              try {
                await appwrite.createTempChannel({
                  guild_id: guildId,
                  channel_id: tempChannel.id,
                  owner_id: member.id,
                  lobby_channel_id: newState.channelId,
                });
              } catch (err) {
                console.error(
                  "[TempVoice] Failed to persist temp channel:",
                  err,
                );
              }

              moduleManager.logger.info(
                `Created temp channel "${channelName}" for ${member.user.tag}`,
                guildId,
                "tempvoice",
              );
            } catch (err) {
              console.error("[TempVoice] Failed to create temp channel:", err);
              moduleManager.logger.error(
                `Failed to create temp channel for ${member.user.tag}: ${err}`,
                guildId,
                "tempvoice",
              );
            }
          }
        }

        // ── User left a channel ────────────────────────────────────
        if (oldState.channelId && oldState.channelId !== newState.channelId) {
          const info = activeChannels.get(oldState.channelId);
          if (!info) return; // Not a temp channel

          const channel = oldState.channel;
          if (!channel) {
            // Channel already deleted
            activeChannels.delete(oldState.channelId);
            try {
              await appwrite.deleteTempChannel(oldState.channelId);
            } catch {}
            return;
          }

          // Check if channel is now empty
          if (channel.members.size === 0) {
            try {
              await channel.delete("Temp voice channel is now empty");
              moduleManager.logger.info(
                `Deleted empty temp channel: ${channel.name}`,
                guildId,
                "tempvoice",
              );
            } catch (err) {
              console.error(
                "[TempVoice] Failed to delete empty temp channel:",
                err,
              );
            }

            activeChannels.delete(oldState.channelId);
            try {
              await appwrite.deleteTempChannel(oldState.channelId);
            } catch (err) {
              console.error(
                "[TempVoice] Failed to remove Appwrite record:",
                err,
              );
            }
          }
        }
      } catch (err) {
        console.error("[TempVoice] Error in voiceStateUpdate:", err);
      }
    },
  );

  // ── Channel Delete Listener (external deletion) ──────────────────
  client.on("channelDelete", async (channel: any) => {
    if (activeChannels.has(channel.id)) {
      activeChannels.delete(channel.id);
      try {
        await appwrite.deleteTempChannel(channel.id);
      } catch {}
    }
  });

  console.log("[TempVoice] voiceStateUpdate event listener registered.");
}

export default tempvoiceModule;
