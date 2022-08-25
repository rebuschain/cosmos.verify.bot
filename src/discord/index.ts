import path from 'path';
import fs from 'fs';
import { client } from './client';

// Read commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const command = require(filePath);

	client.commands.set(command.data.name, command);
}

// Read events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.ts'));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const event = require(filePath);

	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}
