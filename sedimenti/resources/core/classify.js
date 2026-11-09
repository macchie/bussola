// Classify a sediment path into a category, a safety level and a display name.
// Safety: 0 safe (it regenerates), 1 caution (you need the source to rebuild it),
// 2 careful (it may hold data worth keeping).
export const SAFE = 0;
export const CAUTION = 1;
export const CAREFUL = 2;

export const CATEGORIES = {
  caches: { label: 'Caches', safety: SAFE, order: 0 },
  packages: { label: 'Package caches', safety: SAFE, order: 1 },
  node_modules: { label: 'node_modules', safety: CAUTION, order: 2 },
  docker: { label: 'Docker', safety: CAUTION, order: 3 },
  trash: { label: 'Trash', safety: SAFE, order: 4 },
  leftovers: { label: 'Leftovers', safety: CAUTION, order: 5 },
};

// Known package-manager caches, relative to home.
const PKG = ['.npm', '.cache/pip', '.cache/yarn', '.cache/pnpm', '.cache/go-build', '.gradle/caches', '.m2/repository', '.cargo/registry', '.bun/install/cache', 'Library/Caches/Homebrew', 'Library/Caches/go-build'];

const base = (p) => p.replace(/\/+$/, '').split('/').pop() || p;
const nice = (n) => n.replace(/^\./, '');

export function classify(path, home = '') {
  const rel = home && path.startsWith(home + '/') ? path.slice(home.length + 1) : path;
  if (path.startsWith('docker:')) {
    const rest = path.slice(7);
    const sub = rest.split(':')[0];
    const safety = /volume/i.test(sub) ? CAREFUL : /build\s*cache/i.test(sub) ? SAFE : CAUTION;
    return { category: 'docker', safety, name: rest };
  }
  if (/\/node_modules$/.test(path)) {
    const parent = path.replace(/\/node_modules$/, '');
    return { category: 'node_modules', safety: CAUTION, name: base(parent) || 'node_modules' };
  }
  if (rel === '.local/share/Trash' || rel === '.Trash' || /\/\.Trash$/.test(path)) {
    return { category: 'trash', safety: SAFE, name: 'Trash' };
  }
  if (PKG.some((p) => rel === p || rel.startsWith(p + '/'))) {
    return { category: 'packages', safety: SAFE, name: nice(base(path)) };
  }
  if (rel === '.cache' || rel === 'Library/Caches' || rel.startsWith('.cache/') || rel.startsWith('Library/Caches/')) {
    return { category: 'caches', safety: SAFE, name: nice(base(path)) };
  }
  return { category: 'leftovers', safety: CAUTION, name: nice(base(path)) };
}
