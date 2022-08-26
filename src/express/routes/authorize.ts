import { ethers } from 'ethers';
import { verifyADR36Amino } from '@keplr-wallet/cosmos';
import { ETH } from '@hanchon/ethermint-address-converter';
import { decode, encode, fromWords, toWords } from 'bech32';
import { onUserAuthorized } from '../../discord/common/verify-nft';
import { pg } from '../../db/connection';
import { logger } from '../../logger';
import { CustomError } from '../error';

function makeBech32Encoder(prefix: string) {
	return (data: Buffer) => encode(prefix, toWords(data));
}

function makeBech32Decoder(currentPrefix: string) {
	return (data: string) => {
		const { prefix, words } = decode(data);
		if (prefix !== currentPrefix) {
			throw Error('Unrecognised address format');
		}
		return Buffer.from(fromWords(words));
	};
}

const bech32Chain = (prefix: string) => ({
	decoder: makeBech32Decoder(prefix),
	encoder: makeBech32Encoder(prefix),
});

export const routes = [
    {
        method: 'post',
        path: '/api/v1/authorize',
        execute: async (req, res) => {
            const { body } = req;

            if (!body.nonce) {
                throw new CustomError('Missing nonce', 400);
            }
            if (!body.address) {
                throw new CustomError('Missing address', 400);
            }
            if (!body.signature) {
                throw new CustomError('Missing signature', 400);
            }
            if (!body.userId) {
                throw new CustomError('Missing userId', 400);
            }
            if (!body.serverId) {
                throw new CustomError('Missing serverId', 400);
            }

            let ethAddress = body.address;

            if (!body.address.startsWith('0x')) {
                if (!body.pubKey) {
                    throw new CustomError('Missing pubKey', 400);
                }
                if (!body.chainPrefix) {
                    throw new CustomError('Missing chainPrefix', 400);
                }

                const chain = bech32Chain(body.chainPrefix);
                const data = chain.decoder(body.address);

                ethAddress = ETH.encoder(data);
            }

            const holder = await pg.queryBuilder()
                .from('holder')
                .where('externalServerId', body.serverId)
                .andWhere('userId', '=', body.userId)
                .andWhere(function() {
                    this.where('address', '=', body.address)
                        .orWhere('ethAddress', '=', ethAddress);
                })
                .first();

            if (holder) {
                throw new CustomError('User already associated to address', 400);
            }

            const nonce = await pg.queryBuilder()
                .from('nonce')
                .where('nonce', '=', body.nonce)
                .first();

            if (!nonce || nonce.address !== body.address) {
                throw new CustomError('Invalid nonce', 400);
            }

            const bodyString = JSON.stringify({
                address: body.address,
                nonce: body.nonce,
                userId: body.userId,
            });

            let decodedAddress = '';

            if (body.pubKey) {
                const pubKey = Buffer.from(body.pubKey, 'base64');
                const signature = Buffer.from(body.signature, 'base64');

                if (!verifyADR36Amino('rebus', body.address, bodyString, pubKey, signature)) {
                    throw new CustomError('Invalid signature', 400);
                }

                decodedAddress = body.address;
            } else {
                decodedAddress = ethers.utils.verifyMessage(bodyString, body.signature);
            }

            if (decodedAddress?.toLowerCase() !== body.address.toLowerCase()) {
                throw new CustomError('Invalid signature', 400);
            }

            await pg.queryBuilder()
                .from('holder')
                .insert({
                    address: body.address,
                    ethAddress,
                    userId: body.userId,
                    externalServerId: body.serverId,
                });

            await pg.queryBuilder()
                .from('nonce')
                .where('id', '=', nonce.id)
                .delete();

            logger.info('Associated user to wallet', holder);

            try {
                await onUserAuthorized(body.serverId, body.userId);
                logger.info('Successfuly refreshed user\'s roles', holder);
            } catch (err) {
                logger.error('Error refreshing user roles', err);
                throw new CustomError('Error refreshing user roles', 500);
            }

            return res.status(200).send({ success: true });
        },
    }
];
