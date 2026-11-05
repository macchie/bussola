import { t as tt, tx, locale } from './shared/i18n.js';
import { saveTheme, beforeReload } from './shared/settings.js';
import { RadialMap } from './map.js';
import { Sampler, PERIODS } from './core/sampler.js';
import { buildTree, SEP, ROOT } from './core/store.js';
import { SUPPORTED, run } from './core/platform.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const dialog = $('dialog');
const state = { period: 'live', metric: 'all', path: [], sel: null, filter: '', tree: null, map: null, sampler: null, bins: [], ticks: 0 };

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
const rate = (b) => `${size(b)}/s`;
const split = (n) => `↓ ${size(n.in)}   ↑ ${size(n.out)}`;
function toast(text) {
  const el = h('div', { class: 'toast' }, text);
  $('toasts').append(el);
  setTimeout(() => el.remove(), 3500);
}
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

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
$('theme').onclick = () => {
  const next = theme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  saveTheme(next);
  window.dispatchEvent(new Event('tema'));
};
window.addEventListener('tema', () => {
  paintThemeIcon();
  refresh();
});

/* Dati e navigazione */
function current() {
  let node = state.tree;
  const names = [];
  for (const name of state.path) {
    const next = (node.c || []).find((c) => c.n === name && c.d);
    if (!next) break;
    node = next;
    names.push(name);
  }
  state.path = names;
  return node;
}
const pathOf = (names) => [ROOT, ...names].join(SEP);
const viewData = () => ({ path: pathOf(state.path), sep: SEP, root: ROOT, hidden: 0, node: current() });

function refresh(navigated = false) {
  if (!state.sampler || !state.map) return;
  const now = Date.now();
  const store = state.sampler.store;
  state.tree = buildTree(store.totals(state.period, now), state.metric);
  const data = viewData();
  if (navigated) state.map.setView(data); else state.map.update(data);
  state.bins = store.timeline(state.period, now);
  renderCrumbs();
  renderCenter(state.map.hover);
  renderRows(data.node);
  renderRates(store.rate());
  drawChart();
  renderActions();
  const empty = !state.tree.c.length;
  $('stageEmpty').hidden = !empty;
  $('center').hidden = empty;
  $('stageEmpty').textContent = tx(state.sampler.paused ? tt('Monitoring paused.')
    : state.period === 'live' && state.sampler.diag.samples < 2 ? tt('Listening for traffic…') : tt('No traffic in this period.'));
  const d = state.sampler.diag;
  const bad = d.samples >= 2 && !d.header;
  $('alert').hidden = !bad;
}
function go(names) {
  state.path = names;
  state.sel = null;
  refresh(true);
}
function renderCrumbs() {
  const parts = [h('button', { onclick: () => go([]) }, tt('All traffic'))];
  state.path.forEach((name, i) => parts.push(h('i', null, '/'), h('button', { onclick: () => go(state.path.slice(0, i + 1)) }, name)));
  $('crumbs').replaceChildren(...parts);
}
function renderCenter(arc) {
  const node = arc ? (arc.kind === 'other' ? { n: tt('Smaller items'), s: arc.node.s } : arc.node) : current();
  $('cName').textContent = tx(node.n);
  $('cSize').textContent = tx(size(node.s));
  $('cSplit').textContent = tx(node.in !== undefined ? `↓ ${size(node.in)}\n↑ ${size(node.out)}` : '');
  $('center').classList.toggle('up', state.path.length > 0);
}
const metaOf = (n) => (n.n === 'Unattributed traffic' ? tt('UDP, QUIC or short connections') : n.kind === 'app' && n.processes > 1 ? tt("{0} processes", num.format(n.processes))
  : n.d ? `${num.format(n.c.length)} ${n.c.length === 1 ? tt('destination') : tt('destinations')}` : n.kind === 'dest' ? tt('Destination') : '');
function renderRows(node) {
  const list = (node.c || []).filter((c) => !state.filter || tx(c.n).toLowerCase().includes(state.filter));
  const max = list.length ? Math.max(list[0].s, 1) : 1;
  const base = pathOf(state.path);
  const rows = list.map((n) => {
    const path = base + SEP + n.n;
    const color = state.map.colorOf(path) || 'var(--muted)';
    return h('button', {
      class: `row${state.sel === path ? ' sel' : ''}`, 'data-path': path, title: n.n,
      onclick: () => { state.sel = path; state.map.selected = path; state.map.draw(); renderRows(current()); renderActions(); },
      ondblclick: () => { if (n.d) go([...state.path, n.n]); },
      onmouseenter: () => state.map.hoverPath(path),
      onmouseleave: () => state.map.hoverPath(null),
    },
    h('div', { class: 'bar', style: `width:${n.s / max * 100}%;background:${color}` }),
    h('span', { class: 'dot', style: `background:${color}` }),
    h('div', { style: 'min-width:0' }, h('div', { class: 'name' }, n.n), h('div', { class: 'meta' }, metaOf(n))),
    h('div', null, h('div', { class: 'size' }, size(n.s)), h('div', { class: 'split' }, split(n))),
    h('span', { class: 'go', 'aria-hidden': 'true' }, n.d ? '›' : ''));
  });
  const box = $('rows');
  const top = box.scrollTop;
  box.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, state.filter ? tt('No items with this name.') : tt('When an app uses the network you\'ll find it here, from most to least active.'))]));
  box.scrollTop = top;
  $('paneTitle').textContent = tx(`${size(node.s)} ${tx(PERIODS[state.period].phrase)}`);
}
function selectedNode() {
  if (!state.sel) return null;
  return (current().c || []).find((c) => pathOf(state.path) + SEP + c.n === state.sel) || null;
}
function renderActions() {
  const box = $('actions');
  const n = selectedNode();
  box.hidden = !n;
  if (!n) { box.replaceChildren(); return; }
  const reveal = n.kind === 'app' && state.sampler.revealCommand(n.n);
  box.replaceChildren(
    n.d ? h('button', { class: 'quiet', onclick: () => go([...state.path, n.n]) }, tt('Open')) : '',
    reveal ? h('button', { class: 'quiet', onclick: async () => { const r = await run(reveal); if (r.code !== 0) toast(tt('No file manager available')); } }, NL_OS === 'Darwin' ? tt('Show in Finder') : tt('Show in folder')) : '',
    h('button', { class: 'quiet', onclick: async () => { await Neutralino.clipboard.writeText(n.n); toast(tt('Name copied')); } }, tt('Copy name')),
  );
}
function renderRates(r) {
  $('rxRate').textContent = tx(rate(r.in));
  $('txRate').textContent = tx(rate(r.out));
}

/* Chart: received on top, sent below, same scale */
function drawChart() {
  const canvas = $('chart');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const bins = state.bins;
  const labelH = 18;
  const leftW = 66;
  const plotW = rect.width - leftW;
  const plotH = rect.height - labelH;
  const mid = plotH / 2;
  const max = Math.max(1, ...bins.map((b) => Math.max(b.in, b.out)));
  const step = plotW / bins.length;
  const barW = Math.max(1, step - 2);
  ctx.font = '12px Plex, system-ui, sans-serif';
  ctx.fillStyle = css('--muted');
  ctx.textBaseline = 'top';
  ctx.fillText(tx(size(max)), 0, 0);
  ctx.textBaseline = 'bottom';
  ctx.fillText(tx(size(max)), 0, plotH);
  ctx.strokeStyle = css('--line');
  ctx.beginPath(); ctx.moveTo(leftW, mid + .5); ctx.lineTo(rect.width, mid + .5); ctx.stroke();
  const bar = (x, len, up) => {
    if (len < .5) return;
    const l = Math.max(2, len);
    const r = Math.min(4, barW / 2, l);
    ctx.beginPath();
    if (up) ctx.roundRect(x, mid - l, barW, l, [r, r, 0, 0]);
    else ctx.roundRect(x, mid + 1, barW, l, [0, 0, r, r]);
    ctx.fill();
  };
  const scale = (mid - 2) / max;
  ctx.fillStyle = css('--rx');
  bins.forEach((b, i) => bar(leftW + i * step, b.in * scale, true));
  ctx.fillStyle = css('--tx');
  bins.forEach((b, i) => bar(leftW + i * step, b.out * scale, false));
  if (state.hoverBin !== undefined && bins[state.hoverBin]) {
    ctx.fillStyle = css('--tint');
    ctx.fillRect(leftW + state.hoverBin * step - 1, 0, step, plotH);
  }
  ctx.fillStyle = css('--muted');
  ctx.textBaseline = 'alphabetic';
  if (bins.length) {
    ctx.fillText(tx(binLabel(bins[0].t)), leftW, rect.height - 3);
    const end = binLabel(Date.now());
    ctx.fillText(tx(end), rect.width - ctx.measureText(end).width, rect.height - 3);
  }
  state.chartGeom = { leftW, step };
  const total = bins.reduce((s, b) => ({ in: s.in + b.in, out: s.out + b.out }), { in: 0, out: 0 });
  canvas.setAttribute('aria-label', tx(tt("Traffic trend: {0} received, {1} sent", size(total.in), size(total.out))));
}
const binLabel = (t) => new Intl.DateTimeFormat(locale(), state.period === 'week' ? { weekday: 'short', hour: '2-digit', minute: '2-digit' }
  : state.period === 'live' ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' }).format(t);
function chartHover(e) {
  const g = state.chartGeom;
  const canvas = $('chart');
  if (!g) return;
  const x = e.clientX - canvas.getBoundingClientRect().left;
  const i = Math.floor((x - g.leftW) / g.step);
  const b = state.bins[i];
  const tip = $('tip');
  if (!b || x < g.leftW) { tip.hidden = true; state.hoverBin = undefined; drawChart(); return; }
  state.hoverBin = i;
  drawChart();
  tip.hidden = false;
  tip.replaceChildren(h('b', null, binLabel(b.t)), `↓ ${size(b.in)}   ↑ ${size(b.out)}`);
  const w = tip.offsetWidth;
  tip.style.left = `${Math.max(0, Math.min(canvas.clientWidth - w, x + 12))}px`;
}

/* Struttura */
function build() {
  $('periods').replaceChildren(...Object.entries(PERIODS).map(([id, p]) => h('button', {
    'aria-pressed': id === state.period ? 'true' : 'false', 'data-period': id,
    onclick: (e) => {
      state.period = id;
      for (const b of $('periods').children) b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false');
      state.hoverBin = undefined;
      refresh();
    },
  }, p.label)));
  const metric = h('div', { class: 'seg', role: 'group', 'aria-label': tt('Direction') }, [['all', tt('Total')], ['in', tt('Received')], ['out', tt('Sent')]].map(([id, label]) => h('button', {
    'aria-pressed': id === 'all' ? 'true' : 'false',
    onclick: (e) => {
      state.metric = id;
      for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false');
      refresh();
    },
  }, label)));
  const canvas = h('canvas', { role: 'img', 'aria-label': tt('Traffic map by app. The same content is in the list.') });
  const center = h('button', { class: 'center', id: 'center', onclick: () => { if (state.path.length) go(state.path.slice(0, -1)); } },
    h('span', { class: 'c-name', id: 'cName' }), h('span', { class: 'c-size', id: 'cSize' }), h('span', { class: 'c-split', id: 'cSplit' }));
  view.replaceChildren(h('div', { class: 'app' },
    h('div', { class: 'alert', id: 'alert', hidden: true }, h('span', null, NL_OS === 'Linux' ? tt('The ss command isn\'t responding: install the iproute2 package.') : tt('macOS answered in an unexpected format: traffic can\'t be read.')),
      h('button', { class: 'quiet', onclick: openDiag }, tt('Open diagnostics'))),
    h('aside', { class: 'pane' },
      h('div', { class: 'pane-head' }, h('strong', { id: 'paneTitle' }), metric),
      h('input', { class: 'search', type: 'search', placeholder: tt('Filter by name'), 'aria-label': tt('Filter by name'), oninput: (e) => { state.filter = e.target.value.toLowerCase(); renderRows(current()); } }),
      h('div', { class: 'rows', id: 'rows' }),
      h('div', { class: 'actions', id: 'actions', hidden: true })),
    h('div', { class: 'stage' }, canvas, center, h('div', { class: 'empty', id: 'stageEmpty', hidden: true })),
    h('section', { class: 'flow', 'aria-label': tt('Trend') },
      h('div', { class: 'rates' },
        h('div', { class: 'rate' }, h('i', { style: 'background:var(--rx)' }), h('strong', { id: 'rxRate' }, tt('0 bytes/s')), h('span', null, tt('Received, now'))),
        h('div', { class: 'rate' }, h('i', { style: 'background:var(--tx)' }), h('strong', { id: 'txRate' }, tt('0 bytes/s')), h('span', null, tt('Sent, now')))),
      h('div', { class: 'chart', onmousemove: chartHover, onmouseleave: () => { $('tip').hidden = true; state.hoverBin = undefined; drawChart(); } },
        h('canvas', { id: 'chart', role: 'img' }), h('div', { class: 'tip', id: 'tip', hidden: true })))));
  state.map = new RadialMap(canvas, {
    onHover: (arc) => {
      renderCenter(arc);
      document.querySelectorAll('.row.hover').forEach((r) => r.classList.remove('hover'));
      if (arc?.path) $('rows').querySelector(`[data-path="${CSS.escape(arc.path)}"]`)?.classList.add('hover');
    },
    onClick: (arc) => {
      if (!arc.path) return;
      if (arc.node.d) go(arc.path.split(SEP).slice(1));
      else { state.sel = arc.path; state.map.selected = arc.path; state.map.draw(); }
    },
    onContext: () => {},
  });
  state.map.onMeasure = (d) => { center.style.width = center.style.height = `${d - 8}px`; };
  state.map.measure();
  new ResizeObserver(drawChart).observe($('chart'));
}

/* Diagnostica */
function openDiag() {
  const d = state.sampler.diag;
  const report = JSON.stringify({ ...d, raw: undefined, version: NL_APPVERSION }, null, 1) + '\n\n' + d.raw;
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, tt('Diagnostics')), h('p', null, tt('What the system returned in the latest sample. The history stays on this computer and is never sent to anyone.'))),
    h('div', { class: 'body' },
      h('dl', null,
        h('dt', null, tt('Samples read')), h('dd', null, num.format(d.samples)),
        h('dt', null, tt('Format recognized')), h('dd', null, d.header ? tt('Yes') : tt('No')),
        h('dt', null, tt('Lines and connections')), h('dd', null, tt("{0} lines, {1} connections", num.format(d.rows), num.format(d.connections))),
        h('dt', null, tt('Lines ignored')), h('dd', null, num.format(d.skipped)),
        h('dt', null, tt('Exit code')), h('dd', null, String(d.exitCode)),
        d.error ? h('dt', null, tt('Message')) : '', d.error ? h('dd', null, d.error) : ''),
      h('pre', null, d.raw || tt('No data yet.'))),
    h('footer', null,
      h('button', { class: 'danger', onclick: confirmClear }, tt('Clear history')),
      h('div', null,
        h('button', { class: 'ghost', onclick: async () => { await Neutralino.clipboard.writeText(report); toast(tt('Data copied')); } }, tt('Copy data')),
        h('button', { class: 'primary', onclick: () => dialog.close() }, tt('Close'))))));
  if (!dialog.open) dialog.showModal();
}
function confirmClear() {
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, tt('Clear the history?')), h('p', null, tt('Deletes the traffic data collected so far on this computer. This can\'t be undone.'))),
    h('footer', null, h('span'), h('div', null,
      h('button', { class: 'ghost', onclick: () => dialog.close() }, tt('Cancel')),
      h('button', { class: 'danger', onclick: async () => { await state.sampler.clearHistory(); dialog.close(); toast(tt('History cleared')); } }, tt('Clear history'))))));
}

(async () => {
  if (!SUPPORTED) {
    for (const id of ['periods', 'pause', 'diag']) $(id).hidden = true;
    view.replaceChildren(h('div', { class: 'notsupported' }, h('div', null, h('h1', null, tt('Correnti runs on macOS and Linux')), h('p', null, tt('This version reads traffic with tools that don\'t exist on this system.')))));
    Neutralino.events.on('windowClose', () => Neutralino.app.exit());
    return;
  }
  build();
  state.sampler = new Sampler(refresh);
  beforeReload(() => state.sampler.stop());
  Neutralino.events.on('windowClose', async () => {
    await state.sampler.stop().catch(() => {});
    Neutralino.app.exit();
  });
  $('diag').onclick = openDiag;
  $('pause').onclick = () => {
    const next = !state.sampler.paused;
    state.sampler.setPaused(next);
    $('pause').textContent = tx(next ? tt('Resume') : tt('Pause'));
    $('pause').setAttribute('aria-pressed', next ? 'true' : 'false');
    refresh();
  };
  refresh(true);
  await state.sampler.start();
  refresh();
})().catch((err) => toast(String(err.message || err)));
