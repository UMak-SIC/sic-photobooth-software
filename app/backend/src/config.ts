import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  storageDir: string;
  nodeEnv: string;
  publicAppUrl: string;
  corsOrigins: string[];
}

const defaultStorageDir = path.resolve(__dirname, '../../storage');

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/photobooth',
  storageDir: process.env.STORAGE_DIR || defaultStorageDir,
  nodeEnv: process.env.NODE_ENV || 'development',
  publicAppUrl: process.env.PUBLIC_APP_URL || 'https://myphotobooth.com',
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
    : [
        'http://localhost:5173', // photobooth-software (dev)
        'http://localhost:5174', // captive-website (dev)
        'http://192.168.4.1', // captive portal gateway (prod)
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
      ],
};
