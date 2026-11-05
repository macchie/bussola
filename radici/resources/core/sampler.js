// Legge gli elementi di avvio, ricorda cosa è già stato visto e tiene il diario delle modifiche.
import { OS, run, scriptCommand, linuxScript, MAC_SCRIPT, WINDOWS_SCRIPT } from './platform.js';
import { parseLinux, parseMac, parseWindows, firstToken } from './parse.js';
import { commandFor, hiddenDesktop } from './actions.js';
import { groupOf } from './attribute.js';
import { Store, Ledger, PERIODS, SEP, buildTree } from './store.js';

const INTERVAL = 60000;
const N = () => globalThis.Neutralino;
const fs = () => N().filesystem;
const dayName = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.jsonl`;
};

export function digest(items, os) {
  const entries = new Map();
  const details = new Map();
  for (const item of items) {
    const kind = item.state === 'off' ? 'off' : item.kind;
    const group = groupOf(os, item, firstToken(item.program));
    const key = [kind, group, '', item.name].join(SEP);
    entries.set(key, 1);
    details.set(key, { detail: item.source, off: item.state === 'off', item });
  }
  const off = items.filter((i) => i.state === 'off').length;
  return { entries, details, active: items.length - off, off };
}

export class Sampler {
  constructor(onSample) {
    this.store = new Store();
    this.ledger = new Ledger();
    this.onSample = onSample;
    this.paused = false;
    this.snapshot = { entries: new Map(), details: new Map() };
    this.items = [];
    this.journal = [];
    this.latest = { active: 0, off: 0 };
    this.lastT = 0;
    this.diag = { samples: 0, processes: 0, error: '', exitCode: null, raw: '' };
  }

  tree(period, now, kind) {
    const entries = period === 'live' || kind === 'off' ? this.snapshot.entries
      : new Map(this.ledger.seenSince(this.store.rangeOf(period, now).from).map((k) => [k, 1]));
    return buildTree(entries, kind, (key) => ({
      ...(this.snapshot.details.get(key) || {}), isNew: this.ledger.isNew(key, now), first: this.ledger.items.get(key)?.[0],
    }));
  }

  async start() {
    const base = (await N().os.getPath('data')).replace(/[\\/]$/, '');
    this.config = (await N().os.getPath('config')).replace(/[\\/]$/, '');
    this.sep = OS === 'Windows' ? '\\' : '/';
    this.dir = `${base}${this.sep}Radici`;
    await fs().createDirectory(this.dir).catch(() => {});
    await this.loadHistory();
    this.script = await scriptCommand(OS === 'Linux' ? linuxScript(this.config) : OS === 'Darwin' ? MAC_SCRIPT : WINDOWS_SCRIPT);
    this.loop();
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
    try {
      const data = JSON.parse(await fs().readFile(this.dir + this.sep + 'stato.json'));
      this.ledger = new Ledger(data.ledger);
      this.journal = data.journal || [];
    } catch { /* primo avvio */ }
  }

  async save(now) {
    const file = this.dir + this.sep + 'stato.json';
    this.ledger.prune(now);
    await fs().writeFile(`${file}.tmp`, JSON.stringify({ ledger: this.ledger, journal: this.journal }));
    await fs().move(`${file}.tmp`, file);
  }

  parse(text) {
    return OS === 'Linux' ? parseLinux(text, this.config) : OS === 'Darwin' ? parseMac(text) : parseWindows(text);
  }

  async read() {
    const res = await run(this.script.command);
    this.diag.exitCode = res.code;
    this.diag.error = res.err.trim().slice(0, 400);
    this.diag.raw = res.out.split('\n').slice(0, 40).join('\n');
    const items = this.parse(res.out);
    this.diag.samples++;
    this.diag.processes = items.length;
    this.items = items;
    return items;
  }

  async scan() {
    const items = await this.read();
    const now = Date.now();
    const r = digest(items, OS);
    this.snapshot = r;
    this.latest = { active: r.active, off: r.off };
    this.ledger.observe([...r.entries.keys()].filter((k) => !k.startsWith(`off${SEP}`)), now);
    if (this.lastT) this.store.record(now, (now - this.lastT) / 1000, [], { cpu: r.active, mem: r.off });
    this.lastT = now;
    for (const { minute, line } of this.store.drain(now)) {
      await fs().appendFile(this.dir + this.sep + dayName(minute * 60000), `${line}\n`).catch(() => {});
    }
    await this.save(now).catch(() => {});
    this.onSample();
  }

  async loop() {
    if (this.stopped) return;
    if (!this.paused) {
      try { await this.scan(); } catch (err) { this.diag.error = String(err.message || err); this.onSample(); }
    }
    this.timer = setTimeout(() => this.loop(), INTERVAL);
  }

  // Cambia lo stato, poi rilegge dal sistema: conta ciò che il sistema dice, non il comando.
  async toggle(item, enable) {
    if (!item.editable || !item.mech) throw new Error(item.why || 'Elemento in sola lettura');
    const entry = this.journal.find((j) => j.id === item.id && !j.restoredAt);
    if (item.mech.type === 'autostart') await this.toggleAutostart(item, enable, entry);
    else {
      // Disattivato altrove, per esempio da Gestione attività: non c'è un valore da rimettere.
      const mech = enable && entry ? entry.mech
        : enable && item.mech.type === 'run' ? { ...item.mech, approved: '020000000000000000000000' } : item.mech;
      const { command, file } = await scriptCommand(commandFor(mech, enable));
      const res = await run(command);
      fs().remove(file).catch(() => {});
      if (res.code !== 0) throw new Error((res.err || 'Il sistema ha rifiutato la modifica').trim().slice(0, 200));
    }
    await this.scan();
    const after = this.items.find((i) => i.id === item.id);
    if (!after || after.state !== (enable ? 'on' : 'off')) throw new Error('Il sistema non ha applicato la modifica');
    if (enable) { if (entry) entry.restoredAt = Date.now(); } else {
      this.journal.push({ id: item.id, name: item.name, at: Date.now(), mech: item.mech, backup: this.backup ?? null });
    }
    this.backup = undefined;
    await this.save(Date.now());
  }

  async toggleAutostart(item, enable, entry) {
    const path = `${this.config}/autostart/${item.mech.base}`;
    if (!/^[\w@.+-]+\.desktop$/.test(item.mech.base)) throw new Error('Nome non valido');
    if (enable) {
      if (entry?.backup) await fs().writeFile(path, entry.backup);
      else if (entry) await fs().remove(path);
      else {
        const cur = await fs().readFile(path);
        await fs().writeFile(path, cur.replace(/^Hidden=.*\n?/m, ''));
      }
      return;
    }
    await fs().createDirectory(`${this.config}/autostart`).catch(() => {});
    let previous = null;
    try { previous = await fs().readFile(path); } catch { /* elemento di sistema: la copia è nuova */ }
    this.backup = previous;
    await fs().writeFile(path, hiddenDesktop(previous, item.name));
  }

  setPaused(value) {
    this.paused = value;
    if (!value) this.lastT = 0;
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    for (const { minute, line } of this.store.drain(Date.now(), true)) await fs().appendFile(this.dir + this.sep + dayName(minute * 60000), `${line}\n`).catch(() => {});
    await this.save(Date.now()).catch(() => {});
    if (this.script) await fs().remove(this.script.file).catch(() => {});
  }

  async clearHistory() {
    this.store.clear();
    this.ledger = new Ledger();
    for (const f of await fs().readDirectory(this.dir).catch(() => [])) {
      if (f.entry.endsWith('.jsonl')) await fs().remove(this.dir + this.sep + f.entry).catch(() => {});
    }
    await this.save(Date.now()).catch(() => {});
    this.onSample();
  }
}
export { PERIODS };
