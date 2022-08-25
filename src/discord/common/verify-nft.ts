import axios from 'axios';
import Web3 from 'web3';
import { Guild, GuildMember } from 'discord.js';
import { logger } from '../../logger';
import { pg } from '../../db/connection';
import { Holder, Role, ServerConfig } from '../../db/types';
import { client } from '../client';
import { formatBulletPointList } from '../utils/messages';

const {
    DEFAULT_CONTRACT,
    ETHEREUM_NODE,
    EXPLORER_URL,
} = process.env;

const getContractAbi = async (contractAddress = '') => {
    const res = await axios.get(`${EXPLORER_URL}?module=contract&action=getabi&address=${contractAddress || DEFAULT_CONTRACT}`);

    if (res.data?.status !== '1') {
        throw new Error(res.data?.result || 'Failed to get contract abi');
    }

    return JSON.parse(res.data?.result || '{}');
};

const getContract = async (contractAddress = '') => {
    const web3 = new Web3(ETHEREUM_NODE || Web3.givenProvider);
    const abi = await getContractAbi(contractAddress);
    const contract = new web3.eth.Contract(abi, contractAddress || DEFAULT_CONTRACT);

    return contract;
};

const ownerOf = async (tokenId: string, contractAddress = '') => {
    const contract = await getContract(contractAddress);
    const owner = await contract.methods.ownerOf(tokenId).call();

    return owner;
};

const verifyNftForUser = async (server: Guild, serverConfig: ServerConfig, serverRoles: Role[], member: GuildMember, addresses: string[]) => {
    const serverId = server.id;
    const userId = member.user.id;
    const rolesAdded: string[] = [];
    const rolesRemoved: string[] = [];

    for (const role of serverRoles) {
        const roleName = server?.roles.cache.get(role.externalId)?.name as string;
        const logInfo = { addresses, userId, serverId, roleId: role.id, roleName, externalRoleId: role.externalId, tokenId: role.tokenId };
        const userHasRole = !!member.roles.cache.get(role.externalId);
        const roleHasTokenId = role.tokenId?.length > 0;
        const tokenOwner = roleHasTokenId ? await ownerOf(role.tokenId, serverConfig.contractAddress as string) : null;
        const userOwnsToken = tokenOwner && addresses.includes(tokenOwner);

        if (userHasRole && !userOwnsToken) {
            logger.info('Removing role from user', logInfo);
            await member.roles.remove(role.externalId as string);
            rolesRemoved.push(roleName);
        } else if (!userHasRole && userOwnsToken) {
            logger.info('Adding role to user', logInfo);
            await member.roles.add(role.externalId as string);                    
            rolesAdded.push(roleName);
        }
    }

    const rolesAddedList = rolesAdded.length ? formatBulletPointList(rolesAdded, 'You have been added to the following roles:') : '';
    const rolesRemovedList = rolesRemoved.length ? formatBulletPointList(rolesRemoved, 'You have been removed from the following roles:') : '';
    const content = `For server: ${server.name} (${server.id})\n${rolesAddedList}${rolesAdded.length ? '\n' : ''}${rolesRemovedList}`;

    if (rolesAdded.length || rolesRemoved.length) {
        await member.send(content);
    }
};

export const verifyNftForAllUsers = async () => {
    try {
        logger.info('Verifying all users');

        await client.guilds.fetch();

        const serverIds = client.guilds.cache.map(({ id }) => id);

        const holders: Holder[] = await pg.queryBuilder()
            .select('ethAddress', 'userId')
            .from('holder')
            .whereIn('externalServerId', serverIds);
        const holdersByUserId = holders.reduce((acc, holder) => {
            if (!acc[holder.userId]) {
                acc[holder.userId] = [holder];
            } else {
                acc[holder.userId].push(holder);
            }
            return acc;
        }, {} as { [userId: string]: Holder[] });

        const roles: Role[] = await pg.queryBuilder()
            .select('*')
            .from('role')
            .whereIn('externalServerId', serverIds);
        const rolesByExternalServerId = roles.reduce((acc, role) => {
            if (!acc[role.externalServerId]) {
                acc[role.externalServerId] = [];
            }

            acc[role.externalServerId].push(role);
            return acc;
        }, {} as { [id: string]: Role[] });

        for (const serverId of serverIds) {
            const server = client.guilds.cache.get(serverId);
            if (!server) {
                continue;
            }

            const serverConfig: ServerConfig = await pg.queryBuilder()
                .select('contractAddress')
                .from('server')
                .where('externalId', '=', serverId)
                .first();

            await server.members.fetch();

            for (const member of server.members.cache.values()) {
                const holders = holdersByUserId[member.id];
                if (!holders) {
                    continue;
                }

                const serverRoles = rolesByExternalServerId[serverId];

                await verifyNftForUser(server, serverConfig, serverRoles, member, holders.map(({ ethAddress }) => ethAddress));
            }
        }

        logger.info('Finished verifying all users');
    } catch (error) {
        logger.error('Error verify all users', error);
    }
};

export const onUserAuthorized = async (serverId: string, userId: string) => {
    try {
        const rootLogInfo = { serverId, userId };
        logger.info('On user authorized', rootLogInfo);

        await client.guilds.fetch(serverId);

        const roles: Role[] = await pg.queryBuilder()
            .select('*')
            .from('role')
            .where('externalServerId', '=', serverId);

        const server = client.guilds.cache.get(serverId);
        const member = server?.members.cache.get(userId);

        if (!server) {
            logger.error('Failed to get server', { serverId, userId });
            return;
        }
        if (!member) {
            logger.error('Failed to get member', { serverId, userId });
            return;
        }

        const serverConfig: ServerConfig = await pg.queryBuilder()
            .select('contractAddress')
            .from('server')
            .where('externalId', '=', serverId)
            .first();
        const holders: Holder[] = await pg.queryBuilder()
            .select('ethAddress')
            .from('holder')
            .where('externalServerId', '=', serverId)
            .andWhere('userId', '=', userId);

        await verifyNftForUser(server, serverConfig, roles, member, holders.map(({ ethAddress }) => ethAddress));

        logger.info('Finished on user authorized', rootLogInfo);
    } catch (error) {
        logger.error('Error on user authorized', { serverId, userId, error });
    }
};
