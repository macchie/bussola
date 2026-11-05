// Last check before publishing: the catalog must describe exactly the release files.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [dir, tag] = process.argv.slice(2);
const catalog = JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8'));
const apps = ['anelli', 'correnti', 'battiti', 'scorte', 'sentinelle', 'radici', 'registro'];
const errors = [];
if (catalog.tag !== tag) errors.push(`catalog tag ${catalog.tag}, expected ${tag}`);
const listed = new Set(['catalog.json']);
for (const id of apps) {
  const entry = catalog.app[id];
  if (!entry) { errors.push(`${id} missing`); continue; }
  for (const [key, p] of Object.entries(entry.packages)) {
    const file = p.url.split('/').pop();
    listed.add(file);
    if (!p.url.startsWith(`https://github.com/macchie/bussola/releases/download/${tag}/`)) errors.push(`${file}: wrong address`);
    let body;
    try { body = readFileSync(join(dir, file)); } catch { errors.push(`${file}: file missing`); continue; }
    if (statSync(join(dir, file)).size !== p.size) errors.push(`${file}: size mismatch`);
    if (createHash('sha256').update(body).digest('hex') !== p.sha256) errors.push(`${file}: checksum mismatch (${key})`);
  }
}
const files = readdirSync(dir);
for (const f of files) if (!listed.has(f) && !/^Bussola-/.test(f)) errors.push(`${f}: not in catalog`);
if (!files.some((f) => /^Bussola-macos/.test(f))) errors.push('Bussola packages missing');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Catalog valid: ${files.length} files, tag ${tag}`);
