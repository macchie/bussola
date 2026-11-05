import test from 'node:test';
import assert from 'node:assert';
import { parseLinux, parseMac, parseWindows, parseCpuTime, splitBlocks } from '../resources/core/parse.js';
import { appFor, UNATTRIBUTED } from '../resources/core/attribute.js';
import { Store, buildTree, SEP } from '../resources/core/store.js';
import { digest } from '../resources/core/sampler.js';

const LINUX = `===PROC 4096 100
1 (systemd) S 0 1 1 0 -1 4194560 0 0 0 0 150 50 0 0 20 0 1 0 5 100 2000 18446744073709551615
77 (tmux: server (a)) S 1 77 77 0 -1 0 0 0 0 0 10 5 0 0 20 0 1 0 9 100 500 18446744073709551615
12 (kworker/0:1) I 2 0 0 0 -1 0 0 0 0 0 1 2 0 0 20 0 1 0 2 0 0 18446744073709551615
===STAT
cpu  100 0 50 800 50 0 0 0 0 0
===MEM
MemTotal:       16000 kB
MemFree:         1000 kB
MemAvailable:    6000 kB
SwapTotal:       2000 kB
SwapFree:        1500 kB
===EXE
lrwxrwxrwx 1 me me 0 Nov  4 21:00 /proc/77/exe -> /usr/bin/tmux (deleted)
`;

test('Linux: nomi con parentesi, tick, pagine, memoria', () => {
  const s = parseLinux(LINUX);
  assert.equal(s.procs.length, 3);
  const t = s.procs[1];
  assert.deepEqual([t.pid, t.name, t.ppid, t.cpuMs, t.mem], [77, 'tmux: server (a)', 1, 150, 500 * 4096]);
  assert.deepEqual(s.cpu, { busy: 150, total: 1000 });
  assert.deepEqual(s.mem, { total: 16000 * 1024, used: 10000 * 1024, swap: 500 * 1024 });
  assert.equal(s.paths.get(77).path, '/usr/bin/tmux');
});

test('macOS: ps, tempi di CPU, vm_stat e swap', () => {
  const s = parseMac(`===PS
    1     0  12000   1:02.50 root             /sbin/launchd
  900     1 204800   0:00.25 macchie          /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
===VM
Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               10.
Pages active:                            100.
Pages wired down:                         50.
Pages occupied by compressor:             25.
===SWAP
total = 2048,00M  used = 512.50M  free = 1535.50M  (encrypted)
`);
  assert.deepEqual([s.procs[0].cpuMs, s.procs[0].name, s.procs[0].mem], [62500, 'launchd', 12000 * 1024]);
  assert.equal(s.procs[1].name, 'Google Chrome');
  assert.equal(s.mem.used, 175 * 16384);
  assert.equal(s.mem.swap, 512.5 * 1048576);
  assert.equal(s.cpu, null);
  assert.equal(parseCpuTime('1-02:03:04'), 93784000);
  assert.equal(parseCpuTime('x'), null);
});

test('Windows: righe del flusso, CRLF inclusi', () => {
  const s = parseWindows('M\t16000\t6000\r\nP\t4\tSystem\t1000\t2000\r\nP\t900\tchrome\t2500\t3000\r\nI\t900\tC:\\Program Files\\Google\\Chrome\\chrome.exe\tGoogle Chrome\r\n');
  assert.equal(s.procs.length, 2);
  assert.equal(s.mem.used, 10000 * 1024);
  assert.equal(s.paths.get(900).description, 'Google Chrome');
});

test('Windows: blocchi spezzati, e END nel nome di un processo', () => {
  const a = splitBlocks('P\t1\tBACKEND\t1\t1\nEN');
  assert.equal(a.blocks.length, 0);
  const b = splitBlocks(`${a.rest}D\r\nP\t2\tEND\t1\t1\nEND\nM\t1`);
  assert.equal(b.blocks.length, 2);
  assert.match(b.blocks[0], /BACKEND/);
  assert.match(b.blocks[1], /P\t2\tEND/);
  assert.equal(b.rest, 'M\t1');
});

test('attribuzione sui tre sistemi', () => {
  assert.equal(appFor('Linux', { pid: 12, ppid: 2, name: 'k' }).app, 'Kernel Linux');
  assert.equal(appFor('Linux', { pid: 9, ppid: 1, name: 'chrome' }, { path: '/opt/google/chrome/chrome' }).app, 'Google');
  assert.equal(appFor('Linux', { pid: 9, ppid: 1, name: 'firefox-bin' }, { path: '/usr/lib/firefox/firefox-bin' }).app, 'Firefox');
  assert.equal(appFor('Linux', { pid: 9, ppid: 1, name: 'node' }, { path: '/usr/bin/node' }).app, 'node');
  assert.equal(appFor('Linux', { pid: 9, ppid: 1, name: 'cron' }).app, 'Sistema Linux');
  assert.equal(appFor('Darwin', { name: 'H' }, { path: '/Applications/Slack.app/Contents/Frameworks/Slack Helper.app/Contents/MacOS/H' }).app, 'Slack');
  assert.equal(appFor('Darwin', { name: 'launchd' }, { path: '/sbin/launchd' }).app, 'Sistema macOS');
  assert.equal(appFor('Windows', { name: 'chrome' }, { path: 'C:\\Program Files\\x\\chrome.exe', description: 'Google Chrome' }).app, 'Google Chrome');
  assert.equal(appFor('Windows', { name: 'svchost' }, { path: 'C:\\Windows\\System32\\svchost.exe' }).app, 'Sistema Windows');
  assert.equal(appFor('Windows', { name: 'System' }).app, 'Sistema Windows');
});

const machine = { cores: 4, memTotal: 1000 };
const ctx = (t) => ({ t, paths: new Map(), bundles: new Map() });

test('CPU dalle differenze, sulla capacità della macchina', () => {
  const first = digest(null, ctx(0), { procs: [{ pid: 5, ppid: 1, name: 'a', cpuMs: 9000, mem: 100 }], mem: { used: 400 } }, machine, 'Darwin');
  assert.equal(first.seconds, 0);
  const prev = { t: 0, cpu: first.cpuMap, sys: null };
  const two = digest(prev, ctx(2000), { procs: [
    { pid: 5, ppid: 1, name: 'a', cpuMs: 11000, mem: 100 },
    { pid: 6, ppid: 1, name: 'b', cpuMs: 500000, mem: 100 },
  ], mem: { used: 400 } }, machine, 'Darwin');
  assert.equal(two.entries.find((e) => e.process === 'a').cpu, 0.25, '2 s di CPU in 2 s su 4 thread');
  assert.equal(two.entries.find((e) => e.process === 'b').cpu, 0, 'un processo nuovo non porta con sé il passato');
  assert.equal(two.machine.cpu, 0.25);
  assert.equal(two.entries.find((e) => e.app === UNATTRIBUTED).mem, 200);
  assert.equal(two.machine.mem, 0.4);
});

test('il totale di /proc/stat vince sulla somma dei processi', () => {
  const r = digest({ t: 0, cpu: new Map(), sys: { busy: 100, total: 1000 } }, ctx(1000), { procs: [], cpu: { busy: 150, total: 1100 }, mem: { total: 1000, used: 1 } }, machine, 'Linux');
  assert.equal(r.machine.cpu, 0.5);
});

const T0 = new Date(2026, 10, 4, 12, 0, 0).getTime();
test('medie pesate sul tempo osservato e persistenza', () => {
  const s = new Store();
  const key = `A${SEP}a`;
  s.record(T0, 2, [{ app: 'A', process: 'a', cpu: 0.1, mem: 100, count: 1 }], { cpu: 0.1, mem: 0.5 });
  s.record(T0 + 2000, 6, [{ app: 'A', process: 'a', cpu: 0.5, mem: 300, count: 3 }], { cpu: 0.5, mem: 0.7 });
  assert.equal(s.averages('live', T0 + 2000).get(key)[0], 0.5);
  const avg = s.averages('hour', T0 + 5000).get(key);
  assert.ok(Math.abs(avg[0] - 0.4) < 1e-9);
  assert.equal(avg[1], 250);
  const copy = new Store();
  copy.loadLines(`${s.drain(T0 + 120000)[0].line}\nrotto\n`);
  assert.equal(copy.averages('hour', T0 + 5000).get(key)[1], 250);
  const bin = copy.timeline('hour', T0 + 60000).find((b) => b.w);
  assert.ok(Math.abs(bin.mem - 0.65) < 1e-9);
});

test('albero: ordine per misura, processo solo se serve', () => {
  const k = (a, p) => a + SEP + p;
  const avg = new Map([[k('Chrome', 'H1'), [0.1, 900, 5]], [k('Chrome', 'H2'), [0.3, 100, 1]], [k('Mail', 'Mail'), [0.5, 50, 1]]]);
  const cpu = buildTree(avg, 'cpu');
  assert.deepEqual(cpu.c.map((a) => a.n), ['Mail', 'Chrome']);
  assert.deepEqual(cpu.c[1].c.map((p) => p.n), ['H2', 'H1']);
  assert.ok(!cpu.c[0].d);
  assert.deepEqual(buildTree(avg, 'mem').c.map((a) => a.n), ['Chrome', 'Mail']);
});
