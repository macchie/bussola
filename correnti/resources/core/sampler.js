// Campiona la rete con esecuzioni brevi di nettop e conserva lo storico su disco.
import { OS, run, quote, NETTOP_COMMAND, PS_COMMAND, LINUX_COMMAND } from './platform.js';
import { parseSample, parseSs, parseNetDev, parseLinuxPaths, sections, residual, DeltaTracker } from './nettop.js';
import { parsePs, appOf, linuxAppOf, destinationOf, isLocal, UNATTRIBUTED } from './attribute.js';
import { Store, PERIODS } from './store.js';

const INTERVAL = 3000;
const fs = () => globalThis.Neutralino.filesystem;
const dayName = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.jsonl`;
};

export class Sampler {
  constructor(onSample) {
    this.store = new Store();
    this.tracker = new DeltaTracker();
    this.onSample = onSample;
    this.paused = false;
    this.pids = new Map();
    this.bundles = new Map();
    this.psAt = 0;
    this.names = new Map();
    this.device = null;
    this.diag = { samples: 0, rows: 0, connections: 0, skipped: 0, raw: '', error: '', exitCode: null };
  }

  async start() {
    const base = (await globalThis.Neutralino.os.getPath('data')).replace(/\/$/, '');
    this.dir = `${base}/Correnti`;
    await fs().createDirectory(this.dir).catch(() => {});
    await this.loadHistory();
    this.loop();
  }

  async loadHistory() {
    const now = Date.now();
    let files = [];
    try { files = await fs().readDirectory(this.dir); } catch { return; }
    const keep = new Set(Array.from({ length: 8 }, (_, i) => dayName(now - i * 86400000)));
    for (const f of files) {
      if (!f.entry.endsWith('.jsonl')) continue;
      const path = `${this.dir}/${f.entry}`;
      if (!keep.has(f.entry)) { fs().remove(path).catch(() => {}); continue; }
      try { this.store.loadLines(await fs().readFile(path)); } catch { /* giorno illeggibile */ }
    }
    this.store.prune(now);
  }

  async refreshPids() {
    const res = await run(PS_COMMAND);
    if (res.code === 0) this.pids = parsePs(res.out);
    this.psAt = Date.now();
  }

  attribute(rows) {
    return rows.map((r) => {
      const who = OS === 'Linux' ? linuxAppOf(this.pids.get(r.pid), r.process) : appOf(this.pids.get(r.pid), r.process);
      if (who.bundle) this.bundles.set(who.app, who.bundle);
      const host = this.names.get(r.remote.host) || r.remote.host;
      return { app: who.app, process: who.process, dest: destinationOf(host), in: r.dIn, out: r.dOut };
    });
  }

  // ss dà solo indirizzi: i nomi arrivano in sottofondo e valgono dal campione successivo.
  async resolve(rows) {
    if (this.resolving) return;
    const ips = [...new Set(rows.map((r) => r.remote.host))]
      .filter((ip) => /^[0-9a-fA-F:.]+$/.test(ip) && !this.names.has(ip) && !isLocal(ip)).slice(0, 15);
    if (!ips.length) return;
    this.resolving = true;
    try {
      for (const ip of ips) this.names.set(ip, ip);
      const res = await run(`getent hosts ${ips.join(' ')}`, 10000);
      for (const line of res.out.split('\n')) {
        const m = /^(\S+)\s+(\S+)/.exec(line);
        if (m) this.names.set(m[1], m[2]);
      }
    } finally { this.resolving = false; }
  }

  async sampleLinux() {
    const res = await run(LINUX_COMMAND);
    const s = sections(res.out);
    const ok = !(s.SS || []).includes('SSMISSING') && !!s.SS;
    const rows = ok ? parseSs(s.SS) : [];
    this.pids = parseLinuxPaths(s.EXE);
    this.diag.samples++;
    this.diag.rows = (s.SS || []).length;
    this.diag.connections = rows.length;
    this.diag.skipped = 0;
    this.diag.exitCode = res.code;
    this.diag.error = res.err.trim().slice(0, 400);
    this.diag.raw = res.out.split('\n').slice(0, 40).map((l) => l.slice(0, 200)).join('\n');
    this.diag.header = ok;
    const fresh = this.tracker.feed(rows);
    const entries = this.attribute(fresh);
    const now = parseNetDev(s.DEV);
    if (now && this.device) {
      const sum = (k) => entries.reduce((n, e) => n + e[k], 0);
      const rest = residual({ in: now.rx - this.device.rx, out: now.tx - this.device.tx }, { in: sum('in'), out: sum('out') });
      if (rest.in || rest.out) entries.push({ app: UNATTRIBUTED, process: UNATTRIBUTED, dest: UNATTRIBUTED, ...rest });
    }
    this.device = now;
    this.resolve(rows).catch(() => {});
    const t = Date.now();
    this.store.record(t, entries);
    await this.persist(t, false);
    this.store.prune(t);
  }

  async sampleOnce() {
    if (OS === 'Linux') { await this.sampleLinux(); return; }
    const res = await run(NETTOP_COMMAND);
    const { rows, issues } = parseSample(res.out);
    this.diag.samples++;
    this.diag.rows = issues.lines;
    this.diag.connections = rows.length;
    this.diag.skipped = issues.skipped;
    this.diag.exitCode = res.code;
    this.diag.error = res.err.trim().slice(0, 400);
    this.diag.raw = res.out.split('\n').slice(0, 40).join('\n');
    this.diag.header = issues.header;
    if (Date.now() - this.psAt > 30000 || rows.some((r) => !this.pids.has(r.pid))) await this.refreshPids();
    const now = Date.now();
    this.store.record(now, this.attribute(this.tracker.feed(rows)));
    await this.persist(now, false);
    this.store.prune(now);
  }

  async persist(now, all) {
    for (const { minute, line } of this.store.drain(now, all)) {
      await fs().appendFile(`${this.dir}/${dayName(minute * 60000)}`, `${line}\n`).catch(() => {});
    }
  }

  async loop() {
    if (this.stopped) return;
    const began = Date.now();
    if (!this.paused) {
      try { await this.sampleOnce(); } catch (err) { this.diag.error = String(err.message || err); }
      this.onSample();
    }
    this.timer = setTimeout(() => this.loop(), Math.max(500, INTERVAL - (Date.now() - began)));
  }

  setPaused(value) {
    this.paused = value;
    // Il traffico durante la pausa non va attribuito al primo campione successivo.
    if (!value) { this.tracker = new DeltaTracker(); this.device = null; }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.persist(Date.now(), true);
  }

  async clearHistory() {
    this.store.clear();
    const files = await fs().readDirectory(this.dir).catch(() => []);
    for (const f of files) if (f.entry.endsWith('.jsonl')) await fs().remove(`${this.dir}/${f.entry}`).catch(() => {});
    this.onSample();
  }

  revealCommand(app) {
    const bundle = this.bundles.get(app);
    if (!bundle) return null;
    return OS === 'Linux' ? `xdg-open ${quote(bundle.slice(0, bundle.lastIndexOf('/')) || '/')}` : `/usr/bin/open -R ${quote(bundle)}`;
  }
}
export { PERIODS };
