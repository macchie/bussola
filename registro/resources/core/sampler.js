// Legge il registro di sistema a intervalli e conserva conteggi e un esempio per ogni messaggio.
import { OS, run, scriptCommand, readScript, MAX_EVENTS } from './platform.js';
import { PARSERS, patternOf, accessOf, journalMissing } from './parse.js';
import { appOfEvent } from './attribute.js';
import { Store, PERIODS, SEP, buildTree } from './store.js';

const INTERVAL = 60000;
const DAY = 86400000;
const MAX_SAMPLES = 3000;
const N = () => globalThis.Neutralino;
const fs = () => N().filesystem;
const dayName = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.jsonl`;
};
// log show è lento su periodi lunghi: al primo avvio su macOS si guarda meno indietro.
export const firstLook = (os, now) => now - (os === 'Darwin' ? 3 * 3600000 : DAY);

export function keyOf(os, e) {
  return [e.kind, appOfEvent(os, e), patternOf(e.text)].join(SEP);
}

// Solo ciò che è successo dopo l'ultima lettura, senza ricontare i riavvii già visti.
export function fresh(events, since, seen) {
  return events.filter((e) => {
    if (!(e.t > since)) return false;
    if (e.kind !== 'event') return true;
    const id = `${e.t}|${e.text}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export class Sampler {
  constructor(onSample) {
    this.store = new Store();
    this.onSample = onSample;
    this.paused = false;
    this.samples = new Map();
    this.seen = new Set();
    this.since = 0;
    this.latest = {};
    this.diag = { samples: 0, processes: 0, error: '', exitCode: null, raw: '', truncated: false };
  }

  tree(period, now, kind) {
    return buildTree(this.store.totals(period, now), kind, (key) => {
      const s = this.samples.get(key);
      return s ? { sample: s.text, first: s.first, last: s.last } : {};
    });
  }

  lastHour(now) {
    let errors = 0;
    let warns = 0;
    for (const [k, c] of this.store.totals('hour', now)) {
      if (k.startsWith(`error${SEP}`)) errors += c;
      else if (k.startsWith(`warn${SEP}`)) warns += c;
    }
    return { errors, warns };
  }

  async start() {
    const base = (await N().os.getPath('data')).replace(/[\\/]$/, '');
    this.sep = OS === 'Windows' ? '\\' : '/';
    this.dir = `${base}${this.sep}Registro`;
    await fs().createDirectory(this.dir).catch(() => {});
    await this.loadHistory();
    this.loop();
  }

  async loadHistory() {
    const now = Date.now();
    const keep = new Set(Array.from({ length: 8 }, (_, i) => dayName(now - i * DAY)));
    for (const f of await fs().readDirectory(this.dir).catch(() => [])) {
      if (!f.entry.endsWith('.jsonl')) continue;
      const path = this.dir + this.sep + f.entry;
      if (!keep.has(f.entry)) { fs().remove(path).catch(() => {}); continue; }
      try { this.store.loadLines(await fs().readFile(path)); } catch { /* giorno illeggibile */ }
    }
    this.store.prune(now);
    try {
      const data = JSON.parse(await fs().readFile(this.dir + this.sep + 'stato.json'));
      this.since = data.since || 0;
      this.samples = new Map(Object.entries(data.samples || {}));
      this.seen = new Set(data.seen || []);
    } catch { /* primo avvio */ }
  }

  async save() {
    const file = this.dir + this.sep + 'stato.json';
    const recent = [...this.samples].sort((a, b) => b[1].last - a[1].last).slice(0, MAX_SAMPLES);
    this.samples = new Map(recent);
    await fs().writeFile(`${file}.tmp`, JSON.stringify({ since: this.since, samples: Object.fromEntries(recent), seen: [...this.seen].slice(-500) }));
    await fs().move(`${file}.tmp`, file);
  }

  async read() {
    const now = Date.now();
    const since = this.since || firstLook(OS, now);
    const { command, file } = await scriptCommand(readScript(OS, since));
    const res = await run(command);
    fs().remove(file).catch(() => {});
    this.diag.exitCode = res.code;
    this.diag.error = res.err.trim().slice(0, 400);
    this.diag.access = OS === 'Linux' && journalMissing(res.out) ? 'failed' : accessOf(res.err);
    this.diag.raw = res.out.split('\n').slice(0, 30).map((l) => l.slice(0, 400)).join('\n');
    const all = PARSERS[OS](res.out);
    const events = fresh(all, since, this.seen);
    this.diag.samples++;
    this.diag.processes = events.length;
    this.diag.truncated = all.length >= MAX_EVENTS;
    const rows = events.map((e) => ({ t: e.t, key: keyOf(OS, e), text: e.text }));
    for (const r of rows) {
      const s = this.samples.get(r.key);
      if (s) { if (r.t > s.last) { s.last = r.t; s.text = r.text.slice(0, 1200); } if (r.t < s.first) s.first = r.t; }
      else this.samples.set(r.key, { text: r.text.slice(0, 1200), first: r.t, last: r.t });
    }
    for (const { minute, line } of this.store.ingest(rows)) {
      await fs().appendFile(this.dir + this.sep + dayName(minute * 60000), `${line}\n`).catch(() => {});
    }
    this.since = Math.max(since, ...events.map((e) => e.t));
    this.store.prune(now);
    await this.save().catch(() => {});
  }

  async loop() {
    if (this.stopped) return;
    if (!this.paused) {
      try { await this.read(); } catch (err) { this.diag.error = String(err.message || err); this.diag.access = 'failed'; }
      this.onSample();
    }
    this.timer = setTimeout(() => this.loop(), INTERVAL);
  }

  setPaused(value) { this.paused = value; }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.save().catch(() => {});
  }

  async clearHistory() {
    this.store.clear();
    this.samples.clear();
    for (const f of await fs().readDirectory(this.dir).catch(() => [])) {
      if (f.entry.endsWith('.jsonl')) await fs().remove(this.dir + this.sep + f.entry).catch(() => {});
    }
    await this.save().catch(() => {});
    this.onSample();
  }
}
export { PERIODS };
