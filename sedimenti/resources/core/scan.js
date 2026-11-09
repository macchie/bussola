// One scan: run the native command, then turn the raw output into { path, bytes } items.
import { OS, run, scanCommand } from './platform.js';

const N = () => globalThis.Neutralino;
const UNITS = { B: 1, KB: 1e3, KIB: 1024, MB: 1e6, MIB: 1024 ** 2, GB: 1e9, GIB: 1024 ** 3, TB: 1e12, TIB: 1024 ** 4 };

export function humanToBytes(s) {
  const m = /^([\d.]+)\s*([kKmMgGtT]?i?B?)/.exec(String(s).trim());
  if (!m) return 0;
  return Math.round(parseFloat(m[1]) * (UNITS[(m[2] || 'B').toUpperCase()] ?? 1));
}

// The native command emits per-type docker listings behind ===SECTION=== markers so each
// image, container and volume can be shown — and removed — on its own.
function sections(text) {
  const out = {};
  let cur = null;
  for (const raw of String(text).split('\n')) {
    const m = /^===([A-Z]+)===$/.exec(raw.trim());
    if (m) { cur = m[1]; out[cur] = out[cur] || []; continue; }
    if (cur) out[cur].push(raw);
  }
  return out;
}

// Volumes come from `docker system df -v`; its "Local Volumes space usage:" block lists
// each volume as `NAME  LINKS  SIZE`. Volume names never contain spaces, so this is safe.
export function parseVolumes(lines) {
  const items = [];
  let inVol = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/Local Volumes space usage:/i.test(line)) { inVol = true; continue; }
    if (/(space|cache) usage:/i.test(line)) { inVol = false; continue; }
    if (!inVol || !line || /^VOLUME NAME\b/i.test(line)) continue;
    const m = /^(\S+)\s+(\d+)\s+([\d.]+\s*[kKmMgGtT]?i?B)\s*$/.exec(line);
    if (m) items.push({ path: `docker:volume:${m[1]}`, bytes: humanToBytes(m[3]), name: m[1], sub: 'volume', use: parseInt(m[2], 10) });
  }
  return items;
}

export function parseDocker(text) {
  const s = sections(text);
  const items = [];
  for (const line of s.DOCKER || []) {
    const [id, repo, tag, sizeStr, containers] = line.split('|');
    if (!id || sizeStr === undefined) continue;
    const name = (!repo || repo === '<none>') ? id.slice(0, 12) : `${repo}:${tag === '<none>' ? 'latest' : tag}`;
    items.push({ path: `docker:image:${id}`, bytes: humanToBytes(sizeStr), name, sub: 'image', use: parseInt(containers, 10) || 0 });
  }
  for (const line of s.CONTAINERS || []) {
    const [id, cname, , sizeStr, stateStr] = line.split('|');
    if (!id || sizeStr === undefined) continue;
    items.push({ path: `docker:container:${id}`, bytes: humanToBytes(sizeStr), name: cname || id.slice(0, 12), sub: 'container', state: (stateStr || '').trim() });
  }
  items.push(...parseVolumes(s.VOLUMES || []));
  for (const line of s.BUILD || []) {
    const [type, reclaimable] = line.split('|');
    if (/build\s*cache/i.test(type || '')) { const bytes = humanToBytes(reclaimable); if (bytes > 0) items.push({ path: 'docker:buildcache', bytes, name: 'Build Cache', sub: 'buildcache' }); }
  }
  return items;
}

export function parseScan(out) {
  const text = String(out);
  const at = text.indexOf('===DOCKER===');
  const fs = at === -1 ? text : text.slice(0, at);
  const items = [];
  for (const line of fs.split('\n')) {
    const m = /^(\d+)\t(.+)$/.exec(line);
    if (m) items.push({ path: m[2].replace(/\/$/, ''), bytes: parseInt(m[1], 10) * 1024 });
  }
  if (at !== -1) items.push(...parseDocker(text.slice(at)));
  return items;
}

export async function scan() {
  const home = (await N().os.getPath('home')).replace(/[\\/]$/, '');
  const res = await run(scanCommand(home));
  return { home, items: parseScan(res.out), code: res.code, raw: res.out.slice(0, 4000), hasDocker: res.out.includes('===DOCKER===') };
}
