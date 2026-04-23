import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  GuildMember,
} from "discord.js";
import type { BotModule, ModuleManager } from "../ModuleManager";
import { speakInChannel, TTSError, isTTSAvailable } from "../lib/tts";
import { KOKORO_VOICE_LIST, resolveVoice } from "../lib/ttsVoices";

const COOLDOWN_MS = 10_000;

const lastInvocation = new Map<string, number>();
const activeAborts = new Map<string, AbortController>();

const sayModule: BotModule | null = isTTSAvailable()
  ? {
      name: "say",
      description: "Make the bot speak text in your voice channel",
      data: new SlashCommandBuilder()
        .setName("say")
        .setDescription("Make the bot speak text in your current voice channel")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((o) =>
          o
            .setName("text")
            .setDescription("What to say (max 5000 chars)")
            .setRequired(true)
            .setMaxLength(5000),
        )
        .addStringOption((o) =>
          o
            .setName("voice")
            .setDescription("Kokoro voice (defaults to server configuration)")
            .setRequired(false)
            .addChoices(
              ...KOKORO_VOICE_LIST.map((v) => ({
                name: v.displayName,
                value: v.id,
              })),
            ),
        )
        .addNumberOption((o) =>
          o
            .setName("speed")
            .setDescription("Speech speed, 0.5 to 2.0")
            .setRequired(false)
            .setMinValue(0.5)
            .setMaxValue(2.0),
        ),

      async execute(
        interaction: ChatInputCommandInteraction,
        moduleManager: ModuleManager,
      ) {
        const member = interaction.member as GuildMember | null;
        if (!member || !interaction.guild) {
          await interaction.editReply(
            "❌ This command only works inside a server.",
          );
          return;
        }

        const voiceChannel = member.voice?.channel;
        if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
          await interaction.editReply("❌ Join a voice channel first.");
          return;
        }

        const me = interaction.guild.members.me;
        if (!me) {
          await interaction.editReply(
            "❌ Could not resolve the bot's member entry.",
          );
          return;
        }
        const perms = voiceChannel.permissionsFor(me);
        if (
          !perms?.has(PermissionFlagsBits.Connect) ||
          !perms?.has(PermissionFlagsBits.Speak)
        ) {
          await interaction.editReply(
            "❌ I need **Connect** and **Speak** permissions in that voice channel.",
          );
          return;
        }

        const now = Date.now();
        const last = lastInvocation.get(member.id) ?? 0;
        const remainingMs = COOLDOWN_MS - (now - last);
        if (remainingMs > 0) {
          await interaction.editReply(
            `⏱️ Slow down — try again in ${Math.ceil(remainingMs / 1000)}s.`,
          );
          return;
        }

        const text = interaction.options.getString("text", true);
        const voiceId = interaction.options.getString("voice") ?? undefined;
        const selectedVoice = resolveVoice(voiceId);
        const voice = selectedVoice?.apiVoice;
        const speed =
          interaction.options.getNumber("speed") ??
          selectedVoice?.speed ??
          undefined;

        lastInvocation.set(member.id, now);

        const controller = new AbortController();
        activeAborts.set(interaction.guildId!, controller);

        const stopRow =
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`say:stop:${interaction.guildId}`)
              .setLabel("Stop")
              .setStyle(ButtonStyle.Danger),
          );

        await interaction.editReply({
          content: `🔊 Speaking in **#${voiceChannel.name}**…`,
          components: [stopRow],
        });

        try {
          await speakInChannel(voiceChannel, text, {
            voice,
            speed,
            signal: controller.signal,
          });
          if (controller.signal.aborted) {
            await interaction.editReply({
              content: "🛑 Stopped.",
              components: [],
            });
          } else {
            await interaction.editReply({
              content: "✅ Done.",
              components: [],
            });
          }
        } catch (err) {
          const msg =
            err instanceof TTSError
              ? err.message
              : `Unexpected error: ${(err as Error).message}`;
          moduleManager.logger.error(
            `/say failed: ${msg}`,
            interaction.guildId!,
            err,
            "say",
          );
          await interaction.editReply({
            content: `❌ ${msg}`,
            components: [],
          });
        } finally {
          activeAborts.delete(interaction.guildId!);
        }
      },

      async handleButton(
        interaction: ButtonInteraction,
        _moduleManager: ModuleManager,
      ) {
        if (!interaction.customId.startsWith("say:stop:")) return;

        const member = interaction.member as GuildMember | null;
        if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.reply({
            content: "❌ Admin only.",
            ephemeral: true,
          });
          return;
        }

        const controller = activeAborts.get(interaction.guildId!);
        if (!controller) {
          await interaction.reply({
            content: "⚠️ Nothing to stop.",
            ephemeral: true,
          });
          return;
        }

        controller.abort();
        await interaction.deferUpdate();
      },
    }
  : null;

export default sayModule;
