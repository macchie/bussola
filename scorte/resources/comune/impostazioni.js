/* Impostazioni della suite: un file condiviso e il pannello con l'ingranaggio. */
import { LINGUE, rileva, impostaLingua, lingua, t, traduciPagina } from './i18n.js';

const PREDEFINITE = { lingua: 'auto', tema: 'auto' };
const stato = { valori: { ...PREDEFINITE }, file: null, sistema: 'en', prima: [] };
const sezioni = [];

async function linguaSistema() {
  const elenco = [];
  try { const info = await Neutralino.os.getLocaleInfo(); if (info?.locale) elenco.push(info.locale); } catch { /* si usa il browser */ }
  return rileva([...elenco, ...(navigator.languages || []), navigator.language]);
}
function applicaTema() {
  if (stato.valori.tema === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = stato.valori.tema;
  window.dispatchEvent(new Event('tema'));
}
async function salva() {
  if (!stato.file) return;
  await Neutralino.filesystem.createDirectory(stato.file.replace(/[\\/][^\\/]+$/, '')).catch(() => {});
  await Neutralino.filesystem.writeFile(stato.file, JSON.stringify(stato.valori, null, 2)).catch(() => {});
}

/* Prima di tutto il resto: l'app legge lingua e numeri mentre si carica. */
export async function caricaImpostazioni() {
  stato.sistema = await linguaSistema();
  try {
    const base = (await Neutralino.os.getPath('data')).replace(/[\\/]$/, '');
    const sep = base.includes('\\') ? '\\' : '/';
    stato.file = `${base}${sep}Bussola Suite${sep}impostazioni.json`;
    const letto = JSON.parse(await Neutralino.filesystem.readFile(stato.file));
    if (letto && typeof letto === 'object' && !Array.isArray(letto)) stato.valori = { ...PREDEFINITE, ...letto };
  } catch { /* primo avvio o file illeggibile: valori predefiniti */ }
  if (stato.valori.lingua !== 'auto' && !LINGUE.some((l) => l.id === stato.valori.lingua)) stato.valori.lingua = 'auto';
  if (!['auto', 'light', 'dark'].includes(stato.valori.tema)) stato.valori.tema = 'auto';
  impostaLingua(stato.valori.lingua === 'auto' ? stato.sistema : stato.valori.lingua);
  applicaTema();
  traduciPagina();
}
export const valore = (chiave) => stato.valori[chiave];
export function imposta(chiave, v) { stato.valori[chiave] = v; return salva(); }
export function salvaTema(tema) { stato.valori.tema = tema; salva(); }
export const primaDiRicaricare = (fn) => stato.prima.push(fn);
/* Un'app può aggiungere righe al pannello: aggiungiSezione(() => elemento). */
export const aggiungiSezione = (crea) => sezioni.push(crea);

function crea(tag, proprieta, ...figli) {
  const el = Object.assign(document.createElement(tag), proprieta);
  el.append(...figli.filter(Boolean));
  return el;
}
function riga(etichetta, id, opzioni, attuale, cambia) {
  const scelta = crea('select', { id, onchange: () => cambia(scelta.value) }, ...opzioni.map(([v, testo]) => crea('option', { value: v, textContent: testo, selected: v === attuale })));
  return crea('div', { className: 'set-riga' }, crea('label', { htmlFor: id, textContent: etichetta }), scelta);
}
async function cambiaLingua(id) {
  await imposta('lingua', id);
  for (const fn of stato.prima) await Promise.resolve(fn()).catch(() => {});
  location.reload();
}
function apri(dialogo, avviso) {
  const nomeAuto = LINGUE.find((l) => l.id === stato.sistema)?.nome;
  const corpo = crea('div', { className: 'body' },
    riga(t('Lingua'), 'setLingua', [['auto', `${t('Automatica')} (${nomeAuto})`], ...LINGUE.map((l) => [l.id, l.nome])], stato.valori.lingua, cambiaLingua),
    riga(t('Tema'), 'setTema', [['auto', t('Automatico')], ['light', t('Chiaro')], ['dark', t('Scuro')]], stato.valori.tema, (v) => { stato.valori.tema = v; applicaTema(); salva(); }),
    ...sezioni.map((fn) => fn()),
    avviso ? crea('p', { className: 'set-nota', textContent: avviso }) : null);
  const versione = globalThis.NL_APPVERSION ? t('Versione {0}', globalThis.NL_APPVERSION) : '';
  dialogo.replaceChildren(crea('div', { className: 'dlg' },
    crea('header', null, crea('h2', { textContent: t('Impostazioni') }), crea('p', { textContent: t('Valgono per tutte le app della suite e restano su questo computer.') })),
    corpo,
    crea('footer', { className: 'set-piede' }, crea('span', { className: 'set-nota', textContent: versione }),
      crea('button', { className: 'primary', textContent: t('Chiudi'), onclick: () => dialogo.close() }))));
  dialogo.showModal();
}

/* Mette l'ingranaggio accanto al pulsante del tema. */
export function installaImpostazioni({ avviso } = {}) {
  const tema = document.getElementById('theme');
  if (!tema || document.getElementById('settings')) return;
  const dialogo = crea('dialog', { id: 'settingsDialog' });
  document.body.append(dialogo);
  const stile = crea('style', { textContent: `
    .set-riga { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--line); }
    .set-riga:last-of-type { border-bottom: 0; }
    .set-riga select { font: inherit; color: var(--ink); background: var(--raised); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; min-width: 200px; max-width: 60%; }
    .set-nota { color: var(--muted); font-size: 12px; }
    .dlg footer.set-piede { justify-content: space-between; align-items: center; }` });
  document.head.append(stile);
  const titolo = t('Impostazioni');
  const pulsante = crea('button', { id: 'settings', className: tema.className, title: titolo, onclick: () => apri(dialogo, avviso?.()) });
  pulsante.setAttribute('aria-label', titolo);
  pulsante.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h7M15 6h1M4 14h1M9 14h7"/><circle cx="13" cy="6" r="2"/><circle cx="7" cy="14" r="2"/></svg>';
  tema.before(pulsante);
}
export { lingua };
