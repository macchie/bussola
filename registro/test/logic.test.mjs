import test from 'node:test';
import assert from 'node:assert';
import { parseJournal, parseBoots, parseMacLog, parseCrashFiles, parseMac, parseWindows, patternOf, macTime, accessOf, journalMissing } from '../resources/core/parse.js';
import { Store, buildTree, SEP } from '../resources/core/store.js';
import { appOfEvent } from '../resources/core/attribute.js';
import { fresh, keyOf, firstLook } from '../resources/core/sampler.js';

const j = (o) => JSON.stringify({ __REALTIME_TIMESTAMP: '1730000000123456', ...o });
test('Linux: priorities, binary messages and shutdowns', () => {
  const ev = parseJournal([
    j({ PRIORITY: '3', SYSLOG_IDENTIFIER: 'nginx', MESSAGE: 'bind failed', _EXE: '/usr/sbin/nginx' }),
    j({ PRIORITY: '4', _COMM: 'cron', MESSAGE: 'lento' }),
    j({ PRIORITY: '2', SYSLOG_IDENTIFIER: 'kernel', MESSAGE: [104, 105] }),
    j({ PRIORITY: '6', SYSLOG_IDENTIFIER: 'systemd-coredump', MESSAGE: 'Process 12 (foo) dumped core.' }),
    j({ PRIORITY: '6', SYSLOG_IDENTIFIER: 'chatty', MESSAGE: 'ok' }), 'not json',
  ]);
  assert.deepEqual(ev.map((e) => e.kind), ['error', 'warn', 'error', 'event']);
  assert.equal(ev[0].t, 1730000000123);
  assert.equal(ev[2].text, 'hi');
  assert.equal(ev[3].source, 'foo', 'l\'arresto va sotto l\'app caduta');
  assert.equal(ev[2].level, 'critical');
  assert.equal(parseBoots(['-1 abc Mon 2026-11-03 08:00:00 CET Tue 2026-11-04 21:00:00 CET', 'nulla']).length, 1);
});

test('macOS: ndjson, fuso orario, tipi', () => {
  assert.equal(macTime('2024-03-15 10:00:00.123456-0700'), Date.UTC(2024, 2, 15, 17, 0, 0, 123));
  const ev = parseMacLog([
    'Filtering the log data using ...',
    JSON.stringify({ timestamp: '2024-03-15 10:00:00.123456-0700', messageType: 'Error', processImagePath: '/Applications/Slack.app/Contents/MacOS/Slack', eventMessage: 'no' }),
    JSON.stringify({ timestamp: '2024-03-15 10:00:01.000000-0700', messageType: 'Fault', processImagePath: '/usr/libexec/x', eventMessage: 'grave' }),
    JSON.stringify({ timestamp: '2024-03-15 10:00:02.000000-0700', messageType: 'Default', processImagePath: '/a', eventMessage: 'no' }),
  ]);
  assert.equal(ev.length, 2);
  assert.equal(ev[1].level, 'critical');
  assert.equal(appOfEvent('Darwin', ev[0]), 'Slack');
  assert.equal(appOfEvent('Darwin', ev[1]), 'macOS system');
});

test('macOS: crash reports and boot', () => {
  const ev = parseCrashFiles(['Safari-2026-11-04-123456.ips', 'Google Chrome_2026-11-04-090000_mac.crash', 'kernel-2026-11-03-101010.panic', 'x.txt', 'Retired']);
  assert.equal(ev.length, 3);
  assert.equal(ev[0].source, 'Safari');
  assert.equal(ev[1].source, 'Google Chrome');
  assert.match(ev[2].text, /kernel/);
  const all = parseMac('===LOG\n===CRASH\n===BOOT\n{ sec = 1730000000, usec = 5 } Mon\n');
  assert.deepEqual([all.length, all[0].t, all[0].kind], [1, 1730000000000, 'event']);
});

test('Windows: levels and ids with the right provider', () => {
  const row = (o) => JSON.stringify({ t: 1000, l: 2, i: 7, p: 'Disk', m: 'x', ...o });
  const ev = parseWindows([row({}), row({ l: 3, i: 8 }), row({ l: 1, i: 41, p: 'Microsoft-Windows-Kernel-Power' }), row({ l: 4, i: 6005, p: 'EventLog', m: '' }),
    row({ l: 2, i: 1000, p: 'Application Error', m: 'chrome.exe' }), row({ l: 2, i: 41, p: 'AltraApp' }), row({ l: 4, i: 9 }), 'rumore'].join('\r\n'));
  assert.deepEqual(ev.map((e) => e.kind), ['error', 'warn', 'event', 'event', 'event', 'error']);
  assert.equal(ev[3].source, 'System');
  assert.equal(appOfEvent('Windows', ev[2]), 'Kernel-Power');
  assert.equal(appOfEvent('Windows', ev[3]), 'Windows system');
});

test('messages equal except for the details become one', () => {
  const a = patternOf('Failed to connect to 10.0.0.5:443 after 3 tries, id 0xdeadbeef');
  const b = patternOf('Failed to connect to 192.168.1.9:8080 after 12 tries, id 0x1f');
  assert.equal(a, b);
  assert.equal(patternOf('open /var/log/a.log: denied'), patternOf('open /home/me/b.txt: denied'));
  assert.equal(patternOf('550e8400-e29b-41d4-a716-446655440000 fine'), '# fine');
  assert.notEqual(patternOf('disk full'), patternOf('disk slow'));
  assert.equal(patternOf('  '), '(empty message)');
  assert.ok(patternOf('x'.repeat(500)).length <= 140);
});

test('no new event is not a fault', () => {
  assert.equal(accessOf(''), 'ok');
  assert.equal(accessOf('-- No entries --'), 'ok');
  assert.equal(accessOf('No journal files were found.'), 'failed');
  assert.equal(accessOf('Hint: You are currently not seeing messages from other users and the system.'), 'partial');
});

test('log absent, even if journalctl doesn\'t say so', () => {
  assert.equal(journalMissing('===JOURNAL\n===BOOTS\n'), true);
  assert.equal(journalMissing('===JOURNAL\n===BOOTS\n 0 abc Tue 2026-11-03 08:30:00 CET Wed 2026-11-04 22:00:00 CET\n'), false);
});

test('letture successive: niente doppioni', () => {
  const seen = new Set();
  const e = (t, kind) => ({ t, kind, text: 'a' });
  assert.equal(fresh([e(5, 'error'), e(10, 'error'), e(20, 'event')], 7, seen).length, 2);
  assert.equal(fresh([e(10, 'error'), e(20, 'event')], 10, seen).length, 0, 'the boundary event and the already-seen restart are not recounted');
  assert.ok(firstLook('Darwin', 1e10) > firstLook('Linux', 1e10));
});

const T0 = new Date(2026, 10, 4, 12, 0, 0).getTime();
test('storico additivo, periodi e albero', () => {
  const k = (kind, app, p) => [kind, app, p].join(SEP);
  const s = new Store();
  const lines = s.ingest([{ t: T0, key: k('error', 'A', 'x') }, { t: T0 + 1000, key: k('error', 'A', 'x') }, { t: T0 + 90000, key: k('warn', 'B', 'y') }]);
  assert.equal(lines.length, 2);
  assert.equal(s.ingest([{ t: T0, key: k('error', 'A', 'x') }])[0].minute, Math.floor(T0 / 60000));
  const copy = new Store();
  copy.loadLines(`${lines.map((l) => l.line).join('\n')}\nrotto\n`);
  assert.equal(copy.totals('hour', T0 + 100000).get(k('error', 'A', 'x')), 2);
  const bins = s.timeline('hour', T0 + 100000);
  assert.equal(bins.reduce((n, b) => n + b.cpu, 0), 3);
  assert.equal(bins.reduce((n, b) => n + b.mem, 0), 1);
  const t = buildTree(s.totals('day', T0 + 100000), 'error', () => ({ sample: 'm' }));
  assert.deepEqual([t.s, t.c[0].n, t.c[0].c[0].s, t.c[0].c[0].sample], [3, 'A', 3, 'm']);
  assert.equal(keyOf('Linux', { kind: 'error', source: 'nginx', text: 'failed 3' }), k('error', 'nginx', 'failed #'));
});
