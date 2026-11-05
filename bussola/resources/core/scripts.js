// Script di sistema. Gli unici valori esterni sono URL e impronta, già validati dal catalogo,
// e finiscono comunque quotati. Gli errori escono come "ERR CODICE" e i passaggi come "STEP nome".
const qs = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const qp = (s) => `'${String(s).replace(/'/g, "''")}'`;
const CURL = "--proto '=https' --tlsv1.2";
export const TOOLS = { curlFlags: CURL };
const check = (app) => { if (!/^[a-z]+$/.test(app.id)) throw new Error('App non valida'); };
export const zipStem = (app, key) => `${app.name}-${key}`;

const POSIX_HEAD = (work) => `set -u
T=${qs(work)}
fail() { echo "ERR $1"; rm -rf "$T"; exit 1; }
rm -rf "$T"; mkdir -p "$T" || fail COPY
`;
const DOWNLOAD = (pkg, sum) => `echo STEP download
curl -fsSL ${CURL} --retry 2 --connect-timeout 20 -o "$T/p.zip" ${qs(pkg.url)} || fail DOWNLOAD
echo STEP verify
[ "$(${sum} "$T/p.zip" | cut -d' ' -f1)" = ${qs(pkg.sha256)} ] || fail HASH
`;

export function macInstall(app, pkg, work) {
  check(app);
  const a = `$T/x/${zipStem(app, 'macos')}/${app.name}.app`;
  return `${POSIX_HEAD(work)}${DOWNLOAD(pkg, '/usr/bin/shasum -a 256')}echo STEP extract
mkdir "$T/x" && /usr/bin/ditto -x -k "$T/p.zip" "$T/x" || fail UNZIP
A="${a}"
[ -d "$A" ] && [ -x "$A/Contents/MacOS/${app.id}" ] || fail LAYOUT
[ -z "$(find "$A" -type l)" ] || fail LAYOUT
echo STEP sign
/usr/bin/xattr -cr "$A"
/usr/bin/codesign --force --deep --sign - --identifier it.${app.id}.app "$A" 2>/dev/null || fail SIGN
/usr/bin/codesign --verify --deep --strict "$A" 2>/dev/null || fail SIGN
echo STEP install
D=/Applications
[ -w "$D" ] || { D="$HOME/Applications"; mkdir -p "$D" || fail COPY; }
/usr/bin/pkill -x ${app.id} 2>/dev/null
/usr/bin/ditto "$A" "$D/.${app.name}.nuova" || fail COPY
rm -rf "$D/${app.name}.app" && mv "$D/.${app.name}.nuova" "$D/${app.name}.app" || fail COPY
${app.id === 'anelli' ? '/usr/bin/tccutil reset SystemPolicyAllFiles it.anelli.app >/dev/null 2>&1\n' : ''}rm -rf "$T"
echo DONE
`;
}

export function linuxInstall(app, pkg, work, key) {
  check(app);
  const dir = `$HOME/.local/share/bussola/apps/${app.id}`;
  return `${POSIX_HEAD(work)}${DOWNLOAD(pkg, 'sha256sum')}echo STEP extract
mkdir "$T/x"
if command -v unzip >/dev/null; then unzip -q "$T/p.zip" -d "$T/x" || fail UNZIP
else python3 -m zipfile -e "$T/p.zip" "$T/x" || fail NOUNZIP; fi
S="$T/x/${zipStem(app, key)}"
[ -f "$S/${app.id}" ] && [ -f "$S/resources.neu" ] && [ ! -L "$S/${app.id}" ] || fail LAYOUT
echo STEP install
D="${dir}"
pkill -x ${app.id} 2>/dev/null
mkdir -p "$D" || fail COPY
cp "$S/${app.id}" "$D/.nuovo" && cp "$S/resources.neu" "$D/resources.neu" && chmod 755 "$D/.nuovo" && mv "$D/.nuovo" "$D/${app.id}" || fail COPY
printf '%s' ${qs(pkg.version)} > "$D/.versione"
M="$HOME/.local/share/applications"
mkdir -p "$M"
cat > "$M/it.${app.id}.desktop" <<FINE
[Desktop Entry]
Type=Application
Name=${app.name}
Comment=${app.tagline}
Exec="$D/${app.id}"
Path=$D
Icon=$D/icona.png
Terminal=false
Categories=System;Monitor;
FINE
rm -rf "$T"
echo DONE
`;
}

export function windowsInstall(app, pkg, work, key) {
  check(app);
  return `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$T = ${qp(work)}
function Fail($c) { Write-Output "ERR $c"; Remove-Item -LiteralPath $T -Recurse -Force -ErrorAction SilentlyContinue; exit 1 }
try { if (Test-Path -LiteralPath $T) { Remove-Item -LiteralPath $T -Recurse -Force }; New-Item -ItemType Directory -Path "$T\\x" -Force | Out-Null } catch { Fail COPY }
Write-Output 'STEP download'
& curl.exe -fsSL ${CURL.replace("'=https'", '=https')} --retry 2 --connect-timeout 20 -o "$T\\p.zip" ${qp(pkg.url)}
if ($LASTEXITCODE -ne 0) { Fail DOWNLOAD }
Write-Output 'STEP verify'
if ((Get-FileHash -LiteralPath "$T\\p.zip" -Algorithm SHA256).Hash.ToLower() -ne ${qp(pkg.sha256)}) { Fail HASH }
Write-Output 'STEP extract'
try { Expand-Archive -LiteralPath "$T\\p.zip" -DestinationPath "$T\\x" -Force } catch { Fail UNZIP }
$S = "$T\\x\\${zipStem(app, key)}"
if (-not (Test-Path -LiteralPath "$S\\${app.name}.exe") -or -not (Test-Path -LiteralPath "$S\\resources.neu")) { Fail LAYOUT }
Write-Output 'STEP install'
$D = Join-Path $env:LOCALAPPDATA 'Programs\\Bussola\\${app.id}'
try {
  Get-Process -Name ${app.name} -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 400
  New-Item -ItemType Directory -Path $D -Force | Out-Null
  Copy-Item -LiteralPath "$S\\${app.name}.exe" -Destination $D -Force
  Copy-Item -LiteralPath "$S\\resources.neu" -Destination $D -Force
  Set-Content -LiteralPath "$D\\.versione" -Value ${qp(pkg.version)} -NoNewline
  Get-ChildItem -LiteralPath $D -File | Unblock-File
  $l = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) '${app.name}.lnk'))
  $l.TargetPath = "$D\\${app.name}.exe"
  $l.WorkingDirectory = $D
  $l.Save()
} catch { Fail COPY }
Remove-Item -LiteralPath $T -Recurse -Force -ErrorAction SilentlyContinue
Write-Output 'DONE'
`;
}

export const installScript = (os, app, pkg, work, key) => (os === 'Darwin' ? macInstall(app, pkg, work)
  : os === 'Windows' ? windowsInstall(app, pkg, work, key) : linuxInstall(app, pkg, work, key));

// Percorsi costruiti solo da id noti: la disinstallazione non legge mai un percorso da file.
export function uninstallScript(os, app) {
  check(app);
  if (os === 'Darwin') return `/usr/bin/pkill -x ${app.id} 2>/dev/null
rm -rf "/Applications/${app.name}.app" "$HOME/Applications/${app.name}.app"
[ ! -e "/Applications/${app.name}.app" ] && [ ! -e "$HOME/Applications/${app.name}.app" ]
`;
  if (os === 'Windows') return `$ErrorActionPreference = 'SilentlyContinue'
Get-Process -Name ${app.name} | Stop-Process -Force
Start-Sleep -Milliseconds 400
$D = Join-Path $env:LOCALAPPDATA 'Programs\\Bussola\\${app.id}'
Remove-Item -LiteralPath $D -Recurse -Force
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Programs')) '${app.name}.lnk') -Force
if (Test-Path -LiteralPath $D) { exit 1 }
`;
  return `pkill -x ${app.id} 2>/dev/null
rm -rf "$HOME/.local/share/bussola/apps/${app.id}" "$HOME/.local/share/applications/it.${app.id}.desktop"
[ ! -e "$HOME/.local/share/bussola/apps/${app.id}" ]
`;
}

export function openScript(os, app) {
  check(app);
  if (os === 'Darwin') return `for p in "/Applications/${app.name}.app" "$HOME/Applications/${app.name}.app"; do
  if [ -d "$p" ]; then /usr/bin/open "$p"; exit $?; fi
done
exit 1
`;
  if (os === 'Windows') return `$D = Join-Path $env:LOCALAPPDATA 'Programs\\Bussola\\${app.id}'
Start-Process -FilePath "$D\\${app.name}.exe" -WorkingDirectory $D
`;
  return `cd "$HOME/.local/share/bussola/apps/${app.id}" || exit 1
nohup ./${app.id} >/dev/null 2>&1 &
`;
}

// Una riga "id<TAB>versione" per ogni app presente, comprese quelle installate a mano.
export function detectScript(os, apps) {
  if (os === 'Darwin') return `${apps.map((a) => `for p in "/Applications/${a.name}.app" "$HOME/Applications/${a.name}.app"; do
  if [ -d "$p" ]; then printf '${a.id}\\t%s\\n' "$(/usr/bin/defaults read "$p/Contents/Info" CFBundleShortVersionString 2>/dev/null)"; break; fi
done`).join('\n')}\nexit 0\n`;
  if (os === 'Windows') return `[Console]::OutputEncoding = [Text.Encoding]::UTF8
$R = Join-Path $env:LOCALAPPDATA 'Programs\\Bussola'
${apps.map((a) => `if (Test-Path -LiteralPath "$R\\${a.id}\\${a.name}.exe") { "${a.id}\`t" + (Get-Content -LiteralPath "$R\\${a.id}\\.versione" -ErrorAction SilentlyContinue) }`).join('\n')}
`;
  return `${apps.map((a) => `D="$HOME/.local/share/bussola/apps/${a.id}"
if [ -x "$D/${a.id}" ]; then printf '${a.id}\\t%s\\n' "$(cat "$D/.versione" 2>/dev/null)"; fi`).join('\n')}\nexit 0\n`;
}

export function parseDetected(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^([a-z]+)\t([\d.]*)\r?$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export const catalogCommandScript = (os, url) => (os === 'Windows'
  ? `[Console]::OutputEncoding = [Text.Encoding]::UTF8\n& curl.exe -fsSL ${CURL.replace("'=https'", '=https')} --connect-timeout 15 --max-time 30 ${qp(url)}\nexit $LASTEXITCODE\n`
  : `curl -fsSL ${CURL} --connect-timeout 15 --max-time 30 ${qs(url)}\n`);

export const ERRORS = {
  DOWNLOAD: 'Download non riuscito: controlla la connessione',
  HASH: 'Il file scaricato non corrisponde all\'impronta del catalogo: installazione annullata',
  UNZIP: 'Il pacchetto non si può estrarre',
  NOUNZIP: 'Serve il comando unzip oppure python3',
  LAYOUT: 'Il pacchetto non ha la struttura prevista: installazione annullata',
  SIGN: 'La firma locale dell\'app non è riuscita',
  COPY: 'Non è stato possibile scrivere nella cartella di installazione',
};
export const STEPS = { download: 'Download', verify: 'Verifica dell\'impronta', extract: 'Estrazione', sign: 'Firma sul computer', install: 'Installazione' };
