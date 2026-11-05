import { t as tt, tx, locale } from './shared/i18n.js';
import { saveTheme, beforeReload } from './shared/settings.js';
import { RadialMap } from './map.js';
import { Sampler, PERIODS } from './core/sampler.js';
import { SEP, ROOT } from './core/store.js';
import { reveal } from './core/platform.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const dialog = $('dialog');
const state = { period: 'live', metric: 'error', path: [], sel: null, filter: '', tree: null, map: null, sampler: null, bins: [], ticks: 0 };

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
const KINDS = {
  error: { tab: tt('Errors'), one: tt('error'), many: tt('errors'), empty: tt('No errors in this period.') },
  warn: { tab: tt('Warnings'), one: tt('warning'), many: tt('warnings'), empty: tt('No warnings in this period.') },
  event: { tab: tt('Shutdowns and restarts'), one: tt('shutdown or restart'), many: tt('shutdowns and restarts'), empty: tt('No shutdowns or restarts in this period.') },
};
const label = (n, kind = state.metric) => `${num.format(n)} ${n === 1 ? KINDS[kind].one : KINDS[kind].many}`;
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
  state.tree = state.sampler.tree(state.period, now, state.metric);
  const data = viewData();
  if (navigated) state.map.setView(data); else state.map.update(data);
  state.bins = store.timeline(state.period, now);
  renderCrumbs();
  renderCenter(state.map.hover);
  renderRows(data.node);
  renderRates();
  drawChart();
  renderActions();
  const empty = !state.tree.c.length;
  $('stageEmpty').hidden = !empty;
  $('center').hidden = empty;
  $('stageEmpty').textContent = tx(state.sampler.paused ? tt('Monitoring paused.')
    : state.sampler.diag.samples < 1 ? tt('Reading the log…') : KINDS[state.metric].empty);
  const d = state.sampler.diag;
  const note = state.metric === 'warn' && NL_OS === 'Darwin' ? tt('macOS only distinguishes errors and faults: warnings aren\'t read.') : state.sampler.diag.truncated ? tt('Too many events in one reading: the counts are partial.')
    : state.sampler.diag.access === 'partial' ? tt('The system only shows this user part of the log.') : '';
  $('notice').textContent = tx(note);
  $('alert').hidden = d.access !== 'failed';
}
function go(names) {
  state.path = names;
  state.sel = null;
  refresh(true);
}
function renderCrumbs() {
  const parts = [h('button', { onclick: () => go([]) }, tt('Whole log'))];
  state.path.forEach((name, i) => parts.push(h('i', null, '/'), h('button', { onclick: () => go(state.path.slice(0, i + 1)) }, name)));
  $('crumbs').replaceChildren(...parts);
}
function renderCenter(arc) {
  const node = arc ? (arc.kind === 'other' ? { n: tt('Smaller items'), s: arc.node.s, kind: 'other' } : arc.node) : current();
  $('cName').textContent = tx(node.n);
  $('cSize').textContent = tx(num.format(Math.round(node.s)));
  $('cSplit').textContent = tx(KINDS[state.metric][Math.round(node.s) === 1 ? 'one' : 'many']);
  $('center').classList.toggle('up', state.path.length > 0);
}
const metaOf = (n) => (n.kind === 'item' ? (n.last ? tt("Last: {0}", when(n.last)) : '') : label(n.s));
const when = (t) => new Date(t).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const nameOf = (n) => n.n;
function renderRows(node) {
  const list = (node.c || []).filter((c) => !state.filter || tx(c.n).toLowerCase().includes(state.filter));
  const max = list.length && list[0].s ? list[0].s : 1;
  const base = pathOf(state.path);
  const rows = list.map((n) => {
    const path = base + SEP + n.n;
    const color = state.map.colorOf(path) || 'var(--muted)';
    return h('button', {
      class: `row${state.sel === path ? ' sel' : ''}`, 'data-path': path, title: n.n,
      onclick: () => { state.sel = path; state.map.selected = path; state.map.draw(); renderRows(current()); renderActions(); },
      ondblclick: () => { if (n.d) go([...state.path, n.n]); else openEvent(n); },
      onmouseenter: () => state.map.hoverPath(path),
      onmouseleave: () => state.map.hoverPath(null),
    },
    h('div', { class: 'bar', style: `width:${n.s / max * 100}%;background:${color}` }),
    h('span', { class: 'dot', style: `background:${color}` }),
    h('div', { style: 'min-width:0' }, h('div', { class: 'name' }, nameOf(n)), h('div', { class: 'meta' }, metaOf(n))),
    h('div', { class: 'size' }, num.format(Math.round(n.s))),
    h('span', { class: 'go', 'aria-hidden': 'true' }, n.d ? '›' : ''));
  });
  const box = $('rows');
  const top = box.scrollTop;
  box.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, state.filter ? tt('No items with this name.') : KINDS[state.metric].empty)]));
  box.scrollTop = top;
  $('paneTitle').textContent = tx(`${label(Math.round(node.s))} ${tx(PERIODS[state.period].phrase)}`);
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
  const item = n.kind === 'item';
  box.replaceChildren(
    n.d ? h('button', { class: 'quiet', onclick: () => go([...state.path, n.n]) }, tt('Open')) : '',
    item ? h('button', { class: 'quiet', onclick: () => openEvent(n) }, tt('Details')) : '',
    h('button', { class: 'quiet', onclick: async () => { await Neutralino.clipboard.writeText(n.sample || n.n); toast(tt('Copied')); } }, tt('Copy')),
  );
}
function openEvent(n) {
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, state.path[0] || tt('Event')), h('p', null, tt(n.s === 1 ? '{0} time {1}' : '{0} times {1}', num.format(n.s), PERIODS[state.period].phrase))),
    h('div', { class: 'body' },
      h('dl', null,
        n.first ? h('dt', null, tt('First time')) : '', n.first ? h('dd', null, when(n.first)) : '',
        n.last ? h('dt', null, tt('Last time')) : '', n.last ? h('dd', null, when(n.last)) : ''),
      h('pre', { style: 'white-space:pre-wrap' }, n.sample || n.n)),
    h('footer', null, h('span'), h('div', null,
      h('button', { class: 'ghost', onclick: async () => { await Neutralino.clipboard.writeText(n.sample || n.n); toast(tt('Copied')); } }, tt('Copy message')),
      h('button', { class: 'primary', onclick: () => dialog.close() }, tt('Close'))))));
  if (!dialog.open) dialog.showModal();
}
function renderRates() {
  const t = state.sampler.lastHour(Date.now());
  $('cpuNow').textContent = tx(num.format(t.errors));
  $('memNow').textContent = tx(num.format(t.warns));
}

/* Chart: errors and shutdowns on top, warnings below, same scale */
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
  const leftW = 44;
  const plotW = rect.width - leftW;
  const plotH = rect.height - labelH;
  const mid = plotH / 2;
  const peak = Math.max(1, ...bins.map((b) => Math.max(b.cpu, b.mem)));
  const step = plotW / (bins.length || 1);
  const barW = Math.max(1, step - 2);
  ctx.font = '12px Plex, system-ui, sans-serif';
  ctx.fillStyle = css('--muted');
  ctx.textBaseline = 'top';
  ctx.fillText(tx(num.format(Math.ceil(peak))), 0, 0);
  ctx.textBaseline = 'bottom';
  ctx.fillText(tx(num.format(Math.ceil(peak))), 0, plotH);
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
  const scale = (mid - 2) / peak;
  ctx.fillStyle = css('--cpu');
  bins.forEach((b, i) => bar(leftW + i * step, b.cpu * scale, true));
  ctx.fillStyle = css('--ram');
  bins.forEach((b, i) => bar(leftW + i * step, b.mem * scale, false));
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
  canvas.setAttribute('aria-label', tx(tt('Errors and warnings trend')));
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
  tip.replaceChildren(h('b', null, binLabel(b.t)), b.w ? tt("Errors {0}   Warnings {1}", num.format(b.cpu), num.format(b.mem)) : tt('No data'));
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
  const metric = h('div', { class: 'seg', role: 'group', 'aria-label': tt('Measure') }, Object.entries(KINDS).map(([id, { tab }]) => h('button', {
    'aria-pressed': id === 'error' ? 'true' : 'false',
    onclick: (e) => {
      state.metric = id;
      for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false');
      state.sel = null;
      state.path = [];
      refresh(true);
    },
  }, tab)));
  const canvas = h('canvas', { role: 'img', 'aria-label': tt('Events map by app. The same content is in the list.') });
  const center = h('button', { class: 'center', id: 'center', onclick: () => { if (state.path.length) go(state.path.slice(0, -1)); } },
    h('span', { class: 'c-name', id: 'cName' }), h('span', { class: 'c-size', id: 'cSize' }), h('span', { class: 'c-split', id: 'cSplit' }));
  view.replaceChildren(h('div', { class: 'app' },
    h('div', { class: 'alert', id: 'alert', hidden: true }, h('span', null, tt('The system log can\'t be read: open diagnostics to see why.')),
      h('button', { class: 'quiet', onclick: openDiag }, tt('Open diagnostics'))),
    h('aside', { class: 'pane' },
      h('div', { class: 'pane-head' }, h('strong', { id: 'paneTitle' }), metric),
      h('input', { class: 'search', type: 'search', placeholder: tt('Filter by name'), 'aria-label': tt('Filter by name'), oninput: (e) => { state.filter = e.target.value.toLowerCase(); renderRows(current()); } }),
      h('div', { class: 'rows', id: 'rows' }),
      h('div', { class: 'actions', id: 'actions', hidden: true })),
    h('div', { class: 'stage' }, canvas, center, h('div', { class: 'empty', id: 'stageEmpty', hidden: true }), h('div', { class: 'notice', id: 'notice' })),
    h('section', { class: 'flow', 'aria-label': tt('Trend') },
      h('div', { class: 'rates' },
        h('div', { class: 'rate' }, h('i', { style: 'background:var(--cpu)' }), h('strong', { id: 'cpuNow' }, '—'), h('span', null, tt('Errors in the last hour'))),
        h('div', { class: 'rate' }, h('i', { style: 'background:var(--ram)' }), h('strong', { id: 'memNow' }, '—'), h('span', null, tt('Warnings in the last hour')))),
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
  const report = JSON.stringify({ ...d, raw: undefined, os: NL_OS, version: NL_APPVERSION }, null, 1) + '\n\n' + d.raw;
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, tt('Diagnostics')), h('p', null, tt('What the system returned in the latest reading. Messages may contain file or account names: they stay on this computer and are never sent to anyone.'))),
    h('div', { class: 'body' },
      h('dl', null,
        h('dt', null, tt('Samples read')), h('dd', null, num.format(d.samples)),
        h('dt', null, tt('Events in the latest reading')), h('dd', null, num.format(d.processes)),
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
    h('header', null, h('h2', null, tt('Clear the history?')), h('p', null, tt('Deletes the data collected so far on this computer. This can\'t be undone.'))),
    h('footer', null, h('span'), h('div', null,
      h('button', { class: 'ghost', onclick: () => dialog.close() }, tt('Cancel')),
      h('button', { class: 'danger', onclick: async () => { await state.sampler.clearHistory(); dialog.close(); toast(tt('History cleared')); } }, tt('Clear history'))))));
}

(async () => {
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
