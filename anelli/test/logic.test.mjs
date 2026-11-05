// Development only: the app doesn't use Node. They test the pure logic, including the
// Windows format, which can be simulated here.
import test from 'node:test';
import assert from 'node:assert';
import { refuse } from '../resources/backend/safety.js';
import { dirname, ancestors, inside, macDataPath, quoteSh, quotePs, stripTrailing } from '../resources/backend/paths.js';
import { parseDf, filterLinux, filterMac, parseWindows } from '../resources/backend/volumes.js';
import { handle } from '../resources/backend/scan-worker.js';

const enc = (s) => new TextEncoder().encode(s).buffer;
function build(config, text, splitAt) {
  const out = [];
  const post = (m) => out.push(m);
  handle({ type: 'config', config }, post);
  const bytes = new Uint8Array(enc(text));
  const cut = splitAt ?? bytes.length;
  handle({ type: 'chunk', buffer: bytes.slice(0, cut) }, post);
  handle({ type: 'chunk', buffer: bytes.slice(cut) }, post);
  handle({ type: 'end' }, post);
  const ask = (cmd, args) => { let r; handle({ id: 1, cmd, args }, (m) => { r = m; }); if (r.error) throw new Error(r.error); return r.result; };
  return { out, ask };
}
const posix = { root: '/d', sep: '/', windows: false, trashHome: '/data/trash' };

test('POSIX: albero, ordinamento e byte da kB', () => {
  const { ask } = build(posix, '4\t/d/a/x\n8\t/d/a/y\n16\t/d/a\n100\t/d/b\n120\t/d\n');
  const t = ask('tree', { target: '/d', depth: 3 });
  assert.equal(t.s, 120 * 1024);
  assert.deepEqual(t.c.map((c) => c.n), ['b', 'a']);
  assert.equal(t.c[1].d, 1);
  assert.equal(t.c[1].fc, 2);
});

test('POSIX: a UTF-8 character split across two chunks stays intact', () => {
  const text = '4\t/d/café.txt\n8\t/d\n';
  const at = new TextEncoder().encode(text).indexOf(0xc3) + 1;
  const { ask } = build(posix, text, at);
  assert.equal(ask('tree', { target: '/d', depth: 1 }).c[0].n, 'café.txt');
});

test('the trash next to the files doesn\'t appear and doesn\'t weigh in the totals', () => {
  const { ask } = build(posix, '50\t/d/.anelli-trash-0/id/f\n54\t/d/.anelli-trash-0/id\n58\t/d/.anelli-trash-0\n4\t/d/s/.anelli-trash-0/z\n8\t/d/s/.anelli-trash-0\n2\t/d/s/k\n14\t/d/s\n10\t/d/z\n90\t/d\n');
  const t = ask('tree', { target: '/d', depth: 3 });
  assert.deepEqual(t.c.map((c) => c.n).sort(), ['s', 'z']);
  assert.equal(t.s, (90 - 58 - 8) * 1024);
  assert.equal(t.c.find((c) => c.n === 's').s, 6 * 1024);
});

test('Windows: explicit types, empty folders, drive root', () => {
  const cfg = { root: 'C:\\', sep: '\\', windows: true, trashHome: 'C:\\Users\\a\\AppData\\Roaming\\Anelli\\trash' };
  const { ask } = build(cfg, '10\tF\tC:\\Dati\\a.bin\r\n0\tD\tC:\\Vuota\n10\tD\tC:\\Dati\n10\tD\tC:\\\n');
  const t = ask('tree', { target: 'C:\\', depth: 3 });
  assert.equal(t.s, 10);
  assert.ok(t.c.find((c) => c.n === 'Vuota').d);
  assert.equal(ask('node', { target: 'c:\\dati\\a.bin' }), null, 'i nomi figli restano esatti');
  assert.equal(ask('node', { target: 'C:\\Dati\\a.bin' }).size, 10);
});

test('list without a root: error, not an empty tree', () => {
  const { out } = build(posix, '');
  assert.equal(out.at(-1).type, 'failed');
});

test('files beyond the limit stay in the total as a group', () => {
  let text = '';
  for (let i = 0; i < 250; i++) text += `4\t/d/f${i}\n`;
  const { ask } = build(posix, `${text}1000\t/d\n`);
  const t = ask('tree', { target: '/d', depth: 2 });
  assert.equal(t.c.length, 200);
  assert.equal(t.o.count, 50);
  assert.equal(t.fc, 250);
});

const ctx = (os, extra = {}) => ({ os, home: os === 'Windows' ? 'C:\\Users\\a' : '/home/a', mounts: [], protectedDirs: [], allowSystem: false, ...extra });

test('protezioni Linux e macOS', () => {
  for (const p of ['/', '/usr', '/usr/bin/ls', '/etc/passwd', '/home', '/home/a', '/var', 'rel/x', '/home/a/../b', '/home/a/./x', '/home/a/x/']) {
    assert.ok(refuse(p, ctx('Linux')), p);
  }
  assert.equal(refuse('/home/a/video.mov', ctx('Linux')), null);
  assert.equal(refuse('/var/log/old', ctx('Linux')), null);
  assert.ok(refuse('/mnt/d', ctx('Linux', { mounts: ['/mnt/d'] })));
  assert.ok(refuse('/x/.anelli-trash-0', ctx('Linux')));
  const mac = ctx('Darwin', { home: '/Users/a' });
  for (const p of ['/System/Library', '/Users', '/Applications', '/System/Volumes/Data']) assert.ok(refuse(p, mac), p);
  assert.equal(refuse('/Users/a/Movies/x', mac), null);
  assert.equal(refuse('/System/Volumes/Data/Users/a/Movies/x', mac), null);
  for (const p of ['/System/Volumes/Data', '/System/Volumes/Data/Users', '/System/Volumes/Data/Users/a', '/System/Volumes/Data/usr/local/x', '/System/Volumes/Data/Applications']) {
    assert.ok(refuse(p, mac), p);
  }
  assert.ok(refuse('/System/Volumes/Data/Users/a/Library/Application Support/Anelli/trash', { ...mac, protectedDirs: ['/Users/a/Library/Application Support/Anelli'] }));
});

test('Windows protections, case-insensitive', () => {
  const w = ctx('Windows', { mounts: ['D:\\'] });
  for (const p of ['C:\\', 'D:\\', 'C:\\Windows\\System32', 'c:\\windows', 'C:\\Program Files\\App', 'C:\\pagefile.sys', 'C:\\Users', 'c:\\users\\A', 'C:\\ProgramData\\x']) {
    assert.ok(refuse(p, w), p);
  }
  assert.equal(refuse('C:\\Users\\a\\Downloads\\x.iso', w), null);
  assert.equal(refuse('D:\\Film\\x.mkv', w), null);
});

test('percorsi su entrambe le famiglie', () => {
  assert.equal(dirname('/usr', '/'), '/');
  assert.equal(dirname('C:\\Dati', '\\'), 'C:\\');
  assert.equal(dirname('C:\\Dati\\x', '\\'), 'C:\\Dati');
  assert.deepEqual(ancestors('/a/b/c', '/'), ['/', '/a', '/a/b']);
  assert.deepEqual(ancestors('C:\\a\\b', '\\'), ['C:\\', 'C:\\a']);
  assert.ok(inside('C:\\A\\b', 'c:\\a', '\\', true));
  assert.ok(!inside('/ab', '/a', '/'));
  assert.equal(stripTrailing('C:\\', '\\'), 'C:\\');
  assert.equal(macDataPath('/Users/a'), '/System/Volumes/Data/Users/a');
  assert.equal(macDataPath('/Volumes/X/a'), '/Volumes/X/a');
  assert.equal(quoteSh("a'b"), `'a'\\''b'`);
  assert.equal(quotePs("a'b"), "'a''b'");
});

test('dischi: df, /proc/self/mounts e PowerShell', () => {
  const df = 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 100 40 60 40% /\ntmpfs 10 0 10 0% /run\n/dev/sdb1 200 50 150 25% /media/a b\n/dev/sda1 100 40 60 40% /var/lib/bind\n';
  const rows = parseDf(df);
  assert.equal(rows.length, 4);
  const list = filterLinux(rows, '/dev/sda1 / ext4 rw 0 0\ntmpfs /run tmpfs rw 0 0\n/dev/sdb1 /media/a\\040b ext4 rw 0 0\n/dev/sda1 /var/lib/bind ext4 rw 0 0\n');
  assert.deepEqual(list.map((v) => v.mount), ['/', '/media/a b']);
  const mac = filterMac(parseDf('Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk3s1 100 9 50 15% /\n/dev/disk3s5 100 40 50 45% /System/Volumes/Data\n/dev/disk3s4 100 1 50 2% /System/Volumes/VM\nmap auto_home 0 0 0 100% /System/Volumes/Data/home\n/dev/disk4s1 300 10 290 4% /Volumes/Foto\n'));
  assert.deepEqual(mac.map((v) => v.name), ['Macintosh HD', 'Foto']);
  assert.equal(parseWindows('{"DeviceID":"C:","VolumeName":"","Size":100,"FreeSpace":40}')[0].used, 60);
});
