import { CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { formatBulletPointList } from '../utils/messages';

export const name = 'help';

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Displays info about the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand =>
		subcommand
			.setName('authorize')
			.setDescription('Displays info about the authorize command')
    )
    .addSubcommand(subcommand =>
		subcommand
			.setName('role')
			.setDescription('Displays info about the role command')
    )
    .addSubcommand(subcommand =>
		subcommand
			.setName('server')
			.setDescription('Displays info about the server command')
    );

export const execute = async (interaction: CommandInteraction) => {
    const subcommand = (<any>interaction.options).getSubcommand();

    switch (subcommand) {
        case 'authorize':
            interaction.reply({ content: `The authorize command is available for all users. It is used to initiate the process to associate a user to a wallet.
${formatBulletPointList([
    'Click the Authorize button or use the /authorize command',
    'Click the button link that gets displayed in the channel to get redirected to the webpage to connect the wallet',
    'Connect one of the available wallet options and sign the message',
    'Wallet is now connected to the user',
], 'Flow:')}`, ephemeral: true });
            break;
        case 'role':
            interaction.reply({ content: `Command only available for admin users. It is used to get/list/add/remove/update the role configuration of the server.
${formatBulletPointList([
    'token-id: The NFT token id which will be required for the user to be assigned to the specified role (Setting to less than 0 will make it be removed)',
    'min-balance: The minimum balance required for the user to be assigned to the specified role (Setting to less than 0 will make it be removed)',
    `meta-condition: The condition that the meta properties of the NFT must be matched to in order for the user to be assigned to the specified role (Setting to "null" will make it be removed)
    Example: "name === 'Spooky Pet #3462' && !!attributes.find((attr) => attr.trait_type === 'Landscape')"`,
    `rebus-nftid: The configuration string for the required nftid to be owned by the user (Setting to "null" will make it be removed)
    Example: "v1,rebus,require-activation" where the first item is the version, second item is the organization, and third item specifies if activation is required`,
], 'The updateable properties are:')}`, ephemeral: true });
            break;
        case 'server':
            interaction.reply({ content: 'Command only available for admin users. It is used to update the configuration of the server. The updateable properties are: "contract-address" and "disablePrivateMessages"', ephemeral: true });
            break;
        default:
            interaction.reply({ content: 'Invalid subcommand', ephemeral: true });
            break;
    }
};
