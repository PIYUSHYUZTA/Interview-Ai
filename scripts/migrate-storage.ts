import path from 'node:path';
import { loadEnvFile } from '../src/core/provider/providerFactory.js';
import { migrateFileStorage } from '../src/api/migrateFileStorage.js';
loadEnvFile();
const directory = path.resolve(process.env.INTERVIEW_DATA_DIR ?? '.data');
const root = process.cwd();
if (!directory.startsWith(root + path.sep)) throw new Error('Migration data directory must be inside the project directory.');
console.log(migrateFileStorage(directory));
