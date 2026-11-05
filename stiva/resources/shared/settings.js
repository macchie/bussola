/* Suite settings: one shared file and the panel behind the gear icon. */
import { LANGUAGES, detect, setLanguage, language, t, translatePage } from './i18n.js';

const DEFAULTS = { language: 'auto', theme: 'auto' };
const state = { values: { ...DEFAULTS }, file: null, system: 'en', before: [] };
const sections = [];

async function systemLanguage() {
  const list = [];
  try { const info = await Neutralino.os.getLocaleInfo(); if (info?.locale) list.push(info.locale); } catch { /* fall back to the browser */ }
  return detect([...list, ...(navigator.languages || []), navigator.language]);
}
function applyTheme() {
  if (state.values.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.values.theme;
  window.dispatchEvent(new Event('theme'));
}
async function save() {
  if (!state.file) return;
  await Neutralino.filesystem.createDirectory(state.file.replace(/[\\/][^\\/]+$/, '')).catch(() => {});
  await Neutralino.filesystem.writeFile(state.file, JSON.stringify(state.values, null, 2)).catch(() => {});
}

/* Before anything else: the app reads language and numbers while it loads. */
export async function loadSettings() {
  state.system = await systemLanguage();
  try {
    const base = (await Neutralino.os.getPath('data')).replace(/[\\/]$/, '');
    const sep = base.includes('\\') ? '\\' : '/';
    state.file = `${base}${sep}Bussola Suite${sep}settings.json`;
    const read = JSON.parse(await Neutralino.filesystem.readFile(state.file));
    if (read && typeof read === 'object' && !Array.isArray(read)) state.values = { ...DEFAULTS, ...read };
  } catch { /* first run or unreadable file: defaults */ }
  if (state.values.language !== 'auto' && !LANGUAGES.some((l) => l.id === state.values.language)) state.values.language = 'auto';
  if (!['auto', 'light', 'dark'].includes(state.values.theme)) state.values.theme = 'auto';
  setLanguage(state.values.language === 'auto' ? state.system : state.values.language);
  applyTheme();
  translatePage();
}
export const value = (key) => state.values[key];
export function set(key, v) { state.values[key] = v; return save(); }
export function saveTheme(theme) { state.values.theme = theme; save(); }
export const beforeReload = (fn) => state.before.push(fn);
/* An app can add rows to the panel: addSection(() => element). */
export const addSection = (make) => sections.push(make);

function el(tag, props, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids.filter(Boolean));
  return node;
}
function row(label, id, options, selected, change) {
  const select = el('select', { id, onchange: () => change(select.value) }, ...options.map(([v, text]) => el('option', { value: v, textContent: text, selected: v === selected })));
  return el('div', { className: 'set-riga' }, el('label', { htmlFor: id, textContent: label }), select);
}
async function changeLanguage(id) {
  await set('language', id);
  for (const fn of state.before) await Promise.resolve(fn()).catch(() => {});
  location.reload();
}
function open(dialog, notice) {
  const autoName = LANGUAGES.find((l) => l.id === state.system)?.name;
  const body = el('div', { className: 'body' },
    row(t('Language'), 'setLingua', [['auto', `${t('Automatic')} (${autoName})`], ...LANGUAGES.map((l) => [l.id, l.name])], state.values.language, changeLanguage),
    row(t('Theme'), 'setTema', [['auto', t('Automatic')], ['light', t('Light')], ['dark', t('Dark')]], state.values.theme, (v) => { state.values.theme = v; applyTheme(); save(); }),
    ...sections.map((fn) => fn()),
    notice ? el('p', { className: 'set-nota', textContent: notice }) : null);
  const version = globalThis.NL_APPVERSION ? t('Version {0}', globalThis.NL_APPVERSION) : '';
  dialog.replaceChildren(el('div', { className: 'dlg' },
    el('header', null, el('h2', { textContent: t('Settings') }), el('p', { textContent: t('These apply to every app in the suite and stay on this computer.') })),
    body,
    el('footer', { className: 'set-piede' }, el('span', { className: 'set-nota', textContent: version }),
      el('button', { className: 'primary', textContent: t('Close'), onclick: () => dialog.close() }))));
  dialog.showModal();
}

/* Places the gear icon next to the theme button. */
export function installSettings({ notice } = {}) {
  const theme = document.getElementById('theme');
  if (!theme || document.getElementById('settings')) return;
  const dialog = el('dialog', { id: 'settingsDialog' });
  document.body.append(dialog);
  const style = el('style', { textContent: `
    .set-riga { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--line); }
    .set-riga:last-of-type { border-bottom: 0; }
    .set-riga select { font: inherit; color: var(--ink); background: var(--raised); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; min-width: 200px; max-width: 60%; }
    .set-nota { color: var(--muted); font-size: 12px; }
    .dlg footer.set-piede { justify-content: space-between; align-items: center; }` });
  document.head.append(style);
  const title = t('Settings');
  const button = el('button', { id: 'settings', className: theme.className, title, onclick: () => open(dialog, notice?.()) });
  button.setAttribute('aria-label', title);
  button.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h7M15 6h1M4 14h1M9 14h7"/><circle cx="13" cy="6" r="2"/><circle cx="7" cy="14" r="2"/></svg>';
  theme.before(button);
}
export { language };
