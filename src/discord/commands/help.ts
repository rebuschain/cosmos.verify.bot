import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { formatBulletPointList } from '../utils/messages';

export const name = 'help';

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Displays info about the server')
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
    'token-id: The NFT token id which will be required for the user to be assigned to the specified role',
    'min-balance: The minimum balance required for the user to be assigned to the specified role',
    '(TODO) meta-condition: The condition that the meta properties of the NFT must be matched to in order for the user to be assigned to the specified role',
], 'The updateable properties are:')}`, ephemeral: true });
            break;
        case 'server':
            interaction.reply({ content: 'Command only available for admin users. It is used to update the configuration of the server. The updateable properties are: "contract-address"', ephemeral: true });
            break;
        default:
            interaction.reply({ content: 'Invalid subcommand', ephemeral: true });
            break;
    }
};
