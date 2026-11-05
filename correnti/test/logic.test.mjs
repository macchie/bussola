import test from 'node:test';
import assert from 'node:assert';
import { parseSample, parseEndpoint, parseBytes, parseSs, parseNetDev, parseLinuxPaths, residual, sections, DeltaTracker } from '../resources/core/nettop.js';
import { appOf, linuxAppOf, destinationOf, parsePs, SYSTEM_APP, LOCAL_DEST, OTHER_USERS, LINUX_SYSTEM } from '../resources/core/attribute.js';
import { Store, buildTree, SEP } from '../resources/core/store.js';

// Righe nel formato documentato da SANS ISC per `nettop -L`.
const SAMPLE = `time,,interface,state,bytes_in,bytes_out,rx_dupe,rx_ooo,re-tx,rtt_avg,rcvsize,tx_win,tc_class,tc_mgt,cc_algo,P,C,R,W,arch,
12:49:53.399032,firefox.5356,,,5427,1386,0,0,0,,,,,,,,,,,,,
12:49:53.392327,tcp4 192.168.254.212:52429<->55.65.117.34.bc.googleusercontent.com:443,en7,Established,5427,1386,0,0,0,39.81 ms,131072,69376,BE,-,cubic,-,-,-,-,so,
12:49:53.399100,Google Chrome H.900,,,10,20,0,0,0,,,,,,,,,,,,,
12:49:53.399100,udp4 *:5353<->*:*,en0,,0,0,
12:49:53.399100,tcp6 2a00:1450:4001::1.51000<->2a00:1450:4002::2.443,en0,Established,7,8,
12:49:53.399100,tcp4 127.0.0.1:5000<->127.0.0.1:6000,lo0,Established,900,900,
`;

test('riconosce processi, connessioni e righe IPv6', () => {
  const { rows, issues } = parseSample(SAMPLE);
  assert.ok(issues.header);
  assert.equal(issues.skipped, 0);
  assert.equal(rows.length, 4);
  assert.deepEqual([rows[0].pid, rows[0].process, rows[0].in, rows[0].out, rows[0].iface], [5356, 'firefox', 5427, 1386, 'en7']);
  assert.equal(rows[0].remote.host, '55.65.117.34.bc.googleusercontent.com');
  assert.equal(rows[1].process, 'Google Chrome H');
  assert.deepEqual(rows[2].remote, { host: '2a00:1450:4002::2', port: '443' });
});

test('intestazione senza colonna time e numeri con unità', () => {
  const { rows } = parseSample(',bytes_in,bytes_out,\napsd.84,1,2,\ntcp4 1.1.1.1:1<->2.2.2.2:443,4300 B,1 KiB,\n');
  assert.deepEqual([rows.length, rows[0].in, rows[0].out], [1, 4300, 1024]);
});

test('byte ed estremi', () => {
  assert.equal(parseBytes('1 KiB'), 1024);
  assert.equal(parseBytes('--'), null);
  assert.deepEqual(parseEndpoint('*:*'), { host: '*', port: '*' });
  assert.deepEqual(parseEndpoint('[::1]:80'), { host: '::1', port: '80' });
});

test('dai contatori cumulativi ai delta', () => {
  const t = new DeltaTracker();
  const row = (local, i, o, host = '8.8.8.8') => ({ pid: 1, process: 'a', proto: 'tcp4', local, remote: { host, port: '443' }, iface: 'en0', in: i, out: o });
  assert.equal(t.feed([row('l:1', 1000, 1000)]).length, 0, 'il primo campione è solo la base');
  let d = t.feed([row('l:1', 1500, 1000, 'dns.google')]);
  assert.deepEqual([d[0].dIn, d[0].dOut], [500, 0], 'il nome che si risolve non azzera la connessione');
  d = t.feed([row('l:1', 1500, 1000), row('l:2', 70, 30)]);
  assert.deepEqual([d.length, d[0].dIn], [1, 70], 'connessione nuova contata per intero');
  d = t.feed([row('l:1', 5, 5)]);
  assert.equal(d[0].dIn, 5, 'contatore ripartito');
  assert.equal(t.feed([{ ...row('x', 999, 999), iface: 'lo0' }]).length, 0, 'loopback escluso');
});

test('attribuzione alle app', () => {
  const chrome = '/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper';
  assert.deepEqual(appOf(chrome, 'Google Chrome H'), { app: 'Google Chrome', process: 'Google Chrome Helper', bundle: '/Applications/Google Chrome.app' });
  assert.equal(appOf('/usr/sbin/mDNSResponder', 'mDNSResponder').app, SYSTEM_APP);
  assert.equal(appOf('/System/Library/PrivateFrameworks/X.framework/x', 'x').app, SYSTEM_APP);
  assert.equal(appOf('/opt/homebrew/bin/node', 'node').app, 'node');
  assert.equal(appOf(undefined, 'scomparso').app, 'scomparso');
  assert.equal(parsePs('  12 /usr/bin/a b\n').get(12), '/usr/bin/a b');
});

test('destinazioni', () => {
  assert.equal(destinationOf('lhr25s34-in-f14.1e100.net'), 'Google');
  assert.equal(destinationOf('a.b.example.co.uk'), 'example.co.uk');
  assert.equal(destinationOf('api.github.com'), 'GitHub');
  assert.equal(destinationOf('192.168.1.8'), LOCAL_DEST);
  assert.equal(destinationOf('stampante.local'), LOCAL_DEST);
  assert.equal(destinationOf('8.8.8.8'), '8.8.8.8');
  assert.equal(destinationOf('2a00:1450::1'), '2a00:1450::1');
});

const T0 = new Date(2026, 10, 4, 12, 0, 0).getTime();
test('periodi, tempo e persistenza', () => {
  const s = new Store();
  s.record(T0, [{ app: 'A', process: 'a', dest: 'x.com', in: 100, out: 10 }]);
  s.record(T0 + 3000, [{ app: 'A', process: 'a', dest: 'x.com', in: 50, out: 5 }, { app: 'B', process: 'b', dest: 'y.com', in: 1, out: 1 }]);
  assert.equal(s.totals('live', T0 + 4000).get(['A', 'a', 'x.com'].join(SEP))[0], 150);
  assert.equal(s.rate().in, 51 / 3);
  const lines = s.drain(T0 + 120000);
  assert.equal(lines.length, 1);
  assert.equal(s.drain(T0 + 120000).length, 0, 'ogni minuto si salva una volta');
  const copy = new Store();
  copy.loadLines(`${lines[0].line}\nnon-json\n`);
  assert.equal(copy.totals('hour', T0 + 60000).get(['A', 'a', 'x.com'].join(SEP))[1], 15);
  assert.equal(copy.timeline('hour', T0 + 60000).reduce((n, b) => n + b.in, 0), 151);
  copy.prune(T0 + 8 * 86400000);
  assert.equal(copy.minutes.size, 0);
});

test('albero: ordine, direzione, livello processo solo se serve', () => {
  const j = (...p) => p.join(SEP);
  const totals = new Map([[j('Chrome', 'H1', 'a.com'), [100, 1]], [j('Chrome', 'H2', 'b.com'), [50, 900]], [j('Mail', 'Mail', 'm.com'), [10, 10]]]);
  const all = buildTree(totals, 'all');
  assert.deepEqual(all.c.map((a) => a.n), ['Chrome', 'Mail']);
  assert.equal(all.s, 1071);
  assert.deepEqual(all.c[0].c.map((p) => p.n), ['H2', 'H1']);
  assert.equal(all.c[1].c[0].kind, 'dest', 'un solo processo: si passa alla destinazione');
  const sent = buildTree(totals, 'out');
  assert.equal(sent.c[0].s, 901);
  assert.deepEqual(sent.c[0].c.map((p) => p.s), [900, 1]);
});

// Righe vere di ss 6.1, accorciate.
const SS = `ESTAB 0      0      192.0.2.2:54376 160.79.104.10:443 users:(("claude",pid=104,fd=15))
	 bbr wscale:7,10 rto:204 mss:1348 bytes_sent:43354 bytes_acked:43355 bytes_received:3746 segs_out:38
ESTAB 0      0      [::ffff:192.168.1.5]:443 [::ffff:8.8.8.8]:50000 users:(("nginx: worker",pid=7,fd=3),("nginx",pid=6,fd=3))
	 cubic bytes_sent:10
ESTAB 0      0      [2a00:1450::1]:51000 [2a00:1450::2]:443
	 cubic bytes_received:5 bytes_sent:6
ESTAB 0      0      127.0.0.1:5000 127.0.0.1:6000 users:(("db",pid=9,fd=3))
	 cubic bytes_sent:999 bytes_received:999`.split('\n');

test('Linux: righe di ss, IPv6, indirizzi mappati, socket senza processo', () => {
  const r = parseSs(SS);
  assert.equal(r.length, 4);
  assert.deepEqual([r[0].pid, r[0].process, r[0].in, r[0].out, r[0].remote.host, r[0].remote.port], [104, 'claude', 3746, 43354, '160.79.104.10', '443']);
  assert.deepEqual([r[1].process, r[1].in, r[1].out, r[1].remote.host], ['nginx: worker', 0, 10, '8.8.8.8']);
  assert.deepEqual([r[2].pid, r[2].process, r[2].remote.host], [0, '', '2a00:1450::2']);
  const t = new DeltaTracker();
  t.feed(r);
  const bumped = r.map((x) => ({ ...x, in: x.in + 100, out: x.out }));
  assert.equal(t.feed(bumped).length, 3, 'il loopback resta fuori');
});

test('Linux: schede di rete, solo quelle fisiche', () => {
  const dev = parseNetDev(['Inter-|   Receive', ' face |bytes packets', '    lo: 900 1 0 0 0 0 0 0 900 1 0 0 0 0 0 0', '  eth0: 1000 1 0 0 0 0 0 0 200 1 0 0 0 0 0 0', ' wlan0: 500 1 0 0 0 0 0 0 100 1 0 0 0 0 0 0', 'docker0: 7 1 0 0 0 0 0 0 7 1 0 0 0 0 0 0', ' tun0: 8 1 0 0 0 0 0 0 8 1 0 0 0 0 0 0']);
  assert.deepEqual(dev, { rx: 1500, tx: 300 });
  assert.equal(parseNetDev([]), null);
});

test('il traffico non attribuito ignora le intestazioni dei pacchetti', () => {
  assert.deepEqual(residual({ in: 1000000, out: 10000 }, { in: 950000, out: 10000 }), { in: 0, out: 0 });
  assert.deepEqual(residual({ in: 1000000, out: 0 }, { in: 100000, out: 0 }), { in: 840000, out: 0 });
});

test('attribuzione su Linux', () => {
  assert.equal(linuxAppOf('/opt/google/chrome/chrome', 'chrome').app, 'Chrome');
  assert.equal(linuxAppOf('/usr/lib/firefox/firefox-bin', 'firefox-bin').app, 'Firefox');
  assert.equal(linuxAppOf('/snap/spotify/1/spotify', 'spotify').app, 'Spotify');
  assert.equal(linuxAppOf('/usr/bin/curl', 'curl').app, 'curl');
  assert.equal(linuxAppOf('/usr/sbin/sshd', 'sshd').app, LINUX_SYSTEM);
  assert.equal(linuxAppOf(undefined, 'proc').app, 'proc', 'percorso non leggibile');
  assert.equal(linuxAppOf(undefined, '').app, OTHER_USERS);
  assert.equal(parseLinuxPaths(['lrwxrwxrwx 1 a a 0 Nov 5 10:00 /proc/7/exe -> /usr/bin/x (deleted)']).get(7), '/usr/bin/x');
  assert.deepEqual(Object.keys(sections('===SS\na\n===DEV\nb\n')), ['SS', 'DEV']);
});
