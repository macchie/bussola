/* Suite language: the key is the English text, which is also the fallback. */
import TEXTS, { FORMS } from './translations.js';

export const LANGUAGES = [
  { id: 'en', name: 'English', locale: 'en-GB' },
  { id: 'it', name: 'Italiano', locale: 'it-IT' },
  { id: 'fr', name: 'Français', locale: 'fr-FR' },
  { id: 'es', name: 'Español', locale: 'es-ES' },
  { id: 'de', name: 'Deutsch', locale: 'de-DE' },
];
const COLUMN = { it: 0, fr: 1, es: 2, de: 3 };
let column = null;
let current = LANGUAGES[0];
const forms = FORMS.map((key) => {
  const source = key.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\d\}/g, '(.+)');
  return { key, rule: new RegExp(`^${source}$`) };
});

/* First supported language among the preferred ones; otherwise English. */
export function detect(preferred) {
  for (const item of preferred || []) {
    const code = String(item).toLowerCase().replace('_', '-').split(/[-.]/)[0];
    if (LANGUAGES.some((l) => l.id === code)) return code;
  }
  return 'en';
}
export function setLanguage(id) {
  current = LANGUAGES.find((l) => l.id === id) || LANGUAGES[0];
  column = COLUMN[current.id] ?? null;
  globalThis.LINGUA = current.locale;
  globalThis.tx = tx;
  if (globalThis.document) document.documentElement.lang = current.id;
}
export const language = () => current.id;
export const locale = () => current.locale;

const entry = (key) => (column === null ? key : TEXTS[key]?.[column] ?? key);
const fill = (text, values) => text.replace(/\{(\d)\}/g, (m, i) => (values[i] === undefined ? m : values[i]));

/* Text written in the app: t('Add {0} to the collection', name). */
export const t = (key, ...values) => fill(entry(key), values.map(tx));

/*
 * Text coming from outside (core, saved data): translated only when it matches
 * a known entry. That way a process name stays intact.
 */
const cache = new Map();
export function tx(text) {
  if (typeof text !== 'string' || column === null) return text;
  if (TEXTS[text]) return TEXTS[text][column];
  if (cache.has(text)) return cache.get(text);
  let result = text;
  for (const { key, rule } of forms) {
    const m = text.match(rule);
    if (m) { result = t(key, ...m.slice(1)); break; }
  }
  if (cache.size > 2000) cache.clear();
  cache.set(text, result);
  return result;
}

/* Labels written in index.html. */
export function translatePage(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue.trim();
    if (text && TEXTS[text]) n.nodeValue = n.nodeValue.replace(text, tx(text));
  }
  for (const el of root.querySelectorAll('[title],[aria-label],[placeholder],[alt]')) {
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) if (el.hasAttribute(a)) el.setAttribute(a, tx(el.getAttribute(a)));
  }
}
