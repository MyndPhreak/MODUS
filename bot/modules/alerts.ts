import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionsBitField,
  ChannelType,
  MessageFlags,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";
import { AlertsSettingsSchema, AlertsSettingsType, SocialAlertSchema } from "../lib/schemas";
import { parseSettings } from "../lib/validateSettings";

const platforms = [
  { name: "YouTube", value: "youtube" },
  { name: "Twitch", value: "twitch" },
  { name: "RSS Feed", value: "rss" },
  { name: "GitHub", value: "github" },
];

const alertsModule: BotModule = {
  name: "alerts",
  description: "Configure automated social media & external alerts",
  data: new SlashCommandBuilder()
    .setName("alerts")
    .setDescription("Configure social media alerts")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a new social media alert source")
        .addStringOption((opt) =>
          opt
            .setName("platform")
            .setDescription("Platform to monitor")
            .addChoices(...platforms)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("handle")
            .setDescription(
              "YouTube: channel ID (UC...) · Twitch: login name · RSS: feed URL · GitHub: owner/repo",
            )
            .setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Where to post the alerts")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("message")
            .setDescription("Custom ping message (e.g. 'Hey @everyone, new video!')")
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove an alert configuration")
        .addStringOption((opt) =>
          opt
            .setName("platform")
            .setDescription("Platform")
            .addChoices(...platforms)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("handle")
            .setDescription("The handle, ID, or URL to remove")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List active alerts")
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

    const appwrite = moduleManager.databaseService;
    const rawSettings = await appwrite.getModuleSettings(guildId, "alerts");
    const settings = parseSettings(AlertsSettingsSchema, rawSettings, "alerts", guildId) || { alerts: [] };

    if (subcommand === "add") {
      const platform = interaction.options.getString("platform", true) as any;
      const handle = interaction.options.getString("handle", true);
      const channel = interaction.options.getChannel("channel", true);
      const message = interaction.options.getString("message") || undefined;

      // Check if an alert for this platform+handle already exists
      const existingIdx = settings.alerts.findIndex(a => a.platform === platform && a.handle.toLowerCase() === handle.toLowerCase());

      const newAlert = { platform, handle, channelId: channel.id, message };

      if (existingIdx > -1) {
        settings.alerts[existingIdx] = newAlert;
      } else {
        settings.alerts.push(newAlert);
      }

      await appwrite.setModuleSettings(guildId, "alerts", settings);
      await appwrite.setModuleStatus(guildId, "alerts", true);

      await interaction.editReply(`✅ Configured **${platform}** alerts for \`${handle}\` → <#${channel.id}>. *(Polling worker implementation pending)*`);
      moduleManager.logger.info(`Added alert for ${platform}:${handle} in ${channel.id}`, guildId, "alerts");

    } else if (subcommand === "remove") {
      const platform = interaction.options.getString("platform", true);
      const handle = interaction.options.getString("handle", true);

      const count = settings.alerts.length;
      settings.alerts = settings.alerts.filter(a => !(a.platform === platform && a.handle.toLowerCase() === handle.toLowerCase()));

      if (settings.alerts.length === count) {
        await interaction.editReply(`❌ Could not find a **${platform}** alert for \`${handle}\`.`);
      } else {
        await appwrite.setModuleSettings(guildId, "alerts", settings);
        await interaction.editReply(`✅ Removed **${platform}** alert for \`${handle}\`.`);
      }

    } else if (subcommand === "list") {
      if (settings.alerts.length === 0) {
        await interaction.editReply("No social alerts configured.");
        return;
      }

      const list = settings.alerts.map((a, i) => `${i + 1}. **${a.platform}** — \`${a.handle}\` → <#${a.channelId}>`).join("\n");
      await interaction.editReply(`**Active Social Alerts:**\n${list}`);
    }
  }
};

export function registerAlertsEvents(moduleManager: ModuleManager) {
  // Stub: expected to be used by a future cron worker or polling service.
}

export default alertsModule;
