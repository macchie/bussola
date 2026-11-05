import { t as tt, tx, locale } from './comune/i18n.js';
import { salvaTema, primaDiRicaricare } from './comune/impostazioni.js';
import { RadialMap } from './map.js';
import { Sampler, PERIODS } from './core/sampler.js';
import { buildTree, SEP, ROOT } from './core/store.js';
import { reveal } from './core/platform.js';

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
  if (!b) return tt('0 byte');
  const units = [tt('byte'), tt('kB'), tt('MB'), tt('GB'), tt('TB')];
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1000)));
  return `${i === 0 ? Math.round(b) : dec.format(b / 1000 ** i)} ${units[i]}`;
}
const pct = (x) => {
  const v = x * 100;
  return `${v > 0 && v < 0.1 ? '<0,1' : new Intl.NumberFormat(locale(), { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v)} %`;
};
const value = (n) => (state.metric === 'cpu' ? pct(n.s) : size(n.s));
const other = (n) => (state.metric === 'cpu' ? tt("Memoria {0}", size(n.mem)) : `CPU ${pct(n.cpu)}`);
function toast(text) {
  const el = h('div', { class: 'toast' }, text);
  $('toasts').append(el);
  setTimeout(() => el.remove(), 3500);
}
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* Tema */
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
  salvaTema(next);
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
  $('stageEmpty').textContent = tx(state.sampler.paused ? tt('Rilevamento in pausa.')
    : state.sampler.diag.samples < 2 ? tt('Lettura dei processi in corso…') : tt('Nessun dato in questo periodo.'));
  const d = state.sampler.diag;
  const shared = state.metric === 'mem' && state.sampler.latest.used && state.tree.mem > state.sampler.latest.used * 1.02;
  $('notice').textContent = tx(shared ? tt('La somma dei processi supera la memoria in uso perché una parte è condivisa tra loro.') : '');
  $('alert').hidden = !(d.samples >= 2 && !d.processes) && !(d.samples === 0 && d.exitCode !== null && d.exitCode !== 0);
}
function go(names) {
  state.path = names;
  state.sel = null;
  refresh(true);
}
function renderCrumbs() {
  const parts = [h('button', { onclick: () => go([]) }, tt('Tutto il sistema'))];
  state.path.forEach((name, i) => parts.push(h('i', null, '/'), h('button', { onclick: () => go(state.path.slice(0, i + 1)) }, name)));
  $('crumbs').replaceChildren(...parts);
}
function renderCenter(arc) {
  const node = arc ? (arc.kind === 'other' ? { n: tt('Elementi minori'), s: arc.node.s } : arc.node) : current();
  $('cName').textContent = tx(node.n);
  $('cSize').textContent = tx(value(node));
  $('cSplit').textContent = tx(node.mem !== undefined ? other(node) : '');
  $('center').classList.toggle('up', state.path.length > 0);
}
const metaOf = (n) => {
  const c = Math.round(n.count);
  return c > 0 ? (c === 1 ? tt('1 processo') : tt("{0} processi", num.format(c))) : tt('Non attribuita a un processo');
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
  box.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, state.filter ? tt('Nessun elemento con questo nome.') : tt('Qui troverai le app, dalla più pesante alla più leggera.'))]));
  box.scrollTop = top;
  $('paneTitle').textContent = tx(`${value(node)} ${state.metric === 'mem' ? tt('nei processi, ') : ''}${tx(PERIODS[state.period].phrase)}`);
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
    n.d ? h('button', { class: 'quiet', onclick: () => go([...state.path, n.n]) }, tt('Apri')) : '',
    target ? h('button', { class: 'quiet', onclick: async () => { if (!await reveal(target).catch(() => false)) toast(tt('Nessun gestore file disponibile')); } }, tt('Mostra nella cartella')) : '',
    h('button', { class: 'quiet', onclick: async () => { await Neutralino.clipboard.writeText(n.n); toast(tt('Nome copiato')); } }, tt('Copia nome')),
  );
}
function renderRates() {
  const { machine, latest } = state.sampler;
  $('cpuNow').textContent = tx(pct(latest.cpu));
  $('memNow').textContent = tx(latest.total ? tt("{0} di {1}", size(latest.used), size(latest.total)) : '—');
  $('cpuSub').textContent = tt('CPU, {0} thread', machine.cores);
  $('memSub').textContent = tx(latest.swap ? tt("Memoria, swap {0}", size(latest.swap)) : tt('Memoria'));
}

/* Grafico: CPU sopra, memoria sotto, entrambe da 0 a 100% */
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
  canvas.setAttribute('aria-label', tx(last ? tt("Andamento: CPU {0}, memoria {1}", pct(last.cpu), pct(last.mem)) : tt('Andamento di CPU e memoria')));
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
  tip.replaceChildren(h('b', null, binLabel(b.t)), b.w ? tt("CPU {0}   Memoria {1}", pct(b.cpu), pct(b.mem)) : tt('Nessun dato'));
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
  const metric = h('div', { class: 'seg', role: 'group', 'aria-label': tt('Misura') }, [['cpu', 'CPU'], ['mem', tt('Memoria')]].map(([id, label]) => h('button', {
    'aria-pressed': id === 'cpu' ? 'true' : 'false',
    onclick: (e) => {
      state.metric = id;
      for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false');
      refresh();
    },
  }, label)));
  const canvas = h('canvas', { role: 'img', 'aria-label': tt('Mappa di CPU e memoria per app. Lo stesso contenuto è nell\'elenco.') });
  const center = h('button', { class: 'center', id: 'center', onclick: () => { if (state.path.length) go(state.path.slice(0, -1)); } },
    h('span', { class: 'c-name', id: 'cName' }), h('span', { class: 'c-size', id: 'cSize' }), h('span', { class: 'c-split', id: 'cSplit' }));
  view.replaceChildren(h('div', { class: 'app' },
    h('div', { class: 'alert', id: 'alert', hidden: true }, h('span', null, tt('Il sistema ha risposto in un formato inatteso: i processi non si possono leggere.')),
      h('button', { class: 'quiet', onclick: openDiag }, tt('Apri diagnostica'))),
    h('aside', { class: 'pane' },
      h('div', { class: 'pane-head' }, h('strong', { id: 'paneTitle' }), metric),
      h('input', { class: 'search', type: 'search', placeholder: tt('Filtra per nome'), 'aria-label': tt('Filtra per nome'), oninput: (e) => { state.filter = e.target.value.toLowerCase(); renderRows(current()); } }),
      h('div', { class: 'rows', id: 'rows' }),
      h('div', { class: 'actions', id: 'actions', hidden: true })),
    h('div', { class: 'stage' }, canvas, center, h('div', { class: 'empty', id: 'stageEmpty', hidden: true }), h('div', { class: 'notice', id: 'notice' })),
    h('section', { class: 'flow', 'aria-label': tt('Andamento') },
      h('div', { class: 'rates' },
        h('div', { class: 'rate' }, h('i', { style: 'background:var(--cpu)' }), h('strong', { id: 'cpuNow' }, '—'), h('span', { id: 'cpuSub' }, 'CPU')),
        h('div', { class: 'rate' }, h('i', { style: 'background:var(--ram)' }), h('strong', { id: 'memNow' }, '—'), h('span', { id: 'memSub' }, tt('Memoria')))),
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
    h('header', null, h('h2', null, tt('Diagnostica')), h('p', null, tt('Quello che il sistema ha restituito nell\'ultimo campione. Lo storico resta su questo computer e non viene inviato a nessuno.'))),
    h('div', { class: 'body' },
      h('dl', null,
        h('dt', null, tt('Processore')), h('dd', null, tt("{0}, {1} thread", machine.model || tt('Sconosciuto'), machine.cores)),
        h('dt', null, tt('Campioni letti')), h('dd', null, num.format(d.samples)),
        h('dt', null, tt('Processi')), h('dd', null, num.format(d.processes)),
        h('dt', null, tt('Codice di uscita')), h('dd', null, String(d.exitCode)),
        d.error ? h('dt', null, tt('Messaggio')) : '', d.error ? h('dd', null, d.error) : ''),
      h('pre', null, d.raw || tt('Nessun dato ancora.'))),
    h('footer', null,
      h('button', { class: 'danger', onclick: confirmClear }, tt('Cancella storico')),
      h('div', null,
        h('button', { class: 'ghost', onclick: async () => { await Neutralino.clipboard.writeText(report); toast(tt('Dati copiati')); } }, tt('Copia dati')),
        h('button', { class: 'primary', onclick: () => dialog.close() }, tt('Chiudi'))))));
  if (!dialog.open) dialog.showModal();
}
function confirmClear() {
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, tt('Cancellare lo storico?')), h('p', null, tt('Elimina i dati raccolti finora su questo computer. L\'azione non si può annullare.'))),
    h('footer', null, h('span'), h('div', null,
      h('button', { class: 'ghost', onclick: () => dialog.close() }, tt('Annulla')),
      h('button', { class: 'danger', onclick: async () => { await state.sampler.clearHistory(); dialog.close(); toast(tt('Storico cancellato')); } }, tt('Cancella storico'))))));
}

(async () => {
  build();
  state.sampler = new Sampler(refresh);
  primaDiRicaricare(() => state.sampler.stop());
  Neutralino.events.on('windowClose', async () => {
    await state.sampler.stop().catch(() => {});
    Neutralino.app.exit();
  });
  $('diag').onclick = openDiag;
  $('pause').onclick = () => {
    const next = !state.sampler.paused;
    state.sampler.setPaused(next);
    $('pause').textContent = tx(next ? tt('Riprendi') : tt('Pausa'));
    $('pause').setAttribute('aria-pressed', next ? 'true' : 'false');
    refresh();
  };
  refresh(true);
  await state.sampler.start();
  refresh();
})().catch((err) => toast(String(err.message || err)));
