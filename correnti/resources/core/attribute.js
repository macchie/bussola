// From process to app and from host to a readable destination.
export const SYSTEM_APP = 'macOS system';
export const LINUX_SYSTEM = 'Linux system';
export const OTHER_USERS = 'Other users or system';
export const UNATTRIBUTED = 'Unattributed traffic';
export const LOCAL_DEST = 'Local network';
export const UNKNOWN_DEST = 'Not connected';

export function parsePs(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (m) map.set(Number(m[1]), m[2].trim());
  }
  return map;
}

export function appOf(path, processName) {
  const proc = path ? path.slice(path.lastIndexOf('/') + 1) : processName;
  if (!path) return { app: processName, process: processName, bundle: null };
  const m = /^(.*?\/([^/]+)\.app)(\/|$)/.exec(path);
  if (m) return { app: m[2], process: proc, bundle: m[1] };
  if (/^\/(usr\/(s?bin|libexec)|sbin|bin|System|Library\/Apple)\//.test(path)) return { app: SYSTEM_APP, process: proc, bundle: null };
  return { app: proc, process: proc, bundle: null };
}

const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function linuxAppOf(path, name) {
  if (!name && !path) return { app: OTHER_USERS, process: OTHER_USERS, bundle: null };
  const proc = path ? path.slice(path.lastIndexOf('/') + 1) : name;
  if (!path) return { app: name, process: name, bundle: null };
  const m = /^\/opt\/(?:google\/)?([^/]+)\//.exec(path) || /^\/snap\/([^/]+)\//.exec(path) || /^\/usr\/lib(?:64)?\/([^/]+)\//.exec(path);
  if (m && !/^(systemd|x86_64-linux-gnu|aarch64-linux-gnu|gnome|kde|polkit|udisks2)/.test(m[1])) return { app: title(m[1]), process: proc, bundle: path };
  if (/^\/usr\/(lib|libexec|sbin)\/|^\/sbin\//.test(path)) return { app: LINUX_SYSTEM, process: proc, bundle: null };
  return { app: proc, process: proc, bundle: path };
}

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
