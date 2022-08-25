import 'dotenv/config';
import './discord';
import './express';
import { initializeDB } from './db/initialize-db';

initializeDB();
