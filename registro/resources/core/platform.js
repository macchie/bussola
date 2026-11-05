export const OS = globalThis.NL_OS;
const N = () => globalThis.Neutralino;
const handlers = new Map();
const early = new Map();
let listening = false;
let seq = 0;

function listen() {
  if (listening) return;
  listening = true;
  N().events.on('spawnedProcess', ({ detail }) => {
    const h = handlers.get(detail.id);
    if (h) h(detail);
    else {
      if (!early.has(detail.id)) early.set(detail.id, []);
      early.get(detail.id).push(detail);
    }
  });
}

// Launches a command and delivers stdout in chunks as it arrives.
export async function spawn(command, { onOut, onExit }) {
  listen();
  const { id } = await N().os.spawnProcess(command);
  let err = '';
  const onEvent = (d) => {
    if (d.action === 'stdOut') onOut(d.data);
    else if (d.action === 'stdErr') err += d.data;
    else if (d.action === 'exit') { handlers.delete(id); onExit(d.data, err); }
  };
  handlers.set(id, onEvent);
  for (const d of early.get(id) || []) onEvent(d);
  early.delete(id);
  return id;
}
export const kill = (id) => N().os.updateSpawnedProcess(id, 'exit').catch(() => {});

export function run(command) {
  return new Promise((resolve, reject) => {
    let out = '';
    spawn(command, { onOut: (d) => { out += d; }, onExit: (code, err) => resolve({ code, out, err }) }).catch(reject);
  });
}

// Writes a temporary script and returns the command that launches it.
export async function scriptCommand(body) {
  const temp = (await N().os.getPath('temp')).replace(/[\\/]$/, '');
  const win = OS === 'Windows';
  const file = `${temp}${win ? '\\' : '/'}registro-${Date.now()}-${++seq}${win ? '.ps1' : '.sh'}`;
  await N().filesystem.writeFile(file, (win ? '\uFEFF' : '') + body);
  const command = win
    ? `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${file}"`
    : `/bin/sh ${quoteSh(file)}`;
  return { command, file };
}
export const quoteSh = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
export const quotePs = (s) => `'${s.replace(/'/g, "''")}'`;

export async function reveal(path) {
  const body = OS === 'Windows' ? `Start-Process explorer.exe -ArgumentList ('/select,"' + ${quotePs(path)} + '"')\n`
    : OS === 'Darwin' ? `/usr/bin/open -R ${quoteSh(path)}\n`
      : `xdg-open "$(dirname ${quoteSh(path)})"\n`;
  const { command, file } = await scriptCommand(body);
  const res = await run(command);
  N().filesystem.remove(file).catch(() => {});
  return res.code === 0;
}

const pad = (n) => String(n).padStart(2, '0');
const local = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
export const MAX_EVENTS = 20000;

export const readScript = (os, since) => {
  const seconds = Math.floor(since / 1000);
  if (os === 'Linux') {
    return `echo ===JOURNAL
journalctl --no-pager -o json -p warning --since "@${seconds}" -n ${MAX_EVENTS}
journalctl --no-pager -o json -t systemd-coredump --since "@${seconds}" -n 500 2>/dev/null
echo ===BOOTS
journalctl --no-pager --list-boots 2>/dev/null
exit 0
`;
  }
  if (os === 'Darwin') {
    return `echo ===LOG
/usr/bin/log show --style ndjson --predicate 'messageType == error OR messageType == fault' --start '${local(since)}' | head -n ${MAX_EVENTS}
echo ===CRASH
/bin/ls -1 "$HOME/Library/Logs/DiagnosticReports" /Library/Logs/DiagnosticReports 2>/dev/null
echo ===BOOT
/usr/sbin/sysctl -n kern.boottime
exit 0
`;
  }
  return `$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$since = [DateTimeOffset]::FromUnixTimeMilliseconds(${Math.floor(since)}).LocalDateTime
$rows = @(Get-WinEvent -MaxEvents ${MAX_EVENTS} -FilterHashtable @{ LogName = 'System', 'Application'; Level = 1, 2, 3; StartTime = $since })
$rows += @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 6005, 6008; StartTime = $since })
$rows += @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000, 1002; StartTime = $since })
foreach ($e in $rows) {
  $m = [string]$e.Message
  if ($m.Length -gt 1000) { $m = $m.Substring(0, 1000) }
  $t = ([DateTimeOffset]$e.TimeCreated).ToUnixTimeMilliseconds()
  @{ t = $t; l = [int]$e.Level; i = [int]$e.Id; p = [string]$e.ProviderName; m = $m } | ConvertTo-Json -Compress
}
`;
};
