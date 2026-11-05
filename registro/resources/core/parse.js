// Eventi di ogni sistema in una sola forma: { t, kind: error|warn|event, level, source, path?, text }
// 'event' raccoglie arresti anomali e riavvii.
const sections = (text) => {
  const out = {};
  let cur = null;
  for (const line of text.split('\n')) {
    const m = /^===(\w+)$/.exec(line);
    if (m) { cur = m[1]; out[cur] = []; } else if (cur) out[cur].push(line);
  }
  return out;
};
const decodeMessage = (m) => (Array.isArray(m) ? new TextDecoder().decode(new Uint8Array(m)) : String(m ?? ''));

export function parseJournal(lines) {
  const out = [];
  for (const line of lines || []) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    const t = Math.floor(Number(r.__REALTIME_TIMESTAMP) / 1000);
    if (!t) continue;
    const p = Number(r.PRIORITY ?? 6);
    const text = decodeMessage(r.MESSAGE);
    const source = r.SYSLOG_IDENTIFIER || r._COMM || 'kernel';
    const crash = source === 'systemd-coredump' || /dumped core|segfault at /.test(text);
    if (p > 4 && !crash) continue;
    // Il messaggio di systemd-coredump nomina l'app caduta, che è ciò che interessa.
    const fallen = crash ? /Process \d+ \(([^)]+)\)/.exec(text)?.[1] : null;
    out.push({ t, kind: crash ? 'event' : p <= 3 ? 'error' : 'warn', level: p <= 2 ? 'critical' : p === 3 ? 'error' : 'warning', source: fallen || source, path: fallen ? undefined : r._EXE, text });
  }
  return out;
}

export function parseBoots(lines) {
  const out = [];
  for (const line of lines || []) {
    const m = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(line);
    if (m) out.push({ t: new Date(m[1].replace(' ', 'T')).getTime(), kind: 'event', level: 'info', source: 'Sistema', text: 'Avvio del sistema' });
  }
  return out;
}

export function parseLinux(text) {
  const s = sections(text);
  return [...parseJournal(s.JOURNAL), ...parseBoots(s.BOOTS)];
}

// "2024-03-15 10:00:00.123456-0700"
export function macTime(text) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2})(\d{2})$/.exec(text || '');
  return m ? new Date(`${m[1]}T${m[2]}${(m[3] || '').slice(0, 4)}${m[4]}:${m[5]}`).getTime() : NaN;
}

export function parseMacLog(lines) {
  const out = [];
  for (const line of lines || []) {
    if (!line.startsWith('{')) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    const t = macTime(r.timestamp);
    if (!t) continue;
    const type = String(r.messageType || '').toLowerCase();
    if (type !== 'error' && type !== 'fault') continue;
    const path = r.processImagePath || '';
    out.push({ t, kind: 'error', level: type === 'fault' ? 'critical' : 'error', source: path.slice(path.lastIndexOf('/') + 1) || 'Sistema', path, text: String(r.eventMessage ?? '') });
  }
  return out;
}

// "Safari-2026-11-04-123456.ips", "kernel-2026-11-04-123456.panic"
export function parseCrashFiles(lines) {
  const out = [];
  for (const line of lines || []) {
    const m = /^(.+?)[-_](\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(?:[-_.][\w.-]*)?\.(ips|crash|panic|hang|diag)$/.exec(line.trim());
    if (!m) continue;
    const t = new Date(`${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}:${m[7]}`).getTime();
    const hang = m[8] === 'hang';
    if (m[8] === 'diag') continue;
    out.push({ t, kind: 'event', level: 'critical', source: m[1], text: hang ? 'L\'app non ha risposto' : m[8] === 'panic' ? 'Errore grave del kernel' : 'Chiusura imprevista dell\'app' });
  }
  return out;
}

export function parseMac(text) {
  const s = sections(text);
  const boot = /sec = (\d+)/.exec((s.BOOT || []).join(' '));
  const boots = boot ? [{ t: Number(boot[1]) * 1000, kind: 'event', level: 'info', source: 'Sistema', text: 'Avvio del sistema' }] : [];
  return [...parseMacLog(s.LOG), ...parseCrashFiles(s.CRASH), ...boots];
}

const EVENT_IDS = { 41: 'Riavvio senza arresto corretto', 1000: 'Chiusura imprevista dell\'app', 1001: 'Arresto per errore di sistema', 1002: 'L\'app non ha risposto', 6005: 'Avvio del sistema', 6008: 'Arresto imprevisto' };
export function parseWindows(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    const special = EVENT_IDS[r.i];
    const crashProvider = r.i === 41 ? /Kernel-Power/.test(r.p) : r.i === 1000 || r.i === 1002 ? /Application (Error|Hang)/.test(r.p) : r.i === 1001 ? /BugCheck/.test(r.p) : r.i === 6005 || r.i === 6008 ? /EventLog/.test(r.p) : false;
    if (special && crashProvider) {
      out.push({ t: r.t, kind: 'event', level: r.i === 6005 ? 'info' : 'critical', source: r.i === 6005 ? 'Sistema' : r.p, text: `${special}${r.m ? `: ${r.m}` : ''}` });
    } else if (r.l >= 1 && r.l <= 3) {
      out.push({ t: r.t, kind: r.l === 3 ? 'warn' : 'error', level: r.l === 1 ? 'critical' : r.l === 2 ? 'error' : 'warning', source: r.p, text: r.m || `Evento ${r.i}` });
    }
  }
  return out;
}

// Cosa dice il sistema sul proprio registro. Nessun evento nuovo è normale, non un guasto.
export function accessOf(stderr) {
  const text = String(stderr || '');
  if (/No journal files|command not found|not found|Cannot find|Failed to/i.test(text)) return 'failed';
  if (/not seeing messages|Permission denied|not permitted|access denied/i.test(text)) return 'partial';
  return 'ok';
}

// journalctl non segnala un registro assente: senza nemmeno un avvio elencato, non c'è nulla da leggere.
export const journalMissing = (text) => !/\d{4}-\d{2}-\d{2}/.test(sections(text).BOOTS?.join('\n') || '');

export const PARSERS = { Linux: parseLinux, Darwin: parseMac, Windows: parseWindows };

// Riduce un messaggio alla sua forma: ciò che cambia a ogni ripetizione diventa #.
export function patternOf(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '#')
    .replace(/\b0x[0-9a-f]+\b/gi, '#')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '#')
    .replace(/\b[0-9a-f]{12,}\b/gi, '#')
    .replace(/(?:\/[\w.@+-]+){2,}/g, '#')
    .replace(/\b\d+(?:\.\d+)*\b/g, '#');
  return (clean || '(messaggio vuoto)').slice(0, 140);
}
