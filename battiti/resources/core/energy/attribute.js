// From process to app, with each system's rules.
const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const SYSTEM = { Linux: 'Linux system', Darwin: 'macOS system', Windows: 'Windows system' };

function linux(p, info) {
  if (p.pid === 2 || p.ppid === 2) return { app: 'Linux kernel', bundle: null };
  const path = info?.path;
  if (!path) return { app: SYSTEM.Linux, bundle: null };
  const m = /^\/(?:opt|snap)\/([^/]+)\//.exec(path) || /^\/usr\/lib(?:64)?\/([^/]+)\//.exec(path);
  if (m && !/^(systemd|x86_64-linux-gnu|aarch64-linux-gnu|gnome|kde|polkit|udisks2)/.test(m[1])) return { app: title(m[1]), bundle: path };
  if (/^\/usr\/(lib|libexec)\//.test(path)) return { app: SYSTEM.Linux, bundle: null };
  return { app: path.slice(path.lastIndexOf('/') + 1), bundle: path };
}

function mac(p, info) {
  const path = info?.path;
  if (!path) return { app: p.name, bundle: null };
  const m = /^(.*?\/([^/]+)\.app)(\/|$)/.exec(path);
  if (m) return { app: m[2], bundle: m[1] };
  if (/^\/(usr\/(s?bin|libexec)|sbin|bin|System|Library\/Apple)\//.test(path)) return { app: SYSTEM.Darwin, bundle: null };
  return { app: p.name, bundle: path };
}

function windows(p, info) {
  const path = info?.path;
  if (!path || /^[A-Za-z]:\\Windows\\/i.test(path)) return { app: SYSTEM.Windows, bundle: null };
  return { app: info.description || p.name, bundle: path };
}

export const appFor = (os, p, info) => (os === 'Linux' ? linux : os === 'Darwin' ? mac : windows)(p, info);
