import { CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { pg } from '../../db/connection';
import { logger } from '../../logger';

export const name = 'roleAdd';

export const data = new SlashCommandBuilder()
    .setName('server')
    .setDescription('Server config management commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand =>
		subcommand
			.setName('update')
			.setDescription('Updates the configuration for a server')
			.addStringOption(option => option.setName('contract-address').setDescription('The ERC721 contract address ("null" to remove)'))
    );

const serverUpdate = async (interaction: CommandInteraction) => {
    let contractAddress = interaction.options.get('contract-address')?.value as string | null;
    contractAddress = contractAddress?.toLowerCase() === 'null' ? null : contractAddress;
    const serverId = interaction.guild?.id;
    const logInfo = { serverId, contractAddress };

    try {
        if (serverId) {
            logger.info('Updating server config', logInfo);

            await pg.queryBuilder()
                .from('server')
                .where('externalId', '=', serverId)
                .update({ contractAddress });

            interaction.reply({ content: 'Server configuration has been updated', ephemeral: true });
        } else {
            interaction.reply({ content: 'No server found', ephemeral: true });
        }
    } catch (error) {
        logger.error('Error updating server config', {
            ...logInfo,
            error: error,
        });
        interaction.reply({ content: 'There was an error while updating the server configuration', ephemeral: true });
    }
};

export const execute = async (interaction: CommandInteraction) => {
    const subcommand = (<any>interaction.options).getSubcommand();

    switch (subcommand) {
        case 'update':
            await serverUpdate(interaction);
            break;
        default:
            interaction.reply({ content: 'Invalid subcommand', ephemeral: true });
            break;
    }
};
