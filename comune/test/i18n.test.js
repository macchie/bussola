import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import TESTI, { FORME } from '../traduzioni.js';
import { rileva, impostaLingua, t, tx, LINGUE } from '../i18n.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const APPS = ['anelli', 'correnti', 'battiti', 'scorte', 'sentinelle', 'radici', 'registro', 'bussola'];
const segnaposti = (s) => (s.match(/\{\d\}/g) || []).sort().join();

test('ogni voce ha le quattro traduzioni con gli stessi segnaposto', () => {
  for (const [chiave, voci] of Object.entries(TESTI)) {
    assert.equal(voci.length, 4, chiave);
    for (const v of voci) { assert.ok(v, chiave); assert.equal(segnaposti(v), segnaposti(chiave), `${chiave} → ${v}`); }
  }
});
test('ogni testo usato dalle app esiste nel dizionario', () => {
  const mancanti = [];
  for (const a of APPS) for (const f of ['app.js', 'map.js']) {
    const p = `${ROOT}${a}/resources/${f}`;
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/\btt\((?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g)) {
      const k = (m[1] ?? m[2]).replace(/\\(.)/g, '$1');
      if (!TESTI[k]) mancanti.push(`${a}: ${k}`);
    }
  }
  assert.deepEqual(mancanti, []);
});
test('le forme riconosciute esistono nel dizionario', () => { for (const f of FORME) assert.ok(TESTI[f], f); });
test('le copie nelle app coincidono con comune/', () => {
  const file = readdirSync(`${ROOT}comune`).filter((f) => f.endsWith('.js'));
  for (const a of APPS) for (const f of file) {
    assert.equal(readFileSync(`${ROOT}${a}/resources/comune/${f}`, 'utf8'), readFileSync(`${ROOT}comune/${f}`, 'utf8'), `${a}/${f}: esegui make sync`);
  }
});
test('rileva la lingua dell\'utente e ripiega sull\'inglese', () => {
  assert.equal(rileva(['de_DE.UTF-8']), 'de');
  assert.equal(rileva(['pt-BR', 'fr-CA', 'en']), 'fr');
  assert.equal(rileva(['ja-JP']), 'en');
  assert.equal(rileva([]), 'en');
  assert.equal(LINGUE.length, 5);
});
test('t e tx traducono solo ciò che conoscono', () => {
  impostaLingua('de');
  assert.equal(t('Aggiungi {0} alla raccolta', '3 MB'), '3 MB zur Sammlung hinzufügen');
  assert.equal(tx('Rete locale'), 'Lokales Netzwerk');
  assert.equal(tx('Altre 12 destinazioni'), '12 weitere Ziele');
  assert.equal(tx('Safari'), 'Safari');
  assert.equal(tx(42), 42);
  assert.equal(t('Testo sconosciuto'), 'Testo sconosciuto');
  impostaLingua('it');
  assert.equal(tx('Rete locale'), 'Rete locale');
  assert.equal(globalThis.LINGUA, 'it-IT');
});
