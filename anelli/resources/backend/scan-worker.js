// Builds the tree from the list produced by the native tool. The list is in
// post-order: each folder appears after its own content, so it's enough
// tenere in memoria le cartelle ancora aperte.
//   POSIX    "<kB>\t<path>"          (du -ak)
//   Windows  "<byte>\t<D|F>\t<path>"
const FILE_CAP = 200;
const LARGEST_KEEP = 300;
const VIEW_LIST_CAP = 1000;
const VIEW_DEEP_CAP = 80;
const TRASH_MARK = '.anelli-trash-';

let cfg = null;      // { root, sep, windows, trashHome }
let root = null;
let largest = [];

function dirname(p, sep) {
  const i = p.lastIndexOf(sep);
  if (i <= 0) return sep;
  const up = p.slice(0, i);
  return /^[A-Za-z]:$/.test(up) ? up + sep : up;
}
const fold = (s) => (cfg.windows ? s.toLowerCase() : s);
const isUnder = (p, dir) => {
  const a = fold(p);
  const b = fold(dir);
  return a === b || a.startsWith(b.endsWith(cfg.sep) ? b : b + cfg.sep);
};

function noteLargest(path, size) {
  if (size < 1048576) return;
  largest.push({ path, s: size });
  if (largest.length > LARGEST_KEEP * 2) {
    largest.sort((a, b) => b.s - a.s);
    largest.length = LARGEST_KEEP;
  }
}

class Builder {
  constructor(topPath) {
    this.top = topPath;
    this.open = new Map();
    this.result = null;
    this.tail = '';
    this.decoder = new TextDecoder();
    this.count = { files: 0, dirs: 0, bytes: 0, last: '' };
  }

  slot(dir) {
    let s = this.open.get(dir);
    if (!s) { s = { dirs: [], files: [], excl: 0, fc: 0 }; this.open.set(dir, s); }
    return s;
  }

  feed(buffer, final) {
    const text = this.tail + this.decoder.decode(buffer, { stream: !final });
    const lines = text.split('\n');
    this.tail = final ? '' : lines.pop();
    for (const raw of lines) {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      if (line) this.line(line);
    }
  }

  line(line) {
    const tab = line.indexOf('\t');
    if (tab < 1) return;
    let size = Number(line.slice(0, tab));
    if (!Number.isFinite(size)) return;
    let path = line.slice(tab + 1);
    let isDir = false;
    if (cfg.windows) {
      isDir = path[0] === 'D';
      path = path.slice(2);
    } else {
      size *= 1024;
    }
    const sep = cfg.sep;
    const name = path.slice(path.lastIndexOf(sep) + 1);
    const atTop = path === this.top;
    const parent = atTop ? null : dirname(path, sep);

    // The trash isn't in the map, but the tool's total includes it.
    if (path.includes(sep + TRASH_MARK) || (cfg.trashHome && isUnder(path, cfg.trashHome))) {
      const here = name.startsWith(TRASH_MARK) || (cfg.trashHome && fold(path) === fold(cfg.trashHome));
      if (here && parent) this.slot(parent).excl += size;
      return;
    }

    const slot = this.open.get(path);
    if (slot || isDir || atTop) {
      const s = slot || { dirs: [], files: [], excl: 0, fc: 0 };
      this.open.delete(path);
      const node = { n: atTop ? (name || path) : name, s: size - s.excl, d: 1, fc: s.fc, c: s.dirs, oc: 0, os: 0 };
      let files = s.files;
      if (files.length > FILE_CAP) {
        files.sort((a, b) => b.s - a.s);
        for (let i = FILE_CAP; i < files.length; i++) { node.oc++; node.os += files[i].s; }
        files = files.slice(0, FILE_CAP);
      }
      node.c = s.dirs.concat(files);
      node.c.sort((a, b) => b.s - a.s);
      this.count.dirs++;
      if (atTop) { this.result = node; return; }
      const up = this.slot(parent);
      up.dirs.push(node);
      up.fc += s.fc;
      up.excl += s.excl;
    } else {
      const up = this.slot(parent);
      up.files.push({ n: name, s: size });
      up.fc++;
      this.count.files++;
      this.count.bytes += size;
      noteLargest(path, size);
    }
    this.count.last = path;
  }
}

function chainTo(target) {
  if (!isUnder(target, cfg.root)) return null;
  const chain = [root];
  if (fold(target) === fold(cfg.root)) return chain;
  const rel = target.slice(cfg.root.length + (cfg.root.endsWith(cfg.sep) ? 0 : 1));
  let cur = root;
  for (const part of rel.split(cfg.sep)) {
    const next = cur.c && cur.c.find((c) => c.n === part);
    if (!next) return null;
    chain.push(next);
    cur = next;
  }
  return chain;
}

function view(node, depth, minSize, top) {
  const out = { n: node.n, s: node.s };
  if (!node.d) return out;
  out.d = 1;
  out.fc = node.fc;
  if (depth <= 0) {
    if (node.c.length || node.oc) out.more = 1;
    return out;
  }
  out.c = [];
  let oc = node.oc;
  let os = node.os;
  const cap = top ? VIEW_LIST_CAP : VIEW_DEEP_CAP;
  for (const child of node.c) {
    if (out.c.length >= cap || (!top && child.s < minSize)) {
      oc += child.d ? child.fc + 1 : 1;
      os += child.s;
    } else {
      out.c.push(view(child, depth - 1, minSize, false));
    }
  }
  if (oc) out.o = { count: oc, size: os };
  return out;
}

function adjust(chain, delta, deltaFiles) {
  for (const n of chain) {
    n.s += delta;
    n.fc += deltaFiles;
    n.c.sort((a, b) => b.s - a.s);
  }
}
const dropLargest = (target) => { largest = largest.filter((f) => !isUnder(f.path, target)); };

const commands = {
  tree({ target, depth }) {
    const chain = chainTo(target || cfg.root);
    if (!chain) return null;
    const node = chain[chain.length - 1];
    return view(node, depth, node.s * 0.002, true);
  },
  node({ target }) {
    const chain = chainTo(target);
    if (!chain) return null;
    const n = chain[chain.length - 1];
    return { name: n.n, size: n.s, dir: !!n.d, files: n.d ? n.fc : 1 };
  },
  totals() { return { size: root.s, files: root.fc }; },
  largest({ limit }) {
    largest.sort((a, b) => b.s - a.s);
    if (largest.length > LARGEST_KEEP) largest.length = LARGEST_KEEP;
    return largest.slice(0, limit);
  },
  remove({ target }) {
    const chain = chainTo(target);
    if (!chain || chain.length < 2) return false;
    const node = chain.pop();
    const parent = chain[chain.length - 1];
    parent.c.splice(parent.c.indexOf(node), 1);
    adjust(chain, -node.s, node.d ? -node.fc : -1);
    dropLargest(target);
    return true;
  },
  // Closest folder to target still present in the tree.
  nearest({ target }) {
    let at = target;
    for (;;) {
      const chain = chainTo(at);
      if (chain && chain[chain.length - 1].d) return at;
      if (fold(at) === fold(cfg.root) || !isUnder(at, cfg.root)) return null;
      at = dirname(at, cfg.sep);
    }
  },
  beginRefresh({ target }) { refreshing = new Builder(target); return true; },
  endRefresh({ target }) {
    const builder = refreshing;
    refreshing = null;
    builder.feed(new Uint8Array(), true);
    if (!builder.result) throw new Error('Folder no longer readable');
    const chain = chainTo(target);
    if (!chain) throw new Error('Item no longer exists');
    const old = chain.pop();
    builder.result.n = old.n;
    if (chain.length) {
      const parent = chain[chain.length - 1];
      parent.c[parent.c.indexOf(old)] = builder.result;
      adjust(chain, builder.result.s - old.s, builder.result.fc - old.fc);
    } else {
      root = builder.result;
    }
    return true;
  },
};

let main = null;
let refreshing = null;

export function handle(msg, post) {
  if (msg.type === 'config') {
    cfg = msg.config;
    main = new Builder(cfg.root);
  } else if (msg.type === 'chunk') {
    main.feed(msg.buffer, false);
    post({ type: 'progress', files: main.count.files, dirs: main.count.dirs, bytes: main.count.bytes, current: main.count.last });
  } else if (msg.type === 'refreshChunk') {
    if (refreshing.top === msg.target && !refreshing.pruned) {
      dropLargest(msg.target);
      refreshing.pruned = true;
    }
    refreshing.feed(msg.buffer, false);
  } else if (msg.type === 'end') {
    main.feed(new Uint8Array(), true);
    root = main.result;
    if (root) post({ type: 'done', files: main.count.files, dirs: main.count.dirs, size: root.s, fc: root.fc });
    else post({ type: 'failed', error: 'The folder couldn\'t be read' });
    main = null;
  } else {
    try {
      post({ type: 'reply', id: msg.id, result: commands[msg.cmd](msg.args || {}) });
    } catch (err) {
      post({ type: 'reply', id: msg.id, error: err.message });
    }
  }
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined') {
  self.onmessage = (e) => handle(e.data, (m) => self.postMessage(m));
}
