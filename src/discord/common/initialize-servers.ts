import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, Guild, GuildChannelCreateOptions, MessagePayload, PermissionFlagsBits, TextBasedChannel, TextChannel } from 'discord.js';
import { logger } from '../../logger';
import { pg } from '../../db/connection';
import { client } from '../client';

const {
    DEFAULT_CATEGORY_NAME,
    DEFAULT_GENERAL_CHANNEL_NAME,
} = process.env;

const createServerConfigs = async (server: Guild, serverConfig: any) => {
    if (!serverConfig) {
        serverConfig = await pg.queryBuilder()
            .select('*')
            .from('server')
            .where('externalId', '=', server.id)
            .first();
    }

    if (!serverConfig) {
        logger.info('Creating server config', { externalId: server.id });

        await pg.queryBuilder()
            .from('server')
            .insert({
                externalId: server.id,
                contractAddress: null,
                categoryChannelId: null,
                generalChannelId: null,
            });

        logger.info('Created server config', { externalId: server.id });
    }
};

const getGeneralWelcomeMessage = (channel: TextChannel): MessagePayload => {
    const embedInfo = new EmbedBuilder()
        .setColor(0xFF0EFF)
        .setTitle(process.env.DEFAULT_GENERAL_WELCOME_MESSAGE_TITLE as string)
        .setURL(process.env.DEFAULT_GENERAL_WELCOME_MESSAGE_URL as string)
        .setDescription('To authorize a wallet and gain access to specific roles based on the held NFTs, please click the button below.');

    const button = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('authorize')
                .setLabel('Authorize')
                .setStyle(ButtonStyle.Primary),
        );

    return new MessagePayload(channel, {
        components: [button as any],
        embeds: [embedInfo],
    });
};

const createGeneralChannel = async (server: Guild, serverConfig: any, categoryChannelId: string | undefined) => {
    const serverLog = {
        externalId: server.id,
        serverName: server.name,
    };
    const everyoneRole = server.roles.everyone;

    // Can add more channels to be generated here
    const channelsToGenerate = [
        !serverConfig.generalChannelId && {
            type: 'general',
            dbColumn: 'generalChannelId',
            name: DEFAULT_GENERAL_CHANNEL_NAME || '',
            permissions: [
                {
                    id: everyoneRole.id,
                    deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ManageChannels],
                },
                {
                    id: client.user?.id,
                    allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
                },
            ],
            getWelcomeMessage: getGeneralWelcomeMessage,
        }
    ].filter(Boolean) as {
        type: string;
        dbColumn: string;
        name: string;
        permissions: any[];
        getWelcomeMessage: (channel: TextChannel) => MessagePayload;
    }[];
    const channelNames = channelsToGenerate.map(({ name }) => name);

    await Promise.all(channelNames.map((channelName, i) => {
        return new Promise((resolve) => {
            const { getWelcomeMessage, permissions, type } = channelsToGenerate[i];
            logger.info(`Creating ${type} channel`, {
                ...serverLog,
                channelName,
            });

            const channelToCreate = {
                name: channelName as string,
                type: ChannelType.GuildText,
                parent: categoryChannelId,
            } as GuildChannelCreateOptions;

            if (permissions) {
                channelToCreate.permissionOverwrites = permissions;
            }

            server.channels.create(channelToCreate).then(async (channel) => {
                const logInfo = {
                    ...serverLog,
                    channelName,
                    channelId: channel.id,
                };
                logger.info(`Created ${type} channel`, logInfo);

                if (getWelcomeMessage) {
                    const welcomeMessage = getWelcomeMessage(channel);
                    await channel.send(welcomeMessage);
                    logger.info(`Sent welcome message to ${type} channel`, logInfo);
                }

                resolve(channel.id);
            }).catch((err) => {
                logger.error(`Error when creating ${type} channel`, {
                    ...serverLog,
                    channelName,
                    error: err,
                });

                return resolve(null);
            });
        });
    })).then(async (channelIds) => {
        if (!channelIds.some((channelId) => !!channelId)) {
            return;
        }
        const updatePayload = channelIds.reduce((acc: any, channelId, i) => {
            if (channelId && channelsToGenerate[i].dbColumn) {
                acc[channelsToGenerate[i].dbColumn] = channelId;
            }
            return acc;
        }, {});

        // Save channels in database
        await pg.queryBuilder()
            .from('server')
            .update(updatePayload as any)
            .where('id', serverConfig.id);

        logger.info('Updated database with admin and general channel ids', {
            ...serverLog,
            channelIds,
        });
    });
};

const createChannels = async (server: Guild, serverConfig: any) => {
    if (!serverConfig) {
        serverConfig = await pg.queryBuilder()
            .select('*')
            .from('server')
            .where('externalId', '=', server.id)
            .first();
    }

    const serverLog = {
        serverId: server.id,
        serverName: server.name,
    };

    if (!serverConfig || !serverLog.serverName) {
        logger.warn('Server not found', serverLog);
        return;
    }

    if (!serverConfig.categoryChannelId || !client.channels.cache.get(serverConfig.categoryChannelId)) {
        const channelLog = {
            ...serverLog,
            channelName: DEFAULT_CATEGORY_NAME,
        };
        logger.info('Creating category channel', channelLog);

        // Create category
        server.channels.create({
            name: DEFAULT_CATEGORY_NAME || '',
            type: ChannelType.GuildCategory,
        }).then(async (categoryChannel) => {
            (<any>channelLog).channelId = categoryChannel.id;
            logger.info('Created category channel', channelLog);

            // Save category in database
            await pg.queryBuilder()
                .from('server')
                .update({ categoryChannelId: categoryChannel.id })
                .where('id', serverConfig.id);

            logger.info('Updated database with category channel id', channelLog);

            await createGeneralChannel(server, serverConfig, categoryChannel.id);
        }).catch((error) => {
            logger.error('Error when creating category channel', {
                ...channelLog,
                error,
            });
        });
    } else {
        await createGeneralChannel(server, serverConfig, client.channels.cache.get(serverConfig.categoryChannelId)?.id);
    }
};

const initializeServer = async (server: Guild, serverConfig: any = null) => {
    await server.channels.fetch();
    await createServerConfigs(server, serverConfig);
    await createChannels(server, serverConfig);
};

const initializeServers = async () => {
    await client.guilds.fetch();
    const servers = client.guilds.cache.values();

    const serverConfigs = await pg.queryBuilder()
        .select('*')
        .from('server')
        .whereIn('externalId', client.guilds.cache.map(({ id }) => id));
    const serverConfigsByExternalId = serverConfigs.reduce((acc, serverConfig) => {
        acc[serverConfig.externalId] = serverConfig;
        return acc;
    }, {} as { [externalId: string]: any });

    for (const server of servers) {
        await initializeServer(server, serverConfigsByExternalId[server.id]);
    }
};

export { initializeServer, initializeServers };
