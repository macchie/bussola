// Prepare a release: gather the suite app packages, compute their checksums
// and write catalog.json. Usage: node scripts/publish.mjs [tag]
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'macchie/bussola';
const d = new Date();
const tag = process.argv[2] || `suite-${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
const OUT = 'dist/release';
const BASE = `https://github.com/${REPO}/releases/download/${tag}/`;
const APPS = ['anelli', 'correnti', 'battiti', 'scorte', 'sentinelle', 'radici', 'registro'];
const version = (dir) => JSON.parse(readFileSync(join(dir, 'neutralino.config.json'), 'utf8')).version;
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const keyOf = (file) => /-(macos|windows-x64|linux-x64|linux-arm64)\.zip$/.exec(file)?.[1];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const catalog = { format: 1, tag, app: {}, bussola: { version: version('.'), page: `https://github.com/${REPO}/releases/tag/${tag}` } };
for (const id of APPS) {
  const dir = join('..', id);
  const packs = join(dir, 'dist/packages');
  if (!existsSync(packs)) throw new Error(`Missing packages for ${id}: run npm run build there first`);
  const packages = {};
  for (const file of readdirSync(packs)) {
    const key = keyOf(file);
    if (!key) continue;
    const path = join(packs, file);
    copyFileSync(path, join(OUT, file));
    packages[key] = { url: BASE + file, sha256: sha(path), size: statSync(path).size };
  }
  catalog.app[id] = { version: version(dir), packages };
}
for (const file of existsSync('dist/packages') ? readdirSync('dist/packages') : []) copyFileSync(join('dist/packages', file), join(OUT, file));
writeFileSync(join(OUT, 'catalog.json'), `${JSON.stringify(catalog, null, 1)}\n`);
console.log(`Ready in ${OUT}, tag ${tag}. To publish:`);
console.log(`  gh release create ${tag} ${OUT}/* --repo ${REPO} --title "Suite ${tag}" --latest`);
