import { pg } from '../../db/connection';
import { logger } from '../../logger';
import { CustomError } from '../error';

export const routes = [
    {
        method: 'post',
        path: '/api/v1/nonce',
        execute: async (req, res) => {
            const { body } = req;

            if (!body.address) {
                throw new CustomError('Missing address', 400);
            }

            let nonce;

            while (!nonce) {
                nonce = Math.floor(Math.random() * 10000000);

                const existingRelation = await pg.queryBuilder()
                    .from('nonce')
                    .where('nonce', '=', nonce)
                    .first();

                if (existingRelation) {
                    nonce = null;
                }
            }

            await pg.queryBuilder()
                .from('nonce')
                .where('address', '=', body.address)
                .delete();

            await pg.queryBuilder()
                .from('nonce')
                .insert({
                    address: body.address,
                    nonce,
                });

            logger.info('Created nonce', { address: body.address, nonce });

            return res.status(200).send({ nonce });
        },
    }
];
