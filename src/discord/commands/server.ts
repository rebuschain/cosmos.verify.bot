import { CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { pg } from '../../db/connection';
import { logger } from '../../logger';
import { formatBulletPointList } from '../utils/messages';
import { verifyNftForServer } from '../common/verify-nft';
import { ServerConfig } from 'src/db/types';

export const name = 'server';

export const data = new SlashCommandBuilder()
    .setName('server')
    .setDescription('Server config management commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand =>
		subcommand
			.setName('get')
			.setDescription('Gets the configuration for the server')
    )
    .addSubcommand(subcommand =>
		subcommand
			.setName('update')
			.setDescription('Updates the configuration for a server')
			.addStringOption(option => option.setName('contract-address').setDescription('The ERC721 contract address ("null" to remove)'))
            .addBooleanOption(option => option.setName('disable-private-messages').setDescription('Whether to send private messages to users when they are assigned a role'))
    );

const serverGet = async (interaction: CommandInteraction) => {
    const serverId = interaction.guild?.id;

    try {
        if (serverId) {
            logger.info('Getting role configuration', { serverId });

            const serverConfig: ServerConfig = await pg.queryBuilder()
                .select('contractAddress')
                .from('server')
                .andWhere('externalId', '=', serverId)
                .first();

            if (!serverConfig) {
                return interaction.reply({ content: 'No server configuration found', ephemeral: true });
            }

            interaction.reply({ content: formatBulletPointList([
                `Contract Address: ${serverConfig.contractAddress || process.env.DEFAULT_CONTRACT}`,
            ], `Server is configured as follows:`), ephemeral: true });
        } else {
            interaction.reply({ content: 'No role configuration found', ephemeral: true });
        }
    } catch (error) {
        logger.error('Error fetching role configuration', {
            serverId,
            error,
        });
        interaction.reply({ content: 'There was an error while fetching the server configuration', ephemeral: true });
    }
};

const serverUpdate = async (interaction: CommandInteraction) => {
    let contractAddress = interaction.options.get('contract-address')?.value as string | null;
    contractAddress = contractAddress?.toLowerCase() === 'null' ? null : contractAddress;
    const disablePrivateMessages = interaction.options.get('disable-private-messages')?.value as boolean | null;
    const serverId = interaction.guild?.id;
    const logInfo = { serverId, contractAddress };

    try {
        if (serverId) {
            logger.info('Updating server config', logInfo);

            await pg.queryBuilder()
                .from('server')
                .where('externalId', '=', serverId)
                .update({ contractAddress, disablePrivateMessages });

            interaction.reply({ content: 'Server configuration has been updated', ephemeral: true });

            await verifyNftForServer(interaction.guild);
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
        case 'get':
            await serverGet(interaction);
            break;
        case 'update':
            await serverUpdate(interaction);
            break;
        default:
            interaction.reply({ content: 'Invalid subcommand', ephemeral: true });
            break;
    }
};
