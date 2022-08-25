import 'dotenv/config';
import { RESTPostAPIApplicationCommandsJSONBody, Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import path from 'path';
import fs from 'fs';
import { Command } from './client';
import { logger } from '../logger';

const {
    CLIENT_ID,
    TOKEN,
} = process.env;

const commands: RESTPostAPIApplicationCommandsJSONBody[] = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const command = require(filePath) as Command;

	commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(TOKEN as string);

rest.put(Routes.applicationCommands(CLIENT_ID as string), { body: commands })
    .then(() => logger.info('Successfully registered application commands'))
    .catch((err) => {
        logger.error('Error registering application commands:', err);
    });
