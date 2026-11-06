// Three systems, a single shape: sockets: [{ proto, local, port, remote, rport, state, pid }]
// where state is 'listen' or 'open'. procs: [{ pid, ppid, name }], paths: Map pid -> { path, description }
const sections = (text) => {
  const out = {};
  let cur = null;
  for (const line of text.split('\n')) {
    const m = /^===(\w+)$/.exec(line);
    if (m) { cur = m[1]; out[cur] = []; } else if (cur) out[cur].push(line);
  }
  return out;
};

export function hexAddress(hex) {
  if (hex.length === 8) return hex.match(/../g).reverse().map((b) => parseInt(b, 16)).join('.');
  const words = hex.toLowerCase().match(/.{8}/g).map((w) => w.match(/../g).reverse().join(''));
  const full = words.join('');
  if (full.startsWith('00000000000000000000ffff')) {
    return `::ffff:${full.slice(24).match(/../g).map((b) => parseInt(b, 16)).join('.')}`;
  }
  const groups = full.match(/.{4}/g).map((g) => parseInt(g, 16).toString(16)).join(':');
  return groups.replace(/(^|:)0(:0)+(:|$)/, '::');
}

export function parseProcNet(lines, proto) {
  const out = [];
  for (const line of lines || []) {
    const m = /^\s*\d+:\s+([0-9A-Fa-f]+):([0-9A-Fa-f]+)\s+([0-9A-Fa-f]+):([0-9A-Fa-f]+)\s+([0-9A-Fa-f]{2})\s+\S+\s+\S+\s+\S+\s+\d+\s+\d+\s+(\d+)/.exec(line);
    if (!m) continue;
    const st = m[5].toUpperCase();
    const rport = parseInt(m[4], 16);
    const tcp = proto === 'tcp';
    const state = tcp ? (st === '0A' ? 'listen' : st === '01' ? 'open' : null) : (rport ? 'open' : 'listen');
    if (!state) continue;
    out.push({ proto, local: hexAddress(m[1]), port: parseInt(m[2], 16), remote: hexAddress(m[3]), rport, state, inode: m[6] });
  }
  return out;
}

export function parseLinux(text) {
  const s = sections(text);
  const owners = new Map();
  let pid = null;
  for (const line of s.FD || []) {
    const dir = /^\/proc\/(\d+)\/fd:/.exec(line);
    if (dir) { pid = Number(dir[1]); continue; }
    const m = /socket:\[(\d+)\]/.exec(line);
    if (m && pid && !owners.has(m[1])) owners.set(m[1], pid);
  }
  const sockets = [...parseProcNet(s.TCP, 'tcp'), ...parseProcNet(s.TCP6, 'tcp'), ...parseProcNet(s.UDP, 'udp'), ...parseProcNet(s.UDP6, 'udp')]
    .map((k) => ({ ...k, pid: owners.get(k.inode) ?? null }));
  const procs = [];
  for (const line of s.PS || []) {
    const m = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (m) procs.push({ pid: Number(m[1]), ppid: 1, name: m[2].trim() });
  }
  const paths = new Map();
  for (const line of s.EXE || []) {
    const m = /\/proc\/(\d+)\/exe -> (.+)$/.exec(line);
    if (m) paths.set(Number(m[1]), { path: m[2].replace(/ \(deleted\)$/, '') });
  }
  return { sockets, procs, paths };
}

export function parseEndpoint(raw) {
  const text = raw.trim();
  if (text === '*' || text === '*:*' || text === '*.*') return { host: '*', port: 0 };
  const bracket = /^\[(.+)\][:.](\d+|\*)$/.exec(text);
  if (bracket) return { host: bracket[1], port: Number(bracket[2]) || 0 };
  const colons = (text.match(/:/g) || []).length;
  const at = colons === 1 ? text.lastIndexOf(':') : text.lastIndexOf('.');
  if (at < 0) return { host: text, port: 0 };
  return { host: text.slice(0, at), port: Number(text.slice(at + 1)) || 0 };
}

export function parseNettop(lines) {
  const sockets = [];
  let col = null;
  let owner = null;
  let header = false;
  for (const raw of lines || []) {
    const cells = raw.replace(/\r$/, '').split(',');
    if (cells.includes('bytes_in')) {
      col = { name: cells[0].trim() === 'time' ? 1 : 0, state: cells.indexOf('state') };
      header = true;
      owner = null;
      continue;
    }
    if (!col) continue;
    const name = (cells[col.name] || '').trim();
    const row = /^(tcp|udp)\d?\s+(.+?)<->(.+)$/.exec(name);
    if (!row) {
      const m = /^(.*)\.(\d+)$/.exec(name);
      owner = m ? { name: m[1], pid: Number(m[2]) } : null;
      continue;
    }
    if (!owner) continue;
    const local = parseEndpoint(row[2]);
    const remote = parseEndpoint(row[3]);
    const st = (cells[col.state] || '').trim();
    const wild = remote.host === '*';
    const state = row[1] === 'tcp' ? (st === 'Listen' ? 'listen' : st === 'Established' ? 'open' : null) : (wild ? 'listen' : 'open');
    if (state) sockets.push({ proto: row[1], local: local.host, port: local.port, remote: remote.host, rport: remote.port, state, pid: owner.pid, process: owner.name });
  }
  return { sockets, header };
}

export function parseMac(text) {
  const s = sections(text);
  const { sockets, header } = parseNettop(s.NETTOP);
  const procs = [];
  const paths = new Map();
  for (const line of s.PS || []) {
    const m = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (!m) continue;
    const path = m[2].trim();
    procs.push({ pid: Number(m[1]), ppid: 1, name: path.slice(path.lastIndexOf('/') + 1) });
    paths.set(Number(m[1]), { path });
  }
  return { sockets, procs, paths, header };
}

export function parseWindows(text) {
  const sockets = [];
  const procs = [];
  const paths = new Map();
  for (const line of text.split('\n')) {
    const c = line.replace(/\r$/, '').split('\t');
    if (c[0] === 'T' && c.length >= 7) {
      const state = c[1] === 'Listen' ? 'listen' : c[1] === 'Established' ? 'open' : null;
      if (state) sockets.push({ proto: 'tcp', local: c[2], port: Number(c[3]), remote: c[4], rport: Number(c[5]), state, pid: Number(c[6]) });
    } else if (c[0] === 'U' && c.length >= 4) sockets.push({ proto: 'udp', local: c[1], port: Number(c[2]), remote: '*', rport: 0, state: 'listen', pid: Number(c[3]) });
    else if (c[0] === 'Q' && c.length >= 3) procs.push({ pid: Number(c[1]), ppid: 1, name: c[2] });
    else if (c[0] === 'I' && c.length >= 3) paths.set(Number(c[1]), { path: c[2], description: c[3] || '' });
  }
  return { sockets, procs, paths };
}

export function splitBlocks(buffer) {
  const blocks = [];
  let rest = buffer;
  for (;;) {
    const m = /(?:^|\n)END\r?\n/.exec(rest);
    if (!m) return { blocks, rest };
    blocks.push(rest.slice(0, m.index));
    rest = rest.slice(m.index + m[0].length);
  }
}

export const isLoopback = (a) => /^(127\.|::1$|::ffff:127\.|localhost$)/.test(a || '');
const anyAddress = (a) => ['0.0.0.0', '::', '*', ''].includes(a || '');
const WELL_KNOWN = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 67: 'DHCP', 80: 'HTTP', 88: 'Kerberos', 123: 'NTP', 137: 'NetBIOS', 138: 'NetBIOS', 139: 'NetBIOS',
  143: 'IMAP', 443: 'HTTPS', 445: 'File sharing (SMB)', 548: 'File sharing (AFP)', 631: 'Printing (IPP)', 993: 'IMAPS', 1433: 'SQL Server', 1900: 'SSDP',
  2049: 'NFS', 3000: 'Web development', 3306: 'MySQL', 3389: 'Remote desktop (RDP)', 4200: 'Web development', 5000: 'Web development or AirPlay', 5173: 'Web development (Vite)', 5353: 'mDNS',
  5355: 'LLMNR', 5432: 'PostgreSQL', 5900: 'Screen sharing (VNC)', 6379: 'Redis', 7000: 'AirPlay', 8080: 'Alternate HTTP', 8443: 'Alternate HTTPS', 11434: 'Ollama', 27017: 'MongoDB',
};
const REMOTE_ACCESS = new Set([22, 23, 3389, 5900, 5901]);
export const portInfo = (port, proto) => ({
  label: `${port} ${proto.toUpperCase()}${WELL_KNOWN[port] ? `, ${WELL_KNOWN[port]}` : ''}`,
  remote: REMOTE_ACCESS.has(port) && proto === 'tcp',
});

// 'exposed' reachable from the network, 'local' only from this computer, 'conn' active connection.
export function classify(k) {
  if (k.state === 'listen') return isLoopback(k.local) ? 'local' : 'exposed';
  return isLoopback(k.remote) || isLoopback(k.local) ? null : 'conn';
}
export const bindLabel = (k) => (anyAddress(k.local) ? 'all interfaces' : k.local);

export const PARSERS = { Linux: parseLinux, Darwin: parseMac, Windows: parseWindows };
