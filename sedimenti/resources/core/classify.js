// Classify a sediment path into a category, a safety level and a display name.
// Safety: 0 safe (it regenerates), 1 caution (you need the source to rebuild it),
// 2 careful (it may hold data worth keeping).
export const SAFE = 0;
export const CAUTION = 1;
export const CAREFUL = 2;

export const CATEGORIES = {
  caches: { label: 'Caches', safety: SAFE, order: 0 },
  packages: { label: 'Package caches', safety: SAFE, order: 1 },
  deps: { label: 'Dependencies', safety: CAUTION, order: 2 },
  builds: { label: 'Build output', safety: SAFE, order: 3 },
  docker: { label: 'Docker', safety: CAUTION, order: 4 },
  trash: { label: 'Trash', safety: SAFE, order: 5 },
  leftovers: { label: 'Leftovers', safety: CAUTION, order: 6 },
};

// Per-project folders, found anywhere under home. Dependencies need the network or a manifest to
// come back (caution); build output regenerates from your own source (safe).
const DEPS = new Set(['node_modules', 'vendor', '.venv', 'venv', 'Pods', 'bower_components', '.terraform']);
const BUILDS = new Set(['target', 'build', '__pycache__', '_build', '.dart_tool', '.next', '.nuxt', '.svelte-kit', '.angular', '.turbo', '.parcel-cache', '.pytest_cache', '.mypy_cache', '.ruff_cache']);

// Known package-manager and module stores, relative to home, with friendly names.
const PKG_NAMES = {
  '.npm': 'npm', '.gradle/caches': 'Gradle', '.m2/repository': 'Maven', '.cargo/registry': 'Cargo',
  '.bun/install/cache': 'Bun', 'go/pkg/mod': 'Go modules', '.nuget/packages': 'NuGet', '.gem': 'RubyGems',
  '.pub-cache': 'Pub', '.ivy2': 'Ivy', '.sbt': 'sbt', '.stack': 'Stack', '.cabal': 'Cabal', '.yarn/berry/cache': 'Yarn',
};
const PKG = [...Object.keys(PKG_NAMES), '.cache/pip', '.cache/yarn', '.cache/pnpm', '.cache/go-build', 'Library/Caches/Homebrew', 'Library/Caches/go-build'];

const base = (p) => p.replace(/\/+$/, '').split('/').pop() || p;
const parentName = (p) => base(p.replace(/\/[^/]+\/*$/, '')) || base(p);
const nice = (n) => n.replace(/^\./, '');

export function classify(path, home = '') {
  const rel = home && path.startsWith(home + '/') ? path.slice(home.length + 1) : path;
  if (path.startsWith('docker:')) {
    const rest = path.slice(7);
    const sub = rest.split(':')[0];
    const safety = /volume/i.test(sub) ? CAREFUL : /build\s*cache/i.test(sub) ? SAFE : CAUTION;
    return { category: 'docker', safety, name: rest };
  }
  // Per-project dependency/build folders — but never reclassify something that lives inside a cache dir.
  // The name leads with the folder (node_modules, target…) so the list can never be mistaken for a list
  // of projects; the project follows only to tell two folders apart.
  const leaf = base(path);
  if (!/^(\.cache|Library\/Caches)\//.test(rel) && (DEPS.has(leaf) || BUILDS.has(leaf))) {
    const project = parentName(path);
    const name = project && project !== leaf ? `${leaf} · ${project}` : leaf;
    return DEPS.has(leaf)
      ? { category: 'deps', safety: CAUTION, name }
      : { category: 'builds', safety: SAFE, name };
  }
  if (/\/Library\/Developer\/Xcode\/DerivedData$/.test(path)) return { category: 'caches', safety: SAFE, name: 'Xcode DerivedData' };
  if (/\/Library\/Developer\/CoreSimulator\/Caches$/.test(path)) return { category: 'caches', safety: SAFE, name: 'Simulator caches' };
  if (rel === '.local/share/Trash' || rel === '.Trash' || /\/\.Trash$/.test(path)) {
    return { category: 'trash', safety: SAFE, name: 'Trash' };
  }
  const pkg = PKG.find((p) => rel === p || rel.startsWith(p + '/'));
  if (pkg) return { category: 'packages', safety: SAFE, name: PKG_NAMES[pkg] || nice(base(path)) };
  if (rel === '.cache' || rel === 'Library/Caches' || rel.startsWith('.cache/') || rel.startsWith('Library/Caches/')) {
    return { category: 'caches', safety: SAFE, name: nice(base(path)) };
  }
  return { category: 'leftovers', safety: CAUTION, name: nice(base(path)) };
}
