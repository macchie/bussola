import { t as tt, tx, locale } from './shared/i18n.js';
import { saveTheme, beforeReload } from './shared/settings.js';
import { RadialMap } from './map.js';
import * as backend from './backend/index.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const dialog = $('dialog');
const menu = $('menu');

const state = {
  info: null, scan: null, data: null, largest: null, tab: 'list', filter: '', sel: null,
  collection: new Map(), failures: new Map(), trash: [], map: null, poll: 0, token: 0,
};

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
function svg(markup, cls) {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="${cls || 'glyph'}">${markup}</svg>`;
  return t.content.firstChild;
}
const ICON = {
  folder: '<path d="M2.5 5.5a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" fill="currentColor" fill-opacity=".85" stroke="none"/>',
  file: '<path d="M5 2.5h6.5L15 6v11.5H5z"/><path d="M11.5 2.5V6H15"/>',
  link: '<path d="M8 12l4-4M7 9l-2 2a2.8 2.8 0 0 0 4 4l2-2M13 11l2-2a2.8 2.8 0 0 0-4-4L9 7"/>',
  more: '<circle cx="5" cy="10" r="1.1" fill="currentColor"/><circle cx="10" cy="10" r="1.1" fill="currentColor"/><circle cx="15" cy="10" r="1.1" fill="currentColor"/>',
  hidden: '<circle cx="10" cy="10" r="7"/><path d="M5 15L15 5"/>',
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  minus: '<path d="M4.5 10h11"/>',
  sun: '<circle cx="10" cy="10" r="3.4"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
};

const num = new Intl.NumberFormat(locale());
const dec = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });
function size(b) {
  if (!b) return tt('0 bytes');
  const units = [tt('bytes'), tt('kB'), tt('MB'), tt('GB'), tt('TB'), tt('PB')];
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1000)));
  const v = b / 1000 ** i;
  return `${i === 0 ? v : dec.format(v)} ${units[i]}`;
}
const files = (n) => tt("{0} files", num.format(n));
const items = (n) => (n === 1 ? tt('1 item') : tt("{0} items", num.format(n)));
const dateFmt = new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' });
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return tt('now');
  if (m < 60) return tt("{0} min ago", m);
  if (m < 1440) return tt("{0} h ago", Math.round(m / 60));
  return dateFmt.format(ms);
}

function toast(text, action) {
  const el = h('div', { class: 'toast' }, h('span', null, text));
  const close = () => el.remove();
  if (action) el.append(h('button', { onclick: () => { close(); action.run(); } }, action.label));
  $('toasts').append(el);
  setTimeout(close, action ? 8000 : 5000);
}
const report = (err) => toast(err.message || String(err));

/* Theme */
function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
globalThis.LANGUAGE_NOTICE = () => (location.hash.length > 2 ? tt("Changing the language closes the open scan.") : null);
beforeReload(() => { location.hash = '#/'; });
function setThemeIcon() {
  $('theme').replaceChildren(svg(currentTheme() === 'dark' ? ICON.sun : '<path d="M15.5 12.2A6.5 6.5 0 0 1 7.8 4.5a6.5 6.5 0 1 0 7.7 7.7z"/>'));
}
setThemeIcon();
$('theme').onclick = () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  saveTheme(next);
  window.dispatchEvent(new Event('tema'));
};
window.addEventListener('tema', () => {
  setThemeIcon();
  if (state.map && state.data) { state.map.arcs = state.map.build(state.data); state.map.index(); state.map.draw(); renderRows(); }
});

/* Routes */
function route() {
  clearTimeout(state.poll);
  const hash = location.hash.slice(1) || '/';
  const [, section, id, ...rest] = hash.split('/');
  if (section === 'scan' && id) return openScan(id, rest.length ? decodeURIComponent(rest.join('/')) : null);
  state.scan = null;
  state.data = null;
  state.map = null;
  $('rescan').hidden = true;
  $('crumbs').replaceChildren();
  if (section === 'cestino') return renderBin();
  return renderHome();
}
addEventListener('hashchange', route);
const go = (scanId, path) => { location.hash = `#/scan/${scanId}${path ? `/${encodeURIComponent(path)}` : ''}`; };

async function refreshTrash() {
  state.trash = await backend.listTrash();
  const c = $('trashCount');
  c.hidden = !state.trash.length;
  c.textContent = tx(state.trash.length);
}

/* Disks */
async function renderHome() {
  document.title = tx('Anelli');
  const token = ++state.token;
  const [volumes, active] = await Promise.all([backend.volumes(), backend.listScans(), refreshTrash()]);
  if (token !== state.token) return;
  const disks = h('div', { class: 'disks' }, volumes.map((v) => {
    const r = 30;
    const len = 2 * Math.PI * r;
    const part = v.used / v.total;
    const resume = active.find((s) => s.root === v.mount && s.state === 'done');
    return h('section', { class: 'disk' },
      diskRing(r, len, part),
      h('div', { style: 'min-width:0' },
        h('h2', null, v.name),
        h('div', { class: 'where' }, v.mount),
        h('div', { class: 'free' }, tt("{0} free of {1}", size(v.free), size(v.total)))),
      h('div', { class: 'btns' },
        resume && h('button', { class: 'quiet', onclick: () => go(resume.id) }, tt('Resume')),
        h('button', { class: resume ? 'quiet' : 'primary', onclick: () => startScan(v.mount) }, tt('Scan'))));
  }));
  const input = h('input', { type: 'text', placeholder: state.info.home, 'aria-label': tt('Folder path'), spellcheck: 'false' });
  const form = h('form', {
    class: 'pathform',
    onsubmit: (e) => { e.preventDefault(); startScan(input.value.trim() || state.info.home); },
  }, input,
  h('button', { type: 'button', class: 'quiet', onclick: () => browseFolders(input.value.trim() || state.info.home) }, tt('Browse')),
  h('button', { class: 'quiet' }, tt('Scan folder')));
  const others = active.filter((s) => s.state === 'done' && !volumes.some((v) => v.mount === s.root));
  const fda = state.info.fullDiskAccess = await backend.checkFullDiskAccess();
  if (token !== state.token) return;
  view.replaceChildren(h('div', { class: 'home' },
    fda === false && h('div', { class: 'banner' },
      h('div', null, h('strong', null, tt('Full Disk Access is off')),
        h('p', null, tt('macOS doesn\'t recognize this copy of Anelli. Turn it on in Settings, then quit and reopen the app.'))),
      h('button', { class: 'quiet', onclick: () => backend.openPrivacySettings() }, tt('Open Settings'))),
    h('h1', null, tt('Where did the space go?')),
    h('p', null, tt('Choose a disk or a folder. Nothing changes until you decide.')),
    disks,
    others.length ? h('div', { style: 'margin-bottom:32px' },
      h('h2', { class: 'section' }, tt('Recent scans')),
      others.map((s) => h('div', null, h('button', { class: 'ghost', onclick: () => go(s.id) }, s.root)))) : null,
    h('h2', { class: 'section' }, tt('A specific folder')),
    form));
}
function diskRing(r, len, part) {
  const t = document.createElement('template');
  t.innerHTML = `<svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--line)" stroke-width="11"/>
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="${part > .9 ? 'var(--danger)' : 'var(--accent)'}" stroke-width="11" stroke-dasharray="${len * part} ${len}"/></svg>`;
  return t.content.firstChild;
}
async function browseFolders(start) {
  let data;
  try { data = await backend.listFolders(start); } catch { data = await backend.listFolders(); }
  const open = (p) => browseFolders(p);
  dialog.className = '';
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, tt('Choose a folder')), h('p', null, data.path)),
    h('div', { class: 'body dirs' },
      data.parent && h('button', { onclick: () => open(data.parent) }, tt('Parent folder')),
      data.dirs.map((d) => h('button', { onclick: () => open(data.path + (data.path.endsWith(state.info.sep) ? '' : state.info.sep) + d) }, d)),
      !data.dirs.length && h('p', { class: 'empty' }, tt('No subfolders here.'))),
    h('footer', null,
      h('button', { class: 'ghost', onclick: () => dialog.close() }, tt('Close')),
      h('button', { class: 'primary', onclick: () => { dialog.close(); startScan(data.path); } }, tt('Scan this folder')))));
  if (!dialog.open) dialog.showModal();
}
async function startScan(path) {
  try {
    const s = await backend.startScan(path);
    state.collection.clear();
    go(s.id);
  } catch (err) { report(err); }
}

/* Scan in progress */
async function openScan(id, path) {
  const token = ++state.token;
  let s;
  try { s = backend.scanStatus(id); } catch (err) {
    toast(err.message);
    location.hash = '#/';
    return;
  }
  if (token !== state.token) return;
  state.scan = s;
  if (s.state === 'running') return renderProgress(s, token);
  if (s.state === 'failed') { toast(s.error); location.hash = '#/'; return; }
  await refreshTrash();
  if (token !== state.token) return;
  renderExplorer(path || s.root);
}
function renderProgress(s, token) {
  document.title = tx(tt('Scanning'));
  const known = s.expected > 0;
  const c = 2 * Math.PI * 46;
  const fill = h('template');
  fill.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="46"/><circle class="fill" cx="50" cy="50" r="46" stroke-dasharray="${c}" stroke-dashoffset="${known ? c : c * .72}"/></svg>`;
  const ring = fill.content.firstChild;
  const strong = h('strong', null, '');
  const sub = h('span', null, '');
  const where = h('div', { class: 'scan-path' }, '');
  view.replaceChildren(h('div', { class: 'scanning' },
    h('div', { class: `gauge ${known ? '' : 'unknown'}` }, ring, h('div', { class: 'value' }, strong, sub)),
    where,
    h('button', {
      class: 'quiet',
      onclick: () => { try { backend.cancelScan(s.id); } catch { /* already finished */ } location.hash = '#/'; },
    }, tt('Cancel scan'))));
  const tick = async () => {
    if (token !== state.token) return;
    let cur;
    try { cur = backend.scanStatus(s.id); } catch { location.hash = '#/'; return; }
    if (token !== state.token) return;
    const p = cur.progress;
    if (known) {
      const pct = Math.min(99, Math.floor(p.bytes / cur.expected * 100));
      strong.textContent = tx(`${pct}%`);
      sub.textContent = tx(size(p.bytes));
      ring.querySelector('.fill').setAttribute('stroke-dashoffset', c * (1 - pct / 100));
    } else {
      strong.textContent = tx(size(p.bytes));
    }
    if (!known) sub.textContent = tx(files(p.files));
    where.textContent = tx(p.current || '');
    if (cur.state === 'running') state.poll = setTimeout(tick, 200);
    else openScan(s.id);
  };
  tick();
}

/* Explore */
function renderExplorer(path) {
  if (!state.map || state.data?.root !== state.scan.root) buildExplorer();
  loadPath(path);
}
function buildExplorer() {
  const canvas = h('canvas', { role: 'img', 'aria-label': tt('Radial map of used space. The same content is in the list alongside.') });
  const center = h('button', { class: 'center', id: 'center', onclick: goUp },
    h('span', { class: 'c-name', id: 'cName' }), h('span', { class: 'c-size', id: 'cSize' }), h('span', { class: 'c-up', id: 'cUp' }));
  const notice = h('div', { class: 'notice', id: 'notice' });
  const rows = h('div', { class: 'rows', id: 'rows', tabindex: '0', role: 'listbox', 'aria-label': tt('Contents sorted by size'), onkeydown: rowKeys });
  const search = h('input', {
    class: 'search', type: 'search', placeholder: tt('Filter by name'), 'aria-label': tt('Filter by name'), id: 'search',
    oninput: (e) => { state.filter = e.target.value.toLowerCase(); renderRows(); },
  });
  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    h('button', { role: 'tab', id: 'tabList', onclick: () => setTab('list') }, tt('In this folder')),
    h('button', { role: 'tab', id: 'tabLarge', onclick: () => setTab('large') }, tt('Largest files')));
  const tray = h('section', { class: 'tray', id: 'tray', 'aria-label': tt('Collection') });
  bindDrop(tray);
  view.replaceChildren(h('div', { class: 'explorer' },
    h('aside', { class: 'pane' }, tabs, search, rows, h('div', { class: 'actions', id: 'actions' })),
    h('div', { class: 'stage' }, canvas, center, notice),
    tray));
  state.map = new RadialMap(canvas, {
    onHover: (arc) => { updateCenter(arc); markHover(arc?.path); },
    onClick: (arc) => {
      if (!arc.path) {
        if (arc.kind === 'hidden') showHiddenInfo();
        return;
      }
      if (arc.node.d) go(state.scan.id, arc.path);
      else select(arc.path);
    },
    onContext: (arc, e) => { select(arc.path); openMenu(itemOf(arc.path, arc.node), e.clientX, e.clientY); },
  });
  state.map.onMeasure = (d) => { center.style.width = center.style.height = `${d - 8}px`; };
  state.map.measure();
  canvas.addEventListener('dragstart', (e) => {
    const arc = state.map.hover;
    if (!arc || !arc.path) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', arc.path);
    state.dragging = itemOf(arc.path, arc.node);
  });
  state.tab = 'list';
  state.filter = '';
  state.largest = null;
  renderTabs();
  renderTray();
  $('rescan').hidden = false;
  $('rescan').onclick = rescanCurrent;
}
async function loadPath(path) {
  const token = ++state.token;
  let data;
  try {
    data = await backend.tree(state.scan.id, path);
  } catch (err) {
    if (path !== state.scan.root) { toast(err.message); go(state.scan.id); }
    else { toast(err.message); location.hash = '#/'; }
    return;
  }
  if (token !== state.token) return;
  state.data = data;
  state.sel = null;
  state.map.setView(data);
  document.title = tx(`${data.node.n}: ${size(data.node.s)}`);
  renderCrumbs();
  updateCenter(null);
  renderRows();
  renderActions();
  syncMap();
  const n = $('notice');
  const protectedByMac = state.info.fullDiskAccess === true;
  n.textContent = tx(!data.denied ? ''
    : protectedByMac ? tt("{0} protected by macOS stay excluded: this happens even with Full Disk Access.", items(data.denied))
      : tt("{0} unreadable due to missing permissions.", items(data.denied)));
}
function renderCrumbs() {
  const { root, path, sep } = state.data;
  const rel = path === root ? [] : path.slice(root.length).split(sep).filter(Boolean);
  const parts = [h('button', { onclick: () => go(state.scan.id) }, root)];
  let cur = root;
  for (const r of rel) {
    cur = cur.endsWith(sep) ? cur + r : cur + sep + r;
    const target = cur;
    parts.push(h('i', null, '/'), h('button', { onclick: () => go(state.scan.id, target) }, r));
  }
  $('crumbs').replaceChildren(...parts);
}
function goUp() {
  const { root, path, sep } = state.data;
  if (path === root) return;
  const up = path.slice(0, path.lastIndexOf(sep)) || sep;
  go(state.scan.id, up.length < root.length ? root : up);
}
function updateCenter(arc) {
  const d = state.data;
  if (!d) return;
  const node = arc ? arc.node : d.node;
  $('cName').textContent = tx(node.n);
  $('cSize').textContent = tx(size(node.s));
  const note = arc ? (arc.kind === 'other' ? items(node.count) : arc.kind === 'hidden' ? tt('click to learn more') : share(node.s))
    : d.path !== d.root ? tt('Go up') : '';
  $('cUp').textContent = tx(note);
  $('center').classList.toggle('up', d.path !== d.root);
}
const share = (s) => `${dec.format(s / (state.data.node.s + state.data.hidden || 1) * 100)}%`;
function showHiddenInfo() {
  openDialog(tt('Unattributed space'), tt("{0} are in use on the disk but don't belong to readable files.", size(state.data.hidden)), [
    h('p', null, tt('Usually these are folders without permissions, filesystem metadata, snapshots or other users\' files. To see more, start the service with sudo.')),
  ], [h('button', { class: 'primary', onclick: () => dialog.close() }, tt('Got it'))]);
}

/* List */
const childPath = (name) => {
  const { path, sep } = state.data;
  return path.endsWith(sep) ? path + name : path + sep + name;
};
const itemOf = (path, node) => ({ path, name: node.n, size: node.s, dir: !!node.d, link: !!node.l });
function visibleItems() {
  if (state.tab === 'large') {
    return (state.largest || []).map((f) => ({
      path: f.path, name: f.path.slice(f.path.lastIndexOf(state.data.sep) + 1), size: f.s,
      from: f.path.slice(0, f.path.lastIndexOf(state.data.sep)),
    })).filter((i) => !state.filter || i.path.toLowerCase().includes(state.filter));
  }
  return (state.data.node.c || []).filter((c) => !state.filter || tx(c.n).toLowerCase().includes(state.filter))
    .map((c) => ({ ...itemOf(childPath(c.n), c), node: c }));
}
function glyph(item) {
  return svg(item.dir ? ICON.folder : item.link ? ICON.link : ICON.file);
}
/* Add to / remove from the collection: + while free, − once it's selected for trashing. */
function collectButton(item) {
  const on = isCollected(item.path);
  return h('button', {
    class: on ? 'add on' : 'add',
    title: on ? tt('Remove from collection') : tt('Add to collection'),
    'aria-label': on ? tt("Remove {0} from collection", item.name) : tt("Add {0} to collection", item.name),
    onclick: (e) => { e.stopPropagation(); if (on) uncollect(collectedKey(item.path)); else collect(item); },
  }, svg(on ? ICON.minus : ICON.plus));
}
function renderRows() {
  const box = $('rows');
  if (!box || !state.data) return;
  const list = visibleItems();
  const max = list.length ? Math.max(...list.map((i) => i.size), 1) : 1;
  const total = state.data.node.s + state.data.hidden || 1;
  const out = list.slice(0, 1200).map((item) => {
    const color = state.map.colorOf(item.path) || 'var(--muted)';
    const node = item.node;
    const meta = item.from ? item.from : node?.d ? files(node.fc) : tt('File');
    const el = h('div', {
      class: `row${state.sel === item.path ? ' sel' : ''}${isCollected(item.path) ? ' collected' : ''}`,
      role: 'option', 'aria-selected': state.sel === item.path ? 'true' : 'false', draggable: 'true',
      'data-path': item.path,
      onclick: () => select(item.path),
      ondblclick: () => openItem(item),
      oncontextmenu: (e) => { e.preventDefault(); select(item.path); openMenu(item, e.clientX, e.clientY); },
      onmouseenter: () => state.map.hoverPath(item.path),
      onmouseleave: () => state.map.hoverPath(null),
      ondragstart: (e) => { e.dataTransfer.setData('text/plain', item.path); state.dragging = item; },
    },
    h('div', { class: 'bar', style: `width:${item.size / max * 100}%;background:${color}` }),
    h('span', { style: `color:${item.dir ? color : 'var(--muted)'};display:flex` }, glyph(item)),
    h('div', { style: 'min-width:0' }, h('div', { class: 'name', title: item.path }, item.name), h('div', { class: 'meta' }, meta)),
    h('div', null, h('div', { class: 'size' }, size(item.size)), h('div', { class: 'pct' }, `${dec.format(item.size / total * 100)}%`)),
    collectButton(item));
    return el;
  });
  if (state.tab === 'list' && !state.filter) {
    const o = state.data.node.o;
    if (o) out.push(passive(ICON.more, tt("{0} smaller", items(o.count)), tt('Grouped because they are small'), o.size, total));
    if (state.data.hidden > 0) {
      const row = passive(ICON.hidden, tt('Unattributed space'), tt('Used but unreadable'), state.data.hidden, total);
      row.style.cursor = 'pointer';
      row.onclick = showHiddenInfo;
      out.push(row);
    }
  }
  if (!out.length) {
    const msg = state.tab === 'large' && state.largest && !state.largest.length ? tt('No files over 1 MB in this scan.')
      : state.filter ? tt('No items with this name.') : state.tab === 'large' ? tt('Loading…') : tt('This folder is empty.');
    out.push(h('div', { class: 'empty' }, msg));
  }
  box.replaceChildren(...out);
}
function passive(icon, name, meta, s, total) {
  return h('div', { class: 'row passive' }, h('span', { style: 'display:flex' }, svg(icon)),
    h('div', { style: 'min-width:0' }, h('div', { class: 'name' }, name), h('div', { class: 'meta' }, meta)),
    h('div', null, h('div', { class: 'size' }, size(s)), h('div', { class: 'pct' }, `${dec.format(s / total * 100)}%`)), h('span'));
}
function markHover(path) {
  document.querySelectorAll('.row.hover').forEach((r) => r.classList.remove('hover'));
  if (!path) return;
  const row = $('rows')?.querySelector(`[data-path="${CSS.escape(path)}"]`);
  if (row) row.classList.add('hover');
}
function renderTabs() {
  $('tabList').setAttribute('aria-selected', state.tab === 'list');
  $('tabLarge').setAttribute('aria-selected', state.tab === 'large');
}
async function setTab(tab) {
  state.tab = tab;
  state.sel = null;
  renderTabs();
  renderRows();
  renderActions();
  if (tab === 'large') {
    state.largest = await backend.largest(state.scan.id);
    renderRows();
  }
}
function selectedItem() {
  return state.sel ? visibleItems().find((i) => i.path === state.sel) : null;
}
function select(path) {
  state.sel = path;
  state.map.selected = path;
  state.map.draw();
  document.querySelectorAll('.row.sel').forEach((r) => { r.classList.remove('sel'); r.setAttribute('aria-selected', 'false'); });
  const row = $('rows').querySelector(`[data-path="${CSS.escape(path)}"]`);
  if (row) { row.classList.add('sel'); row.setAttribute('aria-selected', 'true'); row.scrollIntoView({ block: 'nearest' }); }
  renderActions();
}
function openItem(item) {
  if (item.dir) go(state.scan.id, item.path);
  else preview(item);
}
function actionsFor(item) {
  return [
    item.dir && [tt('Open'), () => openItem(item)],
    !item.dir && [tt('Preview'), () => preview(item)],
    [tt('Show in folder'), () => backend.reveal(item.path).catch(report)],
    [tt('Copy path'), async () => {
      try { await Neutralino.clipboard.writeText(item.path); toast(tt('Path copied')); } catch { toast(item.path); }
    }],
    item.dir && [tt('Rescan'), () => rescan(item.path)],
    isCollected(item.path) ? [tt('Remove from collection'), () => uncollect(item.path)] : [tt('Add to collection'), () => collect(item)],
  ].filter(Boolean);
}
function renderActions() {
  const box = $('actions');
  if (!box) return;
  const item = selectedItem();
  box.hidden = !item;
  if (!item) { box.replaceChildren(); return; }
  box.replaceChildren(...actionsFor(item).filter(([l]) => l !== 'Rescan').map(([label, run]) => h('button', { class: 'quiet', onclick: run }, label)));
}
function openMenu(item, x, y) {
  menu.replaceChildren(...actionsFor(item).map(([label, run]) => h('button', {
    role: 'menuitem', onclick: () => { closeMenu(); run(); },
  }, label)));
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
  menu.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
  menu.querySelector('button').focus();
}
function closeMenu() { menu.hidden = true; }
addEventListener('click', closeMenu);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

function rowKeys(e) {
  const list = visibleItems();
  const i = list.findIndex((x) => x.path === state.sel);
  const item = list[i];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) select(next.path);
  } else if (e.key === 'Enter' && item) openItem(item);
  else if (e.key === ' ' && item) { e.preventDefault(); if (!item.dir) preview(item); }
  else if ((e.key === 'Delete') && item) collect(item);
  else if (e.key === 'Backspace') { e.preventDefault(); goUp(); }
}

async function rescan(path) {
  try {
    await backend.refresh(state.scan.id, path);
    state.largest = null;
    if (state.tab === 'large') setTab('large');
    await reload();
    toast(tt('Scan updated'));
  } catch (err) { report(err); }
}
const rescanCurrent = () => rescan(state.data.path);
async function reload() {
  const keep = state.data.path;
  state.map.view = null;
  state.map.skipIntro = true;
  await loadPath(keep);
}

/* Collection */
/* The collection entry that covers this path (the path itself or a collected ancestor), or null. */
function collectedKey(path) {
  const sep = state.data?.sep || '/';
  for (const c of state.collection.keys()) if (path === c || path.startsWith(c + sep)) return c;
  return null;
}
const isCollected = (path) => collectedKey(path) !== null;
function collect(item) {
  if (isCollected(item.path)) return;
  const sep = state.data.sep;
  for (const p of state.collection.keys()) if (p.startsWith(item.path + sep)) state.collection.delete(p);
  state.collection.set(item.path, { path: item.path, name: item.name, size: item.size, dir: item.dir });
  syncCollection();
}
function uncollect(path) {
  state.collection.delete(path);
  state.failures.delete(path);
  syncCollection();
}
function syncMap() {
  if (!state.map) return;
  state.map.collected = new Set(state.collection.keys());
  state.map.selected = state.sel;
  state.map.draw();
}
function syncCollection() { syncMap(); renderTray(); renderRows(); renderActions(); }
function bindDrop(tray) {
  tray.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; tray.classList.add('over'); });
  tray.addEventListener('dragleave', () => tray.classList.remove('over'));
  tray.addEventListener('drop', (e) => {
    e.preventDefault();
    tray.classList.remove('over');
    if (state.dragging) collect(state.dragging);
    state.dragging = null;
  });
}
function renderTray() {
  const tray = $('tray');
  if (!tray) return;
  const list = [...state.collection.values()];
  if (!list.length) {
    tray.replaceChildren(h('span', { class: 'hint' }, tt('Drag here, or press +, whatever you want off the disk. Nothing changes until you move it to the Trash.')));
    return;
  }
  const total = list.reduce((s, i) => s + i.size, 0);
  tray.replaceChildren(
    h('div', { class: 'title' }, tt("Collection: {0}", size(total)), h('small', null, items(list.length))),
    h('div', { class: 'chips' }, list.map((i) => {
      const fail = state.failures.get(i.path);
      return h('div', { class: `chip${fail ? ' bad' : ''}`, title: fail || i.path },
        h('span', null, i.name), h('em', null, size(i.size)),
        h('button', { 'aria-label': tt("Remove {0}", i.name), onclick: () => uncollect(i.path) }, '×'));
    })),
    h('button', { class: 'ghost', onclick: () => { state.collection.clear(); state.failures.clear(); syncCollection(); } }, tt('Empty')),
    h('button', { class: 'primary', onclick: moveCollection }, tt('Move to Trash')));
}
async function moveCollection() {
  try {
    const paths = [...state.collection.keys()];
    const res = await backend.moveToTrash(state.scan.id, paths);
    state.failures.clear();
    for (const m of res.moved) state.collection.delete(m.original);
    for (const f of res.failed) state.failures.set(f.path, f.error);
    state.largest = null;
    await refreshTrash();
    await reload();
    if (state.tab === 'large') setTab('large');
    renderTray();
    if (res.moved.length) {
      const ids = res.moved.map((m) => m.id);
      const total = res.moved.reduce((s, m) => s + m.size, 0);
      toast(tt("{0} in the Trash. Space is freed when you delete them.", size(total)), {
        label: tt('Cancel'),
        run: async () => {
          const back = await backend.restoreItems(ids, false);
          await refreshTrash();
          await reload();
          toast(back.failed.length ? tt('Some items didn\'t return to their place: check the Trash') : tt('Items restored'));
        },
      });
    }
    if (res.failed.length) toast(`${res.failed.length === 1 ? tt('One item not moved') : tt("{0} not moved", items(res.failed.length))}: ${res.failed[0].error}`);
  } catch (err) { report(err); }
}

/* Preview */
async function preview(item) {
  let body;
  let url = null;
  try {
    const p = await backend.preview(item.path, item.name);
    if (p.kind === 'media') {
      url = p.url;
      if (p.type.startsWith('image/')) body = h('img', { src: url, alt: item.name });
      else if (p.type.startsWith('video/')) body = h('video', { src: url, controls: true });
      else body = h('audio', { src: url, controls: true });
    } else if (p.kind === 'text') body = h('pre', null, p.text + (p.truncated ? '\n…' : ''));
    else body = h('p', { class: 'empty' }, p.reason);
  } catch { body = h('p', { class: 'empty' }, tt('This item can\'t be opened.')); }
  openDialog(item.name, tt("{0} in {1}", size(item.size), item.path), [body], [
    h('button', { class: 'ghost', onclick: () => { collect(item); dialog.close(); } }, tt('Add to collection')),
    h('button', { class: 'primary', onclick: () => dialog.close() }, tt('Close')),
  ], 'wide');
  if (url) dialog.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
}
function openDialog(title, sub, body, footer, cls = '') {
  dialog.className = cls;
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, title), sub && h('p', null, sub)),
    h('div', { class: 'body' }, body),
    h('footer', null, footer)));
  if (!dialog.open) dialog.showModal();
}

/* Trash */
async function renderBin() {
  document.title = tx(tt('Trash'));
  const token = ++state.token;
  await refreshTrash();
  if (token !== state.token) return;
  const list = [...state.trash].sort((a, b) => b.size - a.size);
  const picked = new Set();
  const total = list.reduce((s, i) => s + i.size, 0);
  const restoreBtn = h('button', { class: 'quiet', disabled: true, onclick: () => restore([...picked]) }, tt('Restore'));
  const purgeBtn = h('button', { class: 'danger', disabled: !list.length, onclick: () => askPurge(picked.size ? list.filter((i) => picked.has(i.id)) : list) }, tt('Delete all'));
  const sync = () => {
    restoreBtn.disabled = !picked.size;
    purgeBtn.textContent = tx(picked.size ? tt("Delete {0}", items(picked.size)) : tt('Delete all'));
  };
  const rows = list.map((item) => h('div', { class: 'bin-row' },
    h('input', {
      type: 'checkbox', 'aria-label': tt("Select {0}", item.name),
      onchange: (e) => { if (e.target.checked) picked.add(item.id); else picked.delete(item.id); sync(); },
    }),
    svg(item.dir ? ICON.folder : ICON.file),
    h('div', { style: 'min-width:0' }, h('div', { class: 'name', title: item.name }, item.name),
      h('div', { class: `from${item.missing ? ' gone' : ''}`, title: item.original }, item.missing ? tt('No longer in the Trash') : item.original)),
    h('div', { class: 'num' }, size(item.size)),
    h('div', { class: 'when' }, ago(item.trashedAt)),
    h('button', { class: 'quiet', disabled: item.missing, onclick: () => restore([item.id]) }, tt('Restore'))));
  view.replaceChildren(h('div', { class: 'bin' },
    h('div', { class: 'bin-head' },
      h('div', null, h('h1', null, list.length ? tt("{0} in the Trash", size(total)) : tt('The Trash is empty')),
        h('p', null, list.length ? tt('These items still take up disk space until you delete them. You can restore them whenever you like.') : tt('What you move from the collection stays here, recoverable, until you decide to delete it.'))),
      list.length ? h('div', { class: 'bin-actions' }, restoreBtn, purgeBtn) : null),
    rows.length ? rows : h('div', { class: 'bin-empty' }, h('a', { class: 'quiet', href: '#/' }, tt('Back to disks')))));
}
async function restore(ids, rename = false) {
  try {
    const res = await backend.restoreItems(ids, rename);
    const conflicts = res.failed.filter((f) => f.code === 'CONFLICT');
    if (res.restored.length) toast(res.restored.length === 1 ? tt('Item restored') : tt("{0} restored", items(res.restored.length)));
    const other = res.failed.find((f) => f.code !== 'CONFLICT');
    if (other) toast(other.error);
    if (conflicts.length) {
      openDialog(tt('An item with the same name already exists'),
        tt("{0} can't return to their place without overwriting.", items(conflicts.length)),
        [h('p', null, tt('Anelli never overwrites. You can restore them next to the original under a different name.'))],
        [h('button', { class: 'ghost', onclick: () => dialog.close() }, tt('Leave in Trash')),
          h('button', { class: 'primary', onclick: () => { dialog.close(); restore(conflicts.map((c) => c.id), true); } }, tt('Restore with another name'))]);
    }
    renderBin();
  } catch (err) { report(err); }
}
function askPurge(list) {
  const total = list.reduce((s, i) => s + i.size, 0);
  const confirmBtn = h('button', { class: 'danger', onclick: () => countdown(list, confirmBtn) }, tt("Delete {0}", size(total)));
  openDialog(tt("Permanently delete {0}?", items(list.length)), tt('This action can\'t be undone.'),
    [h('ul', null, list.slice(0, 40).map((i) => h('li', null, h('span', null, i.original), h('span', null, size(i.size))))),
      list.length > 40 ? h('p', { class: 'empty' }, tt("and {0} more", num.format(list.length - 40))) : null],
    [h('button', { class: 'ghost', onclick: () => { clearInterval(state.timer); dialog.close(); } }, tt('Cancel')), confirmBtn]);
}
function countdown(list, btn) {
  if (state.timer) clearInterval(state.timer);
  let left = 5;
  btn.disabled = true;
  const paint = () => { btn.textContent = tx(tt("Deleting in {0} s", left)); };
  paint();
  state.timer = setInterval(async () => {
    left--;
    if (left > 0 && dialog.open) { paint(); return; }
    clearInterval(state.timer);
    state.timer = null;
    if (!dialog.open) return;
    btn.textContent = tx(tt('Deleting'));
    try {
      const res = await backend.purgeItems(list.map((i) => i.id));
      dialog.close();
      toast(res.failed.length ? tt("{0} not deleted: {1}", res.failed.length, res.failed[0].error) : (res.purged.length === 1 ? tt('Item permanently deleted') : tt("{0} permanently deleted", items(res.purged.length))));
    } catch (err) { dialog.close(); report(err); }
    renderBin();
  }, 1000);
}

dialog.addEventListener('close', () => { clearInterval(state.timer); state.timer = null; });

function quit() { backend.closeAll(); Neutralino.app.exit(); }

/* macOS gives this window no native menu, so wire the standard shortcuts by hand. */
if (globalThis.NL_OS === 'Darwin') {
  addEventListener('keydown', (e) => {
    if (!e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'q' || key === 'w') { e.preventDefault(); quit(); }
    else if (key === 'm') { e.preventDefault(); Neutralino.window.minimize(); }
  });
}

(async () => {
  Neutralino.events.on('windowClose', quit);
  state.info = await backend.init();
  route();
})().catch(report);
