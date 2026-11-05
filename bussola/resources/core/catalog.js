// Le app sono fissate qui: il catalogo può dire quale versione scaricare, mai cosa eseguire.
export const REPO = 'macchie/bussola';
export const CATALOG_URL = `https://github.com/${REPO}/releases/latest/download/catalogo.json`;
export const TRUSTED_PREFIX = `https://github.com/${REPO}/releases/download/`;

export const APPS = [
  { id: 'anelli', name: 'Anelli', tagline: 'Dove finisce lo spazio su disco', color: '#6a6ee0', keepData: 'Contiene il cestino: i file spostati lì non vanno persi' },
  { id: 'correnti', name: 'Correnti', tagline: 'Quali app usano la rete, e verso dove', color: '#14a8b6' },
  { id: 'battiti', name: 'Battiti', tagline: 'Cosa pesa su CPU e memoria', color: '#e0559a' },
  { id: 'scorte', name: 'Scorte', tagline: 'Batteria ed energia per app', color: '#3fa865' },
  { id: 'sentinelle', name: 'Sentinelle', tagline: 'Porte aperte e connessioni', color: '#cd7f0a' },
  { id: 'radici', name: 'Radici', tagline: 'Cosa parte da solo all\'avvio', color: '#a35f00', keepData: 'Serve per riattivare ciò che hai disattivato' },
  { id: 'registro', name: 'Registro', tagline: 'Errori, arresti e riavvii', color: '#de5a55' },
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

// Tiene solo le voci corrette delle app note, e rifiuta il resto senza fidarsi di nulla.
export function parseCatalog(text, prefix = TRUSTED_PREFIX) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('Il catalogo non è leggibile'); }
  if (raw?.formato !== 1 || typeof raw.app !== 'object' || raw.app === null) throw new Error('Formato del catalogo non supportato');
  const apps = {};
  for (const { id } of APPS) {
    const a = raw.app[id];
    if (!a || !VERSION.test(a.versione || '')) continue;
    const pacchetti = {};
    for (const [k, p] of Object.entries(a.pacchetti || {})) if (validPackage(p, prefix)) pacchetti[k] = p;
    apps[id] = { version: a.versione, packages: pacchetti };
  }
  const b = raw.bussola;
  return { apps, bussola: b && VERSION.test(b.versione || '') ? { version: b.versione, page: b.pagina } : null, tag: raw.tag };
}

export function compareVersions(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  return 0;
}

// installed: versione, '' se presente ma sconosciuta, undefined se assente.
export function statusOf(entry, installed, key) {
  const pkg = entry?.packages[key];
  if (installed === undefined) return pkg ? 'available' : entry ? 'unsupported' : 'unknown';
  if (!pkg) return 'installed';
  if (installed === '' || compareVersions(installed, entry.version) < 0) return 'outdated';
  return 'installed';
}
