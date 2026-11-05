// Dal processo all'app, con le regole di ciascun sistema.
const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const SYSTEM = { Linux: 'Sistema Linux', Darwin: 'Sistema macOS', Windows: 'Sistema Windows' };
export const LOCAL_DEST = 'Rete locale';
export const UNKNOWN_APP = 'Processi non identificati';

function linux(p, info) {
  if (p.pid === 2 || p.ppid === 2) return { app: 'Kernel Linux', bundle: null };
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

const TWO_LEVEL = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'co.jp', 'ne.jp', 'com.br', 'co.nz', 'co.in', 'com.cn', 'com.tr', 'co.kr', 'com.mx']);
const OWNERS = {
  '1e100.net': 'Google', 'googleusercontent.com': 'Google Cloud', 'googlevideo.com': 'YouTube',
  'amazonaws.com': 'Amazon AWS', 'cloudfront.net': 'Amazon CloudFront', 'akamaitechnologies.com': 'Akamai',
  'akamai.net': 'Akamai', 'akamaiedge.net': 'Akamai', 'apple.com': 'Apple', 'icloud.com': 'Apple iCloud',
  'aaplimg.com': 'Apple', 'cdn-apple.com': 'Apple', 'fastly.net': 'Fastly', 'cloudflare.com': 'Cloudflare',
  'msedge.net': 'Microsoft', 'azure.com': 'Microsoft Azure', 'github.com': 'GitHub', 'fbcdn.net': 'Meta', 'facebook.com': 'Meta',
};

const isIPv4 = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
export function isLocal(host) {
  if (host.endsWith('.local') || host.includes('%')) return true;
  if (isIPv4(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 10 || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224;
  }
  return /^(fe80:|fc|fd|ff)/i.test(host);
}

export function destinationOf(host) {
  if (!host || host === '*') return UNKNOWN_DEST;
  if (isLocal(host)) return LOCAL_DEST;
  if (isIPv4(host) || host.includes(':')) return host;
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length < 2) return host;
  const two = labels.slice(-2).join('.');
  const domain = TWO_LEVEL.has(two) && labels.length > 2 ? labels.slice(-3).join('.') : two;
  return OWNERS[domain] || domain;
}
