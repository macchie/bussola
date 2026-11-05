import { inside, basename, macPublicPath, MAC_DATA } from './paths.js';

const POSIX_EXACT = ['/', '/dev', '/proc', '/sys', '/run', '/var', '/home', '/root', '/tmp', '/opt', '/mnt', '/media', '/srv'];
const MAC_EXACT = ['/Users', '/Volumes', '/Applications', '/Library', '/private', '/System/Volumes/Data'];
const SYSTEM = {
  Linux: ['/bin', '/boot', '/etc', '/lib', '/lib32', '/lib64', '/libx32', '/sbin', '/usr'],
  Darwin: ['/System', '/bin', '/sbin', '/usr', '/etc', '/private/etc'],
};
const WIN_SYSTEM = ['\\Windows', '\\Program Files', '\\Program Files (x86)', '\\ProgramData', '\\$Recycle.Bin', '\\System Volume Information', '\\Recovery'];
const WIN_FILES = ['pagefile.sys', 'hiberfil.sys', 'swapfile.sys'];

// The reason a path can't be moved, or null.
export function refuse(rawTarget, { os, allowSystem, home, mounts, protectedDirs }) {
  if (os === 'Darwin' && rawTarget === MAC_DATA) return 'It\'s a system folder';
  const target = os === 'Darwin' ? macPublicPath(rawTarget) : rawTarget;
  const win = os === 'Windows';
  const sep = win ? '\\' : '/';
  const fold = win;
  if (win ? !/^[A-Za-z]:\\/.test(target) : !target.startsWith('/')) return 'Invalid path';
  const parts = target.split(sep);
  if (parts.includes('..') || parts.includes('.') || parts.slice(1).includes('')) {
    if (target !== sep && !(win && /^[A-Za-z]:\\$/.test(target))) return 'Invalid path';
  }
  if (target === sep || (win && /^[A-Za-z]:\\$/.test(target))) return 'It\'s the root of the disk';
  if (!win && (POSIX_EXACT.includes(target) || (os === 'Darwin' && MAC_EXACT.includes(target)))) return 'It\'s a system folder';
  if (win && /^[A-Za-z]:\\Users$/i.test(target)) return 'It\'s a system folder';
  if (inside(home, target, sep, fold)) return 'It contains your home folder';
  if (mounts.some((m) => (fold ? m.toLowerCase() === target.toLowerCase() : m === target || m === rawTarget))) return 'It\'s a volume\'s mount point';
  for (const dir of protectedDirs) {
    if (inside(target, dir, sep, fold) || inside(dir, target, sep, fold)) return 'It contains Stiva or its data';
  }
  if (basename(target, sep).startsWith('.stiva-trash-')) return 'It\'s a Trash folder';
  if (allowSystem) return null;
  const message = 'System file: it can\'t be moved';
  if (win) {
    const rel = target.slice(2);
    if (WIN_SYSTEM.some((s) => inside(rel, s, sep, true))) return message;
    if (parts.length === 2 && WIN_FILES.includes(parts[1].toLowerCase())) return message;
    return null;
  }
  return (SYSTEM[os] || SYSTEM.Linux).some((s) => inside(target, s, sep)) ? message : null;
}
