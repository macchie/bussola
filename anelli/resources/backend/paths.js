// Operazioni sui percorsi, senza accesso al sistema: identiche su ogni piattaforma
// una volta noto il separatore.
export function dirname(p, sep) {
  const i = p.lastIndexOf(sep);
  if (i < 0) return p;
  if (i === 0) return sep;
  const up = p.slice(0, i);
  return /^[A-Za-z]:$/.test(up) ? up + sep : up;
}
export const basename = (p, sep) => p.slice(p.lastIndexOf(sep) + 1);
export const join = (dir, name, sep) => (dir.endsWith(sep) ? dir + name : dir + sep + name);
export function stripTrailing(p, sep) {
  if (p === sep || /^[A-Za-z]:\\$/.test(p)) return p;
  return p.endsWith(sep) ? p.slice(0, -1) : p;
}
export function inside(child, parent, sep, fold = false) {
  const c = fold ? child.toLowerCase() : child;
  const p = fold ? parent.toLowerCase() : parent;
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}
export function ancestors(p, sep) {
  // Dalla radice alla cartella che contiene p.
  const out = [];
  let cur = dirname(p, sep);
  for (;;) {
    out.unshift(cur);
    const up = dirname(cur, sep);
    if (up === cur) return out;
    cur = up;
  }
}
// Su macOS i dati stanno in /System/Volumes/Data, ma il sistema li mostra anche da
// /Users, /Applications e così via: sono lo stesso posto con due nomi.
export const MAC_DATA = '/System/Volumes/Data';
export const macPublicPath = (p) => (p.startsWith(`${MAC_DATA}/`) ? p.slice(MAC_DATA.length) : p);
export const macDataPath = (p) => (p === MAC_DATA || p.startsWith(`${MAC_DATA}/`) || p.startsWith('/Volumes/') ? p : MAC_DATA + p);
export const quoteSh = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
export const quotePs = (s) => `'${s.replace(/'/g, "''")}'`;
