// Lettura dell'output di `nettop -L 1`, guidata dall'intestazione:
//   time,,interface,state,bytes_in,bytes_out,...
//   12:49:53.399032,firefox.5356,,,5427,1386,...
//   12:49:53.392327,tcp4 192.168.1.2:52429<->host.example:443,en7,Established,5427,1386,...
// Le righe di connessione seguono quella del processo a cui appartengono.
const UNITS = { b: 1, kib: 1024, mib: 1048576, gib: 1073741824, tib: 1099511627776, kb: 1000, mb: 1e6, gb: 1e9 };

export function parseBytes(raw) {
  const text = String(raw ?? '').trim();
  if (/^\d+$/.test(text)) return Number(text);
  const m = /^([\d.]+)\s*([A-Za-z]+)$/.exec(text);
  if (!m || !(m[2].toLowerCase() in UNITS)) return null;
  return Math.round(Number(m[1]) * UNITS[m[2].toLowerCase()]);
}

export function parseEndpoint(raw) {
  const text = raw.trim();
  if (text === '*' || text === '*:*' || text === '*.*') return { host: '*', port: '*' };
  const bracket = /^\[(.+)\][:.](\d+|\*)$/.exec(text);
  if (bracket) return { host: bracket[1], port: bracket[2] };
  const colons = (text.match(/:/g) || []).length;
  // IPv6: la porta segue un punto, perché i due punti fanno parte dell'indirizzo.
  const at = colons > 1 ? text.lastIndexOf('.') : text.lastIndexOf(':');
  if (at < 0) return { host: text, port: '*' };
  return { host: text.slice(0, at), port: text.slice(at + 1) };
}

export function parseSample(text) {
  const rows = [];
  const issues = { lines: 0, skipped: 0, header: false };
  let col = null;
  let owner = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    const cells = line.split(',');
    const inIdx = cells.indexOf('bytes_in');
    if (inIdx >= 0) {
      const timeFirst = cells[0].trim() === 'time';
      col = { name: timeFirst ? 1 : 0, iface: cells.indexOf('interface'), in: inIdx, out: cells.indexOf('bytes_out') };
      issues.header = true;
      owner = null;
      continue;
    }
    if (!col) continue;
    issues.lines++;
    const name = (cells[col.name] || '').trim();
    if (name.includes('<->')) {
      if (!owner) { issues.skipped++; continue; }
      const m = /^(\S+)\s+(.+?)<->(.+)$/.exec(name);
      const bytesIn = parseBytes(cells[col.in]);
      const bytesOut = parseBytes(cells[col.out]);
      if (!m || bytesIn === null || bytesOut === null) { issues.skipped++; continue; }
      rows.push({
        pid: owner.pid, process: owner.name, proto: m[1], local: m[2].trim(),
        remote: parseEndpoint(m[3]), iface: (cells[col.iface] || '').trim(), in: bytesIn, out: bytesOut,
      });
    } else {
      const m = /^(.*)\.(\d+)$/.exec(name);
      if (m) owner = { name: m[1], pid: Number(m[2]) };
      else { owner = null; issues.skipped++; }
    }
  }
  return { rows, issues };
}

// Linux: `ss -Htinp` dà una riga per connessione seguita da una rientrata con i contatori.
//   ESTAB 0 0 192.0.2.2:54376 160.79.104.10:443 users:(("claude",pid=104,fd=15))
//   \t bbr wscale:7,10 ... bytes_sent:43354 bytes_acked:43355 bytes_received:3746 ...
const unmap = (host) => host.replace(/^::ffff:/i, '').replace(/%.*$/, '');
export function parseSs(lines) {
  const rows = [];
  let cur = null;
  for (const line of lines || []) {
    if (/^\s/.test(line)) {
      if (!cur) continue;
      cur.in = Number(/bytes_received:(\d+)/.exec(line)?.[1] || 0);
      cur.out = Number(/bytes_sent:(\d+)/.exec(line)?.[1] || 0);
      rows.push(cur);
      cur = null;
      continue;
    }
    const f = line.trim().split(/\s+/);
    if (f.length < 5) { cur = null; continue; }
    const remote = parseEndpoint(f[4]);
    const who = /users:\(\("((?:[^"\\]|\\.)*)",pid=(\d+)/.exec(line);
    cur = {
      pid: who ? Number(who[2]) : 0, process: who ? who[1] : '', proto: 'tcp', local: f[3],
      remote: { host: unmap(remote.host), port: remote.port }, iface: '', in: 0, out: 0,
    };
  }
  return rows;
}

const VIRTUAL = /^(lo|veth|docker|br-|virbr|vmnet|vboxnet|tun|tap|wg|ifb|dummy|cni|flannel|tailscale)/;
// Byte reali delle interfacce fisiche, per sapere quanto traffico resta fuori da ss.
export function parseNetDev(lines) {
  let rx = 0;
  let tx = 0;
  let seen = false;
  for (const line of lines || []) {
    const m = /^\s*([^:\s]+):\s*(.*)$/.exec(line);
    if (!m || VIRTUAL.test(m[1])) continue;
    const c = m[2].trim().split(/\s+/).map(Number);
    if (c.length < 9) continue;
    rx += c[0];
    tx += c[8];
    seen = true;
  }
  return seen ? { rx, tx } : null;
}

export function parseLinuxPaths(lines) {
  const paths = new Map();
  for (const line of lines || []) {
    const m = /\/proc\/(\d+)\/exe -> (.+)$/.exec(line);
    if (m) paths.set(Number(m[1]), m[2].replace(/ \(deleted\)$/, ''));
  }
  return paths;
}

export function sections(text) {
  const out = {};
  let cur = null;
  for (const line of text.split('\n')) {
    const m = /^===(\w+)$/.exec(line);
    if (m) { cur = m[1]; out[cur] = []; } else if (cur) out[cur].push(line);
  }
  return out;
}

// Quanto le interfacce hanno visto più delle connessioni lette. I contatori di rete includono
// le intestazioni dei pacchetti, che il margine evita di scambiare per traffico perso.
export function residual(device, attributed, margin = 0.94, floor = 4096) {
  const rest = (d, a) => { const r = d * margin - a; return r >= floor ? Math.round(r) : 0; };
  return { in: rest(device.in, attributed.in), out: rest(device.out, attributed.out) };
}

const isLoopback = (r) => r.iface === 'lo0' || /^(127\.|::1$|localhost$)/.test(r.remote.host) || /^(127\.|::1)/.test(r.local);

// Trasforma i contatori cumulativi in traffico del campione. Ogni connessione è
// identificata dal suo capo locale, che resta uguale anche quando il nome del
// server remoto passa da IP a dominio.
export class DeltaTracker {
  constructor() { this.seen = new Map(); this.primed = false; this.tick = 0; }

  feed(rows) {
    this.tick++;
    const out = [];
    for (const r of rows) {
      if (isLoopback(r)) continue;
      const key = `${r.pid}|${r.proto}|${r.local}|${r.remote.port}`;
      const before = this.seen.get(key);
      this.seen.set(key, { in: r.in, out: r.out, tick: this.tick });
      if (!this.primed) continue; // primo campione: solo il punto di partenza
      const dIn = before && r.in >= before.in ? r.in - before.in : r.in;
      const dOut = before && r.out >= before.out ? r.out - before.out : r.out;
      if (dIn || dOut) out.push({ ...r, dIn, dOut });
    }
    this.primed = true;
    for (const [key, v] of this.seen) if (this.tick - v.tick > 20) this.seen.delete(key);
    return out;
  }
}
