import axios from 'axios';
import Web3 from 'web3';
import safeEval from 'safe-eval';
import { Guild, GuildMember } from 'discord.js';
import { logger } from '../../logger';
import { pg } from '../../db/connection';
import { Holder, Role, ServerConfig } from '../../db/types';
import { client } from '../client';
import { formatBulletPointList } from '../utils/messages';
import { RebusNftId } from '../types';

const {
    DEFAULT_CONTRACT,
    ETHEREUM_NODE,
    EXPLORER_URL,
    REBUS_API_URL,
} = process.env;

const CACHE_TIME = 300000;

let contractAbiFetchedAt = 0;
let contractAbi: any;

const tokenMetaFetchedAtMap: { [tokenId: string]: any } = {};
const tokenMetaCache: { [tokenId: string]: any } = {};

const getContractAbi = async (contractAddress = '') => {
    if (contractAbi && (Date.now() + CACHE_TIME) >= contractAbiFetchedAt) {
        return contractAbi;
    }

    const res = await axios.get(`${EXPLORER_URL}?module=contract&action=getabi&address=${contractAddress || DEFAULT_CONTRACT}`);

    if (res.data?.status !== '1') {
        throw new Error(res.data?.result || 'Failed to get contract abi');
    }

    contractAbiFetchedAt = Date.now();
    contractAbi = JSON.parse(res.data?.result || '{}');

    return contractAbi;
};

const getContract = async (contractAddress = '') => {
    const web3 = new Web3(ETHEREUM_NODE || Web3.givenProvider);
    const abi = await getContractAbi(contractAddress);
    const contract = new web3.eth.Contract(abi, contractAddress || DEFAULT_CONTRACT);

    return contract;
};

const ownerOf = async (tokenId: string, contractAddress = '') => {
    try {
        const contract = await getContract(contractAddress);
        const owner = await contract.methods.ownerOf(tokenId).call();

        return owner;
    } catch (error: any) {
        logger.error('Failed to get token owner', { tokenId, contractAddress, error: error?.message || error });
        throw error;
    }
};

const balanceOf = async (address, contractAddress = '') => {
    try {
        const contract = await getContract(contractAddress);
        const balance = await contract.methods.balanceOf(address).call();

        return parseFloat(balance) || 0;
    } catch (error: any) {
        logger.error('Failed to get token balance', { address, contractAddress, error: error?.message || error });
        throw error;
    }
};

const getTokenMeta = async (tokenId: string, contractAddress = '') => {
    try {
        if (typeof tokenMetaCache[tokenId] !== 'undefined' && (Date.now() + CACHE_TIME) >= tokenMetaFetchedAtMap[tokenId]) {
            return tokenMetaCache[tokenId];
        }

        const contract = await getContract(contractAddress);
        const tokenURI = await contract.methods.getTokenURI(tokenId).call();

        if (tokenURI) {
            const res = await axios.get(tokenURI, { headers: { 'Content-Type': 'application/json' } });
            const tokenMeta = res.data || null;

            tokenMetaFetchedAtMap[tokenId] = Date.now();
            tokenMetaCache[tokenId] = tokenMeta;

            return tokenMeta;
        }

        return null;
    } catch (error: any) {
        logger.error('Failed to get token meta', { tokenId, contractAddress, error: error?.message || error });
        throw error;
    }
};

const verifyNftForUser = async (server: Guild, serverConfig: ServerConfig, serverRoles: Role[], member: GuildMember, holders: Holder[], isRoleDeleted = false) => {
    const ethAddresses = holders.map(({ ethAddress }) => ethAddress).filter(Boolean);
    const rebusAddresses = holders.map(({ address }) => address).filter(Boolean);
    const serverId = server.id;
    const userId = member.user.id;
    const rolesAdded: string[] = [];
    const rolesRemoved: string[] = [];
    const rolesWithPermissionError: string[] = [];

    for (const role of serverRoles) {
        const roleName = server?.roles.cache.get(role.externalId)?.name as string;
        const logInfo = { ethAddresses, rebusAddresses, userId, serverId, role };
        const userHasRole = !!member.roles.cache.get(role.externalId);
        let userHasAccessToRole = false;

        if (!isRoleDeleted) {
            const roleHasTokenId = parseInt(role.tokenId, 10) >= 0;
            const tokenOwner = roleHasTokenId ? await ownerOf(role.tokenId, serverConfig.contractAddress as string) : null;
            userHasAccessToRole = tokenOwner && ethAddresses.includes(tokenOwner);

            const minBalance = parseFloat(role.minBalance);

            if (!isNaN(minBalance) && minBalance > 0) {
                userHasAccessToRole = false;

                for (const address of ethAddresses) {
                    const balance = await balanceOf(address, serverConfig.contractAddress as string);

                    if (balance !== null && balance >= minBalance) {
                        userHasAccessToRole = true;
                        break;
                    }
                }
            }

            if (role.metaCondition) {
                userHasAccessToRole = false;
                const meta = await getTokenMeta(role.tokenId);

                if (meta) {
                    try {
                        logger.info('Evaluating meta condition', logInfo);
                        userHasAccessToRole = !!safeEval(role.metaCondition, meta);
                    } catch (error: any) {
                        if (!error?.message?.includes('Cannot read properties of undefined')) {
                            logger.error('Failed to evaluate meta condition', logInfo);
                        }
                    }
                }
            }

            if (role.rebusNftid) {
                userHasAccessToRole = false;

                const config = role.rebusNftid.split(',');
                const requiresActivation = config[2] === 'require-activation';

                for (const address of rebusAddresses) {
                    const nftidRes = await axios.get<RebusNftId>(`${REBUS_API_URL}/rebus/nftid/v1beta1/id_record/${config[0]}/${config[1]}/${address}`);
                    const nftid = nftidRes.data;

                    if (nftid && (!requiresActivation || nftid.id_record?.active)) {
                        userHasAccessToRole = true;
                        break;
                    }
                }
            }
        }

        try {
            if (userHasRole && !userHasAccessToRole) {
                logger.info('Removing role from user', logInfo);
                await member.roles.remove(role.externalId as string);
                rolesRemoved.push(roleName);
            } else if (!userHasRole && userHasAccessToRole) {
                logger.info('Adding role to user', logInfo);
                await member.roles.add(role.externalId as string);                    
                rolesAdded.push(roleName);
            }
        } catch (err: any) {
            if (err?.status === 403) {
                rolesWithPermissionError.push(roleName);
            } else {
                throw err;
            }
        }
    }

    if (rolesWithPermissionError.length > 0) {
        await server.members.cache.get(server.ownerId)?.send(formatBulletPointList(rolesWithPermissionError, `The following roles are not manageable by the bot on server "${server.name}":`));
    }

    const rolesAddedList = rolesAdded.length ? formatBulletPointList(rolesAdded, 'You have been added to the following roles:') : '';
    const rolesRemovedList = rolesRemoved.length ? formatBulletPointList(rolesRemoved, 'You have been removed from the following roles:') : '';
    const content = `For server: ${server.name} (${server.id})\n${rolesAddedList}${rolesAdded.length ? '\n' : ''}${rolesRemovedList}`;

    if (!serverConfig.disablePrivateMessages && (rolesAdded.length || rolesRemoved.length)) {
        await member.send(content);
    }
};

export const verifyNftForServer = async (server: Guild) => {
    const logInfo = { serverId: server.id };

    try {
        logger.info('Verifying users for server', logInfo);

        const holders: Holder[] = await pg.queryBuilder()
            .select('address', 'ethAddress', 'userId')
            .from('holder')
            .where('externalServerId', '=', server.id);
        const holdersByUserId = holders.reduce((acc, holder) => {
            if (!acc[holder.userId]) {
                acc[holder.userId] = [holder];
            } else {
                acc[holder.userId].push(holder);
            }
            return acc;
        }, {} as { [userId: string]: Holder[] });

        const serverRoles: Role[] = await pg.queryBuilder()
            .select('*')
            .from('role')
            .where('externalServerId', '=', server.id);

        const serverConfig: ServerConfig = await pg.queryBuilder()
            .select('contractAddress', 'disablePrivateMessages')
            .from('server')
            .where('externalId', '=', server.id)
            .first();

        await server.members.fetch();

        for (const member of server.members.cache.values()) {
            const holders = holdersByUserId[member.id];
            if (!holders) {
                continue;
            }

            await verifyNftForUser(server, serverConfig, serverRoles, member, holders);
        }

        logger.info('Finished verifying users for server', logInfo);
    } catch (error: any) {
        logger.error('Error verify users for server', { ...logInfo, error: error?.message || error });
    }
};

export const verifyNftForRole = async (server: Guild, role: Role, isRoleDeleted = false) => {
    const logInfo = { serverId: server.id, role };

    try {
        logger.info('Verifying users for role', logInfo);

        const holders: Holder[] = await pg.queryBuilder()
            .select('address', 'ethAddress', 'userId')
            .from('holder')
            .where('externalServerId', '=', server.id);
        const holdersByUserId = holders.reduce((acc, holder) => {
            if (!acc[holder.userId]) {
                acc[holder.userId] = [holder];
            } else {
                acc[holder.userId].push(holder);
            }
            return acc;
        }, {} as { [userId: string]: Holder[] });

        const serverConfig: ServerConfig = await pg.queryBuilder()
            .select('contractAddress', 'disablePrivateMessages')
            .from('server')
            .where('externalId', '=', server.id)
            .first();

        await server.members.fetch();

        for (const member of server.members.cache.values()) {
            const holders = holdersByUserId[member.id];
            if (!holders) {
                continue;
            }

            await verifyNftForUser(server, serverConfig, [role], member, holders, isRoleDeleted);
        }

        logger.info('Finished verifying users for role', logInfo);
    } catch (error) {
        logger.error('Error verify users for role', { ...logInfo, error: (error as any)?.message || error });
    }
};

export const verifyNftForAllUsers = async () => {
    try {
        logger.info('Verifying all users');

        await client.guilds.fetch();

        const serverIds = client.guilds.cache.map(({ id }) => id);

        const holders: Holder[] = await pg.queryBuilder()
            .select('externalServerId', 'address', 'ethAddress', 'userId')
            .from('holder')
            .whereIn('externalServerId', serverIds);
        const holdersByUserIdAndServerId = holders.reduce((acc, holder) => {
            const key = `${holder.externalServerId}${holder.userId}`;

            if (!acc[key]) {
                acc[key] = [holder];
            } else {
                acc[key].push(holder);
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
                .select('contractAddress', 'disablePrivateMessages')
                .from('server')
                .where('externalId', '=', serverId)
                .first();

            await server.members.fetch();

            for (const member of server.members.cache.values()) {
                const holders = holdersByUserIdAndServerId[`${serverId}${member.id}`];
                if (!holders) {
                    continue;
                }

                const serverRoles = rolesByExternalServerId[serverId] || [];

                await verifyNftForUser(server, serverConfig, serverRoles, member, holders);
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
            .select('contractAddress', 'disablePrivateMessages')
            .from('server')
            .where('externalId', '=', serverId)
            .first();
        const holders: Holder[] = await pg.queryBuilder()
            .select('address', 'ethAddress')
            .from('holder')
            .where('externalServerId', '=', serverId)
            .andWhere('userId', '=', userId);

        await verifyNftForUser(server, serverConfig, roles, member, holders);

        logger.info('Finished on user authorized', rootLogInfo);
    } catch (error) {
        logger.error('Error on user authorized', { serverId, userId, error });
    }
};
