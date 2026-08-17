/**
 * modules/giveaways/index.ts
 *
 * Entry-point for the Giveaways module. Wires the BotModule interface to
 * all handlers and registers the /giveaway command.
 */
import {
  ChannelType,
  SlashCommandBuilder,
} from "discord.js";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  RoleSelectMenuInteraction,
} from "discord.js";
import type { BotModule, ModuleManager } from "../../ModuleManager";
import { handleCreate } from "./handlers/create";
import { handleEnter } from "./handlers/enter";
import {
  handleAgeButton,
  handleAgeModal,
  handleRequirementsCommand,
  handleRoleSelect,
} from "./handlers/requirements";
import { handleEnd } from "./handlers/end";
import { handleReroll } from "./handlers/reroll";
import { handleList } from "./handlers/list";

const giveawayCommand = new SlashCommandBuilder()
  .setName("giveaway")
  .setDescription("Create and manage giveaways")
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Start a new giveaway")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel to post the giveaway in")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("title").setDescription("Giveaway title").setRequired(true).setMaxLength(200),
      )
      .addStringOption((opt) =>
        opt
          .setName("duration")
          .setDescription("When it ends (e.g. 'in 1 hour', '3 days')")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("prize_kind")
          .setDescription("Type of prize")
          .setRequired(true)
          .addChoices(
            { name: "🔑 Key / Code", value: "key" },
            { name: "🎁 Gift", value: "gift" },
            { name: "📦 Physical Item", value: "physical" },
            { name: "🏆 Other", value: "other" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("prize_value")
          .setDescription("The code, or a description of the prize")
          .setRequired(true)
          .setMaxLength(500),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("winners")
          .setDescription("Number of winners (default 1)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(50),
      )
      .addStringOption((opt) =>
        opt
          .setName("description")
          .setDescription("Extra details shown in the embed")
          .setRequired(false)
          .setMaxLength(1000),
      )
      .addStringOption((opt) =>
        opt
          .setName("image_url")
          .setDescription("Image URL shown in the embed (ignored for Key/Code prizes)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("requirements")
      .setDescription("Configure entry requirements for a giveaway")
      .addStringOption((opt) =>
        opt.setName("message_id").setDescription("The giveaway's message ID").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("end")
      .setDescription("End a giveaway early and draw winners")
      .addStringOption((opt) =>
        opt.setName("message_id").setDescription("The giveaway's message ID").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("reroll")
      .setDescription("Redraw winner(s) for an ended giveaway")
      .addStringOption((opt) =>
        opt.setName("message_id").setDescription("The giveaway's message ID").setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("count")
          .setDescription("How many new winners to draw (default 1)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(50),
      ),
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("List active giveaways in this server"))
  .toJSON();

const giveawaysModule: BotModule = {
  name: "giveaways",
  description: "Configurable giveaways with entry requirements and structured prizes",
  meta: {
    displayName: "Giveaways",
    category: "community",
    icon: "i-lucide-gift",
    color: "yellow",
    tags: ["giveaway", "contest", "prizes", "raffle", "winners"],
  },
  commands: [giveawayCommand],

  execute: async (interaction: ChatInputCommandInteraction, moduleManager: ModuleManager) => {
    if (!interaction.guildId) {
      await interaction.editReply("This command can only be used in a server.");
      return;
    }
    switch (interaction.options.getSubcommand()) {
      case "create":
        return handleCreate(interaction, moduleManager);
      case "requirements":
        return handleRequirementsCommand(interaction, moduleManager);
      case "end":
        return handleEnd(interaction, moduleManager);
      case "reroll":
        return handleReroll(interaction, moduleManager);
      case "list":
        return handleList(interaction, moduleManager);
    }
  },

  // customId formats: giveaways:enter:<id> | giveaways:req-age:<id>
  handleButton: async (interaction: ButtonInteraction, moduleManager: ModuleManager) => {
    const [, action, id] = interaction.customId.split(":");
    if (action === "enter") return handleEnter(interaction, moduleManager, id);
    if (action === "req-age") return handleAgeButton(interaction, id);
  },

  // customId formats: giveaways:req-required:<id> | giveaways:req-blocked:<id>
  handleRoleSelectMenu: async (interaction: RoleSelectMenuInteraction, moduleManager: ModuleManager) => {
    const [, action, id] = interaction.customId.split(":");
    if (action === "req-required") return handleRoleSelect(interaction, moduleManager, "required", id);
    if (action === "req-blocked") return handleRoleSelect(interaction, moduleManager, "blocked", id);
  },

  // customId format: giveaways:req-age-modal:<id>
  handleModal: async (interaction: ModalSubmitInteraction, moduleManager: ModuleManager) => {
    const [, action, id] = interaction.customId.split(":");
    if (action === "req-age-modal") return handleAgeModal(interaction, moduleManager, id);
  },
};

export default giveawaysModule;
