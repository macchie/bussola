import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import TEXTS, { FORMS } from '../translations.js';
import { detect, setLanguage, t, tx, LANGUAGES } from '../i18n.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const APPS = ['stiva', 'correnti', 'battiti', 'scorte', 'sentinelle', 'radici', 'registro', 'bussola'];
const placeholders = (s) => (s.match(/\{\d\}/g) || []).sort().join();

test('every entry has four translations with the same placeholders', () => {
  for (const [key, values] of Object.entries(TEXTS)) {
    assert.equal(values.length, 4, key);
    for (const v of values) { assert.ok(v, key); assert.equal(placeholders(v), placeholders(key), `${key} → ${v}`); }
  }
});
test('every text used by the apps exists in the dictionary', () => {
  const missing = [];
  for (const a of APPS) for (const f of ['app.js', 'map.js']) {
    const p = `${ROOT}${a}/resources/${f}`;
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/\btt\((?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g)) {
      const k = (m[1] ?? m[2]).replace(/\\(.)/g, '$1');
      if (!TEXTS[k]) missing.push(`${a}: ${k}`);
    }
  }
  assert.deepEqual(missing, []);
});
test('the recognized forms exist in the dictionary', () => { for (const f of FORMS) assert.ok(TEXTS[f], f); });
test('the copies in the apps match shared/', () => {
  const files = readdirSync(`${ROOT}shared`).filter((f) => f.endsWith('.js'));
  for (const a of APPS) for (const f of files) {
    assert.equal(readFileSync(`${ROOT}${a}/resources/shared/${f}`, 'utf8'), readFileSync(`${ROOT}shared/${f}`, 'utf8'), `${a}/${f}: run make sync`);
  }
});
test('detects the user language and falls back to English', () => {
  assert.equal(detect(['de_DE.UTF-8']), 'de');
  assert.equal(detect(['pt-BR', 'fr-CA', 'en']), 'fr');
  assert.equal(detect(['ja-JP']), 'en');
  assert.equal(detect([]), 'en');
  assert.equal(LANGUAGES.length, 5);
});
test('t and tx translate only what they know', () => {
  setLanguage('de');
  assert.equal(t('Add {0} to collection', '3 MB'), '3 MB zur Sammlung hinzufügen');
  assert.equal(tx('Local network'), 'Lokales Netzwerk');
  assert.equal(tx('12 other destinations'), '12 weitere Ziele');
  assert.equal(tx('Safari'), 'Safari');
  assert.equal(tx(42), 42);
  assert.equal(t('Totally unknown'), 'Totally unknown');
  setLanguage('en');
  assert.equal(tx('Local network'), 'Local network');
  setLanguage('it');
  assert.equal(tx('Local network'), 'Rete locale');
  assert.equal(globalThis.LINGUA, 'it-IT');
});
