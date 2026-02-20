import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  TextChannel,
  ChannelType,
  Message,
  PartialMessage,
  GuildMember,
  PartialGuildMember,
  Role,
  GuildChannel,
  Invite,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";

// ── Types ──────────────────────────────────────────────────────────

export interface LoggingSettings {
  auditChannelId: string;
  logMessages: boolean;
  logMembers: boolean;
  logRoles: boolean;
  logChannels: boolean;
  logInvites: boolean;
}

const DEFAULT_SETTINGS: LoggingSettings = {
  auditChannelId: "",
  logMessages: false,
  logMembers: false,
  logRoles: false,
  logChannels: false,
  logInvites: false,
};

// ── Helper ─────────────────────────────────────────────────────────

export async function sendAuditLog(
  moduleManager: ModuleManager,
  guildId: string,
  embed: EmbedBuilder,
  eventType: keyof Omit<LoggingSettings, "auditChannelId">,
) {
  try {
    const isEnabled = await moduleManager.appwriteService.isModuleEnabled(
      guildId,
      "logging",
    );
    if (!isEnabled) return;

    const saved = await moduleManager.appwriteService.getModuleSettings(
      guildId,
      "logging",
    );
    const settings: LoggingSettings = { ...DEFAULT_SETTINGS, ...saved };

    if (!settings.auditChannelId || !settings[eventType]) return;

    const client = (moduleManager as any).client;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(settings.auditChannelId);
    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error(`[Logging] Error sending audit log for ${eventType}:`, err);
  }
}

// ── Module Definition ──────────────────────────────────────────────

const loggingModule: BotModule = {
  name: "logging",
  description: "Comprehensive audit logging for server forensics and events",
  data: new SlashCommandBuilder()
    .setName("logging")
    .setDescription("View logging module status")
    .toJSON(),

  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply("This command can only be used in a server.");
      return;
    }

    const saved = await moduleManager.appwriteService.getModuleSettings(
      guildId,
      "logging",
    );
    const settings: LoggingSettings = { ...DEFAULT_SETTINGS, ...saved };

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("📋 Audit Logging Status")
      .addFields(
        {
          name: "Audit Channel",
          value: settings.auditChannelId
            ? `<#${settings.auditChannelId}>`
            : "Not configured",
          inline: true,
        },
        {
          name: "Messages",
          value: settings.logMessages ? "✅" : "❌",
          inline: true,
        },
        {
          name: "Members",
          value: settings.logMembers ? "✅" : "❌",
          inline: true,
        },
        {
          name: "Roles",
          value: settings.logRoles ? "✅" : "❌",
          inline: true,
        },
        {
          name: "Channels",
          value: settings.logChannels ? "✅" : "❌",
          inline: true,
        },
        {
          name: "Invites",
          value: settings.logInvites ? "✅" : "❌",
          inline: true,
        },
      )
      .setFooter({ text: "Configure logging from the web dashboard" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

// ── Event Registration ─────────────────────────────────────────────

export function registerLoggingEvents(moduleManager: ModuleManager) {
  const client = moduleManager["client"];

  // ── Messages ──
  client.on("messageDelete", async (message: Message | PartialMessage) => {
    if (!message.guild) return;
    // Skip bot messages (author may be null for uncached partials)
    if (message.author?.bot) return;

    const authorTag = message.author?.tag ?? "Unknown User";
    const authorAvatar = message.author?.displayAvatarURL() ?? undefined;
    const authorMention = message.author
      ? `<@${message.author.id}>`
      : "Unknown";

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🗑️ Message Deleted")
      .setAuthor({ name: authorTag, iconURL: authorAvatar })
      .addFields(
        { name: "Author", value: authorMention, inline: true },
        { name: "Channel", value: `<#${message.channelId}>`, inline: true },
        { name: "Message ID", value: message.id, inline: true },
      )
      .setTimestamp();

    if (message.content) {
      embed.addFields({
        name: "Content",
        value:
          message.content.substring(0, 1021) +
          (message.content.length > 1021 ? "..." : ""),
      });
    } else {
      embed.addFields({
        name: "Content",
        value: "*Message was not cached — content unavailable*",
      });
    }

    if (message.attachments && message.attachments.size > 0) {
      embed.addFields({
        name: "Attachments",
        value: Array.from(message.attachments.values())
          .map((a) => `[${a.name || "file"}](${a.url})`)
          .join("\n"),
      });
    }

    if (message.createdTimestamp) {
      embed.addFields({
        name: "Originally Sent",
        value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
        inline: true,
      });
    }

    await sendAuditLog(moduleManager, message.guild.id, embed, "logMessages");
  });

  client.on(
    "messageUpdate",
    async (
      oldMessage: Message | PartialMessage,
      newMessage: Message | PartialMessage,
    ) => {
      if (!newMessage.guild) return;

      // Fetch partial new message to ensure we have content + author
      if (newMessage.partial) {
        try {
          await newMessage.fetch();
        } catch {
          return; // Message was deleted before we could fetch
        }
      }

      if (newMessage.author?.bot) return;
      if (oldMessage.content === newMessage.content) return; // Ignore embed-only updates

      const authorTag = newMessage.author?.tag ?? "Unknown User";
      const authorAvatar = newMessage.author?.displayAvatarURL() ?? undefined;
      const messageLink = `https://discord.com/channels/${newMessage.guild.id}/${newMessage.channelId}/${newMessage.id}`;

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("✏️ Message Edited")
        .setAuthor({ name: authorTag, iconURL: authorAvatar })
        .setDescription(`[Jump to message](${messageLink})`)
        .addFields(
          {
            name: "Author",
            value: newMessage.author ? `<@${newMessage.author.id}>` : "Unknown",
            inline: true,
          },
          {
            name: "Channel",
            value: `<#${newMessage.channelId}>`,
            inline: true,
          },
        )
        .setTimestamp();

      if (oldMessage.content) {
        embed.addFields({
          name: "Before",
          value:
            oldMessage.content.substring(0, 1021) +
            (oldMessage.content.length > 1021 ? "..." : ""),
        });
      } else {
        embed.addFields({
          name: "Before",
          value: "*Original message was not cached*",
        });
      }

      if (newMessage.content) {
        embed.addFields({
          name: "After",
          value:
            newMessage.content.substring(0, 1021) +
            (newMessage.content.length > 1021 ? "..." : ""),
        });
      }

      await sendAuditLog(
        moduleManager,
        newMessage.guild.id,
        embed,
        "logMessages",
      );
    },
  );

  // ── Members ──
  client.on("guildMemberAdd", async (member: GuildMember) => {
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("👋 Member Joined")
      .setAuthor({
        name: member.user.tag,
        iconURL: member.user.displayAvatarURL(),
      })
      .addFields(
        {
          name: "Account Created",
          value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        },
        { name: "User ID", value: member.id },
      )
      .setTimestamp();

    await sendAuditLog(moduleManager, member.guild.id, embed, "logMembers");
  });

  client.on(
    "guildMemberRemove",
    async (member: GuildMember | PartialGuildMember) => {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("🚪 Member Left")
        .setAuthor({
          name: member.user?.tag ?? "Unknown User",
          iconURL: member.user?.displayAvatarURL() ?? undefined,
        })
        .addFields(
          {
            name: "Joined Server",
            value: member.joinedTimestamp
              ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
              : "Unknown",
          },
          { name: "User ID", value: member.id },
        )
        .setTimestamp();

      await sendAuditLog(moduleManager, member.guild.id, embed, "logMembers");
    },
  );

  // ── Roles ──
  client.on("roleCreate", async (role: Role) => {
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("🛡️ Role Created")
      .addFields(
        { name: "Name", value: role.name, inline: true },
        { name: "ID", value: role.id, inline: true },
        { name: "Color", value: role.hexColor, inline: true },
      )
      .setTimestamp();

    await sendAuditLog(moduleManager, role.guild.id, embed, "logRoles");
  });

  client.on("roleUpdate", async (oldRole: Role, newRole: Role) => {
    if (oldRole.name === newRole.name && oldRole.color === newRole.color)
      return;
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("🛡️ Role Updated")
      .setDescription(`<@&${newRole.id}>`)
      .setTimestamp();

    if (oldRole.name !== newRole.name) {
      embed.addFields({
        name: "Name",
        value: `${oldRole.name} ➔ ${newRole.name}`,
      });
    }
    if (oldRole.hexColor !== newRole.hexColor) {
      embed.addFields({
        name: "Color",
        value: `${oldRole.hexColor} ➔ ${newRole.hexColor}`,
      });
    }

    await sendAuditLog(moduleManager, newRole.guild.id, embed, "logRoles");
  });

  client.on("roleDelete", async (role: Role) => {
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🛡️ Role Deleted")
      .addFields({ name: "Name", value: role.name })
      .setTimestamp();

    await sendAuditLog(moduleManager, role.guild.id, embed, "logRoles");
  });

  // ── Channels ──
  client.on("channelCreate", async (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    const embed = new EmbedBuilder()
      .setColor(0x1abc9c)
      .setTitle("📁 Channel Created")
      .addFields(
        { name: "Name", value: channel.name, inline: true },
        { name: "Type", value: ChannelType[channel.type], inline: true },
        { name: "ID", value: channel.id, inline: true },
      )
      .setTimestamp();

    await sendAuditLog(moduleManager, channel.guild.id, embed, "logChannels");
  });

  client.on("channelDelete", async (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("📁 Channel Deleted")
      .addFields(
        { name: "Name", value: channel.name, inline: true },
        { name: "Type", value: ChannelType[channel.type], inline: true },
      )
      .setTimestamp();

    await sendAuditLog(moduleManager, channel.guild.id, embed, "logChannels");
  });

  // ── Invites ──
  client.on("inviteCreate", async (invite: Invite) => {
    if (!invite.guild) return;
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🔗 Invite Created")
      .addFields(
        { name: "Code", value: invite.code, inline: true },
        { name: "Channel", value: `<#${invite.channelId}>`, inline: true },
        {
          name: "Creator",
          value: invite.inviter ? `<@${invite.inviter.id}>` : "Unknown",
        },
      )
      .setTimestamp();

    await sendAuditLog(
      moduleManager,
      invite.guild.id as string,
      embed,
      "logInvites",
    );
  });

  client.on("inviteDelete", async (invite: Invite) => {
    if (!invite.guild) return;
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🔗 Invite Deleted")
      .addFields(
        { name: "Code", value: invite.code, inline: true },
        { name: "Channel", value: `<#${invite.channelId}>`, inline: true },
      )
      .setTimestamp();

    await sendAuditLog(
      moduleManager,
      invite.guild.id as string,
      embed,
      "logInvites",
    );
  });

  console.log(
    "[Logging] Core event listeners registered (messageDelete, messageUpdate, member[Add/Remove], role*, channel*, invite*).",
  );
}

export default loggingModule;
