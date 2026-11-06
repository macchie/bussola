/* Shell: hosts the load and energy views of one app. Energy appears only with a battery. */
import { t as tt, tx } from './shared/i18n.js';
import { saveTheme, beforeReload } from './shared/settings.js';
import { createLoad } from './views/load.js';
import { createEnergy } from './views/energy.js';

const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(typeof kid === 'string' ? tx(kid) : kid);
  return el;
}

/* Theme (shared by both views) */
const theme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const paintThemeIcon = () => {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${theme() === 'dark'
    ? '<circle cx="10" cy="10" r="3.4"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>'
    : '<path d="M15.5 12.2A6.5 6.5 0 0 1 7.8 4.5a6.5 6.5 0 1 0 7.7 7.7z"/>'}</svg>`;
  $('theme').replaceChildren(t.content.firstChild);
};
paintThemeIcon();
$('theme').onclick = () => {
  document.documentElement.dataset.theme = theme() === 'dark' ? 'light' : 'dark';
  saveTheme(theme());
  window.dispatchEvent(new Event('tema'));
};
window.addEventListener('tema', () => { paintThemeIcon(); active?.refresh(); });

/* Views */
const load = createLoad();
const energy = createEnergy();
const views = [load];
let active = null;

function renderSwitcher() {
  $('views').replaceChildren(...views.map((v) => h('button', {
    'data-view': v.id, 'aria-pressed': v === active ? 'true' : 'false', onclick: () => activate(v),
  }, tx(v.label))));
  $('views').hidden = views.length < 2;
}
async function activate(v) {
  if (active === v) return;
  await active?.unmount();
  active = v;
  $('pause').textContent = tx(tt('Pause'));
  $('pause').setAttribute('aria-pressed', 'false');
  renderSwitcher();
  await v.mount();
}

$('diag').onclick = () => active?.diag();
$('pause').onclick = () => active?.pause();
beforeReload(() => active?.unmount());
Neutralino.events.on('windowClose', async () => { await active?.unmount().catch(() => {}); Neutralino.app.exit(); });

(async () => {
  renderSwitcher();
  const probe = energy.hasBattery().catch(() => false); // detect a battery while Load mounts
  await activate(load);
  if (await probe) { views.push(energy); renderSwitcher(); }
})().catch((err) => {
  const el = h('div', { class: 'toast' }, String(err.message || err));
  $('toasts').append(el);
  setTimeout(() => el.remove(), 3500);
});
