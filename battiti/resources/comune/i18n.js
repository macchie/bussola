/* Lingua della suite: la chiave è il testo italiano, che fa anche da ripiego. */
import TESTI, { FORME } from './traduzioni.js';

export const LINGUE = [
  { id: 'it', nome: 'Italiano', locale: 'it-IT' },
  { id: 'en', nome: 'English', locale: 'en-GB' },
  { id: 'fr', nome: 'Français', locale: 'fr-FR' },
  { id: 'es', nome: 'Español', locale: 'es-ES' },
  { id: 'de', nome: 'Deutsch', locale: 'de-DE' },
];
const COLONNA = { en: 0, fr: 1, es: 2, de: 3 };
let colonna = null;
let attuale = LINGUE[0];
const forme = FORME.map((chiave) => {
  const sorgente = chiave.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\d\}/g, '(.+)');
  return { chiave, regola: new RegExp(`^${sorgente}$`) };
});

/* Prima lingua supportata tra quelle preferite; altrimenti inglese. */
export function rileva(preferite) {
  for (const voce of preferite || []) {
    const codice = String(voce).toLowerCase().replace('_', '-').split(/[-.]/)[0];
    if (LINGUE.some((l) => l.id === codice)) return codice;
  }
  return 'en';
}
export function impostaLingua(id) {
  attuale = LINGUE.find((l) => l.id === id) || LINGUE[1];
  colonna = COLONNA[attuale.id] ?? null;
  globalThis.LINGUA = attuale.locale;
  globalThis.tx = tx;
  if (globalThis.document) document.documentElement.lang = attuale.id;
}
export const lingua = () => attuale.id;
export const locale = () => attuale.locale;

const voce = (chiave) => (colonna === null ? chiave : TESTI[chiave]?.[colonna] ?? chiave);
const riempi = (testo, valori) => testo.replace(/\{(\d)\}/g, (m, i) => (valori[i] === undefined ? m : valori[i]));

/* Testo scritto nell'app: t('Aggiungi {0} alla raccolta', nome). */
export const t = (chiave, ...valori) => riempi(voce(chiave), valori.map(tx));

/*
 * Testo arrivato da fuori (nucleo, dati salvati): si traduce solo se coincide
 * con una voce nota. Così il nome di un processo resta intatto.
 */
const memoria = new Map();
export function tx(testo) {
  if (typeof testo !== 'string' || colonna === null) return testo;
  if (TESTI[testo]) return TESTI[testo][colonna];
  if (memoria.has(testo)) return memoria.get(testo);
  let esito = testo;
  for (const { chiave, regola } of forme) {
    const m = testo.match(regola);
    if (m) { esito = t(chiave, ...m.slice(1)); break; }
  }
  if (memoria.size > 2000) memoria.clear();
  memoria.set(testo, esito);
  return esito;
}

/* Etichette scritte in index.html. */
export function traduciPagina(radice = document.body) {
  const giro = document.createTreeWalker(radice, NodeFilter.SHOW_TEXT);
  for (let n = giro.nextNode(); n; n = giro.nextNode()) {
    const testo = n.nodeValue.trim();
    if (testo && TESTI[testo]) n.nodeValue = n.nodeValue.replace(testo, tx(testo));
  }
  for (const el of radice.querySelectorAll('[title],[aria-label],[placeholder],[alt]')) {
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) if (el.hasAttribute(a)) el.setAttribute(a, tx(el.getAttribute(a)));
  }
}
