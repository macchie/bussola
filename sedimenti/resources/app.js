import { t as tt, tx, locale } from './shared/i18n.js';
import { saveTheme, beforeReload } from './shared/settings.js';
import { RadialMap } from './map.js';
import { buildTree, SEP, ROOT } from './core/tree.js';
import { scan } from './core/scan.js';
import { OS, SUPPORTED, reveal, trash, dockerRemove, dockerPrune } from './core/platform.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const dialog = $('dialog');
const state = { tree: null, items: [], home: '', path: [], sel: null, filter: '', map: null, scanning: false, raw: '', code: null };

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : ['title', 'aria-label', 'placeholder'].includes(k) ? tx(v) : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(typeof kid === 'string' ? tx(kid) : kid);
  return el;
}
const dec = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });
const num = new Intl.NumberFormat(locale());
function size(b) {
  if (!b) return tt('0 bytes');
  const units = [tt('bytes'), tt('kB'), tt('MB'), tt('GB'), tt('TB')];
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1000)));
  return `${i === 0 ? Math.round(b) : dec.format(b / 1000 ** i)} ${units[i]}`;
}
function toast(text) { const el = h('div', { class: 'toast' }, text); $('toasts').append(el); setTimeout(() => el.remove(), 3500); }
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const SAFETY = () => [tt('Safe to remove'), tt('Caution'), tt('Careful')];
const safetyClass = (s) => ['safe', 'caution', 'careful'][s] || 'caution';

/* Theme */
const theme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const paintThemeIcon = () => {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${theme() === 'dark'
    ? '<circle cx="10" cy="10" r="3.4"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>'
    : '<path d="M15.5 12.2A6.5 6.5 0 0 1 7.8 4.5a6.5 6.5 0 1 0 7.7 7.7z"/>'}</svg>`;
  $('theme').replaceChildren(t.content.firstChild);
};
paintThemeIcon();
$('theme').onclick = () => { document.documentElement.dataset.theme = theme() === 'dark' ? 'light' : 'dark'; saveTheme(theme()); window.dispatchEvent(new Event('tema')); };
window.addEventListener('tema', () => { paintThemeIcon(); if (state.tree) refresh(); });

/* Navigation */
function current() {
  let node = state.tree;
  const names = [];
  for (const name of state.path) {
    const next = (node.c || []).find((c) => c.n === name && c.d);
    if (!next) break;
    node = next; names.push(name);
  }
  state.path = names;
  return node;
}
const pathOf = (names) => [ROOT, ...names].join(SEP);
const viewData = () => ({ path: pathOf(state.path), sep: SEP, root: ROOT, hidden: 0, node: current() });
function go(names) { state.path = names; state.sel = null; refresh(true); }

function refresh(navigated = false) {
  if (!state.tree || !state.map) return;
  const data = viewData();
  state.map.setView(data);
  renderCrumbs();
  renderCenter(state.map.hover);
  renderRows(data.node);
  renderActions();
  renderLegend();
  const empty = !data.node.c || !data.node.c.length;
  $('stageEmpty').hidden = !empty;
  $('center').hidden = empty;
  $('stageEmpty').textContent = tx(state.scanning ? tt('Scanning…') : tt('Nothing left behind. Your disk is tidy here.'));
}
function renderCrumbs() {
  const parts = [h('button', { onclick: () => go([]) }, tt('All sediments'))];
  state.path.forEach((name, i) => parts.push(h('i', null, '/'), h('button', { onclick: () => go(state.path.slice(0, i + 1)) }, name)));
  $('crumbs').replaceChildren(...parts);
}
function renderCenter(arc) {
  const node = arc ? (arc.kind === 'other' ? { n: tt('Smaller items'), s: arc.node.s } : arc.node) : current();
  $('cName').textContent = tx(node.n === ROOT ? tt('All sediments') : node.n);
  $('cSize').textContent = tx(size(node.s));
  $('cSplit').textContent = tx(node.safety != null && !node.d ? SAFETY()[node.safety] : node.c ? items(node.c.length) : '');
  $('center').classList.toggle('up', state.path.length > 0);
}
const items = (n) => (n === 1 ? tt('1 item') : tt("{0} items", num.format(n)));
function dockerHint(n) {
  const real = String(n.real || '');
  if (real.startsWith('docker:container:')) return n.state === 'running' ? tt('running') : tt('stopped');
  if ((real.startsWith('docker:image:') || real.startsWith('docker:volume:')) && n.use > 0) return tt('in use');
  return '';
}
const metaOf = (n) => { if (n.d) return items((n.c || []).length); const hint = dockerHint(n); return hint ? `${tx(SAFETY()[n.safety])} · ${hint}` : SAFETY()[n.safety]; };
function renderRows(node) {
  const list = (node.c || []).filter((c) => !state.filter || tx(c.n).toLowerCase().includes(state.filter));
  const max = list.length ? Math.max(list[0].s, 1) : 1;
  const base = pathOf(state.path);
  const rows = list.map((n) => {
    const path = base + SEP + n.n;
    const color = state.map.colorOf(path) || 'var(--muted)';
    return h('button', {
      class: `row${state.sel === path ? ' sel' : ''}`, 'data-path': path, title: n.real || n.n,
      onclick: () => { state.sel = path; state.map.selected = path; state.map.draw(); renderRows(current()); renderActions(); },
      ondblclick: () => { if (n.d) go([...state.path, n.n]); },
      onmouseenter: () => state.map.hoverPath(path),
      onmouseleave: () => state.map.hoverPath(null),
    },
    h('div', { class: 'bar', style: `width:${n.s / max * 100}%;background:${color}` }),
    h('span', { class: 'dot', style: `background:${color}` }),
    h('div', { style: 'min-width:0' }, h('div', { class: 'name' }, n.n), h('div', { class: 'meta' }, metaOf(n))),
    h('div', { class: 'size' }, size(n.s)),
    h('span', { class: 'go', 'aria-hidden': 'true' }, n.d ? '›' : ''));
  });
  const box = $('rows');
  const top = box.scrollTop;
  box.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, state.filter ? tt('No items with this name.') : tt('Nothing here.'))]));
  box.scrollTop = top;
  $('paneTitle').textContent = tx(size(node.s));
}
function selectedNode() {
  if (!state.sel) return null;
  return (current().c || []).find((c) => pathOf(state.path) + SEP + c.n === state.sel) || null;
}
const dockerKind = (real) => String(real).split(':')[1] || '';
const dockerRef = (real) => String(real).split(':').slice(2).join(':');
const dockerForce = (n) => (dockerKind(n.real) === 'image' && n.use > 0) || n.state === 'running';
function dockerItemCmd(n) {
  const kind = dockerKind(n.real); const ref = dockerRef(n.real); const f = dockerForce(n) ? ' -f' : '';
  if (kind === 'image') return `docker image rm${f} ${ref}`;
  if (kind === 'container') return `docker rm${f} ${ref}`;
  if (kind === 'volume') return `docker volume rm ${ref}`;
  return 'docker builder prune';
}
const copyCmd = (cmd) => async () => { await Neutralino.clipboard.writeText(cmd); toast(tt("Copied: {0}", cmd)); };
function renderActions() {
  const box = $('actions');
  const n = selectedNode();
  box.hidden = !n;
  if (!n) { box.replaceChildren(); return; }
  if (n.d) {
    const btns = [h('button', { class: 'quiet', onclick: () => go([...state.path, n.n]) }, tt('Open'))];
    if (n.sub) btns.push(h('button', { class: 'quiet', onclick: copyCmd(dockerPrune(n.sub)) }, tt('Copy prune command')));
    box.replaceChildren(...btns);
    return;
  }
  const real = String(n.real || '');
  if (real === 'docker:buildcache') {
    box.replaceChildren(h('button', { class: 'quiet', onclick: copyCmd('docker builder prune') }, tt('Copy cleanup command')));
    return;
  }
  if (real.startsWith('docker:')) {
    box.replaceChildren(
      h('button', { class: 'quiet', onclick: copyCmd(dockerItemCmd(n)) }, tt('Copy command')),
      h('button', { class: 'danger', onclick: () => confirmDockerDelete(n) }, tt('Delete')),
    );
    return;
  }
  box.replaceChildren(
    h('button', { class: 'quiet', onclick: async () => { if (!await reveal(n.real).catch(() => false)) toast(tt('No file manager available')); } }, OS === 'Darwin' ? tt('Show in Finder') : tt('Show in folder')),
    h('button', { class: 'quiet', onclick: async () => { await Neutralino.clipboard.writeText(n.real); toast(tt('Path copied')); } }, tt('Copy path')),
    h('button', { class: 'danger', onclick: () => confirmTrash(n) }, tt('Move to Trash')),
  );
}
function renderLegend() {
  const sw = (level) => h('span', null, h('span', { class: 'sw', style: `background:${state.map.safetyColor(level, 0)}` }), SAFETY()[level]);
  $('legend').replaceChildren(sw(0), sw(1), sw(2));
}

function build() {
  const canvas = h('canvas', { role: 'img', 'aria-label': tt('Map of what is left behind, by category and safety.') });
  const center = h('button', { class: 'center', id: 'center', onclick: () => { if (state.path.length) go(state.path.slice(0, -1)); } },
    h('span', { class: 'c-name', id: 'cName' }), h('span', { class: 'c-size', id: 'cSize' }), h('span', { class: 'c-split', id: 'cSplit' }));
  view.replaceChildren(h('div', { class: 'app' },
    h('aside', { class: 'pane' },
      h('div', { class: 'pane-head' }, h('strong', { id: 'paneTitle' })),
      h('input', { class: 'search', type: 'search', placeholder: tt('Filter by name'), 'aria-label': tt('Filter by name'), oninput: (e) => { state.filter = e.target.value.toLowerCase(); renderRows(current()); } }),
      h('div', { class: 'rows', id: 'rows' }),
      h('div', { class: 'actions', id: 'actions', hidden: true })),
    h('div', { class: 'stage' }, canvas, center, h('div', { class: 'empty', id: 'stageEmpty', hidden: true })),
    h('div', { class: 'legend', id: 'legend' })));
  state.map = new RadialMap(canvas, {
    onHover: (arc) => {
      renderCenter(arc);
      document.querySelectorAll('.row.hover').forEach((r) => r.classList.remove('hover'));
      if (arc?.path) $('rows').querySelector(`[data-path="${CSS.escape(arc.path)}"]`)?.classList.add('hover');
    },
    onClick: (arc) => {
      if (!arc.path) return;
      if (arc.node.d) go(arc.path.split(SEP).slice(1));
      else { state.sel = arc.path; state.map.selected = arc.path; state.map.draw(); renderRows(current()); renderActions(); }
    },
    onContext: () => {},
  });
  state.map.onMeasure = (d) => { center.style.width = center.style.height = `${d - 8}px`; };
  state.map.measure();
}

const prettyPath = (p) => (state.home && String(p).startsWith(state.home) ? '~' + String(p).slice(state.home.length) : String(p));
function confirmTrash(node) {
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, tt("Move {0} to Trash?", node.n)),
      h('p', { style: 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--muted);word-break:break-all;margin:2px 0 0' }, prettyPath(node.real)),
      h('p', null, tt('It goes to the system Trash, where you can put it back.'))),
    h('footer', null, h('span'), h('div', null,
      h('button', { class: 'ghost', onclick: () => dialog.close() }, tt('Cancel')),
      h('button', { class: 'danger', onclick: async () => {
        dialog.close();
        if (await trash(node.real).catch(() => false)) { state.items = state.items.filter((i) => i.path !== node.real); state.tree = buildTree(state.items, state.home); state.sel = null; refresh(true); toast(tt('Moved to the Trash.')); }
        else toast(tt('It couldn\'t be moved to the Trash.'));
      } }, tt('Move to Trash'))))));
  if (!dialog.open) dialog.showModal();
}
function confirmDockerDelete(node) {
  const kind = dockerKind(node.real);
  const label = kind === 'image' ? tt('image') : kind === 'container' ? tt('container') : tt('volume');
  const force = dockerForce(node);
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, tt('Delete this {0}?', label)),
      h('p', null, tt('This runs a Docker command and cannot be undone.') + (force ? ` ${tt('It is in use, so it will be forced.')}` : ''))),
    h('footer', null, h('span'), h('div', null,
      h('button', { class: 'ghost', onclick: () => dialog.close() }, tt('Cancel')),
      h('button', { class: 'danger', onclick: async () => {
        dialog.close();
        const r = await dockerRemove(node.real, force).catch((e) => ({ ok: false, err: String(e.message || e) }));
        if (r.ok) { state.items = state.items.filter((i) => i.path !== node.real); state.tree = buildTree(state.items, state.home); state.sel = null; refresh(true); toast(tt('Deleted.')); }
        else toast(tt("Docker couldn't delete it: {0}", (r.err || '').split('\n')[0] || tt('unknown error')));
      } }, tt('Delete'))))));
  if (!dialog.open) dialog.showModal();
}
function openDiag() {
  const report = `os ${OS}, exit ${state.code}, items ${state.items.length}\n\n${state.raw}`;
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, tt('Diagnostics')), h('p', null, tt('What the scan returned. The list stays on this computer and is never sent to anyone.'))),
    h('div', { class: 'body' }, h('pre', null, state.raw || tt('No data yet.'))),
    h('footer', null, h('span'), h('div', null,
      h('button', { class: 'ghost', onclick: async () => { await Neutralino.clipboard.writeText(report); toast(tt('Data copied')); } }, tt('Copy data')),
      h('button', { class: 'primary', onclick: () => dialog.close() }, tt('Close'))))));
  if (!dialog.open) dialog.showModal();
}

async function scanNow() {
  state.scanning = true; state.path = []; state.sel = null; state.filter = '';
  $('rescan').setAttribute('aria-busy', 'true');
  if (state.tree) refresh();
  else { $('center').hidden = true; $('rows').replaceChildren(); $('stageEmpty').hidden = false; $('stageEmpty').textContent = tx(tt('Scanning…')); }
  try {
    const res = await scan();
    state.items = res.items; state.home = res.home; state.raw = res.raw; state.code = res.code;
    state.tree = buildTree(res.items, res.home);
  } catch (err) { toast(String(err.message || err)); state.tree = buildTree([], ''); }
  state.scanning = false;
  $('rescan').removeAttribute('aria-busy');
  refresh(true);
}

(async () => {
  if (!SUPPORTED) {
    for (const id of ['rescan', 'diag']) $(id).hidden = true;
    view.replaceChildren(h('div', { class: 'notsupported' }, h('div', null, h('h1', null, tt('Sedimenti runs on macOS and Linux')), h('p', null, tt('This version scans with tools that don\'t exist on this system.')))));
    Neutralino.events.on('windowClose', () => Neutralino.app.exit());
    return;
  }
  build();
  beforeReload(() => {});
  Neutralino.events.on('windowClose', () => Neutralino.app.exit());
  $('rescan').onclick = scanNow;
  $('diag').onclick = openDiag;
  await scanNow();
})().catch((err) => toast(String(err.message || err)));
