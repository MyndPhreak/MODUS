import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { BotModule, ModuleManager } from '../ModuleManager';
import { buildV2Layout } from '../lib/components-v2';

const pingModule: BotModule = {
    name: 'ping',
    description: 'Replies with Pong and latency metrics!',
    meta: {
        displayName: 'Ping',
        category: 'utility',
        icon: 'i-lucide-activity',
        color: 'cyan',
        tags: ['latency', 'status', 'health', 'ping'],
    },
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong and latency metrics!')
        .toJSON(),
    execute: async (interaction: ChatInputCommandInteraction, moduleManager: ModuleManager) => {
        const sent = await interaction.fetchReply();
        const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
        const apiPing = interaction.client.ws.ping;

        const v2Layout = buildV2Layout({
            title: "🏓 Pong!",
            fields: [
                { name: "Roundtrip Latency", value: `**${roundtrip}ms**`, inline: true },
                { name: "WebSocket API Latency", value: `**${apiPing}ms**`, inline: true },
            ],
            footer: `Shard ${interaction.guild?.shardId ?? 0}`,
            useContainer: true,
        });

        await interaction.editReply({
            components: v2Layout,
            flags: MessageFlags.IsComponentsV2,
        });
    },
};

export default pingModule;

