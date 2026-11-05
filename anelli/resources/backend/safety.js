import { inside, basename, macPublicPath, MAC_DATA } from './paths.js';

const POSIX_EXACT = ['/', '/dev', '/proc', '/sys', '/run', '/var', '/home', '/root', '/tmp', '/opt', '/mnt', '/media', '/srv'];
const MAC_EXACT = ['/Users', '/Volumes', '/Applications', '/Library', '/private', '/System/Volumes/Data'];
const SYSTEM = {
  Linux: ['/bin', '/boot', '/etc', '/lib', '/lib32', '/lib64', '/libx32', '/sbin', '/usr'],
  Darwin: ['/System', '/bin', '/sbin', '/usr', '/etc', '/private/etc'],
};
const WIN_SYSTEM = ['\\Windows', '\\Program Files', '\\Program Files (x86)', '\\ProgramData', '\\$Recycle.Bin', '\\System Volume Information', '\\Recovery'];
const WIN_FILES = ['pagefile.sys', 'hiberfil.sys', 'swapfile.sys'];

// Motivo per cui un percorso non può essere spostato, o null.
export function refuse(rawTarget, { os, allowSystem, home, mounts, protectedDirs }) {
  if (os === 'Darwin' && rawTarget === MAC_DATA) return 'È una cartella di sistema';
  const target = os === 'Darwin' ? macPublicPath(rawTarget) : rawTarget;
  const win = os === 'Windows';
  const sep = win ? '\\' : '/';
  const fold = win;
  if (win ? !/^[A-Za-z]:\\/.test(target) : !target.startsWith('/')) return 'Percorso non valido';
  const parts = target.split(sep);
  if (parts.includes('..') || parts.includes('.') || parts.slice(1).includes('')) {
    if (target !== sep && !(win && /^[A-Za-z]:\\$/.test(target))) return 'Percorso non valido';
  }
  if (target === sep || (win && /^[A-Za-z]:\\$/.test(target))) return 'È la radice del disco';
  if (!win && (POSIX_EXACT.includes(target) || (os === 'Darwin' && MAC_EXACT.includes(target)))) return 'È una cartella di sistema';
  if (win && /^[A-Za-z]:\\Users$/i.test(target)) return 'È una cartella di sistema';
  if (inside(home, target, sep, fold)) return 'Contiene la tua cartella home';
  if (mounts.some((m) => (fold ? m.toLowerCase() === target.toLowerCase() : m === target || m === rawTarget))) return 'È il punto di montaggio di un volume';
  for (const dir of protectedDirs) {
    if (inside(target, dir, sep, fold) || inside(dir, target, sep, fold)) return 'Contiene Anelli o i suoi dati';
  }
  if (basename(target, sep).startsWith('.anelli-trash-')) return 'È una cartella del cestino';
  if (allowSystem) return null;
  const message = 'File di sistema: non può essere spostato';
  if (win) {
    const rel = target.slice(2);
    if (WIN_SYSTEM.some((s) => inside(rel, s, sep, true))) return message;
    if (parts.length === 2 && WIN_FILES.includes(parts[1].toLowerCase())) return message;
    return null;
  }
  return (SYSTEM[os] || SYSTEM.Linux).some((s) => inside(target, s, sep)) ? message : null;
}
