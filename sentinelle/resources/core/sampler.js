// Reads ports and connections, attributes them to apps and remembers what has been seen.
import { OS, run, spawn, kill, scriptCommand, LINUX_SCRIPT, MAC_SCRIPT, windowsScript } from './platform.js';
import { PARSERS, splitBlocks, classify, portInfo, bindLabel } from './parse.js';
import { appFor, destinationOf, UNKNOWN_APP } from './attribute.js';
import { Store, Ledger, PERIODS, SEP, buildTree } from './store.js';

const INTERVAL = 5000;
const N = () => globalThis.Neutralino;
const fs = () => N().filesystem;
const dayName = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.jsonl`;
};

// From the raw read to the snapshot entries: key -> how many.
export function digest(sample, os, paths, bundles) {
  const names = new Map(sample.procs.map((p) => [p.pid, p]));
  const entries = new Map();
  const details = new Map();
  for (const k of sample.sockets) {
    const kind = classify(k);
    if (!kind) continue;
    const proc = names.get(k.pid) || (k.process ? { pid: k.pid, ppid: 1, name: k.process } : null);
    const who = proc ? appFor(os, proc, paths.get(k.pid)) : { app: UNKNOWN_APP, bundle: null };
    if (who.bundle) bundles.set(who.app, who.bundle);
    const info = kind === 'conn' ? null : portInfo(k.port, k.proto);
    const item = kind === 'conn' ? destinationOf(k.remote) : info.label;
    const key = [kind, who.app, proc?.name || '', item].join(SEP);
    entries.set(key, (entries.get(key) || 0) + 1);
    if (!details.has(key)) details.set(key, { detail: kind === 'conn' ? `port ${k.rport}` : bindLabel(k), remote: !!(info?.remote && kind === 'exposed') });
  }
  const count = (kind) => [...entries].reduce((n, [key, c]) => n + (key.startsWith(kind + SEP) ? (kind === 'conn' ? c : 1) : 0), 0);
  return { entries, details, exposed: count('exposed'), conn: count('conn') };
}

export class Sampler {
  constructor(onSample) {
    this.store = new Store();
    this.ledger = new Ledger();
    this.onSample = onSample;
    this.paused = false;
    this.paths = new Map();
    this.bundles = new Map();
    this.snapshot = { entries: new Map(), details: new Map() };
    this.memory = new Map();
    this.latest = { exposed: 0, conn: 0 };
    this.savedAt = 0;
    this.lastT = 0;
    this.diag = { samples: 0, processes: 0, error: '', exitCode: null, raw: '' };
  }

  tree(period, now, kind) {
    const entries = period === 'live' ? this.snapshot.entries
      : new Map(this.ledger.seenSince(this.store.rangeOf(period, now).from).map((k) => [k, 1]));
    return buildTree(entries, kind, (key) => ({ ...(this.memory.get(key) || {}), isNew: this.ledger.isNew(key, now) }));
  }

  async start() {
    const base = (await N().os.getPath('data')).replace(/[\\/]$/, '');
    this.sep = OS === 'Windows' ? '\\' : '/';
    this.dir = `${base}${this.sep}Sentinelle`;
    await fs().createDirectory(this.dir).catch(() => {});
    await this.loadHistory();
    if (OS === 'Windows') await this.streamWindows();
    else {
      this.script = await scriptCommand(OS === 'Linux' ? LINUX_SCRIPT : MAC_SCRIPT);
      this.loop();
    }
  }

  async loadHistory() {
    const now = Date.now();
    const keep = new Set(Array.from({ length: 8 }, (_, i) => dayName(now - i * 86400000)));
    for (const f of await fs().readDirectory(this.dir).catch(() => [])) {
      if (!f.entry.endsWith('.jsonl')) continue;
      const path = this.dir + this.sep + f.entry;
      if (!keep.has(f.entry)) { fs().remove(path).catch(() => {}); continue; }
      try { this.store.loadLines(await fs().readFile(path)); } catch { /* giorno illeggibile */ }
    }
    this.store.prune(now);
    try {
      const data = JSON.parse(await fs().readFile(this.dir + this.sep + 'seen.json'));
      this.ledger = new Ledger(data.ledger);
      this.memory = new Map(Object.entries(data.details || {}));
    } catch { /* first launch */ }
  }

  async saveLedger(now) {
    this.savedAt = now;
    const file = this.dir + this.sep + 'seen.json';
    this.ledger.prune(now);
    const details = Object.fromEntries([...this.memory].filter(([k]) => this.ledger.items.has(k)));
    await fs().writeFile(`${file}.tmp`, JSON.stringify({ ledger: this.ledger, details }));
    await fs().move(`${file}.tmp`, file).catch(() => {});
  }

  async handle(text) {
    if (this.paused || this.stopped) return;
    const sample = PARSERS[OS](text);
    for (const [pid, info] of sample.paths) this.paths.set(pid, info);
    this.diag.samples++;
    this.diag.processes = sample.sockets.length;
    this.diag.header = sample.header;
    this.diag.raw = text.split('\n').slice(0, 40).join('\n');
    const now = Date.now();
    const r = digest(sample, OS, this.paths, this.bundles);
    this.snapshot = r;
    for (const [k, v] of r.details) this.memory.set(k, v);
    const added = this.ledger.observe(r.entries.keys(), now);
    this.latest = { exposed: r.exposed, conn: r.conn };
    if (this.lastT) this.store.record(now, (now - this.lastT) / 1000, [], { cpu: r.exposed, mem: r.conn });
    this.lastT = now;
    for (const { minute, line } of this.store.drain(now)) await this.append(minute, line);
    this.store.prune(now);
    if (added || now - this.savedAt > 60000) await this.saveLedger(now).catch(() => {});
    this.onSample();
  }

  append(minute, line) {
    return fs().appendFile(this.dir + this.sep + dayName(minute * 60000), `${line}\n`).catch(() => {});
  }

  async loop() {
    if (this.stopped) return;
    const began = Date.now();
    if (!this.paused) {
      try {
        const res = await run(this.script.command);
        this.diag.exitCode = res.code;
        this.diag.error = res.err.trim().slice(0, 400);
        await this.handle(res.out);
      } catch (err) { this.diag.error = String(err.message || err); }
    }
    this.timer = setTimeout(() => this.loop(), Math.max(500, INTERVAL - (Date.now() - began)));
  }

  async streamWindows() {
    if (!this.script) this.script = await scriptCommand(windowsScript(globalThis.NL_PID));
    let buffer = '';
    this.proc = await spawn(this.script.command, {
      onOut: (d) => {
        const { blocks, rest } = splitBlocks(buffer + d);
        buffer = rest;
        for (const block of blocks) this.handle(block).catch((err) => { this.diag.error = String(err.message || err); });
      },
      onExit: (code, err) => {
        this.diag.exitCode = code;
        this.diag.error = err.trim().slice(0, 400);
        if (!this.stopped) this.timer = setTimeout(() => this.streamWindows(), 3000);
      },
    });
  }

  setPaused(value) {
    this.paused = value;
    if (!value) this.lastT = 0;
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.proc !== undefined) kill(this.proc);
    for (const { minute, line } of this.store.drain(Date.now(), true)) await this.append(minute, line);
    await this.saveLedger(Date.now()).catch(() => {});
    if (this.script) await fs().remove(this.script.file).catch(() => {});
  }

  async clearHistory() {
    this.store.clear();
    this.ledger = new Ledger();
    this.memory.clear();
    for (const f of await fs().readDirectory(this.dir).catch(() => [])) {
      if (f.entry.endsWith('.jsonl') || f.entry === 'seen.json') await fs().remove(this.dir + this.sep + f.entry).catch(() => {});
    }
    this.onSample();
  }
}
export { PERIODS };
