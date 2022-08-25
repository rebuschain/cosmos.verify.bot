import { logger } from '../../logger';
import { client } from '../client';
import { initializeServers } from '../common/initialize-servers';
import { verifyNftForAllUsers } from '../common/verify-nft';

export const name = 'ready';
export const once = true;
export const execute = async () => {
    logger.info('Ready');
    await initializeServers();
    logger.info('Logged in', { username: client.user?.username, id: client.user?.id });

    setInterval(verifyNftForAllUsers, parseInt(process.env.INTERVAL_VERIFY_USERS || '', 10) || 60000);
    await verifyNftForAllUsers();
};
