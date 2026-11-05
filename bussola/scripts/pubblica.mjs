// Prepara una release: raccoglie i pacchetti delle app della suite, calcola le impronte
// e scrive catalogo.json. Uso: node scripts/pubblica.mjs [tag]
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
const catalog = { formato: 1, tag, app: {}, bussola: { versione: version('.'), pagina: `https://github.com/${REPO}/releases/tag/${tag}` } };
for (const id of APPS) {
  const dir = join('..', id);
  const packs = join(dir, 'dist/pacchetti');
  if (!existsSync(packs)) throw new Error(`Mancano i pacchetti di ${id}: esegui prima npm run build lì`);
  const pacchetti = {};
  for (const file of readdirSync(packs)) {
    const key = keyOf(file);
    if (!key) continue;
    const path = join(packs, file);
    copyFileSync(path, join(OUT, file));
    pacchetti[key] = { url: BASE + file, sha256: sha(path), size: statSync(path).size };
  }
  catalog.app[id] = { versione: version(dir), pacchetti };
}
for (const file of existsSync('dist/pacchetti') ? readdirSync('dist/pacchetti') : []) copyFileSync(join('dist/pacchetti', file), join(OUT, file));
writeFileSync(join(OUT, 'catalogo.json'), `${JSON.stringify(catalog, null, 1)}\n`);
console.log(`Pronto in ${OUT}, tag ${tag}. Per pubblicare:`);
console.log(`  gh release create ${tag} ${OUT}/* --repo ${REPO} --title "Suite ${tag}" --latest`);
