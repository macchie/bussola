import { t as tt, tx, locale } from './comune/i18n.js';
import { salvaTema, primaDiRicaricare } from './comune/impostazioni.js';
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
  if (!b) return tt('0 byte');
  const units = [tt('byte'), tt('kB'), tt('MB'), tt('GB'), tt('TB')];
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
  $('stageEmpty').textContent = tx(state.sampler.paused ? tt('Rilevamento in pausa.')
    : state.period === 'live' && state.sampler.diag.samples < 2 ? tt('In ascolto del traffico…') : tt('Nessun traffico in questo periodo.'));
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
  const parts = [h('button', { onclick: () => go([]) }, tt('Tutto il traffico'))];
  state.path.forEach((name, i) => parts.push(h('i', null, '/'), h('button', { onclick: () => go(state.path.slice(0, i + 1)) }, name)));
  $('crumbs').replaceChildren(...parts);
}
function renderCenter(arc) {
  const node = arc ? (arc.kind === 'other' ? { n: tt('Elementi minori'), s: arc.node.s } : arc.node) : current();
  $('cName').textContent = tx(node.n);
  $('cSize').textContent = tx(size(node.s));
  $('cSplit').textContent = tx(node.in !== undefined ? `↓ ${size(node.in)}\n↑ ${size(node.out)}` : '');
  $('center').classList.toggle('up', state.path.length > 0);
}
const metaOf = (n) => (n.n === 'Traffico non attribuito' ? tt('UDP, QUIC o connessioni brevi') : n.kind === 'app' && n.processes > 1 ? tt("{0} processi", num.format(n.processes))
  : n.d ? `${num.format(n.c.length)} ${n.c.length === 1 ? tt('destinazione') : tt('destinazioni')}` : n.kind === 'dest' ? tt('Destinazione') : '');
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
  box.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, state.filter ? tt('Nessun elemento con questo nome.') : tt('Quando un\'app userà la rete la troverai qui, dalla più attiva alla meno attiva.'))]));
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
    n.d ? h('button', { class: 'quiet', onclick: () => go([...state.path, n.n]) }, tt('Apri')) : '',
    reveal ? h('button', { class: 'quiet', onclick: async () => { const r = await run(reveal); if (r.code !== 0) toast(tt('Nessun gestore file disponibile')); } }, NL_OS === 'Darwin' ? tt('Mostra nel Finder') : tt('Mostra nella cartella')) : '',
    h('button', { class: 'quiet', onclick: async () => { await Neutralino.clipboard.writeText(n.n); toast(tt('Nome copiato')); } }, tt('Copia nome')),
  );
}
function renderRates(r) {
  $('rxRate').textContent = tx(rate(r.in));
  $('txRate').textContent = tx(rate(r.out));
}

/* Grafico: ricevuti sopra, inviati sotto, stessa scala */
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
  canvas.setAttribute('aria-label', tx(tt("Andamento del traffico: ricevuti {0}, inviati {1}", size(total.in), size(total.out))));
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
  const metric = h('div', { class: 'seg', role: 'group', 'aria-label': tt('Direzione') }, [['all', tt('Totale')], ['in', tt('Ricevuti')], ['out', tt('Inviati')]].map(([id, label]) => h('button', {
    'aria-pressed': id === 'all' ? 'true' : 'false',
    onclick: (e) => {
      state.metric = id;
      for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false');
      refresh();
    },
  }, label)));
  const canvas = h('canvas', { role: 'img', 'aria-label': tt('Mappa del traffico per app. Lo stesso contenuto è nell\'elenco.') });
  const center = h('button', { class: 'center', id: 'center', onclick: () => { if (state.path.length) go(state.path.slice(0, -1)); } },
    h('span', { class: 'c-name', id: 'cName' }), h('span', { class: 'c-size', id: 'cSize' }), h('span', { class: 'c-split', id: 'cSplit' }));
  view.replaceChildren(h('div', { class: 'app' },
    h('div', { class: 'alert', id: 'alert', hidden: true }, h('span', null, NL_OS === 'Linux' ? tt('Il comando ss non risponde: installa il pacchetto iproute2.') : tt('macOS ha risposto in un formato inatteso: il traffico non si può leggere.')),
      h('button', { class: 'quiet', onclick: openDiag }, tt('Apri diagnostica'))),
    h('aside', { class: 'pane' },
      h('div', { class: 'pane-head' }, h('strong', { id: 'paneTitle' }), metric),
      h('input', { class: 'search', type: 'search', placeholder: tt('Filtra per nome'), 'aria-label': tt('Filtra per nome'), oninput: (e) => { state.filter = e.target.value.toLowerCase(); renderRows(current()); } }),
      h('div', { class: 'rows', id: 'rows' }),
      h('div', { class: 'actions', id: 'actions', hidden: true })),
    h('div', { class: 'stage' }, canvas, center, h('div', { class: 'empty', id: 'stageEmpty', hidden: true })),
    h('section', { class: 'flow', 'aria-label': tt('Andamento') },
      h('div', { class: 'rates' },
        h('div', { class: 'rate' }, h('i', { style: 'background:var(--rx)' }), h('strong', { id: 'rxRate' }, tt('0 byte/s')), h('span', null, tt('Ricevuti, ora'))),
        h('div', { class: 'rate' }, h('i', { style: 'background:var(--tx)' }), h('strong', { id: 'txRate' }, tt('0 byte/s')), h('span', null, tt('Inviati, ora')))),
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
    h('header', null, h('h2', null, tt('Diagnostica')), h('p', null, tt('Quello che il sistema ha restituito nell\'ultimo campione. Lo storico resta su questo computer e non viene inviato a nessuno.'))),
    h('div', { class: 'body' },
      h('dl', null,
        h('dt', null, tt('Campioni letti')), h('dd', null, num.format(d.samples)),
        h('dt', null, tt('Formato riconosciuto')), h('dd', null, d.header ? tt('Sì') : tt('No')),
        h('dt', null, tt('Righe e connessioni')), h('dd', null, tt("{0} righe, {1} connessioni", num.format(d.rows), num.format(d.connections))),
        h('dt', null, tt('Righe ignorate')), h('dd', null, num.format(d.skipped)),
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
    h('header', null, h('h2', null, tt('Cancellare lo storico?')), h('p', null, tt('Elimina i dati di traffico raccolti finora su questo computer. L\'azione non si può annullare.'))),
    h('footer', null, h('span'), h('div', null,
      h('button', { class: 'ghost', onclick: () => dialog.close() }, tt('Annulla')),
      h('button', { class: 'danger', onclick: async () => { await state.sampler.clearHistory(); dialog.close(); toast(tt('Storico cancellato')); } }, tt('Cancella storico'))))));
}

(async () => {
  if (!SUPPORTED) {
    for (const id of ['periods', 'pause', 'diag']) $(id).hidden = true;
    view.replaceChildren(h('div', { class: 'notsupported' }, h('div', null, h('h1', null, tt('Correnti funziona su macOS e Linux')), h('p', null, tt('Questa versione legge il traffico con strumenti che su questo sistema non esistono.')))));
    Neutralino.events.on('windowClose', () => Neutralino.app.exit());
    return;
  }
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
