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
  const file = `${temp}${win ? '\\' : '/'}correnti-ports-${Date.now()}-${++seq}${win ? '.ps1' : '.sh'}`;
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

export const LINUX_SCRIPT = `echo ===TCP
cat /proc/net/tcp 2>/dev/null
echo ===TCP6
cat /proc/net/tcp6 2>/dev/null
echo ===UDP
cat /proc/net/udp 2>/dev/null
echo ===UDP6
cat /proc/net/udp6 2>/dev/null
echo ===FD
ls -l /proc/[0-9]*/fd 2>/dev/null | grep -E '^/proc|socket:'
echo ===PS
ps -axo pid=,comm=
echo ===EXE
ls -l /proc/[0-9]*/exe 2>/dev/null
`;
export const MAC_SCRIPT = `echo ===NETTOP
/usr/bin/nettop -L 1
echo ===PS
/bin/ps -axww -o pid=,comm=
`;
// A single PowerShell process, which exits when Correnti no longer exists.
export const windowsScript = (parent) => `$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$parent = ${parent}
$n = 0
while ($true) {
  if (-not (Get-Process -Id $parent)) { exit }
  $b = New-Object Text.StringBuilder
  foreach ($c in Get-NetTCPConnection) {
    [void]$b.AppendLine("T\`t$($c.State)\`t$($c.LocalAddress)\`t$($c.LocalPort)\`t$($c.RemoteAddress)\`t$($c.RemotePort)\`t$($c.OwningProcess)")
  }
  foreach ($c in Get-NetUDPEndpoint) {
    [void]$b.AppendLine("U\`t$($c.LocalAddress)\`t$($c.LocalPort)\`t$($c.OwningProcess)")
  }
  foreach ($p in Get-Process) {
    [void]$b.AppendLine("Q\`t$($p.Id)\`t$($p.ProcessName)")
    if ($n % 6 -eq 0 -and $p.Path) { [void]$b.AppendLine("I\`t$($p.Id)\`t$($p.Path)\`t$($p.Description)") }
  }
  [void]$b.AppendLine('END')
  [Console]::Out.Write($b.ToString())
  [Console]::Out.Flush()
  $n++
  Start-Sleep -Seconds 5
}
`;
