// Temporary trash. Moving is always a rename on the same volume;
// deletion accepts only trash ids, never arbitrary paths.
import { OS, sep, windows, run, removeScript, q } from './platform.js';
import { ancestors, basename, dirname, inside, join, macDataPath } from './paths.js';

export const TRASH_MARK = '.anelli-trash-';
const fs = () => globalThis.Neutralino.filesystem;

export function parkingSpots(target, { home, mount, sameVolume, label }) {
  const out = sameVolume ? [home] : [];
  const fold = windows;
  for (const dir of ancestors(target, sep)) {
    if (inside(dir, mount, sep, fold)) out.push(join(dir, TRASH_MARK + label, sep));
  }
  return out;
}

async function exists(path) {
  try { await fs().getStats(path); return true; } catch { /* forse un link interrotto */ }
  // getStats follows links: a broken link must be looked up in the folder.
  try {
    const name = basename(path, sep);
    return (await fs().readDirectory(dirname(path, sep))).some((e) => e.entry === name);
  } catch { return false; }
}

export class Trash {
  constructor(dataDir, label) {
    this.dataDir = dataDir;
    this.home = join(dataDir, 'trash', sep);
    this.file = join(dataDir, 'trash.json', sep);
    this.label = label;
    this.items = [];
    this.busy = new Set();
  }

  async load() {
    await fs().createDirectory(this.dataDir).catch(() => {});
    await fs().createDirectory(this.home).catch(() => {});
    try { this.items = JSON.parse(await fs().readFile(this.file)); } catch { this.items = []; }
  }

  async save() {
    const tmp = `${this.file}.tmp`;
    await fs().writeFile(tmp, JSON.stringify(this.items, null, 1));
    await fs().move(tmp, this.file);
  }

  async list() {
    return Promise.all(this.items.map(async (item) => ({ ...item, missing: !await exists(item.parked) })));
  }

  async move(target, meta, volumes) {
    const fold = windows;
    const owner = volumes.filter((v) => inside(target, v.mount, sep, fold))
      .sort((a, b) => b.mount.length - a.mount.length)[0];
    const homePath = OS === 'Darwin' ? macDataPath(this.home) : this.home;
    const homeOwner = volumes.filter((v) => inside(homePath, v.mount, sep, fold))
      .sort((a, b) => b.mount.length - a.mount.length)[0];
    if (!await exists(target)) throw new Error('It no longer exists on disk');
    const id = crypto.randomUUID();
    const spots = parkingSpots(target, {
      home: this.home, mount: owner ? owner.mount : sep, sameVolume: owner === homeOwner, label: this.label,
    });
    for (const root of spots) {
      const holder = join(root, id, sep);
      const parked = join(holder, basename(target, sep), sep);
      const fresh = !await exists(root);
      try {
        await fs().createDirectory(holder);
        if (fresh && !windows) await run(`chmod 700 ${q(root)}\n`);
      } catch { continue; }
      try {
        await fs().move(target, parked);
      } catch {
        await fs().remove(holder).catch(() => {});
        if (fresh) await fs().remove(root).catch(() => {});
        continue;
      }
      const item = {
        id, name: basename(target, sep), original: target, holder, parked, mount: owner ? owner.mount : sep,
        dir: meta.dir, size: meta.size, files: meta.files, trashedAt: Date.now(),
      };
      this.items.push(item);
      await this.save();
      return item;
    }
    throw new Error('Insufficient permissions');
  }

  async restore(id, { rename }) {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw Object.assign(new Error('Item not found'), { code: 'NOTFOUND' });
    if (this.busy.has(id)) throw new Error('Deleting');
    let target = item.original;
    if (await exists(target)) {
      if (!rename) throw Object.assign(new Error('An item with this name already exists'), { code: 'CONFLICT' });
      target = await freeName(target);
    }
    await fs().createDirectory(dirname(target, sep)).catch(() => {});
    await fs().move(item.parked, target);
    await fs().remove(item.holder).catch(() => {});
    await this.tidy(item);
    this.items = this.items.filter((i) => i !== item);
    await this.save();
    return { ...item, restoredTo: target };
  }

  async purge(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw Object.assign(new Error('Item not found'), { code: 'NOTFOUND' });
    const root = dirname(item.holder, sep);
    if (basename(item.holder, sep) !== id || dirname(item.parked, sep) !== item.holder
      || !(root === this.home || basename(root, sep) === TRASH_MARK + this.label)) {
      throw new Error('Invalid Trash entry');
    }
    if (this.busy.has(id)) return item;
    this.busy.add(id);
    try {
      const res = await run(removeScript(item.holder));
      if (res.code !== 0) throw new Error('Insufficient permissions');
    } finally {
      this.busy.delete(id);
    }
    this.items = this.items.filter((i) => i !== item);
    await this.save();
    await this.tidy(item);
    return item;
  }

  // Removes the trash folder next to the files when it's left empty.
  async tidy(item) {
    const root = dirname(item.holder, sep);
    if (root === this.home) return;
    try {
      const left = (await fs().readDirectory(root)).filter((e) => e.entry !== '.' && e.entry !== '..' && e.entry !== item.id);
      if (!left.length) await fs().remove(root);
    } catch { /* ancora in uso */ }
  }

  sizeOnMount(mount) {
    return this.items.reduce((sum, i) => sum + (i.mount === mount ? i.size : 0), 0);
  }
}

async function freeName(target) {
  const dir = dirname(target, sep);
  const base = basename(target, sep);
  const dot = base.lastIndexOf('.');
  const name = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  for (let i = 1; ; i++) {
    const tx = globalThis.tx || ((s) => s);
    const suffix = i === 1 ? tx(' (restored)') : tx(' (restored {0})').replace('{0}', i);
    const next = join(dir, `${name}${suffix}${ext}`, sep);
    if (!await exists(next)) return next;
  }
}
