import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
mkdirSync(join(dist, 'host'), { recursive: true });
mkdirSync(join(dist, 'CSXS'), { recursive: true });

const hostDir = join(root, 'host');
const order = ['json2.jsx', 'index.jsx'];
const parts = order
  .filter((f) => existsSync(join(hostDir, f)))
  .map((f) => readFileSync(join(hostDir, f), 'utf8'));
writeFileSync(join(dist, 'host', 'index.jsx'), parts.join('\n\n'));

copyFileSync(join(root, 'csxs', 'manifest.xml'), join(dist, 'CSXS', 'manifest.xml'));
copyFileSync(join(root, 'csxs', '.debug'), join(dist, '.debug'));
if (existsSync(join(root, 'assets'))) {
  for (const f of readdirSync(join(root, 'assets'))) {
    copyFileSync(join(root, 'assets', f), join(dist, f));
  }
}
console.log('host + CSXS staged into dist/');
