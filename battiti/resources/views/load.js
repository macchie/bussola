import { t as tt, tx, locale } from '../shared/i18n.js';
import { RadialMap } from '../map-load.js';
import { Sampler, PERIODS } from '../core/load/sampler.js';
import { buildTree, SEP, ROOT } from '../core/load/store.js';
import { reveal } from '../core/load/platform.js';

export function createLoad() {
  const $ = (id) => document.getElementById(id);
const view = $('view');
const dialog = $('dialog');
const state = { period: 'live', metric: 'cpu', path: [], sel: null, filter: '', tree: null, map: null, sampler: null, bins: [], ticks: 0 };

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
const pct = (x) => {
  const v = x * 100;
  return `${v > 0 && v < 0.1 ? '<0,1' : new Intl.NumberFormat(locale(), { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v)} %`;
};
const value = (n) => (state.metric === 'cpu' ? pct(n.s) : size(n.s));
const other = (n) => (state.metric === 'cpu' ? tt("Memory {0}", size(n.mem)) : `CPU ${pct(n.cpu)}`);
function toast(text) {
  const el = h('div', { class: 'toast' }, text);
  $('toasts').append(el);
  setTimeout(() => el.remove(), 3500);
}
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();



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
  state.tree = buildTree(store.averages(state.period, now), state.metric);
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
  $('stageEmpty').textContent = tx(state.sampler.paused ? tt('Monitoring paused.')
    : state.sampler.diag.samples < 2 ? tt('Reading processes…') : tt('No data in this period.'));
  const d = state.sampler.diag;
  const shared = state.metric === 'mem' && state.sampler.latest.used && state.tree.mem > state.sampler.latest.used * 1.02;
  $('notice').textContent = tx(shared ? tt('The process total exceeds memory in use because some of it is shared between them.') : '');
  $('alert').hidden = !(d.samples >= 2 && !d.processes) && !(d.samples === 0 && d.exitCode !== null && d.exitCode !== 0);
}
function go(names) {
  state.path = names;
  state.sel = null;
  refresh(true);
}
function renderCrumbs() {
  const parts = [h('button', { onclick: () => go([]) }, tt('Whole system'))];
  state.path.forEach((name, i) => parts.push(h('i', null, '/'), h('button', { onclick: () => go(state.path.slice(0, i + 1)) }, name)));
  $('crumbs').replaceChildren(...parts);
}
function renderCenter(arc) {
  const node = arc ? (arc.kind === 'other' ? { n: tt('Smaller items'), s: arc.node.s } : arc.node) : current();
  $('cName').textContent = tx(node.n);
  $('cSize').textContent = tx(value(node));
  $('cSplit').textContent = tx(node.mem !== undefined ? other(node) : '');
  $('center').classList.toggle('up', state.path.length > 0);
}
const metaOf = (n) => {
  const c = Math.round(n.count);
  return c > 0 ? (c === 1 ? tt('1 process') : tt("{0} processes", num.format(c))) : tt('Not attributed to a process');
};
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
      ondblclick: () => { if (n.d) go([...state.path, n.n]); },
      onmouseenter: () => state.map.hoverPath(path),
      onmouseleave: () => state.map.hoverPath(null),
    },
    h('div', { class: 'bar', style: `width:${n.s / max * 100}%;background:${color}` }),
    h('span', { class: 'dot', style: `background:${color}` }),
    h('div', { style: 'min-width:0' }, h('div', { class: 'name' }, n.n), h('div', { class: 'meta' }, metaOf(n))),
    h('div', null, h('div', { class: 'size' }, value(n)), h('div', { class: 'split' }, other(n))),
    h('span', { class: 'go', 'aria-hidden': 'true' }, n.d ? '›' : ''));
  });
  const box = $('rows');
  const top = box.scrollTop;
  box.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, state.filter ? tt('No items with this name.') : tt('You\'ll find apps here, from heaviest to lightest.'))]));
  box.scrollTop = top;
  $('paneTitle').textContent = tx(`${value(node)} ${state.metric === 'mem' ? tt('in processes, ') : ''}${tx(PERIODS[state.period].phrase)}`);
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
  const target = n.kind === 'app' && state.sampler.bundles.get(n.n);
  box.replaceChildren(
    n.d ? h('button', { class: 'quiet', onclick: () => go([...state.path, n.n]) }, tt('Open')) : '',
    target ? h('button', { class: 'quiet', onclick: async () => { if (!await reveal(target).catch(() => false)) toast(tt('No file manager available')); } }, tt('Show in folder')) : '',
    h('button', { class: 'quiet', onclick: async () => { await Neutralino.clipboard.writeText(n.n); toast(tt('Name copied')); } }, tt('Copy name')),
  );
}
function renderRates() {
  const { machine, latest } = state.sampler;
  $('cpuNow').textContent = tx(pct(latest.cpu));
  $('memNow').textContent = tx(latest.total ? tt("{0} of {1}", size(latest.used), size(latest.total)) : '—');
  $('cpuSub').textContent = tt('CPU, {0} threads', machine.cores);
  $('memSub').textContent = tx(latest.swap ? tt("Memory, swap {0}", size(latest.swap)) : tt('Memory'));
}

/* Chart: CPU on top, memory below, both from 0 to 100% */
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
  const step = plotW / (bins.length || 1);
  const barW = Math.max(1, step - 2);
  ctx.font = '12px Plex, system-ui, sans-serif';
  ctx.fillStyle = css('--muted');
  ctx.textBaseline = 'top';
  ctx.fillText(tx('100 %'), 0, 0);
  ctx.textBaseline = 'bottom';
  ctx.fillText(tx('100 %'), 0, plotH);
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
  const scale = mid - 2;
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
  const last = [...bins].reverse().find((b) => b.w);
  canvas.setAttribute('aria-label', tx(last ? tt("Trend: CPU {0}, memory {1}", pct(last.cpu), pct(last.mem)) : tt('CPU and memory trend')));
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
  tip.replaceChildren(h('b', null, binLabel(b.t)), b.w ? tt("CPU {0}   Memory {1}", pct(b.cpu), pct(b.mem)) : tt('No data'));
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
  const metric = h('div', { class: 'seg', role: 'group', 'aria-label': tt('Measure') }, [['cpu', 'CPU'], ['mem', tt('Memory')]].map(([id, label]) => h('button', {
    'aria-pressed': id === 'cpu' ? 'true' : 'false',
    onclick: (e) => {
      state.metric = id;
      for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false');
      refresh();
    },
  }, label)));
  const canvas = h('canvas', { role: 'img', 'aria-label': tt('CPU and memory map by app. The same content is in the list.') });
  const center = h('button', { class: 'center', id: 'center', onclick: () => { if (state.path.length) go(state.path.slice(0, -1)); } },
    h('span', { class: 'c-name', id: 'cName' }), h('span', { class: 'c-size', id: 'cSize' }), h('span', { class: 'c-split', id: 'cSplit' }));
  view.replaceChildren(h('div', { class: 'app' },
    h('div', { class: 'alert', id: 'alert', hidden: true }, h('span', null, tt('The system answered in an unexpected format: processes can\'t be read.')),
      h('button', { class: 'quiet', onclick: openDiag }, tt('Open diagnostics'))),
    h('aside', { class: 'pane' },
      h('div', { class: 'pane-head' }, h('strong', { id: 'paneTitle' }), metric),
      h('input', { class: 'search', type: 'search', placeholder: tt('Filter by name'), 'aria-label': tt('Filter by name'), oninput: (e) => { state.filter = e.target.value.toLowerCase(); renderRows(current()); } }),
      h('div', { class: 'rows', id: 'rows' }),
      h('div', { class: 'actions', id: 'actions', hidden: true })),
    h('div', { class: 'stage' }, canvas, center, h('div', { class: 'empty', id: 'stageEmpty', hidden: true }), h('div', { class: 'notice', id: 'notice' })),
    h('section', { class: 'flow', 'aria-label': tt('Trend') },
      h('div', { class: 'rates' },
        h('div', { class: 'rate' }, h('i', { style: 'background:var(--cpu)' }), h('strong', { id: 'cpuNow' }, '—'), h('span', { id: 'cpuSub' }, 'CPU')),
        h('div', { class: 'rate' }, h('i', { style: 'background:var(--ram)' }), h('strong', { id: 'memNow' }, '—'), h('span', { id: 'memSub' }, tt('Memory')))),
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
  const { machine } = state.sampler;
  const report = JSON.stringify({ ...d, raw: undefined, machine, os: NL_OS, version: NL_APPVERSION }, null, 1) + '\n\n' + d.raw;
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, tt('Diagnostics')), h('p', null, tt('What the system returned in the latest sample. The history stays on this computer and is never sent to anyone.'))),
    h('div', { class: 'body' },
      h('dl', null,
        h('dt', null, tt('Processor')), h('dd', null, tt("{0}, {1} threads", machine.model || tt('Unknown'), machine.cores)),
        h('dt', null, tt('Samples read')), h('dd', null, num.format(d.samples)),
        h('dt', null, tt('Processes')), h('dd', null, num.format(d.processes)),
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

  async function mount() {
    build();
    state.sampler = new Sampler(refresh);
    refresh(true);
    await state.sampler.start();
    refresh();
  }
  async function unmount() { await state.sampler?.stop().catch(() => {}); }
  function pause() {
    const next = !state.sampler.paused;
    state.sampler.setPaused(next);
    $('pause').textContent = tx(next ? tt('Resume') : tt('Pause'));
    $('pause').setAttribute('aria-pressed', next ? 'true' : 'false');
    refresh();
  }
  return { id: 'load', label: tt('Load'), supported: true, mount, unmount, pause, diag: openDiag, refresh };
}
