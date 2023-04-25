import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: `.env.local`, override: true });

import './discord';
import './express';
import { initializeDB } from './db/initialize-db';

initializeDB();
