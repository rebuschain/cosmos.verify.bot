import { Guild } from 'discord.js';
import { logger } from '../../logger';
import { initializeServer } from '../common/initialize-servers';

export const name = 'guildCreate';
export const execute = async (server: Guild) => {
    logger.info('Guild Create', {
        serverId: server.id,
        serverName: server.name,
    });

    await initializeServer(server);
};
