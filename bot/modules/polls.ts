import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
  MessageFlags,
  PollLayoutType,
  TextChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Renders a compact Unicode progress bar (20 chars wide). */
function buildBar(fraction: number): string {
  const filled = Math.round(fraction * 20);
  return "█".repeat(filled) + "░".repeat(20 - filled);
}

/** Fetch a message by ID from the channel the interaction was used in. */
async function fetchPollMessage(
  interaction: ChatInputCommandInteraction,
  messageId: string,
) {
  try {
    const channel = interaction.channel as TextChannel | null;
    if (!channel?.messages) return null;
    return await channel.messages.fetch(messageId);
  } catch {
    return null;
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────

const pollsModule: BotModule = {
  name: "polls",
  description: "Create and manage native Discord polls",

  // We call interaction.reply() ourselves — the poll must be the initial reply.
  skipDefer: true,

  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create and manage polls")
    // create and end require ManageMessages; results is open to all members.
    // Permission is enforced per-subcommand in execute() for results.
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new native Discord poll"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("End an active poll early")
        .addStringOption((opt) =>
          opt
            .setName("message_id")
            .setDescription("The message ID of the poll to end")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("results")
        .setDescription("Show the current standings of an active or ended poll")
        .addStringOption((opt) =>
          opt
            .setName("message_id")
            .setDescription("The message ID of the poll")
            .setRequired(true),
        ),
    )
    .toJSON(),

  execute: async (
    interaction: ChatInputCommandInteraction,
    _moduleManager: ModuleManager,
  ) => {
    const subcommand = interaction.options.getSubcommand();

    // ── /poll create ────────────────────────────────────────────────────────
    if (subcommand === "create") {
      const modal = new ModalBuilder()
        .setCustomId("polls:create")
        .setTitle("Create a Poll");

      const makeRow = (input: TextInputBuilder) =>
        new ActionRowBuilder<TextInputBuilder>().addComponents(input);

      modal.addComponents(
        makeRow(
          new TextInputBuilder()
            .setCustomId("question")
            .setLabel("Question")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(300)
            .setRequired(true),
        ),
        makeRow(
          new TextInputBuilder()
            .setCustomId("option1")
            .setLabel("Option 1")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(55)
            .setRequired(true),
        ),
        makeRow(
          new TextInputBuilder()
            .setCustomId("option2")
            .setLabel("Option 2")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(55)
            .setRequired(true),
        ),
        makeRow(
          new TextInputBuilder()
            .setCustomId("option3")
            .setLabel("Option 3 (optional)")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(55)
            .setRequired(false),
        ),
        makeRow(
          new TextInputBuilder()
            .setCustomId("option4")
            .setLabel("Option 4 (optional)")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(55)
            .setRequired(false),
        ),
      );

      await interaction.showModal(modal);
      return;
    }

    // ── /poll end ────────────────────────────────────────────────────────────
    if (subcommand === "end") {
      // Defer ephemerally so we have time to fetch the message.
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const messageId = interaction.options.getString("message_id", true);
      const message = await fetchPollMessage(interaction, messageId);

      if (!message) {
        await interaction.editReply(
          "❌ Could not find that message in this channel. Make sure you're using the correct message ID.",
        );
        return;
      }

      if (!message.poll) {
        await interaction.editReply("❌ That message doesn't contain a poll.");
        return;
      }

      if (message.poll.resultsFinalized) {
        await interaction.editReply("ℹ️ That poll has already ended.");
        return;
      }

      try {
        await message.poll.end();
        await interaction.editReply("✅ Poll ended. Results are now finalized.");
      } catch {
        await interaction.editReply(
          "❌ Failed to end the poll. Make sure I have the required permissions.",
        );
      }
      return;
    }

    // ── /poll results ────────────────────────────────────────────────────────
    if (subcommand === "results") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const messageId = interaction.options.getString("message_id", true);
      const message = await fetchPollMessage(interaction, messageId);

      if (!message) {
        await interaction.editReply(
          "❌ Could not find that message in this channel.",
        );
        return;
      }

      if (!message.poll) {
        await interaction.editReply("❌ That message doesn't contain a poll.");
        return;
      }

      // Fetch fresh data so counts are up-to-date.
      const poll = await message.poll.fetch();
      const question = poll.question.text ?? "Poll";
      const isFinalized = poll.resultsFinalized;
      const expiresAt = poll.expiresAt;

      // Tally total votes from answer counts.
      const answers = [...poll.answers.values()];
      const totalVotes = answers.reduce(
        (sum, a) => sum + (a.voteCount ?? 0),
        0,
      );

      let description = "";
      for (const answer of answers) {
        if (!("text" in answer) || answer.text == null) continue;
        const votes = answer.voteCount ?? 0;
        const fraction = totalVotes > 0 ? votes / totalVotes : 0;
        const pct = Math.round(fraction * 100);
        const bar = buildBar(fraction);
        description += `**${answer.text}**\n\`${bar}\` **${pct}%** (${votes})\n\n`;
      }

      if (!description) description = "*No answers available.*";

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${question}`)
        .setDescription(description.trimEnd())
        .setColor(isFinalized ? 0x57f287 : 0x00bfff)
        .addFields({
          name: isFinalized ? "🏁 Status" : "⏳ Status",
          value: isFinalized
            ? "Finalized"
            : expiresAt
              ? `Active — ends <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`
              : "Active",
          inline: true,
        })
        .addFields({
          name: "🗳️ Total Votes",
          value: String(totalVotes),
          inline: true,
        })
        .setFooter({ text: `Message ID: ${messageId}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },

  handleModal: async (
    interaction: ModalSubmitInteraction,
    _moduleManager: ModuleManager,
  ) => {
    if (interaction.customId !== "polls:create") return;

    const question = interaction.fields.getTextInputValue("question");
    const answers: string[] = [];
    for (let i = 1; i <= 4; i++) {
      try {
        const val = interaction.fields.getTextInputValue(`option${i}`).trim();
        if (val) answers.push(val);
      } catch {
        // Optional fields might be omitted
      }
    }

    // Build poll payload using discord.js mapped properties
    const poll = {
      question: { text: question },
      duration: 24,
      allowMultiselect: false,
      layoutType: PollLayoutType.Default,
      answers: answers.map((text) => ({ text })),
    };

    // Native poll MUST be the initial reply — not an editReply.
    await interaction.reply({ poll } as any);
  },
};

export function registerPollsEvents(_moduleManager: ModuleManager) {
  // No passive event listeners required for this module.
}

export default pollsModule;
