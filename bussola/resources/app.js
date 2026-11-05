import { t as tt, tx, locale } from './comune/i18n.js';
import { salvaTema, primaDiRicaricare } from './comune/impostazioni.js';
import { APPS } from './core/catalog.js';
import { Manager } from './core/manager.js';
import { OS } from './core/platform.js';

const $ = (id) => document.getElementById(id);
const dialog = $('dialog');
const num = new Intl.NumberFormat(locale());
const dec = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });
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
function toast(text) {
  const el = h('div', { class: 'toast' }, text);
  $('toasts').append(el);
  while ($('toasts').children.length > 2) $('toasts').firstChild.remove();
  setTimeout(() => el.remove(), 5000);
}
const mb = (b) => `${dec.format(b / 1e6)} MB`;

const theme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const paintTheme = () => {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${theme() === 'dark'
    ? '<circle cx="10" cy="10" r="3.4"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>'
    : '<path d="M15.5 12.2A6.5 6.5 0 0 1 7.8 4.5a6.5 6.5 0 1 0 7.7 7.7z"/>'}</svg>`;
  $('theme').replaceChildren(t.content.firstChild);
};
paintTheme();
$('theme').onclick = () => {
  const next = theme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  salvaTema(next);
  window.dispatchEvent(new Event('tema'));
};
window.addEventListener('tema', () => {
  paintTheme();
});

const manager = new Manager(render);

function dial(count) {
  const r = 92;
  const c = 2 * Math.PI * r;
  const gap = 4;
  const seg = c / APPS.length - gap;
  const arcs = APPS.map((a, i) => {
    const on = manager.installed[a.id] !== undefined;
    return `<circle cx="115" cy="115" r="${r}" fill="none" stroke="${on ? a.color : 'var(--line)'}" stroke-width="20" stroke-dasharray="${seg} ${c - seg}" stroke-dashoffset="${-(i * (c / APPS.length))}" transform="rotate(-90 115 115)"/>`;
  }).join('');
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 230 230" role="img" aria-label="${tt('{0} app installate su {1}', count, APPS.length)}">${arcs}</svg>`;
  return h('div', { class: 'dial' }, t.content.firstChild, h('div', { class: 'value' }, h('strong', null, tt("{0} di {1}", count, APPS.length)), h('span', null, count === 1 ? tt('app installata') : tt('app installate'))));
}

const guard = (fn) => async (...args) => { try { await fn(...args); } catch (err) { toast(err.message); } };
const doInstall = guard(async (app) => {
  const wasThere = manager.installed[app.id] !== undefined;
  await manager.install(app);
  toast(wasThere ? tt('{0} aggiornata', app.name) : tt('{0} installata', app.name));
  if (app.id === 'anelli' && OS === 'Darwin') askPrivacy();
});
const doAll = guard(async (list) => {
  for (const app of list) await manager.install(app);
  toast(list.length === 1 ? tt('Fatto') : tt("{0} app pronte", list.length));
});

function askPrivacy() {
  openDialog(tt('Riattiva l\'Accesso completo al disco'), tt('Anelli ha una nuova firma locale, quindi macOS chiede di concedere di nuovo il permesso. Se in elenco trovi una vecchia voce di Anelli, toglila con il tasto meno e aggiungi di nuovo l\'app.'), null, [
    h('button', { class: 'ghost', onclick: () => dialog.close() }, tt('Più tardi')),
    h('button', { class: 'primary', onclick: () => { manager.openPrivacy(); dialog.close(); } }, tt('Apri Impostazioni')),
  ]);
}
function askUninstall(app) {
  const box = h('input', { type: 'checkbox' });
  openDialog(tt("Disinstallare {0}?", app.name), tt('L\'app viene rimossa da questo computer. Puoi reinstallarla quando vuoi.'),
    app.keepData ? h('p', null, tt("I dati di {0} restano al loro posto. {1}.", app.name, app.keepData)) : h('label', null, box, h('span', null, tt('Cancella anche dati e storico dell\'app'))), [
      h('button', { class: 'ghost', onclick: () => dialog.close() }, tt('Annulla')),
      h('button', { class: 'danger', onclick: guard(async () => { dialog.close(); await manager.uninstall(app, box.checked); toast(tt("{0} disinstallata", app.name)); }) }, tt('Disinstalla')),
    ]);
}
function openDialog(title, sub, body, footer) {
  dialog.replaceChildren(h('div', { class: 'dlg' }, h('header', null, h('h2', null, title), h('p', null, sub)), body ? h('div', { class: 'body' }, body) : null, h('footer', null, footer)));
  if (!dialog.open) dialog.showModal();
}
$('diag').onclick = () => {
  const report = [tt("Sistema: {0} {1}, Bussola {2}, pacchetti {3}", NL_OS, NL_ARCH, NL_APPVERSION, manager.key || tt('nessuno')), tt("Installate: {0}", JSON.stringify(manager.installed)), manager.catalogError ? tt("Catalogo: {0}", manager.catalogError) : tt("Catalogo: {0}", manager.catalog?.tag || 'nessuno'), '', ...manager.log].join('\n');
  openDialog(tt('Diagnostica'), tt('Stato di Bussola e ultime operazioni.'), h('pre', null, report), [
    h('button', { class: 'ghost', onclick: async () => { await Neutralino.clipboard.writeText(report); toast(tt('Dati copiati')); } }, tt('Copia dati')),
    h('button', { class: 'primary', onclick: () => dialog.close() }, tt('Chiudi')),
  ]);
};
$('check').onclick = guard(async () => { $('check').disabled = true; await manager.refresh(); $('check').disabled = false; toast(manager.catalogError ? tt('Catalogo non raggiungibile') : tt('Catalogo aggiornato')); });

function row(app) {
  const st = manager.status(app.id);
  const entry = manager.catalog?.apps[app.id];
  const have = manager.installed[app.id];
  const pkg = entry?.packages[manager.key];
  const prog = manager.progress[app.id];
  const busy = !!manager.busy;
  const badges = [];
  if (have !== undefined) badges.push(h('span', { class: 'badge' }, have ? tt("Versione {0}", have) : tt('Installata')));
  if (st === 'outdated') badges.push(h('span', { class: 'badge up' }, tt("Disponibile {0}", entry.version)));
  if (st === 'unsupported') badges.push(h('span', { class: 'badge' }, tt('Non disponibile per questo sistema')));
  const btns = [];
  if (st === 'available') btns.push(h('button', { class: 'primary', disabled: busy, onclick: () => doInstall(app) }, tt('Installa')));
  if (st === 'outdated') btns.push(h('button', { class: 'primary', disabled: busy, onclick: () => doInstall(app) }, tt('Aggiorna')));
  if (have !== undefined) {
    btns.push(h('button', { class: 'quiet', disabled: busy, onclick: guard(() => manager.open(app)) }, tt('Apri')));
    btns.push(h('button', { class: 'quiet', disabled: busy, onclick: () => askUninstall(app) }, tt('Disinstalla')));
  }
  return h('section', { class: 'app' },
    h('img', { src: `/apps/${app.id}.svg`, alt: '' }),
    h('div', { style: 'min-width:0' }, h('h2', null, app.name, badges), h('p', null, tx(app.tagline) + (st === 'available' && pkg ? `, ${mb(pkg.size)}` : ''))),
    h('div', { class: 'btns' }, btns),
    prog ? h('div', { class: 'track', role: 'progressbar', 'aria-label': prog.step }, h('i', { style: `width:${Math.round(prog.part * 100)}%` })) : null,
    prog ? h('div', { class: 'step' }, prog.step) : null);
}

function render() {
  const count = APPS.filter((a) => manager.installed[a.id] !== undefined).length;
  const todo = APPS.filter((a) => ['available', 'outdated'].includes(manager.status(a.id)));
  const outdated = todo.filter((a) => manager.status(a.id) === 'outdated');
  const missing = todo.filter((a) => manager.status(a.id) === 'available');
  const update = manager.bussolaUpdate();
  const busy = !!manager.busy;
  const top = $('view').scrollTop;
  $('view').replaceChildren(h('div', { class: 'home' },
    manager.catalogError ? h('div', { class: 'banner' }, h('div', null, h('strong', null, tt('Catalogo non raggiungibile')), h('p', null, tt('Le app già installate si aprono comunque. Per installare o aggiornare serve la connessione.'))), h('button', { class: 'quiet', disabled: busy, onclick: () => manager.refresh() }, tt('Riprova'))) : null,
    !manager.key ? h('div', { class: 'banner' }, h('div', null, h('strong', null, tt('Sistema non supportato')), h('p', null, tt('Non ci sono pacchetti per questo sistema o processore.')))) : null,
    update ? h('div', { class: 'banner' }, h('div', null, h('strong', null, tt("Bussola {0} è disponibile", update.version)), h('p', null, tt('Bussola non si aggiorna da sola: scarica la nuova versione dalla pagina della release.'))), update.page ? h('button', { class: 'quiet', onclick: () => Neutralino.os.open(update.page) }, tt('Apri la pagina')) : null) : null,
    h('aside', { class: 'hero' }, dial(count),
      h('div', { class: 'bulk' },
        outdated.length ? h('button', { class: 'primary', disabled: busy, onclick: () => doAll(outdated) }, outdated.length === 1 ? tt('Aggiorna 1 app') : tt("Aggiorna {0} app", num.format(outdated.length))) : null,
        missing.length ? h('button', { class: outdated.length ? 'quiet' : 'primary', disabled: busy, onclick: () => doAll(missing) }, missing.length === 1 ? tt('Installa quella mancante') : tt("Installa le {0} mancanti", num.format(missing.length))) : null)),
    h('div', { class: 'apps' }, APPS.map(row))));
  $('view').scrollTop = top;
  $('check').disabled = busy;
}

(async () => {
  Neutralino.events.on('windowClose', () => Neutralino.app.exit());
  render();
  await manager.refresh();
})().catch((err) => toast(String(err.message || err)));
