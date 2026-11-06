import test from 'node:test';
import assert from 'node:assert';
import { hexAddress, parseProcNet, parseLinux, parseNettop, parseEndpoint, parseWindows, classify, portInfo, splitBlocks } from '../resources/core/ports/parse.js';
import { digest } from '../resources/core/ports/sampler.js';
import { Ledger, buildTree, SEP } from '../resources/core/ports/store.js';
import { destinationOf, UNKNOWN_APP } from '../resources/core/ports/attribute.js';

test('addresses from /proc/net', () => {
  assert.equal(hexAddress('0100007F'), '127.0.0.1');
  assert.equal(hexAddress('00000000'), '0.0.0.0');
  assert.equal(hexAddress('00000000000000000000000000000000'), '::');
  assert.equal(hexAddress('00000000000000000000000001000000'), '::1');
  assert.equal(hexAddress('0000000000000000FFFF00000100007F'), '::ffff:127.0.0.1');
});

const LINUX = `===TCP
  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:8A71 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 1235 2 00
   1: 00000000:0016 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 777 1 00
   2: 0100A8C0:C350 08080808:01BB 01 00000000:00000000 00:00000000 00000000  1000        0 888 1 00
   3: 0100A8C0:C351 08080808:01BB 06 00000000:00000000 00:00000000 00000000  1000        0 0 1 00
===UDP
  sl  local_address rem_address   st tx_dequeue tx_queue
   5: 00000000:14E9 00000000:0000 07 00000000:00000000 00:00000000 00000000   100        0 999 2 00
===FD
/proc/10/fd:
lrwx------ 1 me me 64 Nov 4 21:00 3 -> socket:[777]
/proc/20/fd:
lrwx------ 1 me me 64 Nov 4 21:00 3 -> socket:[888]
===PS
   10 sshd
   20 firefox-bin
===EXE
lrwxrwxrwx 1 me me 0 Nov  4 21:00 /proc/20/exe -> /usr/lib/firefox/firefox-bin
`;
test('Linux: states, ports and socket owners', () => {
  const s = parseLinux(LINUX);
  assert.equal(s.sockets.length, 4, 'TIME_WAIT ignorato');
  const ssh = s.sockets.find((k) => k.port === 22);
  assert.deepEqual([ssh.local, ssh.state, ssh.pid], ['0.0.0.0', 'listen', 10]);
  const conn = s.sockets.find((k) => k.state === 'open');
  assert.deepEqual([conn.remote, conn.rport, conn.pid], ['8.8.8.8', 443, 20]);
  assert.equal(s.sockets.find((k) => k.proto === 'udp').port, 5353);
  assert.equal(parseProcNet(['rubbish'], 'tcp').length, 0);
});

test('macOS: nettop rows, listening ports and IPv6', () => {
  const { sockets, header } = parseNettop(`time,,interface,state,bytes_in,bytes_out,
12:49:53.1,rapportd.500,,,1,1,
12:49:53.1,tcp4 *:49152<->*:*,en0,Listen,0,0,
12:49:53.1,tcp6 ::1.5432<->*.*,lo0,Listen,0,0,
12:49:53.1,firefox.5356,,,5427,1386,
12:49:53.1,tcp4 192.168.1.2:52429<->55.65.117.34.bc.googleusercontent.com:443,en7,Established,5427,1386,
12:49:53.1,tcp4 192.168.1.2:52430<->1.1.1.1:443,en7,TimeWait,1,1,
12:49:53.1,mDNSResponder.170,,,1,1,
12:49:53.1,udp4 *:5353<->*:*,en0,,0,0,
`.split('\n'));
  assert.ok(header);
  assert.equal(sockets.length, 4);
  assert.deepEqual([sockets[0].port, sockets[0].state, sockets[0].local], [49152, 'listen', '*']);
  assert.deepEqual([sockets[1].local, sockets[1].port], ['::1', 5432]);
  assert.deepEqual([sockets[2].state, sockets[2].pid, sockets[2].rport], ['open', 5356, 443]);
  assert.equal(sockets[3].state, 'listen');
  assert.deepEqual(parseEndpoint('2a00:1450::1.443'), { host: '2a00:1450::1', port: 443 });
});

test('Windows: TCP, UDP, processi, blocchi', () => {
  const s = parseWindows('T\tListen\t0.0.0.0\t3389\t0.0.0.0\t0\t1044\r\nT\tTimeWait\t1.1.1.1\t5\t2.2.2.2\t6\t0\r\nT\tEstablished\t192.168.1.2\t5000\t8.8.8.8\t443\t900\r\nU\t127.0.0.1\t1900\t44\r\nQ\t900\tchrome\r\nI\t900\tC:\\P\\chrome.exe\tGoogle Chrome\r\n');
  assert.equal(s.sockets.length, 3);
  assert.deepEqual(s.sockets.map(classify), ['exposed', 'conn', 'local']);
  assert.equal(s.paths.get(900).description, 'Google Chrome');
  assert.equal(splitBlocks('Q\t1\tEND\nEND\n').blocks.length, 1);
});

test('classification and port names', () => {
  assert.equal(classify({ state: 'listen', local: '127.0.0.1' }), 'local');
  assert.equal(classify({ state: 'listen', local: '::1' }), 'local');
  assert.equal(classify({ state: 'listen', local: '*' }), 'exposed');
  assert.equal(classify({ state: 'listen', local: '192.168.1.2' }), 'exposed');
  assert.equal(classify({ state: 'open', local: '127.0.0.1', remote: '127.0.0.1' }), null);
  assert.deepEqual(portInfo(5432, 'tcp'), { label: '5432 TCP, PostgreSQL', remote: false });
  assert.equal(portInfo(22, 'tcp').remote, true);
  assert.equal(portInfo(61000, 'udp').label, '61000 UDP');
});

test('from read to entries, with sockets without a known owner', () => {
  const r = digest({ procs: [{ pid: 20, ppid: 1, name: 'firefox-bin' }], sockets: [
    { proto: 'tcp', local: '0.0.0.0', port: 22, remote: '0.0.0.0', rport: 0, state: 'listen', pid: null },
    { proto: 'tcp', local: '10.0.0.2', port: 5, remote: '8.8.8.8', rport: 443, state: 'open', pid: 20 },
    { proto: 'tcp', local: '10.0.0.2', port: 6, remote: '8.8.8.8', rport: 443, state: 'open', pid: 20 },
  ] }, 'Linux', new Map([[20, { path: '/usr/lib/firefox/firefox-bin' }]]), new Map());
  assert.equal(r.exposed, 1);
  assert.equal(r.conn, 2);
  assert.equal(r.entries.get(['conn', 'Firefox', 'firefox-bin', '8.8.8.8'].join(SEP)), 2);
  assert.ok(r.entries.has(['exposed', UNKNOWN_APP, '', '22 TCP, SSH'].join(SEP)));
  assert.ok([...r.details.values()][0].remote, 'exposed SSH is flagged');
  assert.equal(destinationOf('192.168.1.1'), 'Local network');
});

test('log: the first scan is not something new', () => {
  const l = new Ledger();
  l.observe(['a'], 1000);
  l.observe(['a', 'b'], 1000 + 120000);
  assert.equal(l.isNew('a', 200000), false);
  assert.equal(l.isNew('b', 200000), true);
  assert.equal(l.isNew('b', 200000 + 2 * 86400000), false, 'after 24 hours it is no longer new');
  const copy = new Ledger(JSON.parse(JSON.stringify(l)));
  assert.equal(copy.isNew('b', 200000), true, 'sopravvive al salvataggio');
  assert.deepEqual(copy.seenSince(100000), ['a', 'b']);
  copy.prune(121000 + 8 * 86400000);
  assert.equal(copy.items.size, 0);
});

test('tree by type, order and newness', () => {
  const k = (...p) => p.join(SEP);
  const t = buildTree(new Map([[k('exposed', 'A', 'a', '22 TCP'), 1], [k('exposed', 'B', 'b', '80 TCP'), 1], [k('exposed', 'B', 'b', '443 TCP'), 1], [k('conn', 'C', 'c', 'x.com'), 5]]), 'exposed', (key, item) => ({ isNew: item === '80 TCP' }));
  assert.equal(t.s, 3);
  assert.deepEqual(t.c.map((a) => a.n), ['B', 'A']);
  assert.equal(t.fresh, 1);
  assert.equal(t.c[0].fresh, 1);
});
