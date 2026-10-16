// Reset demo data: moves the data file and odometer photos to data/backups/<timestamp>/; the next start reseeds.
// Stop the server first: it holds the DB in memory and rewrites the file on every change.
import { mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = process.env.DATA_FILE || path.join(root, 'data', 'fleet.json');
const dataDir = path.dirname(dataFile), photos = path.join(dataDir, 'photos');
const port = Number(process.env.PORT || 3000);
const exists = p => stat(p).then(() => true, () => false);

const running = await fetch(`http://127.0.0.1:${port}/api/session`, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false);
if (running) {
  console.error(`A server is running on port ${port}. Stop it (Ctrl+C), run this again, then start the server.`);
  process.exit(1);
}
if (!(await exists(dataFile))) {
  console.log(`No data file at ${dataFile}; the server will seed demo data on start.`);
  process.exit(0);
}
const backup = path.join(dataDir, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(backup, { recursive: true });
await rename(dataFile, path.join(backup, path.basename(dataFile)));
if (await exists(photos)) await rename(photos, path.join(backup, 'photos'));
console.log(`Backed up to ${path.relative(root, backup)}`);
console.log('Start the server (npm run dev:lan) to seed fresh demo data. Phones must sign in again.');
