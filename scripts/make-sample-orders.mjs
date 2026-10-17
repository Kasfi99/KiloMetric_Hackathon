// Re-renders the fictional sample surat jalan in samples/delivery-orders/ from their HTML sources
// with headless Google Chrome. Usage: node scripts/make-sample-orders.mjs
// Override the browser with CHROME_PATH=/path/to/chrome.
import {execFile} from 'node:child_process';
import {mkdtemp, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const run = promisify(execFile);
const dir = resolve(fileURLToPath(new URL('../samples/delivery-orders/', import.meta.url)));
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const samples = [
  {src: 'SJ-DEMO-101.html', out: 'SJ-DEMO-101.pdf'},
  {src: 'SJ-DEMO-102.html', out: 'SJ-DEMO-102.png'},
  {src: 'SJ-DEMO-103.html', out: 'SJ-DEMO-103.pdf'},
];

const profile = await mkdtemp(join(tmpdir(), 'kilometric-samples-'));
try {
  for (const {src, out} of samples) {
    const target = join(dir, out);
    const mode = out.endsWith('.pdf')
      ? [`--print-to-pdf=${target}`, '--no-pdf-header-footer']
      : [`--screenshot=${target}`, '--window-size=1240,1754', '--hide-scrollbars'];
    await run(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, ...mode, pathToFileURL(join(dir, 'src', src)).href], {timeout: 60000});
    console.log(`${out}  ${(await stat(target)).size} bytes`);
  }
} catch (error) {
  console.error(`Rendering failed: ${error.message}\nIs Google Chrome installed? Set CHROME_PATH to its binary.`);
  process.exitCode = 1;
} finally {
  await rm(profile, {recursive: true, force: true});
}
