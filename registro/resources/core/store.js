// Counts per minute, kind > app > message shape. The daily files are only
// additions: each read saves the new counts, and re-reading them sums them.
export const SEP = '\u001f';
export const ROOT = 'registro';
export const PERIODS = {
  live: { label: 'Recent', phrase: 'in the last 15 minutes', span: 900000, bin: 30000 },
  hour: { label: 'Last hour', phrase: 'in the last hour', span: 3600000, bin: 60000 },
  day: { label: 'Today', phrase: 'today', bin: 900000 },
  week: { label: '7 days', phrase: 'in 7 days', span: 604800000, bin: 10800000 },
};
const MINUTE = 60000;
export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export class Store {
  constructor() { this.minutes = new Map(); }

  add(minute, key, count) {
    if (!this.minutes.has(minute)) this.minutes.set(minute, new Map());
    const b = this.minutes.get(minute);
    b.set(key, (b.get(key) || 0) + count);
  }

  // events: [{ t, key }]. Returns the rows to save, one per minute.
  ingest(events) {
    const fresh = new Map();
    for (const { t, key } of events) {
      const minute = Math.floor(t / MINUTE);
      this.add(minute, key, 1);
      if (!fresh.has(minute)) fresh.set(minute, new Map());
      fresh.get(minute).set(key, (fresh.get(minute).get(key) || 0) + 1);
    }
    return [...fresh].map(([m, map]) => ({ minute: m, line: JSON.stringify({ m, e: [...map] }) }));
  }

  loadLines(text) {
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      if (!Number.isFinite(r.m) || !Array.isArray(r.e)) continue;
      for (const [key, count] of r.e) this.add(r.m, key, count);
    }
  }

  prune(now) {
    const oldest = Math.floor((now - PERIODS.week.span) / MINUTE);
    for (const m of this.minutes.keys()) if (m < oldest) this.minutes.delete(m);
  }

  clear() { this.minutes.clear(); }

  rangeOf(period, now) {
    const p = PERIODS[period];
    return { from: period === 'day' ? startOfDay(now) : now - p.span, bin: p.bin };
  }

  totals(period, now) {
    const first = Math.floor(this.rangeOf(period, now).from / MINUTE);
    const sum = new Map();
    for (const [m, b] of this.minutes) {
      if (m < first) continue;
      for (const [k, c] of b) sum.set(k, (sum.get(k) || 0) + c);
    }
    return sum;
  }

  timeline(period, now) {
    const { from, bin } = this.rangeOf(period, now);
    const count = Math.max(1, Math.ceil((now - from) / bin));
    const bins = Array.from({ length: count }, (_, i) => ({ t: from + i * bin, cpu: 0, mem: 0, w: 1 }));
    for (const [m, b] of this.minutes) {
      const at = Math.floor((m * MINUTE - from) / bin);
      if (at < 0 || at >= count) continue;
      for (const [k, c] of b) {
        if (k.startsWith(`warn${SEP}`)) bins[at].mem += c; else bins[at].cpu += c;
      }
    }
    return bins;
  }
}

export function buildTree(totals, kind, describe) {
  const root = { n: 'Whole log', d: 1, c: [], s: 0 };
  const apps = new Map();
  for (const [key, count] of totals) {
    const [k, app, pattern] = key.split(SEP);
    if (k !== kind) continue;
    if (!apps.has(app)) apps.set(app, { n: app, d: 1, kind: 'app', s: 0, c: [] });
    const a = apps.get(app);
    a.c.push({ n: pattern, kind: 'item', s: count, key, ...describe(key) });
    a.s += count;
    root.s += count;
  }
  for (const a of apps.values()) { a.c.sort((x, y) => y.s - x.s); root.c.push(a); }
  root.c.sort((x, y) => y.s - x.s);
  return root;
}
