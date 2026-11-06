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
  return { procs, cpu, mem, paths, battery: parseBatteryLinux(s.BAT), thermal: parseThermalLinux(s.THERMAL) };
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
  return { procs, cpu: null, mem: used ? { used, swap } : null, paths, battery: parseBatteryMac(s.IOREG, s.PMSET), thermal: null };
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
  return { procs, cpu: null, mem, paths, battery: parseBatteryWindows(text), thermal: null };
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


// Batteria: { level 0-1, charging, plugged, watts, health 0-1, cycles, full, design, unit, temperature, tempLabel, minutes }
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const known = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));

export function parseBatteryLinux(lines) {
  const f = {};
  for (const line of lines || []) {
    const m = /\/([^/:]+):(.*)$/.exec(line);
    if (m && !(m[1] in f)) f[m[1]] = m[2].trim();
  }
  if (!('capacity' in f) && !('energy_now' in f) && !('charge_now' in f)) return null;
  const n = (k) => (k in f ? num(f[k]) : null);
  const energy = n('energy_full') !== null;
  const now = n(energy ? 'energy_now' : 'charge_now');
  const full = n(energy ? 'energy_full' : 'charge_full');
  const design = n(energy ? 'energy_full_design' : 'charge_full_design');
  const voltage = n('voltage_now');
  let watts = n('power_now') !== null ? n('power_now') / 1e6 : null;
  if (watts === null && n('current_now') !== null && voltage !== null) watts = Math.abs(n('current_now') * voltage) / 1e12;
  const status = f.status || '';
  const charging = status === 'Charging';
  const discharging = status === 'Discharging';
  let minutes = null;
  if (discharging && watts > 0 && now !== null) minutes = energy ? (now / 1e6 / watts) * 60 : ((now * voltage) / 1e12 / watts) * 60;
  return known({
    level: n('capacity') !== null ? n('capacity') / 100 : (now && full ? now / full : null), charging, plugged: !discharging,
    watts: watts ?? null, health: full && design ? full / design : null, cycles: n('cycle_count') || null,
    full: full !== null ? (energy ? full / 1e6 : full / 1000) : null, design: design !== null ? (energy ? design / 1e6 : design / 1000) : null,
    unit: energy ? 'Wh' : 'mAh', temperature: n('temp') !== null ? n('temp') / 10 : null, tempLabel: 'Battery', minutes,
  });
}

export function parseThermalLinux(lines) {
  const temps = [];
  for (const line of lines || []) {
    const m = /\/temp:(-?\d+)$/.exec(line);
    if (m && Number(m[1]) > 1000) temps.push(Number(m[1]) / 1000);
  }
  return temps.length ? Math.max(...temps) : null;
}

const signed64 = (text) => { try { return Number(BigInt.asIntN(64, BigInt(text))); } catch { return null; } };

export function parseIoreg(lines) {
  const keys = new Map();
  for (const line of lines || []) {
    const m = /^([\s|]*)"(\w+)" = (.+)$/.exec(line);
    if (!m) continue;
    const indent = m[1].length;
    // The same name reappears in subtrees: the least nested one wins.
    if (!keys.has(m[2]) || indent < keys.get(m[2]).indent) keys.set(m[2], { indent, value: m[3].trim() });
  }
  return (k) => keys.get(k)?.value;
}

export function parseBatteryMac(ioreg, pmset) {
  const text = (pmset || []).join('\n');
  const m = /(\d+)%;\s*([\w ]+?);\s*(?:(\d+):(\d+) remaining|\(no estimate\)|[^\n]*)/.exec(text);
  if (!m) return null;
  const get = parseIoreg(ioreg);
  const state = m[2].toLowerCase();
  const plugged = /AC Power/.test(text);
  const n = (k) => (get(k) !== undefined ? num(get(k)) : null);
  const raw = n('AppleRawMaxCapacity') ?? n('NominalChargeCapacity');
  const legacy = n('MaxCapacity');
  const full = raw ?? (legacy > 100 ? legacy : null);
  const design = n('DesignCapacity');
  const amps = get('InstantAmperage') ?? get('Amperage');
  const ma = amps !== undefined ? signed64(amps) : null;
  const mv = n('Voltage');
  const temp = n('Temperature');
  return known({
    level: Number(m[1]) / 100, charging: state === 'charging', plugged,
    watts: ma !== null && mv !== null ? Math.abs(ma * mv) / 1e6 : null,
    health: full && design ? full / design : null, cycles: n('CycleCount'), full, design, unit: 'mAh',
    temperature: temp !== null && temp > 1000 ? temp / 100 : null, tempLabel: 'Battery',
    minutes: m[3] !== undefined ? Number(m[3]) * 60 + Number(m[4]) : null,
  });
}

export function parseBatteryWindows(text) {
  let battery = null;
  let health = {};
  for (const line of text.split('\n')) {
    const c = line.replace(/\r$/, '').split('\t');
    if (c[0] === 'B' && c[1] !== '') {
      const run = num(c[3]);
      const discharge = num(c[4]);
      const charge = num(c[5]);
      const plugged = c[2] !== '1';
      battery = known({
        level: num(c[1]) / 100, plugged, charging: charge > 0,
        watts: !plugged && discharge ? discharge / 1000 : charge ? charge / 1000 : null,
        minutes: !plugged && run && run < 71582788 ? run : null, unit: 'mWh',
      });
    } else if (c[0] === 'H') {
      const design = num(c[1]) || null;
      const full = num(c[2]) || null;
      health = known({ design, full, cycles: num(c[3]) || null, health: design && full ? full / design : null });
    }
  }
  return battery ? { ...battery, ...health } : null;
}

export const PARSERS = { Linux: parseLinux, Darwin: parseMac, Windows: parseWindows };
