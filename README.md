# Cosmos Verify Bot

## Environment

The environment variables should all be explained inside the .env file

## Start Local DB

To run the postgres DB in the docker, run: `docker run --name postgres-docker -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres`

## Running

```
yarn
yarn dev
```

## Developer Portal URL

https://discord.com/developers/applications

## Commands

When modifying the commands metadata, it is necessary to run the scripts to deploy them.
```
yarn deploy-commands
```

## Flow

### Help Commands

```
/help server
/help role
/help authorize
```

### Server Configuration

As soon as the discord bot is run, it will check all the servers it is connected to and create a server entry in the `server` table for each of those servers.

By default the bot will use the env var `DEFAULT_CONTRACT` to determine the contract address that it interacts with, but it can be changed by calling the command to update the server config.
It is possible to pass `null` as the contract address to delete it and let the server use the default one.
```
/server update contract-address:{contractAddress}
```

### Roles Configuration

The roles must be configured by interacting with the slash commands.
They are only available for existing roles in the discord server.

NOTE: These commands only manage the role configuration in the discord bot, it does not create/remove roles in the server itself.

Add role:
```
/role add role:{role} token-id:{tokenId} min-balance:{minBalance} meta-condition:{metaCondition}
```

Update role:
```
/role update role:{role} token-id:{tokenId} min-balance:{minBalance} meta-condition:{metaCondition}
```

Remove role:
```
/role remove role:{role}
```

List roles:
```
/role list
```

Get role configuration:
```
/role get role:{role}
```

### Authorization Flow

The authorization process has the following flow:
- Click the Authorize button or use the /authorize command
- Click the button link that gets displayed in the channel to get redirected to the webpage to connect the wallet
- Connect one of the available wallet options and sign the message
- Wallet is now connected to the user

Once the wallet is connected, the bot will see if the user is able to have access to any configured role, and if it is, it will assign those roles to the user.
This also happens on an interval for all users based on the interval specified in `INTERVAL_VERIFY_USERS`.
Roles will be removed from the user if the user no longer can access it.
