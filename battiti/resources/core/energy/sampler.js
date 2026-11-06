// Samples processes and memory, computes CPU usage from deltas and keeps the history.
import { OS, run, spawn, kill, scriptCommand, linuxScript, MAC_SCRIPT, windowsScript } from './platform.js';
import { PARSERS, splitBlocks } from './parse.js';
import { appFor } from './attribute.js';
import { Store, PERIODS } from './store.js';

const INTERVAL = 5000; // an energy tool must not consume energy
const N = () => globalThis.Neutralino;
const fs = () => N().filesystem;
const dayName = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.jsonl`;
};

// From the raw read to the items of a sample. No system state: it tests on its own.
export function digest(prev, now, sample, machine, os) {
  const seconds = prev ? (now.t - prev.t) / 1000 : 0;
  const cpuOf = new Map();
  const groups = new Map();
  let sumCpu = 0;
  for (const p of sample.procs) {
    const key = `${p.pid}|${p.name}`;
    const before = prev?.cpu.get(key);
    cpuOf.set(key, p.cpuMs);
    const delta = before !== undefined ? Math.max(0, p.cpuMs - before) : 0;
    const share = seconds ? Math.min(1, delta / (seconds * 1000 * machine.cores)) : 0;
    const who = appFor(os, p, now.paths.get(p.pid));
    if (who.bundle) now.bundles.set(who.app, who.bundle);
    const gk = `${who.app}|${p.name}`;
    const g = groups.get(gk) || { app: who.app, process: p.name, cpu: 0, mem: 0, count: 0 };
    g.cpu += share; g.count++;
    groups.set(gk, g);
    sumCpu += share;
  }
  let cpu = sumCpu;
  if (sample.cpu && prev?.sys) {
    const dTotal = sample.cpu.total - prev.sys.total;
    if (dTotal > 0) cpu = (sample.cpu.busy - prev.sys.busy) / dTotal;
  }
  // Only on battery is the measured power the computer's consumption. The estimate divides
  // that power in proportion to each process's CPU time.
  const battery = sample.battery;
  const draw = battery && !battery.plugged && battery.watts ? battery.watts : 0;
  const entries = [...groups.values()];
  for (const g of entries) { g.mem = sumCpu ? (g.cpu / sumCpu) * draw : 0; }
  return { seconds, entries, cpuMap: cpuOf, machine: { cpu: Math.min(1, battery?.level ?? 0), mem: Math.min(1, cpu) }, battery, thermal: sample.thermal, load: Math.min(1, cpu), draw };
}

export class Sampler {
  constructor(onSample) {
    this.store = new Store();
    this.onSample = onSample;
    this.paused = false;
    this.prev = null;
    this.paths = new Map();
    this.bundles = new Map();
    this.machine = { cores: 1, model: '' };
    this.latest = { battery: null, thermal: null, load: 0, draw: 0 };
    this.hasBattery = false;
    this.diag = { samples: 0, processes: 0, error: '', exitCode: null, raw: '' };
  }

  async start() {
    const cpu = await N().computer.getCPUInfo();
    this.machine = { cores: cpu.logicalThreads || 1, model: cpu.model || '' };
    const base = (await N().os.getPath('data')).replace(/[\\/]$/, '');
    this.sep = OS === 'Windows' ? '\\' : '/';
    this.dir = `${base}${this.sep}Battiti Energy`;
    await fs().createDirectory(this.dir).catch(() => {});
    await this.loadHistory();
    if (OS === 'Windows') await this.streamWindows();
    else {
      this.script = await scriptCommand(OS === 'Linux' ? linuxScript() : MAC_SCRIPT);
      this.loop();
    }
  }

  async loadHistory() {
    const now = Date.now();
    const keep = new Set(Array.from({ length: 8 }, (_, i) => dayName(now - i * 86400000)));
    const files = await fs().readDirectory(this.dir).catch(() => []);
    for (const f of files) {
      if (!f.entry.endsWith('.jsonl')) continue;
      const path = this.dir + this.sep + f.entry;
      if (!keep.has(f.entry)) { fs().remove(path).catch(() => {}); continue; }
      try { this.store.loadLines(await fs().readFile(path)); } catch { /* giorno illeggibile */ }
    }
    this.store.prune(now);
  }

  async handle(text) {
    if (this.paused || this.stopped) return;
    const sample = PARSERS[OS](text);
    this.hasBattery = sample.battery != null;
    for (const [pid, info] of sample.paths) this.paths.set(pid, info);
    this.diag.samples++;
    this.diag.processes = sample.procs.length;
    this.diag.raw = text.split('\n').slice(0, 40).join('\n');
    const now = { t: Date.now(), paths: this.paths, bundles: this.bundles };
    const r = digest(this.prev, now, sample, this.machine, OS);
    this.prev = { t: now.t, cpu: r.cpuMap, sys: sample.cpu };
    if (r.seconds) {
      this.store.record(now.t, r.seconds, r.entries, r.machine);
      this.latest = { battery: r.battery, thermal: r.thermal, load: r.load, draw: r.draw };
    }
    for (const { minute, line } of this.store.drain(now.t)) await this.append(minute, line);
    this.store.prune(now.t);
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
    this.timer = setTimeout(() => this.loop(), Math.max(400, INTERVAL - (Date.now() - began)));
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
    if (!value) this.prev = null; // the pause must not land in the next delta
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.proc !== undefined) kill(this.proc);
    for (const { minute, line } of this.store.drain(Date.now(), true)) await this.append(minute, line);
    if (this.script) await fs().remove(this.script.file).catch(() => {});
  }

  async clearHistory() {
    this.store.clear();
    const files = await fs().readDirectory(this.dir).catch(() => []);
    for (const f of files) if (f.entry.endsWith('.jsonl')) await fs().remove(this.dir + this.sep + f.entry).catch(() => {});
    this.onSample();
  }
}
export { PERIODS };
