// Dagli elenchi di ciascun sistema a una sola forma:
// { id, kind: login|service|task, name, program, source, state: on|off, editable, why, mech }
const sections = (text) => {
  const out = {};
  let cur = null;
  for (const line of text.split('\n')) {
    const m = /^===(\w+)$/.exec(line);
    if (m) { cur = m[1]; out[cur] = []; } else if (cur) out[cur].push(line);
  }
  return out;
};
// Senza questi una sessione grafica Linux può non funzionare più.
const ESSENTIAL = /^(dbus|pipewire|wireplumber|pulseaudio|gvfs|xdg-|at-spi|gnome-|org\.gnome\.|plasma|kde|polkit|ssh-agent|gpg-agent|gcr-|evolution-)/i;
const SAFE_UNIT = /^[\w@.:-]+\.service$/;
export const SAFE_LABEL = /^[\w.-]+$/;
export const firstToken = (cmd) => {
  const text = (cmd || '').trim();
  const q = /^"([^"]+)"/.exec(text);
  return q ? q[1] : text.split(/\s+/)[0] || '';
};

function parseDesktop(lines, configDir) {
  const items = [];
  let cur = null;
  const flush = () => { if (cur) items.push(cur); };
  const overrides = new Map();
  for (const line of lines || []) {
    if (line.startsWith('@@')) {
      flush();
      const path = line.slice(2);
      cur = { path, base: path.slice(path.lastIndexOf('/') + 1), v: {} };
    } else if (cur) {
      const m = /^([\w-]+)=(.*)$/.exec(line);
      if (m && !(m[1] in cur.v)) cur.v[m[1]] = m[2];
    }
  }
  flush();
  const userDir = `${configDir}/autostart/`;
  for (const i of items) if (i.path.startsWith(userDir)) overrides.set(i.base, i);
  const out = [];
  for (const i of items) {
    const own = i.path.startsWith(userDir);
    if (!own && overrides.has(i.base)) continue; // la copia dell'utente prevale, come da specifica XDG
    const off = i.v.Hidden === 'true' || i.v['X-GNOME-Autostart-enabled'] === 'false';
    const name = i.v.Name || i.base.replace(/\.desktop$/, '');
    const essential = ESSENTIAL.test(i.base);
    out.push({
      id: `autostart:${i.base}`, kind: 'login', name, program: i.v.Exec || '', source: i.path, state: off ? 'off' : 'on',
      editable: !essential, why: essential ? 'Necessario alla sessione grafica' : '',
      mech: { type: 'autostart', base: i.base, name },
    });
  }
  return out;
}

function parseUnits(lines, scope) {
  const out = [];
  for (const line of lines || []) {
    const m = /^(\S+)\s+(\S+)/.exec(line.trim());
    if (!m || !['enabled', 'disabled'].includes(m[2])) continue;
    const timer = m[1].endsWith('.timer');
    const user = scope === 'user';
    if (m[2] === 'disabled' && !user) continue;
    const safe = user && !timer && SAFE_UNIT.test(m[1]) && !ESSENTIAL.test(m[1]);
    out.push({
      id: `${scope}:${m[1]}`, kind: timer ? 'task' : 'service', name: m[1].replace(/\.(service|timer)$/, ''), program: '', source: user ? 'systemd utente' : 'systemd di sistema',
      state: m[2] === 'enabled' ? 'on' : 'off', editable: safe,
      why: safe ? '' : user ? 'Necessario alla sessione o non modificabile' : 'Servizio di sistema: richiede l\'amministratore',
      mech: { type: 'systemd', unit: m[1] },
    });
  }
  return out;
}

function parseCron(lines) {
  return (lines || []).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !/^\w+=/.test(l)).map((line) => {
    const cmd = line.replace(/^(@\w+|(\S+\s+){5})/, '').trim();
    return { id: `cron:${line}`, kind: 'task', name: cmd.slice(0, 60), program: cmd, source: 'crontab', state: 'on', editable: false, why: 'Si modifica con crontab -e', mech: null };
  });
}

export function parseLinux(text, configDir) {
  const s = sections(text);
  return [...parseDesktop(s.AUTOSTART, configDir), ...parseUnits(s.USERUNITS, 'user'), ...parseUnits(s.SYSUNITS, 'system'), ...parseCron(s.CRON)];
}

export function parseDisabled(lines) {
  const off = new Set();
  for (const line of lines || []) {
    const m = /"([^"]+)"\s*=>\s*(disabled|true)/.exec(line);
    if (m) off.add(m[1]);
  }
  return off;
}

export function parseMac(text, home) {
  const s = sections(text);
  const off = parseDisabled(s.DISABLED);
  const out = [];
  let path = null;
  let json = '';
  const flush = () => {
    if (!path) return;
    let p = {};
    try { p = JSON.parse(json); } catch { /* plist non convertibile: resta il nome del file */ }
    const file = path.slice(path.lastIndexOf('/') + 1).replace(/\.plist$/, '');
    const label = p.Label || file;
    const daemon = path.startsWith('/Library/LaunchDaemons/');
    const apple = label.startsWith('com.apple.');
    const safe = !daemon && !apple && SAFE_LABEL.test(label);
    const interval = p.StartInterval || p.StartCalendarInterval;
    out.push({
      id: `launchd:${path}`, kind: daemon ? 'service' : interval && !p.RunAtLoad ? 'task' : 'login', name: label,
      program: p.Program || (p.ProgramArguments || []).join(' '), source: path, state: off.has(label) || p.Disabled === true ? 'off' : 'on', editable: safe,
      why: safe ? '' : daemon ? 'Servizio di sistema: richiede l\'amministratore' : 'Componente di macOS',
      mech: { type: 'launchd', label },
    });
    path = null;
    json = '';
  };
  for (const line of s.AGENTS || []) {
    if (line.startsWith('@@')) { flush(); path = line.slice(2); } else json += line;
  }
  flush();
  return [...out, ...parseCron(s.CRON)];
}

const KEY_LABEL = { HKCU: 'Registro, utente', HKLM: 'Registro, tutti gli utenti' };
const isOff = (hex) => !!hex && hex.slice(0, 2) !== '02' && hex.slice(0, 2) !== '06';
export function parseWindows(text) {
  const start = text.indexOf('{');
  const d = JSON.parse(text.slice(start));
  const list = (v) => (v == null ? [] : [].concat(v));
  const out = [];
  for (const r of list(d.run)) {
    const user = r.hive === 'HKCU';
    out.push({
      id: `run:${r.hive}:${r.name}`, kind: 'login', name: r.name, program: r.value, source: KEY_LABEL[r.hive] || r.hive, state: isOff(r.approved) ? 'off' : 'on',
      editable: user, why: user ? '' : 'Vale per tutti gli utenti: richiede l\'amministratore', mech: user ? { type: 'run', name: r.name, approved: r.approved || null } : null,
    });
  }
  for (const f of list(d.folder)) out.push({ id: `folder:${f.path}`, kind: 'login', name: f.name, program: f.path, source: 'Cartella Esecuzione automatica', state: 'on', editable: false, why: 'Si gestisce dalla cartella', mech: null });
  for (const v of list(d.services)) out.push({ id: `svc:${v.name}`, kind: 'service', name: v.display || v.name, program: v.path || '', source: 'Servizi di Windows', state: 'on', editable: false, why: 'Servizio di sistema: richiede l\'amministratore', mech: null });
  for (const t of list(d.tasks)) out.push({ id: `task:${t.path}${t.name}`, kind: 'task', name: t.name, program: t.exec || '', source: t.path, state: 'on', editable: false, why: 'Si gestisce da Utilità di pianificazione', mech: null });
  return out;
}
