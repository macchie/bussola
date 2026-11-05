import test from 'node:test';
import assert from 'node:assert';
import { parseCatalog, validPackage, compareVersions, statusOf, platformKey, TRUSTED_PREFIX, APPS, CATALOG_URL } from '../resources/core/catalog.js';
import { macInstall, linuxInstall, windowsInstall, uninstallScript, detectScript, parseDetected, openScript } from '../resources/core/scripts.js';

const url = `${TRUSTED_PREFIX}suite-1/Anelli-macos.zip`;
const good = { url, sha256: 'a'.repeat(64), size: 1000 };
const cat = (app, extra = {}) => JSON.stringify({ formato: 1, tag: 't', app, ...extra });

test('il catalogo non può portare altrove', () => {
  assert.equal(CATALOG_URL, 'https://github.com/macchie/bussola/releases/latest/download/catalogo.json');
  assert.ok(validPackage(good));
  for (const p of [{ ...good, url: 'https://evil.example/Anelli.zip' }, { ...good, url: 'http://github.com/macchie/bussola/releases/download/a/b.zip' },
    { ...good, url: `https://github.com/altro/bussola/releases/download/a/b.zip` }, { ...good, url: `${TRUSTED_PREFIX}a/../../b.zip` }, { ...good, url: `${TRUSTED_PREFIX}a/b.exe` }, { ...good, url: `${TRUSTED_PREFIX}../b.zip` },
    { ...good, url: `${TRUSTED_PREFIX}a/b';id;'.zip` }, { ...good, sha256: 'xyz' }, { ...good, size: 0 }, { ...good, size: 1e12 }, null]) {
    assert.equal(validPackage(p), false, JSON.stringify(p));
  }
});

test('app sconosciute e voci errate vengono ignorate', () => {
  const c = parseCatalog(cat({ anelli: { versione: '2.0.1', pacchetti: { macos: good, windows: { ...good, url: 'https://x/y.zip' } } }, intruso: { versione: '1.0.0', pacchetti: { macos: good } }, battiti: { versione: 'latest' } }));
  assert.deepEqual(Object.keys(c.apps), ['anelli']);
  assert.deepEqual(Object.keys(c.apps.anelli.packages), ['macos']);
  assert.throws(() => parseCatalog('<html>'));
  assert.throws(() => parseCatalog('{"formato":2,"app":{}}'));
});

test('versioni e stati', () => {
  assert.equal(compareVersions('2.0.1', '2.0.10'), -1);
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  const e = { version: '2.0.0', packages: { macos: good } };
  assert.equal(statusOf(e, undefined, 'macos'), 'available');
  assert.equal(statusOf(e, '1.0.0', 'macos'), 'outdated');
  assert.equal(statusOf(e, '', 'macos'), 'outdated');
  assert.equal(statusOf(e, '2.0.0', 'macos'), 'installed');
  assert.equal(statusOf(e, '3.0.0', 'macos'), 'installed', 'mai tornare indietro');
  assert.equal(statusOf(e, undefined, 'linux-x64'), 'unsupported');
  assert.equal(statusOf(undefined, '1.0.0', 'macos'), 'installed');
  assert.equal(platformKey('Darwin', 'arm64'), 'macos');
  assert.equal(platformKey('Windows', 'arm64'), null);
  assert.equal(platformKey('Linux', 'arm64'), 'linux-arm64');
});

test('gli script usano solo https e verificano prima di installare', () => {
  const app = APPS[0];
  const pkg = { ...good, version: '2.0.1' };
  for (const s of [macInstall(app, pkg, '/tmp/x'), linuxInstall(app, pkg, '/tmp/x', 'linux-x64'), windowsInstall(app, pkg, 'C:\\t', 'windows-x64')]) {
    assert.match(s, /--proto/);
    assert.ok(s.indexOf('verify') < s.indexOf('extract'), 'verifica prima di estrarre');
    assert.ok(s.includes('a'.repeat(64)));
  }
  assert.match(macInstall(app, pkg, '/tmp/x'), /tccutil reset SystemPolicyAllFiles it\.anelli\.app/);
  assert.doesNotMatch(macInstall(APPS[1], pkg, '/tmp/x'), /tccutil/);
  assert.match(macInstall(app, pkg, "/tmp/a'b"), /'\/tmp\/a'\\''b'/);
  assert.throws(() => macInstall({ id: 'a;b', name: 'x' }, pkg, '/t'));
});

test('disinstallare tocca solo percorsi noti', () => {
  assert.throws(() => uninstallScript('Linux', { id: '../..', name: 'x' }));
  assert.match(uninstallScript('Darwin', APPS[0]), /rm -rf "\/Applications\/Anelli\.app"/);
  assert.equal(/\$\(/.test(uninstallScript('Linux', APPS[0])), false);
  assert.ok(openScript('Windows', APPS[0]).includes('Anelli.exe'));
  assert.ok(APPS.find((a) => a.id === 'anelli').keepData);
  assert.ok(APPS.find((a) => a.id === 'radici').keepData);
});

test('rilevamento', () => {
  assert.deepEqual(parseDetected('anelli\t2.0.1\nbattiti\t\r\nrumore\n'), { anelli: '2.0.1', battiti: '' });
  assert.match(detectScript('Darwin', APPS), /Scorte\.app/);
});
