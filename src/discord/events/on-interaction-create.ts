import { CacheType, Interaction } from 'discord.js';
import { logger } from '../../logger';
import { client } from '../client';

export const name = 'interactionCreate';
export const execute = async (interaction: Interaction<CacheType>) => {
	if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

	const command = client.commands.get((<any>interaction).commandName || (<any>interaction).customId);
	if (!command) return;

	try {
		await command.execute(interaction);
	} catch (error) {
		logger.error('Error executing interaction', error);
		await interaction.reply({ content: 'There was an error while executing this command', ephemeral: true });
	}
};
