// Storico a minuti più il dettaglio fine degli ultimi campioni. Nessun accesso al sistema.
export const SEP = '\u001f';
export const ROOT = 'rete';
export const PERIODS = {
  live: { label: 'Adesso', phrase: 'nell\'ultimo minuto', span: 60000, bin: 3000 },
  hour: { label: 'Ultima ora', phrase: 'nell\'ultima ora', span: 3600000, bin: 60000 },
  day: { label: 'Oggi', phrase: 'oggi', bin: 900000 },
  week: { label: '7 giorni', phrase: 'negli ultimi 7 giorni', span: 604800000, bin: 10800000 },
};
const MINUTE = 60000;
const FINE_KEEP = 40;
const MAX_DESTS = 60;

function add(map, key, i, o) {
  const cur = map.get(key);
  if (cur) { cur[0] += i; cur[1] += o; } else map.set(key, [i, o]);
}
export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export class Store {
  constructor() { this.minutes = new Map(); this.fine = []; this.closed = new Set(); }

  record(t, entries) {
    const minute = Math.floor(t / MINUTE);
    if (!this.minutes.has(minute)) this.minutes.set(minute, new Map());
    const bucket = this.minutes.get(minute);
    const sample = { t, map: new Map(), in: 0, out: 0 };
    for (const e of entries) {
      const key = [e.app, e.process, e.dest].join(SEP);
      add(bucket, key, e.in, e.out);
      add(sample.map, key, e.in, e.out);
      sample.in += e.in;
      sample.out += e.out;
    }
    this.fine.push(sample);
    if (this.fine.length > FINE_KEEP) this.fine.shift();
    return sample;
  }

  // Minuti conclusi e non ancora salvati.
  drain(now, all = false) {
    const current = Math.floor(now / MINUTE);
    const lines = [];
    for (const [minute, bucket] of this.minutes) {
      if (this.closed.has(minute) || (!all && minute >= current) || !bucket.size) continue;
      if (minute < current) this.closed.add(minute);
      lines.push({ minute, line: JSON.stringify({ m: minute, e: [...bucket].map(([k, v]) => [...k.split(SEP), v[0], v[1]]) }) });
    }
    return lines;
  }

  loadLines(text) {
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (!Number.isFinite(row.m) || !Array.isArray(row.e)) continue;
      if (!this.minutes.has(row.m)) this.minutes.set(row.m, new Map());
      const bucket = this.minutes.get(row.m);
      for (const [app, process, dest, i, o] of row.e) add(bucket, [app, process, dest].join(SEP), i, o);
      this.closed.add(row.m);
    }
  }

  prune(now) {
    const oldest = Math.floor((now - PERIODS.week.span) / MINUTE);
    for (const m of this.minutes.keys()) if (m < oldest) { this.minutes.delete(m); this.closed.delete(m); }
  }

  clear() { this.minutes.clear(); this.closed.clear(); this.fine = []; }

  rangeOf(period, now) {
    const p = PERIODS[period];
    return { from: period === 'day' ? startOfDay(now) : now - p.span, to: now, bin: p.bin };
  }

  totals(period, now) {
    const { from } = this.rangeOf(period, now);
    const sum = new Map();
    if (period === 'live') {
      for (const s of this.fine) if (s.t >= from) for (const [k, v] of s.map) add(sum, k, v[0], v[1]);
      return sum;
    }
    const first = Math.floor(from / MINUTE);
    for (const [m, bucket] of this.minutes) if (m >= first) for (const [k, v] of bucket) add(sum, k, v[0], v[1]);
    return sum;
  }

  timeline(period, now) {
    const { from, to, bin } = this.rangeOf(period, now);
    const count = Math.max(1, Math.ceil((to - from) / bin));
    const bins = Array.from({ length: count }, (_, i) => ({ t: from + i * bin, in: 0, out: 0 }));
    const put = (t, i, o) => {
      const at = Math.floor((t - from) / bin);
      if (at >= 0 && at < count) { bins[at].in += i; bins[at].out += o; }
    };
    if (period === 'live') for (const s of this.fine) put(s.t, s.in, s.out);
    else for (const [m, bucket] of this.minutes) for (const v of bucket.values()) put(m * MINUTE, v[0], v[1]);
    return bins;
  }

  rate(windowSamples = 3) {
    const recent = this.fine.slice(-windowSamples - 1);
    if (recent.length < 2) return { in: 0, out: 0 };
    const seconds = (recent.at(-1).t - recent[0].t) / 1000 || 1;
    const used = recent.slice(1);
    return { in: used.reduce((s, x) => s + x.in, 0) / seconds, out: used.reduce((s, x) => s + x.out, 0) / seconds };
  }
}

const measure = (v, metric) => (metric === 'in' ? v.in : metric === 'out' ? v.out : v.in + v.out);
const sortKids = (n, metric) => {
  for (const c of n.c) c.s = measure(c, metric);
  n.c = n.c.filter((c) => c.s > 0).sort((a, b) => b.s - a.s);
  n.s = n.c.reduce((sum, c) => sum + c.s, 0);
};

// app > processo > destinazione. Un'app con un solo processo omonimo salta il livello intermedio.
export function buildTree(totals, metric) {
  const root = { n: 'Tutto il traffico', d: 1, in: 0, out: 0, c: [] };
  const apps = new Map();
  for (const [key, [i, o]] of totals) {
    const [app, process, dest] = key.split(SEP);
    if (!apps.has(app)) apps.set(app, { n: app, d: 1, in: 0, out: 0, kind: 'app', procs: new Map() });
    const a = apps.get(app);
    if (!a.procs.has(process)) a.procs.set(process, { n: process, d: 1, in: 0, out: 0, kind: 'process', dests: new Map() });
    const p = a.procs.get(process);
    const cell = p.dests.get(dest) || { n: dest, in: 0, out: 0, kind: 'dest' };
    cell.in += i; cell.out += o;
    p.dests.set(dest, cell);
    p.in += i; p.out += o;
    a.in += i; a.out += o;
    root.in += i; root.out += o;
  }
  for (const a of apps.values()) {
    const procs = [...a.procs.values()];
    for (const p of procs) {
      p.c = [...p.dests.values()];
      delete p.dests;
      sortKids(p, metric);
      if (p.c.length > MAX_DESTS) {
        const rest = p.c.splice(MAX_DESTS);
        p.c.push({ n: `Altre ${rest.length} destinazioni`, kind: 'dest', in: rest.reduce((s, r) => s + r.in, 0), out: rest.reduce((s, r) => s + r.out, 0), s: rest.reduce((s, r) => s + r.s, 0) });
      }
    }
    delete a.procs;
    if (procs.length === 1) a.c = procs[0].c;
    else { a.c = procs; sortKids(a, metric); }
    a.s = a.c.reduce((sum, c) => sum + c.s, 0);
    if (procs.length > 1) for (const p of a.c) p.s = measure(p, metric);
    a.processes = procs.length;
    root.c.push(a);
  }
  sortKids(root, metric);
  return root;
}
