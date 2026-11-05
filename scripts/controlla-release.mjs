// Ultimo controllo prima di pubblicare: il catalogo deve descrivere esattamente i file della release.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [dir, tag] = process.argv.slice(2);
const catalog = JSON.parse(readFileSync(join(dir, 'catalogo.json'), 'utf8'));
const apps = ['anelli', 'correnti', 'battiti', 'scorte', 'sentinelle', 'radici', 'registro'];
const errors = [];
if (catalog.tag !== tag) errors.push(`tag del catalogo ${catalog.tag}, atteso ${tag}`);
const listed = new Set(['catalogo.json']);
for (const id of apps) {
  const entry = catalog.app[id];
  if (!entry) { errors.push(`${id} assente`); continue; }
  for (const [key, p] of Object.entries(entry.pacchetti)) {
    const file = p.url.split('/').pop();
    listed.add(file);
    if (!p.url.startsWith(`https://github.com/macchie/bussola/releases/download/${tag}/`)) errors.push(`${file}: indirizzo errato`);
    let body;
    try { body = readFileSync(join(dir, file)); } catch { errors.push(`${file}: file mancante`); continue; }
    if (statSync(join(dir, file)).size !== p.size) errors.push(`${file}: dimensione diversa`);
    if (createHash('sha256').update(body).digest('hex') !== p.sha256) errors.push(`${file}: impronta diversa (${key})`);
  }
}
const files = readdirSync(dir);
for (const f of files) if (!listed.has(f) && !/^Bussola-/.test(f)) errors.push(`${f}: fuori catalogo`);
if (!files.some((f) => /^Bussola-macos/.test(f))) errors.push('pacchetti di Bussola mancanti');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Catalogo corretto: ${files.length} file, tag ${tag}`);
