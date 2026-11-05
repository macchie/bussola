import { t as tt, tx, locale } from './comune/i18n.js';
import { salvaTema, primaDiRicaricare } from './comune/impostazioni.js';
import { RadialMap } from './map.js';
import { Sampler, PERIODS } from './core/sampler.js';
import { SEP, ROOT } from './core/store.js';
import { reveal } from './core/platform.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const dialog = $('dialog');
const state = { period: 'live', metric: 'login', path: [], sel: null, filter: '', tree: null, map: null, sampler: null, bins: [], ticks: 0 };

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
const KINDS = {
  login: { tab: tt('Accesso'), one: tt('elemento all\'accesso'), many: tt('elementi all\'accesso'), empty: tt('Nessun elemento parte all\'accesso.') },
  service: { tab: tt('Servizi'), one: tt('servizio'), many: tt('servizi'), empty: tt('Nessun servizio rilevato.') },
  task: { tab: tt('Pianificati'), one: tt('attività pianificata'), many: tt('attività pianificate'), empty: tt('Nessuna attività pianificata.') },
  off: { tab: tt('Disattivati'), one: tt('elemento disattivato'), many: tt('elementi disattivati'), empty: tt('Nulla è disattivato. Quello che disattivi resta qui e si può riattivare.') },
};
const label = (n, kind = state.metric) => `${num.format(n)} ${n === 1 ? KINDS[kind].one : KINDS[kind].many}`;
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
  $('stageEmpty').textContent = tx(state.sampler.paused ? tt('Rilevamento in pausa.')
    : state.sampler.diag.samples < 1 ? tt('Lettura in corso…') : KINDS[state.metric].empty);
  const d = state.sampler.diag;
  const firstDay = state.sampler.ledger.since && now - state.sampler.ledger.since < 60000;
  $('notice').textContent = tx(state.tree.fresh ? tt("{0} nelle ultime 24 ore.", state.tree.fresh === 1 ? tt('1 novità') : tt("{0} novità", num.format(state.tree.fresh)))
    : firstDay ? tt('Prima lettura: da ora Radici segnala ciò che compare di nuovo.') : '');
  $('alert').hidden = !(d.samples >= 2 && !d.processes) && !(d.samples === 0 && d.exitCode !== null && d.exitCode !== 0);
}
function go(names) {
  state.path = names;
  state.sel = null;
  refresh(true);
}
function renderCrumbs() {
  const parts = [h('button', { onclick: () => go([]) }, tt('Questo computer'))];
  state.path.forEach((name, i) => parts.push(h('i', null, '/'), h('button', { onclick: () => go(state.path.slice(0, i + 1)) }, name)));
  $('crumbs').replaceChildren(...parts);
}
function renderCenter(arc) {
  const node = arc ? (arc.kind === 'other' ? { n: tt('Elementi minori'), s: arc.node.s, kind: 'other' } : arc.node) : current();
  $('cName').textContent = tx(node.n);
  $('cSize').textContent = tx(num.format(Math.round(node.s)));
  $('cSplit').textContent = tx(node.kind === 'item' ? (node.detail || '') : KINDS[state.metric][Math.round(node.s) === 1 ? 'one' : 'many']);
  $('center').classList.toggle('up', state.path.length > 0);
}
const metaOf = (n) => (n.kind === 'item' ? n.detail || '' : label(Math.round(n.s)));
const nameOf = (n) => [n.n, n.isNew ? h('span', { class: 'badge' }, tt('Nuovo')) : null, n.off ? h('span', { class: 'badge' }, tt('Disattivato')) : null,
  n.fresh ? h('span', { class: 'badge' }, n.fresh === 1 ? tt('1 nuovo') : tt("{0} nuovi", num.format(n.fresh))) : null];
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
    h('div', { style: 'min-width:0' }, h('div', { class: 'name' }, nameOf(n)), h('div', { class: 'meta' }, metaOf(n))),
    h('div', { class: 'size' }, num.format(Math.round(n.s))),
    h('span', { class: 'go', 'aria-hidden': 'true' }, n.d ? '›' : ''));
  });
  const box = $('rows');
  const top = box.scrollTop;
  box.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, state.filter ? tt('Nessun elemento con questo nome.') : KINDS[state.metric].empty)]));
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
  const toggle = n.kind === 'item' && n.item;
  box.replaceChildren(
    n.d ? h('button', { class: 'quiet', onclick: () => go([...state.path, n.n]) }, tt('Apri')) : '',
    toggle ? h('button', { class: 'quiet', onclick: () => openItem(n) }, tt('Dettagli')) : '',
    toggle?.editable && toggle.state === 'on' ? h('button', { class: 'quiet', onclick: () => confirmToggle(toggle, false) }, tt('Disattiva all\'avvio')) : '',
    toggle?.editable && toggle.state === 'off' ? h('button', { class: 'quiet', onclick: () => confirmToggle(toggle, true) }, tt('Riattiva')) : '',
    h('button', { class: 'quiet', onclick: async () => { await Neutralino.clipboard.writeText(toggle?.program || n.n); toast(tt('Copiato')); } }, tt('Copia')),
  );
}
function openItem(n) {
  const i = n.item;
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, i.name), h('p', null, i.state === 'on' ? tt('Attivo') : tt('Disattivato'))),
    h('div', { class: 'body' }, h('dl', null,
      h('dt', null, tt('Origine')), h('dd', null, i.source),
      i.program ? h('dt', null, tt('Comando')) : '', i.program ? h('dd', null, i.program) : '',
      n.first ? h('dt', null, tt('Visto la prima volta')) : '', n.first ? h('dd', null, new Date(n.first).toLocaleString(locale())) : '',
      !i.editable ? h('dt', null, tt('Modifica')) : '', !i.editable ? h('dd', null, i.why) : '')),
    h('footer', null, h('span'), h('div', null, h('button', { class: 'primary', onclick: () => dialog.close() }, tt('Chiudi'))))));
  if (!dialog.open) dialog.showModal();
}
function confirmToggle(item, enable) {
  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('header', null, h('h2', null, enable ? tt("Riattivare {0}?", item.name) : tt("Disattivare {0} all'avvio?", item.name)),
      h('p', null, enable ? tt('Tornerà a partire dal prossimo accesso.') : tt('Non partirà più dal prossimo accesso. Se è già in esecuzione resta aperto, e puoi riattivarlo quando vuoi da Disattivati.'))),
    h('div', { class: 'body' }, h('dl', null, h('dt', null, tt('Origine')), h('dd', null, item.source), item.program ? h('dt', null, tt('Comando')) : '', item.program ? h('dd', null, item.program) : '')),
    h('footer', null, h('span'), h('div', null,
      h('button', { class: 'ghost', onclick: () => dialog.close() }, tt('Annulla')),
      h('button', { class: 'primary', onclick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          await state.sampler.toggle(item, enable);
          toast(enable ? tt('Elemento riattivato') : tt('Elemento disattivato'));
        } catch (err) { toast(err.message); }
        dialog.close();
        state.sel = null;
        refresh();
      } }, enable ? tt('Riattiva') : tt('Disattiva all\'avvio')))))); 
  if (!dialog.open) dialog.showModal();
}
function renderRates() {
  const { active, off } = state.sampler.latest;
  $('cpuNow').textContent = tx(num.format(active));
  $('memNow').textContent = tx(num.format(off));
}

/* Grafico: elementi attivi sopra, disattivati sotto, stessa scala */
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
  const last = [...bins].reverse().find((b) => b.w);
  canvas.setAttribute('aria-label', tx(last ? tt("Andamento: {0} attivi, {1} disattivati", num.format(Math.round(last.cpu)), num.format(Math.round(last.mem))) : tt('Andamento degli elementi di avvio')));
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
  tip.replaceChildren(h('b', null, binLabel(b.t)), b.w ? tt("Attivi {0}   Disattivati {1}", num.format(Math.round(b.cpu)), num.format(Math.round(b.mem))) : tt('Nessun dato'));
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
  const metric = h('div', { class: 'seg', role: 'group', 'aria-label': tt('Misura') }, Object.entries(KINDS).map(([id, { tab }]) => h('button', {
    'aria-pressed': id === 'login' ? 'true' : 'false',
    onclick: (e) => {
      state.metric = id;
      for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false');
      state.sel = null;
      state.path = [];
      refresh(true);
    },
  }, tab)));
  const canvas = h('canvas', { role: 'img', 'aria-label': tt('Mappa degli elementi di avvio per app. Lo stesso contenuto è nell\'elenco.') });
  const center = h('button', { class: 'center', id: 'center', onclick: () => { if (state.path.length) go(state.path.slice(0, -1)); } },
    h('span', { class: 'c-name', id: 'cName' }), h('span', { class: 'c-size', id: 'cSize' }), h('span', { class: 'c-split', id: 'cSplit' }));
  view.replaceChildren(h('div', { class: 'app' },
    h('div', { class: 'alert', id: 'alert', hidden: true }, h('span', null, tt('Il sistema ha risposto in un formato inatteso: gli elementi di avvio non si possono leggere.')),
      h('button', { class: 'quiet', onclick: openDiag }, tt('Apri diagnostica'))),
    h('aside', { class: 'pane' },
      h('div', { class: 'pane-head' }, h('strong', { id: 'paneTitle' }), metric),
      h('input', { class: 'search', type: 'search', placeholder: tt('Filtra per nome'), 'aria-label': tt('Filtra per nome'), oninput: (e) => { state.filter = e.target.value.toLowerCase(); renderRows(current()); } }),
      h('div', { class: 'rows', id: 'rows' }),
      h('div', { class: 'actions', id: 'actions', hidden: true })),
    h('div', { class: 'stage' }, canvas, center, h('div', { class: 'empty', id: 'stageEmpty', hidden: true }), h('div', { class: 'notice', id: 'notice' })),
    h('section', { class: 'flow', 'aria-label': tt('Andamento') },
      h('div', { class: 'rates' },
        h('div', { class: 'rate' }, h('i', { style: 'background:var(--cpu)' }), h('strong', { id: 'cpuNow' }, '—'), h('span', null, tt('Elementi attivi'))),
        h('div', { class: 'rate' }, h('i', { style: 'background:var(--ram)' }), h('strong', { id: 'memNow' }, '—'), h('span', null, tt('Disattivati')))),
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
    h('header', null, h('h2', null, tt('Diagnostica')), h('p', null, tt('Quello che il sistema ha restituito nell\'ultima lettura. Lo storico resta su questo computer e non viene inviato a nessuno.'))),
    h('div', { class: 'body' },
      h('dl', null,
        h('dt', null, tt('Campioni letti')), h('dd', null, num.format(d.samples)),
        h('dt', null, tt('Elementi')), h('dd', null, num.format(d.processes)),
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
