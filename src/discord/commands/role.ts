import { CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { Role, ServerConfig } from '../../db/types';
import { pg } from '../../db/connection';
import { verifyNftForRole } from '../common/verify-nft';
import { logger } from '../../logger';
import { formatBulletPointList } from '../utils/messages';

export const name = 'role';

export const data = new SlashCommandBuilder()
    .setName('role')
    .setDescription('Server role management commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand =>
		subcommand
			.setName('list')
			.setDescription('Lists all the roles that are configured for the server')
    )
    .addSubcommand(subcommand =>
		subcommand
			.setName('get')
			.setDescription('Gets the role configuration')
            .addRoleOption(option => option.setName('role').setDescription('The role').setRequired(true))
    )
    .addSubcommand(subcommand =>
		subcommand
			.setName('add')
			.setDescription('Adds a role configuration to the server configuration')
			.addRoleOption(option => option.setName('role').setDescription('The role').setRequired(true))
            .addIntegerOption(option => option.setName('token-id').setDescription('The token ID required ("-1" to remove)'))
            .addNumberOption(option => option.setName('min-balance').setDescription('The min balance of the token required ("-1" to remove)'))
            .addStringOption(option => option.setName('meta-condition').setDescription('The dynamic meta condition of the token required ("null" to remove)'))
    )
    .addSubcommand(subcommand =>
		subcommand
			.setName('remove')
			.setDescription('Removes a role configuration to the server configuration')
			.addRoleOption(option => option.setName('role').setDescription('The role').setRequired(true))
    )
    .addSubcommand(subcommand =>
		subcommand
			.setName('update')
			.setDescription('Updates the configuration for a role')
			.addRoleOption(option => option.setName('role').setDescription('The role').setRequired(true))
            .addIntegerOption(option => option.setName('token-id').setDescription('The token ID required ("-1" to remove)'))
            .addNumberOption(option => option.setName('min-balance').setDescription('The min balance of the token required ("-1" to remove)'))
            .addStringOption(option => option.setName('meta-condition').setDescription('The dynamic meta condition of the token required ("null" to remove)'))
    );

const getRoleProperties = (interaction: CommandInteraction) => {
    let tokenId = interaction.options.get('token-id')?.value as number | null;
    if (typeof tokenId !== 'undefined') {
        tokenId = !tokenId || tokenId < 0 ? null : tokenId;
    }
    let minBalance = interaction.options.get('min-balance')?.value as number | null;
    minBalance = !minBalance || minBalance < 0 ? null : minBalance;
    if (typeof minBalance !== 'undefined') {
        minBalance = !minBalance || minBalance < 0 ? null : minBalance;
    }
    let metaCondition = interaction.options.get('meta-condition')?.value as string | null;
    if (typeof metaCondition !== 'undefined') {
        metaCondition = metaCondition?.toLowerCase() === 'null' ? null : metaCondition;
    }

    return { tokenId, minBalance, metaCondition };
}

const roleList = async (interaction: CommandInteraction) => {
    const serverId = interaction.guild?.id;

    try {
        if (serverId) {
            logger.info('Listing server roles', { serverId });

            const roles: Role[] = await pg.queryBuilder()
                .select('*')
                .from('role')
                .where('externalServerId', '=', serverId as string);
            const roleIds = roles.map(r => r.externalId);

            if (!roleIds.length) {
                return interaction.reply({ content: 'No roles are configured', ephemeral: true });
            }

            await interaction.guild.roles.fetch();
            const roleInfo = interaction.guild.roles.cache.filter(role => roleIds.includes(role.id)).map(role => `${role.name} (${role.id})`);

            interaction.reply({ content: formatBulletPointList(roleInfo, 'The following roles are configured:'), ephemeral: true });
        } else {
            interaction.reply({ content: 'No server configuration found', ephemeral: true });
        }
    } catch (error) {
        logger.error('Error fetching role list', {
            serverId,
            error: error,
        });
        interaction.reply({ content: 'There was an error while removing the role configuration', ephemeral: true });
    }
};

const roleGet = async (interaction: CommandInteraction) => {
    const serverId = interaction.guild?.id;
    const target = interaction.options.get('role', true);
    const { role } = target;

    try {
        if (serverId && role) {
            logger.info('Getting role configuration', { roleId: role.id, serverId });

            const roleConfig: Role = await pg.queryBuilder()
                .select('*')
                .from('role')
                .where('externalServerId', '=', serverId as string)
                .andWhere('externalId', '=', role.id)
                .first();

            if (!roleConfig) {
                return interaction.reply({ content: 'No role configuration found', ephemeral: true });
            }

            interaction.reply({ content: formatBulletPointList([
                `Token ID: ${roleConfig.tokenId}`,
                `Min Balance: ${roleConfig.minBalance}`,
                `Meta Condition: ${roleConfig.metaCondition}`,
            ], `Role "${role.name}" is configured as follows:`), ephemeral: true });
        } else {
            interaction.reply({ content: 'No role configuration found', ephemeral: true });
        }
    } catch (error) {
        logger.error('Error fetching role configuration', {
            roleId: role?.id,
            serverId,
            error: error,
        });
        interaction.reply({ content: 'There was an error while fetching the role configuration', ephemeral: true });
    }
};

const roleAdd = async (interaction: CommandInteraction) => {
    const target = interaction.options.get('role', true);
    const { role } = target;
    const { tokenId, minBalance, metaCondition } = getRoleProperties(interaction);
    const serverId = interaction.guild?.id;
    const logInfo = { serverId, roleId: role?.id, roleName: role?.name, tokenId, minBalance, metaCondition };

    try {
        if (role && serverId) {
            logger.info('Adding role', logInfo);

            const existingRole: Role = await pg.queryBuilder()
                .select('*')
                .from('role')
                .where('externalId', '=', role.id)
                .first();

            if (!existingRole) {
                const serverConfig: ServerConfig = await pg.queryBuilder()
                    .select('*')
                    .from('server')
                    .where('externalId', '=', serverId as string)
                    .first();

                if (!serverConfig) {
                    throw new Error('No server config found');
                }

                await pg.queryBuilder()
                    .from('role')
                    .insert({
                        externalId: role.id,
                        serverId: serverConfig.id,
                        externalServerId: serverId as string,
                        tokenId,
                        minBalance,
                        metaCondition,
                    });

                interaction.reply({ content: `Role configuration "${role.name}" added`, ephemeral: true });

                if (typeof tokenId !== 'undefined' || typeof minBalance !== 'undefined' || typeof metaCondition !== 'undefined') {
                    const roleConfig: Role = await pg.queryBuilder()
                        .select('*')
                        .from('role')
                        .where('externalId', '=', role.id)
                        .first();

                    await verifyNftForRole(interaction.guild, roleConfig);
                }
            } else {
                interaction.reply({ content: 'Role configuration is already added', ephemeral: true });
            }
        } else {
            interaction.reply({ content: 'No role found', ephemeral: true });
        }
    } catch (error) {
        logger.error('Error adding role', {
            ...logInfo,
            error: error,
        });
        interaction.reply({ content: 'There was an error while adding the role configuration', ephemeral: true });
    }
};

const roleRemove = async (interaction: CommandInteraction) => {
    const target = interaction.options.get('role', true);
    const { role } = target;
    const serverId = interaction.guild?.id;

    try {
        if (role && serverId) {
            logger.info('Removing role', { serverId, roleId: role.id, roleName: role.name });

            const roleConfig = await pg.queryBuilder()
                .select('*')
                .from('role')
                .where('externalId', '=', role.id)
                .first();

            if (roleConfig) {
                await pg.queryBuilder()
                    .from('role')
                    .where('externalId', '=', role.id)
                    .delete();
            }

            interaction.reply({ content: `Role configuration "${role.name}" removed`, ephemeral: true });

            await verifyNftForRole(interaction.guild, roleConfig, true);
        } else {
            interaction.reply({ content: 'No role configuration found', ephemeral: true });
        }
    } catch (error) {
        logger.error('Error removing role', {
            serverId,
            roleId: role?.id,
            roleName: role?.name,
            error: error,
        });
        interaction.reply({ content: 'There was an error while removing the role configuration', ephemeral: true });
    }
};

const roleUpdate = async (interaction: CommandInteraction) => {
    const target = interaction.options.get('role', true);
    const { role } = target;
    const { tokenId, minBalance, metaCondition } = getRoleProperties(interaction);
    const serverId = interaction.guild?.id;
    const logInfo = { serverId, roleId: role?.id, roleName: role?.name, tokenId, minBalance, metaCondition };

    try {
        if (role && serverId) {
            logger.info('Adding role', logInfo);

            const existingRole: Role = await pg.queryBuilder()
                .select('*')
                .from('role')
                .where('externalId', '=', role.id)
                .first();

            if (!existingRole) {
                interaction.reply({ content: `Role configuration "${role.name}" does not exist`, ephemeral: true });
            } else {
                await pg.queryBuilder()
                    .from('role')
                    .where('id', '=', existingRole.id)
                    .update({
                        tokenId,
                        minBalance,
                        metaCondition,
                    });

                interaction.reply({ content: 'Role configuration has been updated', ephemeral: true });

                if (typeof tokenId !== 'undefined' || typeof minBalance !== 'undefined' || typeof metaCondition !== 'undefined') {
                    const roleConfig: Role = await pg.queryBuilder()
                        .select('*')
                        .from('role')
                        .where('id', '=', existingRole.id)
                        .first();

                    await verifyNftForRole(interaction.guild, roleConfig);
                }
            }
        } else {
            interaction.reply({ content: 'No role found', ephemeral: true });
        }
    } catch (error) {
        logger.error('Error updating role', {
            ...logInfo,
            error: error,
        });
        interaction.reply({ content: 'There was an error while updating the role configuration', ephemeral: true });
    }
};

export const execute = async (interaction: CommandInteraction) => {
    const subcommand = (<any>interaction.options).getSubcommand();

    switch (subcommand) {
        case 'list':
            await roleList(interaction);
            break;
        case 'get':
            await roleGet(interaction);
            break;
        case 'add':
            await roleAdd(interaction);
            break;
        case 'remove':
            await roleRemove(interaction);
            break;
        case 'update':
            await roleUpdate(interaction);
            break;
        default:
            interaction.reply({ content: 'Invalid subcommand', ephemeral: true });
            break;
    }
};
