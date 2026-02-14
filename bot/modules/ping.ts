import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { BotModule, ModuleManager } from '../ModuleManager';

const pingModule: BotModule = {
    name: 'ping',
    description: 'Replies with Pong!',
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!')
        .toJSON(),
    execute: async (interaction: ChatInputCommandInteraction, moduleManager: ModuleManager) => {
        const sent = await interaction.editReply('Pinging...');
        const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
        const apiPing = interaction.client.ws.ping;

        await interaction.editReply(`Pong! 🏓\nRoundtrip Latency: **${roundtrip}ms**\nAPI Latency: **${apiPing}ms**`);
    },
};

export default pingModule;
