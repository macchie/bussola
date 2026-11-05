// Everything the interface asks the system goes through here.
import { OS, windows, sep, spawn, run, kill, tempFile, scanScript, revealScript } from './platform.js';
import { WINDOWS_SCANNER } from './windows-scan.js';
import { listVolumes } from './volumes.js';
import { Trash } from './trash.js';
import { refuse } from './safety.js';
import { dirname, inside, join, macDataPath, stripTrailing } from './paths.js';

const N = () => globalThis.Neutralino;
const fs = () => N().filesystem;
const MAX_SCANS = 4;
const CHUNK = 4 * 1048576;
const fold = windows;
const under = (a, b) => inside(a, b, sep, fold);
const scans = new Map();
let info;
let trash;

export async function init() {
  const home = stripTrailing(await N().os.getPath('home'), sep);
  const base = stripTrailing(await N().os.getPath('data'), sep);
  const dataDir = join(base, 'Stiva', sep);
  let label = 'utente';
  if (!windows) {
    const res = await run('id -u\n');
    label = res.out.trim() || label;
  }
  trash = new Trash(dataDir, label);
  await trash.load();
  info = { home, sep, os: OS, dataDir, fullDiskAccess: await checkFullDiskAccess() };
  return info;
}

// Safari's folder is readable only with Full Disk Access. Null outside macOS.
export async function checkFullDiskAccess() {
  if (OS !== 'Darwin') return null;
  const res = await run('LC_ALL=C ls "$HOME/Library/Safari" 2>&1 >/dev/null\n');
  return !/not permitted/i.test(res.out + res.err);
}
export const openPrivacySettings = () => run("open 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'\n");

// Reads the list as it grows and passes it to the worker as an ArrayBuffer.
async function tail(file, send, finished) {
  let pos = 0;
  for (;;) {
    const ended = finished();
    let size = 0;
    try { size = (await fs().getStats(file)).size; } catch { /* not created yet */ }
    while (pos < size) {
      const want = Math.min(CHUNK, size - pos);
      const buffer = await fs().readBinaryFile(file, { pos, size: want });
      if (!buffer.byteLength) break;
      pos += buffer.byteLength;
      send(buffer);
    }
    if (ended && pos >= size) return;
    await new Promise((r) => setTimeout(r, 150));
  }
}

const countLines = async (file) => {
  try { return (await fs().readFile(file)).split('\n').filter(Boolean).length; } catch { return 0; }
};

class Scan {
  constructor(root, volumes) {
    this.id = crypto.randomUUID().slice(0, 12);
    this.root = root;
    this.state = 'running';
    this.progress = { files: 0, dirs: 0, bytes: 0, denied: 0, current: root };
    this.volume = volumes.find((v) => v.mount === root);
    this.pending = new Map();
    this.seq = 0;
    this.worker = new Worker('/backend/scan-worker.js', { type: 'module' });
    this.worker.onmessage = (e) => this.onMessage(e.data);
    this.worker.onerror = () => this.fail('Out of memory or scan error: try a smaller folder');
    this.worker.postMessage({
      type: 'config',
      config: { root, sep, windows, trashHome: OS === 'Darwin' ? macDataPath(trash.home) : trash.home },
    });
  }

  async start() {
    try {
      this.out = await tempFile('.lst');
      this.err = await tempFile('.err');
      const proc = await spawn(scanScript(this.root, this.out, this.err, WINDOWS_SCANNER));
      this.proc = proc.id;
      let done = false;
      const exited = proc.exited.then((r) => { done = true; return r; });
      await tail(this.out, (buffer) => {
        if (this.state === 'running') this.worker.postMessage({ type: 'chunk', buffer }, [buffer]);
      }, () => done);
      const res = await exited;
      if (this.state !== 'running') return;
      if (windows && res.code !== 0) { this.fail(res.err.trim().split('\n')[0] || 'Scan failed'); return; }
      this.progress.denied = await countLines(this.err);
      this.worker.postMessage({ type: 'end' });
    } catch (err) {
      this.fail(err.message || 'Scan failed');
    } finally {
      this.cleanup();
    }
  }

  cleanup() {
    for (const f of [this.out, this.err]) if (f) fs().remove(f).catch(() => {});
  }

  onMessage(m) {
    if (m.type === 'progress') Object.assign(this.progress, m);
    else if (m.type === 'done') {
      this.state = 'done';
      this.progress = { ...this.progress, ...m, current: null };
    } else if (m.type === 'failed') this.fail(m.error);
    else if (m.type === 'reply') {
      const p = this.pending.get(m.id);
      this.pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result);
    }
  }

  fail(error) {
    if (this.state !== 'running') return;
    this.state = 'failed';
    this.error = error;
    this.stop();
  }

  stop() {
    if (this.proc !== undefined) kill(this.proc);
    this.worker.terminate();
  }

  call(cmd, args) {
    if (this.state !== 'done') return Promise.reject(new Error('Scan not ready'));
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, cmd, args });
    });
  }

  // Re-scans a folder with the same tool and replaces the branch.
  async refresh(target) {
    const at = await this.call('nearest', { target });
    if (!at) return null;
    await this.call('beginRefresh', { target: at });
    const out = await tempFile('.lst');
    const err = await tempFile('.err');
    try {
      const proc = await spawn(scanScript(at, out, err, WINDOWS_SCANNER));
      let done = false;
      proc.exited.then(() => { done = true; });
      await tail(out, (buffer) => this.worker.postMessage({ type: 'refreshChunk', target: at, buffer }, [buffer]), () => done);
      await this.call('endRefresh', { target: at });
    } finally {
      fs().remove(out).catch(() => {});
      fs().remove(err).catch(() => {});
    }
    return { refreshed: at };
  }

  summary() {
    return {
      id: this.id, root: this.root, state: this.state, error: this.error, progress: this.progress,
      expected: this.volume ? this.volume.used : 0,
    };
  }

  async hiddenSize() {
    if (!this.volume) return 0;
    const { size } = await this.call('totals');
    const now = (await listVolumes()).find((v) => v.mount === this.root);
    if (!now) return 0;
    return Math.max(0, now.used - size - trash.sizeOnMount(this.root));
  }
}

function scanOf(id) {
  const s = scans.get(id);
  if (!s) throw new Error('Scan expired: start a new one');
  return s;
}
function dropScan(scan) {
  if (scan.state === 'running') scan.state = 'cancelled';
  scan.stop();
  scans.delete(scan.id);
}

export const getInfo = () => info;
export const volumes = listVolumes;
export const listScans = () => [...scans.values()].map((s) => s.summary());
export const scanStatus = (id) => scanOf(id).summary();
export const cancelScan = (id) => dropScan(scanOf(id));
export const closeAll = () => [...scans.values()].forEach(dropScan);
export const listTrash = () => trash.list();

export async function startScan(raw) {
  const root = stripTrailing(String(raw || ''), sep);
  let st;
  try { st = await fs().getStats(root); } catch { throw new Error('Folder not found'); }
  if (!st.isDirectory) throw new Error('That path isn\'t a folder');
  for (const s of scans.values()) if (s.root === root) dropScan(s);
  while (scans.size >= MAX_SCANS) dropScan(scans.values().next().value);
  const scan = new Scan(root, await listVolumes());
  scans.set(scan.id, scan);
  scan.start();
  return scan.summary();
}

export async function tree(id, path) {
  const scan = scanOf(id);
  const target = path || scan.root;
  const node = await scan.call('tree', { target, depth: 5 });
  if (!node) throw new Error('Item no longer exists');
  const hidden = target === scan.root ? await scan.hiddenSize() : 0;
  return { path: target, sep, root: scan.root, hidden, denied: scan.progress.denied, node };
}
export const largest = (id) => scanOf(id).call('largest', { limit: 200 });
export const refresh = (id, path) => scanOf(id).refresh(path);

export async function moveToTrash(id, paths) {
  const scan = scanOf(id);
  const vols = await listVolumes();
  const ctx = {
    os: OS, home: info.home, mounts: vols.map((v) => v.mount), protectedDirs: [info.dataDir],
    allowSystem: false,
  };
  const moved = [];
  const failed = [];
  for (const target of paths) {
    const reason = target === scan.root ? 'It\'s the scanned folder'
      : !under(target, scan.root) ? 'Outside the scanned folder' : refuse(target, ctx);
    if (reason) { failed.push({ path: target, error: reason }); continue; }
    try {
      const meta = (await scan.call('node', { target })) || { size: 0, files: 1, dir: false };
      const item = await trash.move(target, meta, vols).catch((err) => {
        if (OS === 'Darwin' && err.message === 'Insufficient permissions') {
          throw new Error(info.fullDiskAccess ? 'macOS protects this item even with Full Disk Access' : 'Full Disk Access is required');
        }
        throw err;
      });
      for (const s of scans.values()) {
        if (s.state === 'done' && under(target, s.root) && !await s.call('remove', { target })) {
          await s.refresh(dirname(target, sep));
        }
      }
      moved.push(item);
    } catch (err) {
      failed.push({ path: target, error: err.message });
    }
  }
  return { moved, failed };
}

export async function restoreItems(ids, rename) {
  const restored = [];
  const failed = [];
  for (const id of ids) {
    try {
      const item = await trash.restore(id, { rename });
      restored.push(item);
      for (const s of scans.values()) {
        if (s.state === 'done' && under(item.restoredTo, s.root)) await s.refresh(dirname(item.restoredTo, sep));
      }
    } catch (err) {
      failed.push({ id, code: err.code, error: err.message });
    }
  }
  return { restored, failed };
}

export async function purgeItems(ids) {
  const purged = [];
  const failed = [];
  for (const id of ids) {
    try { purged.push((await trash.purge(id)).id); }
    catch (err) { failed.push({ id, error: err.message }); }
  }
  return { purged, failed };
}

export async function reveal(path) {
  const res = await run(revealScript(path, dirname(path, sep)));
  if (res.code !== 0) throw new Error('No file manager available on this system');
}

export async function listFolders(path) {
  const dir = stripTrailing(path || info.home, sep);
  const entries = await fs().readDirectory(dir);
  const up = dirname(dir, sep);
  return {
    path: dir,
    parent: up === dir ? null : up,
    dirs: entries.filter((e) => e.type === 'DIRECTORY' && e.entry !== '.' && e.entry !== '..')
      .map((e) => e.entry).sort((a, b) => a.localeCompare(b, globalThis.LINGUA || 'it-IT')).slice(0, 500),
  };
}

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/mp4',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
};
const MEDIA_LIMIT = 256 * 1048576;
const TEXT_LIMIT = 128 * 1024;

// { kind: 'media', url, type } | { kind: 'text', text, truncated } | { kind: 'none', reason }
export async function preview(path, name) {
  const st = await fs().getStats(path);
  if (!st.isFile) return { kind: 'none', reason: 'No preview for this item.' };
  const type = MIME[name.split('.').pop().toLowerCase()];
  if (type) {
    if (st.size > MEDIA_LIMIT) return { kind: 'none', reason: 'File troppo grande per l\'anteprima: aprilo con "Show in folder".' };
    const buffer = await fs().readBinaryFile(path);
    return { kind: 'media', type, url: URL.createObjectURL(new Blob([buffer], { type })) };
  }
  const head = await fs().readBinaryFile(path, { pos: 0, size: Math.min(st.size, TEXT_LIMIT) });
  const bytes = new Uint8Array(head);
  if (bytes.includes(0)) return { kind: 'none', reason: 'No preview for this file type.' };
  return { kind: 'text', text: new TextDecoder().decode(bytes), truncated: st.size > TEXT_LIMIT };
}
