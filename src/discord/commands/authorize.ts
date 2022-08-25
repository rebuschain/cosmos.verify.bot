import { ActionRowBuilder, ButtonBuilder, ButtonStyle, CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { pg } from '../../db/connection';
import { logger } from '../../logger';

const {
    DISCORD_WEB_URL,
    WALLET_CONNECT_APP_NAME,
} = process.env;

export const name = 'authorize';

export const data = new SlashCommandBuilder()
    .setName('authorize')
    .setDescription('Get link to connect wallet and get authorized to private roles');

export const execute = async (interaction: CommandInteraction) => {
    const serverId = interaction.guild?.id;
    const userId = interaction?.user?.id;

    try {
        if (serverId) {
            logger.info('Sending user an authorization link', { serverId, userId });

            const server = await pg.queryBuilder()
                .from('server')
                .where('externalId', '=', serverId)
                .select('generalChannelId')
                .first();

            const redirectUrl = encodeURIComponent(`${DISCORD_WEB_URL}/channels/${serverId}/${server.generalChannelId}`);

            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Connect Wallet')
                        .setURL(`${process.env.WALLET_CONNECT_URL}/wallet-connect?app=${WALLET_CONNECT_APP_NAME}&userId=${userId}&serverId=${serverId}&redirectUrl=${redirectUrl}`)
                        .setStyle(ButtonStyle.Link),
                );

            interaction.reply({ content: 'Click the link below in order to connect your wallet to your discord user', ephemeral: true, components: [button as any] });
        } else {
            interaction.reply({ content: 'No server configuration found', ephemeral: true });
        }
    } catch (error) {
        logger.error('Error fetching role list', {
            serverId,
            userId,
            error: error,
        });
        interaction.reply({ content: 'There was an error while removing the role configuration', ephemeral: true });
    }
};
