import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { BotModule, ModuleManager } from '../ModuleManager';

const reloadModule: BotModule = {
    name: 'reload',
    description: 'Reloads all bot modules.',
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Reloads all bot modules.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),
    execute: async (interaction: ChatInputCommandInteraction, moduleManager: ModuleManager) => {
        try {
            await interaction.editReply('Reloading modules...');
            await moduleManager.loadModules();
            await interaction.editReply('✅ All modules have been reloaded successfully!');
        } catch (error) {
            console.error('[ReloadModule] Error reloading modules:', error);
            await interaction.editReply('❌ Failed to reload modules. Check console for errors.');
        }
    },
};

export default reloadModule;
