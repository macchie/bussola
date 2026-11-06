// One system read, three formats. Each parser returns the same shape:
//   procs: [{ pid, ppid, name, cpuMs, mem }]   cpuMs is cumulative
//   cpu:   { busy, total } in tick cumulativi, o null se va ricavata dai processi
//   mem:   { total?, used, swap }
//   paths: Map pid -> { path, description? }
const sections = (text) => {
  const out = {};
  let cur = null;
  for (const line of text.split('\n')) {
    const m = /^===(\w+)(?:\s+(.*))?$/.exec(line);
    if (m) { cur = m[1]; out[cur] = []; if (m[2]) out[cur].head = m[2]; } else if (cur) out[cur].push(line);
  }
  return out;
};

export function parseLinux(text) {
  const s = sections(text);
  const [pageSize, tck] = (s.PROC?.head || '4096 100').split(/\s+/).map(Number);
  const procs = [];
  for (const line of s.PROC || []) {
    const open = line.indexOf('(');
    const close = line.lastIndexOf(')');
    if (open < 0 || close < 0) continue;
    const f = line.slice(close + 2).split(' ');
    procs.push({
      pid: Number(line.slice(0, open)), name: line.slice(open + 1, close), ppid: Number(f[1]),
      cpuMs: (Number(f[11]) + Number(f[12])) * (1000 / tck), mem: Number(f[21]) * pageSize,
    });
  }
  const c = (s.STAT?.[0] || '').trim().split(/\s+/).slice(1).map(Number);
  const cpu = c.length >= 4 ? { busy: c.reduce((a, b) => a + b, 0) - c[3] - (c[4] || 0), total: c.reduce((a, b) => a + b, 0) } : null;
  const kv = {};
  for (const line of s.MEM || []) {
    const m = /^(\w+):\s+(\d+)/.exec(line);
    if (m) kv[m[1]] = Number(m[2]) * 1024;
  }
  const mem = kv.MemTotal ? { total: kv.MemTotal, used: kv.MemTotal - (kv.MemAvailable ?? kv.MemFree), swap: (kv.SwapTotal || 0) - (kv.SwapFree || 0) } : null;
  const paths = new Map();
  for (const line of s.EXE || []) {
    const m = /\/proc\/(\d+)\/exe -> (.+)$/.exec(line);
    if (m) paths.set(Number(m[1]), { path: m[2].replace(/ \(deleted\)$/, '') });
  }
  return { procs, cpu, mem, paths };
}

export function parseCpuTime(text) {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(text.trim());
  if (!m) return null;
  return ((Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + (Number(m[3]) * 60) + Number(m[4])) * 1000;
}

export function parseMac(text) {
  const s = sections(text);
  const procs = [];
  const paths = new Map();
  for (const line of s.PS || []) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(line);
    if (!m) continue;
    const cpuMs = parseCpuTime(m[4]);
    if (cpuMs === null) continue;
    const path = m[6].trim();
    procs.push({ pid: Number(m[1]), ppid: Number(m[2]), mem: Number(m[3]) * 1024, cpuMs, name: path.slice(path.lastIndexOf('/') + 1) });
    paths.set(Number(m[1]), { path });
  }
  const vm = (s.VM || []).join('\n');
  const page = Number(/page size of (\d+)/.exec(vm)?.[1] || 4096);
  const pages = (label) => Number(new RegExp(`${label}:\\s+(\\d+)`).exec(vm)?.[1] || 0);
  const used = (pages('Pages active') + pages('Pages wired down') + pages('Pages occupied by compressor')) * page;
  const sw = /used = ([\d.,]+)([KMG])/.exec((s.SWAP || []).join(' '));
  const swap = sw ? Number(sw[1].replace(',', '.')) * { K: 1024, M: 1048576, G: 1073741824 }[sw[2]] : 0;
  return { procs, cpu: null, mem: used ? { used, swap } : null, paths };
}

export function parseWindows(text) {
  const procs = [];
  const paths = new Map();
  let mem = null;
  for (const line of text.split('\n')) {
    const c = line.replace(/\r$/, '').split('\t');
    if (c[0] === 'P' && c.length >= 5) procs.push({ pid: Number(c[1]), ppid: 0, name: c[2], cpuMs: Number(c[3]), mem: Number(c[4]) });
    else if (c[0] === 'I' && c.length >= 3) paths.set(Number(c[1]), { path: c[2], description: c[3] || '' });
    else if (c[0] === 'M' && c.length >= 3) {
      const total = Number(c[1]) * 1024;
      mem = { total, used: total - Number(c[2]) * 1024, swap: 0 };
    }
  }
  return { procs, cpu: null, mem, paths };
}

// The Windows stream arrives in arbitrary chunks: each sample ends with an END line.
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

export const PARSERS = { Linux: parseLinux, Darwin: parseMac, Windows: parseWindows };
