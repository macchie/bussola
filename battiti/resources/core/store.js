// Detail of recent samples and a per-minute history. The minutes keep integrals over
// time, so the averages stay correct even if the app stayed closed for a while.
export const SEP = '\u001f';
export const ROOT = 'sistema';
export const PERIODS = {
  live: { label: 'Now', phrase: 'now', span: 60000, bin: 2000 },
  hour: { label: 'Last hour', phrase: 'on average in the last hour', span: 3600000, bin: 60000 },
  day: { label: 'Today', phrase: 'on average today', bin: 900000 },
  week: { label: '7 days', phrase: 'on average over 7 days', span: 604800000, bin: 10800000 },
};
const MINUTE = 60000;
const FINE_KEEP = 40;
export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
function add(map, key, v, k = 1) {
  const cur = map.get(key);
  if (cur) for (let i = 0; i < 3; i++) cur[i] += v[i] * k;
  else map.set(key, v.map((x) => x * k));
}

export class Store {
  constructor() { this.minutes = new Map(); this.fine = []; this.closed = new Set(); }

  // entries: [{ app, process, cpu (0-1 of the machine), mem (bytes), count }]; machine: { cpu, mem } in 0-1
  record(t, seconds, entries, machine) {
    const minute = Math.floor(t / MINUTE);
    if (!this.minutes.has(minute)) this.minutes.set(minute, { dt: 0, cpu: 0, mem: 0, e: new Map() });
    const b = this.minutes.get(minute);
    b.dt += seconds;
    b.cpu += machine.cpu * seconds;
    b.mem += machine.mem * seconds;
    const map = new Map();
    for (const e of entries) {
      const key = e.app + SEP + e.process;
      add(map, key, [e.cpu, e.mem, e.count]);
      add(b.e, key, [e.cpu, e.mem, e.count], seconds);
    }
    this.fine.push({ t, map, ...machine });
    if (this.fine.length > FINE_KEEP) this.fine.shift();
  }

  drain(now, all = false) {
    const current = Math.floor(now / MINUTE);
    const lines = [];
    for (const [minute, b] of this.minutes) {
      if (this.closed.has(minute) || (!all && minute >= current) || !b.dt) continue;
      if (minute < current) this.closed.add(minute);
      const round = (x) => Math.round(x * 1000) / 1000;
      lines.push({ minute, line: JSON.stringify({ m: minute, dt: round(b.dt), c: round(b.cpu), u: round(b.mem), e: [...b.e].map(([k, v]) => [...k.split(SEP), round(v[0]), Math.round(v[1]), round(v[2])]) }) });
    }
    return lines;
  }

  loadLines(text) {
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      if (!Number.isFinite(r.m) || !Number.isFinite(r.dt) || !Array.isArray(r.e)) continue;
      if (!this.minutes.has(r.m)) this.minutes.set(r.m, { dt: 0, cpu: 0, mem: 0, e: new Map() });
      const b = this.minutes.get(r.m);
      b.dt += r.dt; b.cpu += r.c; b.mem += r.u;
      for (const [app, process, cpu, mem, count] of r.e) add(b.e, app + SEP + process, [cpu, mem, count]);
      this.closed.add(r.m);
    }
  }

  prune(now) {
    const oldest = Math.floor((now - PERIODS.week.span) / MINUTE);
    for (const m of this.minutes.keys()) if (m < oldest) { this.minutes.delete(m); this.closed.delete(m); }
  }

  clear() { this.minutes.clear(); this.closed.clear(); this.fine = []; }

  rangeOf(period, now) {
    const p = PERIODS[period];
    return { from: period === 'day' ? startOfDay(now) : now - p.span, bin: p.bin };
  }

  // Average values per app and process. Now is simply the latest sample.
  averages(period, now) {
    if (period === 'live') return this.fine.at(-1)?.map || new Map();
    const first = Math.floor(this.rangeOf(period, now).from / MINUTE);
    const sum = new Map();
    let dt = 0;
    for (const [m, b] of this.minutes) {
      if (m < first) continue;
      dt += b.dt;
      for (const [k, v] of b.e) add(sum, k, v);
    }
    if (dt) for (const v of sum.values()) for (let i = 0; i < 3; i++) v[i] /= dt;
    return sum;
  }

  timeline(period, now) {
    const { from, bin } = this.rangeOf(period, now);
    const count = Math.max(1, Math.ceil((now - from) / bin));
    const bins = Array.from({ length: count }, (_, i) => ({ t: from + i * bin, cpu: 0, mem: 0, w: 0 }));
    const put = (t, c, m, w) => {
      const at = Math.floor((t - from) / bin);
      if (at >= 0 && at < count) { bins[at].cpu += c; bins[at].mem += m; bins[at].w += w; }
    };
    if (period === 'live') for (const s of this.fine) put(s.t, s.cpu, s.mem, 1);
    else for (const [m, b] of this.minutes) put(m * MINUTE, b.cpu, b.mem, b.dt);
    for (const b of bins) if (b.w) { b.cpu /= b.w; b.mem /= b.w; }
    return bins;
  }
}

export function buildTree(avg, metric) {
  const root = { n: 'Whole system', d: 1, cpu: 0, mem: 0, c: [] };
  const apps = new Map();
  for (const [key, [cpu, mem, count]] of avg) {
    const [app, process] = key.split(SEP);
    if (!apps.has(app)) apps.set(app, { n: app, kind: 'app', cpu: 0, mem: 0, count: 0, kids: [] });
    const a = apps.get(app);
    a.kids.push({ n: process, kind: 'process', cpu, mem, count, s: metric === 'cpu' ? cpu : mem });
    a.cpu += cpu; a.mem += mem; a.count += count;
    root.cpu += cpu; root.mem += mem;
  }
  const floor = metric === 'cpu' ? 0.0002 : 1;
  for (const a of apps.values()) {
    a.s = metric === 'cpu' ? a.cpu : a.mem;
    if (a.kids.length > 1) { a.d = 1; a.c = a.kids.filter((k) => k.s >= floor).sort((x, y) => y.s - x.s); }
    delete a.kids;
    if (a.s >= floor) root.c.push(a);
  }
  root.c.sort((x, y) => y.s - x.s);
  root.s = root.c.reduce((sum, c) => sum + c.s, 0);
  return root;
}
