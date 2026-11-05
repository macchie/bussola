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

// Lancia un comando e consegna stdout a blocchi man mano che arriva.
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

// Scrive uno script temporaneo e restituisce il comando che lo avvia.
export async function scriptCommand(body) {
  const temp = (await N().os.getPath('temp')).replace(/[\\/]$/, '');
  const win = OS === 'Windows';
  const file = `${temp}${win ? '\\' : '/'}battiti-${Date.now()}-${++seq}${win ? '.ps1' : '.sh'}`;
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

export const LINUX_SCRIPT = `echo "===PROC $(getconf PAGESIZE) $(getconf CLK_TCK)"
cat /proc/[0-9]*/stat 2>/dev/null
echo ===STAT
head -1 /proc/stat
echo ===MEM
cat /proc/meminfo
echo ===EXE
ls -l /proc/[0-9]*/exe 2>/dev/null
`;
export const MAC_SCRIPT = `echo ===PS
/bin/ps -axww -o pid=,ppid=,rss=,time=,user=,comm=
echo ===VM
/usr/bin/vm_stat
echo ===SWAP
/usr/sbin/sysctl -n vm.swapusage
`;
// Avviare PowerShell costa, quindi su Windows resta un processo solo. Si chiude da
// sé quando Battiti non esiste più.
export const windowsScript = (parent) => `$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$parent = ${parent}
$n = 0
while ($true) {
  if (-not (Get-Process -Id $parent)) { exit }
  $b = New-Object Text.StringBuilder
  $os = Get-CimInstance Win32_OperatingSystem
  [void]$b.AppendLine("M\`t$([long]$os.TotalVisibleMemorySize)\`t$([long]$os.FreePhysicalMemory)")
  foreach ($p in [Diagnostics.Process]::GetProcesses()) {
    $ms = [long]0
    try { $ms = [long]$p.TotalProcessorTime.TotalMilliseconds } catch {}
    [void]$b.AppendLine("P\`t$($p.Id)\`t$($p.ProcessName)\`t$ms\`t$([long]$p.WorkingSet64)")
  }
  if ($n % 10 -eq 0) {
    foreach ($p in Get-Process) {
      if ($p.Path) { [void]$b.AppendLine("I\`t$($p.Id)\`t$($p.Path)\`t$($p.Description)") }
    }
  }
  [void]$b.AppendLine('END')
  [Console]::Out.Write($b.ToString())
  [Console]::Out.Flush()
  $n++
  Start-Sleep -Seconds 2
}
`;
