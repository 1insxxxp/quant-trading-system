import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const envFilePath = path.resolve(currentDir, '../../.env');

loadEnvFile(envFilePath);
