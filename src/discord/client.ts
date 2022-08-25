import { Client, Collection, GatewayIntentBits, SlashCommandBuilder } from 'discord.js';

export type Command = {
    data: SlashCommandBuilder,
    execute: (interaction: any) => Promise<void>;
}
 
interface ClientWithCommands extends Client {
    commands: Collection<string, Command>;
}

const client = new Client({ intents: [GatewayIntentBits.GuildMembers, GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences] }) as ClientWithCommands;
client.login(process.env.TOKEN);
client.commands = new Collection();

export { client };
