// Runs the Python vision tests with pytest in the same interpreter the API uses (see visionPython()).
// Run: npm run test:vision   (install pytest first with: npm run setup:vision -- -Dev)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { VISION_WORKER, visionPython } from '../src/api/ProctoringWorker.js';

const python = visionPython();
const result = spawnSync(python.command, ['-m', 'pytest', '-q', '-p', 'no:cacheprovider', ...process.argv.slice(2)], { cwd: path.dirname(VISION_WORKER), stdio: 'inherit' });
if (result.error) { console.error(`Could not start ${python.command}: ${result.error.message}. Run: npm run setup:vision -- -Dev`); process.exit(1); }
process.exit(result.status ?? 1);
