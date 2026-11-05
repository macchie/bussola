/*
 * Standalone update check and self-registration.
 * A single app (installed without Bussola) can learn that a newer version is
 * published and open its download, and it records its presence so Bussola can
 * recognize it later. The only network call is to the same GitHub catalog
 * Bussola reads; it runs at most once a day and can be turned off in Settings.
 */
import { t } from './i18n.js';
import { value } from './settings.js';

const N = () => globalThis.Neutralino;
const REPO = 'macchie/bussola';
const CATALOG_URL = `https://github.com/${REPO}/releases/latest/download/catalog.json`;
const TRUSTED = `https://github.com/${REPO}/releases/download/`;
const DAY = 86400000;

export const appId = () => String(globalThis.NL_APPID || '').split('.')[1] || '';

function compareVersions(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  return 0;
}
function platformKey(os, arch) {
  if (os === 'Darwin') return 'macos';
  if (os === 'Windows') return arch === 'x64' ? 'windows-x64' : null;
  if (os === 'Linux') return arch === 'x64' ? 'linux-x64' : arch === 'arm64' ? 'linux-arm64' : null;
  return null;
}

/* Minimal native command runner (the webview CSP blocks fetching GitHub directly). */
const handlers = new Map();
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  N().events.on('spawnedProcess', ({ detail }) => { const h = handlers.get(detail.id); if (h) h(detail); });
}
async function run(command, timeoutMs = 20000) {
  listen();
  const { id } = await N().os.spawnProcess(command);
  return new Promise((resolve) => {
    let out = ''; let err = '';
    const timer = setTimeout(() => N().os.updateSpawnedProcess(id, 'exit').catch(() => {}), timeoutMs);
    handlers.set(id, (d) => {
      if (d.action === 'stdOut') out += d.data;
      else if (d.action === 'stdErr') err += d.data;
      else if (d.action === 'exit') { clearTimeout(timer); handlers.delete(id); resolve({ code: d.data, out, err }); }
    });
  });
}
const qs = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const qp = (s) => `'${String(s).replace(/'/g, "''")}'`;
function fetchCatalog() {
  if (globalThis.NL_OS === 'Windows') return run(`[Console]::OutputEncoding = [Text.Encoding]::UTF8\n& curl.exe -fsSL --proto =https --tlsv1.2 --connect-timeout 15 --max-time 30 ${qp(CATALOG_URL)}\nexit $LASTEXITCODE\n`);
  return run(`curl -fsSL --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 30 ${qs(CATALOG_URL)}\n`);
}

/* Returns { version, url, page } if a newer version of this app is published, else null. */
export async function checkForUpdate() {
  const id = appId();
  if (!id || id === 'bussola') return null;
  let catalog;
  try { const res = await fetchCatalog(); if (res.code !== 0) return null; catalog = JSON.parse(res.out); } catch { return null; }
  const entry = catalog?.app?.[id];
  if (!entry || typeof entry.version !== 'string') return null;
  if (compareVersions(globalThis.NL_APPVERSION, entry.version) >= 0) return null;
  const pkg = entry.packages?.[platformKey(globalThis.NL_OS, globalThis.NL_ARCH)];
  const url = (pkg && typeof pkg.url === 'string' && pkg.url.startsWith(TRUSTED)) ? pkg.url : null;
  const tag = String(catalog.tag || '').replace(/[^\w.-]/g, '');
  return { version: entry.version, url, page: `https://github.com/${REPO}/releases/tag/${tag}` };
}

/*
 * Record this app's presence in the shared suite folder, so Bussola can
 * recognize an app installed by hand wherever it lives.
 */
export async function registerPresence() {
  const id = appId();
  if (!id || id === 'bussola') return;
  try {
    const base = (await N().os.getPath('data')).replace(/[\\/]$/, '');
    const sep = base.includes('\\') ? '\\' : '/';
    const dir = `${base}${sep}Bussola Suite${sep}apps`;
    await N().filesystem.createDirectory(dir).catch(() => {});
    const info = { id, version: globalThis.NL_APPVERSION || '', path: globalThis.NL_PATH || '', at: Date.now() };
    await N().filesystem.writeFile(`${dir}${sep}${id}.json`, JSON.stringify(info)).catch(() => {});
  } catch { /* best effort */ }
}

function showBanner(info) {
  const id = appId();
  const name = document.title || (id.charAt(0).toUpperCase() + id.slice(1));
  let dismissed = null;
  try { dismissed = localStorage.getItem(`suite-update-dismissed-${id}`); } catch { /* ignore */ }
  if (dismissed === info.version) return;
  if (document.getElementById('suiteUpdate')) return;
  const bar = document.createElement('div');
  bar.id = 'suiteUpdate';
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:14px;max-width:calc(100vw - 32px);padding:11px 15px;border-radius:10px;border:1px solid var(--line,#d6dae6);background:var(--surface,#f8f9fc);color:var(--ink,#171b33);box-shadow:0 12px 40px rgba(0,0,0,.28);font:14px/1.35 system-ui,-apple-system,sans-serif';
  const msg = document.createElement('span');
  msg.textContent = t('{0} {1} is available.', name, info.version);
  const dl = document.createElement('button');
  dl.textContent = t('Download');
  dl.style.cssText = 'flex:none;cursor:pointer;border:0;border-radius:7px;padding:6px 12px;background:var(--accent,#3538cd);color:var(--on-accent,#fff);font:inherit;font-weight:500';
  dl.onclick = () => { N().os.open(info.url || info.page).catch(() => {}); };
  const later = document.createElement('button');
  later.textContent = t('Later');
  later.style.cssText = 'flex:none;cursor:pointer;border:0;background:none;color:var(--muted,#565c7c);font:inherit;padding:6px 4px';
  later.onclick = () => { try { localStorage.setItem(`suite-update-dismissed-${id}`, info.version); } catch { /* ignore */ } bar.remove(); };
  bar.append(msg, dl, later);
  document.body.append(bar);
}

/* Called on startup: register presence, then (unless disabled) check for updates once a day. */
export async function watchForUpdate() {
  registerPresence().catch(() => {});
  const id = appId();
  if (!id || id === 'bussola') return;
  if (value('updates') === 'off') return;
  const cacheKey = `suite-update-${id}`;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch { /* ignore */ }
  let info;
  if (cached && Date.now() - cached.at < DAY) info = cached.info;
  else {
    info = await checkForUpdate().catch(() => null);
    try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), info })); } catch { /* ignore */ }
  }
  if (info) showBanner(info);
}
