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
  const file = `${temp}${win ? '\\' : '/'}radici-${Date.now()}-${++seq}${win ? '.ps1' : '.sh'}`;
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

export const linuxScript = (configDir) => `CFG=${quoteSh(configDir)}
echo ===AUTOSTART
for f in "$CFG"/autostart/*.desktop /etc/xdg/autostart/*.desktop; do
  [ -f "$f" ] || continue
  echo "@@$f"
  grep -E '^(Name|Exec|Hidden|X-GNOME-Autostart-enabled)=' "$f"
done
echo ===USERUNITS
systemctl --user list-unit-files --type=service --type=timer --no-legend --no-pager 2>/dev/null
echo ===SYSUNITS
systemctl list-unit-files --type=service --type=timer --state=enabled --no-legend --no-pager 2>/dev/null
echo ===CRON
crontab -l 2>/dev/null
exit 0
`;
export const MAC_SCRIPT = `echo ===AGENTS
for f in "$HOME"/Library/LaunchAgents/*.plist /Library/LaunchAgents/*.plist /Library/LaunchDaemons/*.plist; do
  [ -f "$f" ] || continue
  echo "@@$f"
  /usr/bin/plutil -convert json -o - "$f" 2>/dev/null
  echo
done
echo ===DISABLED
/bin/launchctl print-disabled "gui/$(id -u)" 2>/dev/null
echo ===CRON
/usr/bin/crontab -l 2>/dev/null
exit 0
`;
export const WINDOWS_SCRIPT = `$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$approved = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
$run = @()
foreach ($h in @(@('HKCU', 'HKCU:\\'), @('HKLM', 'HKLM:\\'))) {
  $k = Get-Item -LiteralPath ($h[1] + 'Software\\Microsoft\\Windows\\CurrentVersion\\Run')
  $a = Get-Item -LiteralPath ($h[1] + $approved)
  foreach ($n in $k.GetValueNames()) {
    if ($n -eq '') { continue }
    $bytes = if ($a) { $a.GetValue($n) } else { $null }
    $hex = if ($bytes) { ($bytes | ForEach-Object { $_.ToString('x2') }) -join '' } else { $null }
    $run += @{ hive = $h[0]; name = $n; value = [string]$k.GetValue($n); approved = $hex }
  }
}
$folder = @()
foreach ($d in @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('CommonStartup'))) {
  foreach ($f in Get-ChildItem -LiteralPath $d -File) { if ($f.Name -ne 'desktop.ini') { $folder += @{ name = $f.BaseName; path = $f.FullName } } }
}
$services = @(Get-CimInstance Win32_Service -Filter "StartMode='Auto'" | ForEach-Object { @{ name = $_.Name; display = $_.DisplayName; path = $_.PathName } })
$tasks = @(Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' -and $_.TaskPath -notlike '\\Microsoft\\*' } | ForEach-Object { @{ name = $_.TaskName; path = $_.TaskPath; exec = [string]($_.Actions | Select-Object -First 1).Execute } })
@{ run = $run; folder = $folder; services = $services; tasks = $tasks } | ConvertTo-Json -Depth 4 -Compress
`;
