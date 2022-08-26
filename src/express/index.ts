import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { CustomError, handleError } from './error';
import { expressLogger, logger } from '../logger';

const { EXPRESS_PORT, USE_CORS, WALLET_CONNECT_URL } = process.env;

const app = express();

app.use(expressLogger);
app.use(cors({
    origin: USE_CORS === 'true' ? WALLET_CONNECT_URL : '*',
}));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

const routesPath = path.join(__dirname, 'routes');
const routeFiles = fs.readdirSync(routesPath).filter(file => file.endsWith('.ts'));

for (const file of routeFiles) {
    const filePath = path.join(routesPath, file);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { routes } = require(filePath);

    routes.forEach((route) => {
        app[route.method](route.path, async (req, res) => {
            try {
                await route.execute(req, res);
            } catch (error) {
                handleError(error as TypeError | CustomError, req, res);
            }
        });
    });
}

app.get('/ping', (req, res) => res.sendStatus(200));

app.listen(EXPRESS_PORT, () => {
    logger.info(`Express API listening on port ${EXPRESS_PORT}`)
});
