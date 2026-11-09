// The apps are fixed here: the catalog may say which version to download, never what to run.
export const REPO = 'macchie/bussola';
export const CATALOG_URL = `https://github.com/${REPO}/releases/latest/download/catalog.json`;
export const TRUSTED_PREFIX = `https://github.com/${REPO}/releases/download/`;

export const APPS = [
  { id: 'stiva', name: 'Stiva', tagline: 'Where your disk space goes', color: '#6a6ee0', keepData: 'It holds the Trash: files moved there aren\'t lost' },
  { id: 'correnti', name: 'Correnti', tagline: 'Network traffic, ports and connections', color: '#14a8b6' },
  { id: 'battiti', name: 'Battiti', tagline: 'CPU, memory and energy', color: '#e0559a' },
  { id: 'radici', name: 'Radici', tagline: 'What starts by itself at boot', color: '#a35f00', keepData: 'It\'s needed to turn back on what you disabled' },
  { id: 'registro', name: 'Registro', tagline: 'Errors, shutdowns and restarts', color: '#de5a55' },
  { id: 'sedimenti', name: 'Sedimenti', tagline: 'What is left behind', color: '#5a6b8c' },
];

export function platformKey(os, arch) {
  if (os === 'Darwin') return 'macos';
  if (os === 'Windows') return arch === 'x64' ? 'windows-x64' : null;
  if (os === 'Linux') return arch === 'x64' ? 'linux-x64' : arch === 'arm64' ? 'linux-arm64' : null;
  return null;
}

const VERSION = /^\d+\.\d+\.\d+$/;
const SHA = /^[0-9a-f]{64}$/;

export function validPackage(p, prefix = TRUSTED_PREFIX) {
  if (!p || typeof p !== 'object' || !SHA.test(p.sha256 || '')) return false;
  if (!Number.isSafeInteger(p.size) || p.size <= 0 || p.size > 200 * 1048576) return false;
  if (typeof p.url !== 'string' || !p.url.startsWith(prefix)) return false;
  return /^\w[\w.+-]*\/\w[\w.+-]*\.zip$/.test(p.url.slice(prefix.length));
}

// Keeps only the valid entries of the known apps, and rejects the rest, trusting nothing.
export function parseCatalog(text, prefix = TRUSTED_PREFIX) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('The catalog can\'t be read'); }
  if (raw?.format !== 1 || typeof raw.app !== 'object' || raw.app === null) throw new Error('Catalog format not supported');
  const apps = {};
  for (const { id } of APPS) {
    const a = raw.app[id];
    if (!a || !VERSION.test(a.version || '')) continue;
    const packages = {};
    for (const [k, p] of Object.entries(a.packages || {})) if (validPackage(p, prefix)) packages[k] = p;
    apps[id] = { version: a.version, packages };
  }
  const b = raw.bussola;
  return { apps, bussola: b && VERSION.test(b.version || '') ? { version: b.version, page: b.page } : null, tag: raw.tag };
}

export function compareVersions(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  return 0;
}

// installed: version, '' if present but unknown, undefined if absent.
export function statusOf(entry, installed, key) {
  const pkg = entry?.packages[key];
  if (installed === undefined) return pkg ? 'available' : entry ? 'unsupported' : 'unknown';
  if (!pkg) return 'installed';
  if (installed === '' || compareVersions(installed, entry.version) < 0) return 'outdated';
  return 'installed';
}
