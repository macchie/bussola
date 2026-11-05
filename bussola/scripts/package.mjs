// Strumento di sviluppo: dal risultato di `neu build` ai pacchetti di ogni sistema.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/bussola';
const OUT = 'dist/pacchetti';
const { version } = JSON.parse(readFileSync('neutralino.config.json', 'utf8'));
rmSync(OUT, { recursive: true, force: true });
const root = join(OUT, 'Bussola-macos');
const contents = join(root, 'Bussola.app', 'Contents');
mkdirSync(join(contents, 'MacOS'), { recursive: true });
cpSync(join(DIST, 'bussola-mac_universal'), join(contents, 'MacOS', 'bussola'));
chmodSync(join(contents, 'MacOS', 'bussola'), 0o755);
cpSync(join(DIST, 'resources.neu'), join(contents, 'MacOS', 'resources.neu'));
writeFileSync(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Bussola</string>
<key>CFBundleDisplayName</key><string>Bussola</string>
<key>CFBundleIdentifier</key><string>it.bussola.app</string>
<key>CFBundleExecutable</key><string>bussola</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>10.15</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
const installer = join(root, 'Installa Bussola.command');
writeFileSync(installer, `#!/bin/bash
# Firma Bussola con lo strumento di Apple e la installa in Applicazioni.
set -e
cd "$(dirname "$0")"
pkill -x bussola 2>/dev/null || true
xattr -cr Bussola.app
codesign --force --deep --sign - --identifier it.bussola.app Bussola.app
codesign --verify --deep --strict Bussola.app
rm -rf /Applications/Bussola.app
ditto Bussola.app /Applications/Bussola.app
echo
echo "Bussola è installata in Applicazioni."
open /Applications/Bussola.app
`);
chmodSync(installer, 0o755);
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--identifier', 'it.bussola.app', join(root, 'Bussola.app')]);
}
function plain(id, binary, target) {
  const dir = join(OUT, `Bussola-${id}`);
  mkdirSync(dir, { recursive: true });
  cpSync(join(DIST, binary), join(dir, target));
  chmodSync(join(dir, target), 0o755);
  cpSync(join(DIST, 'resources.neu'), join(dir, 'resources.neu'));
  return dir;
}
const folders = [root, plain('windows-x64', 'bussola-win_x64.exe', 'Bussola.exe'), plain('linux-x64', 'bussola-linux_x64', 'bussola'), plain('linux-arm64', 'bussola-linux_arm64', 'bussola')];
for (const dir of folders) {
  const name = dir.split(/[\\/]/).pop();
  for (const legal of ['LICENSE', 'LICENZA.md', 'TERZE-PARTI.md']) cpSync(join('..', legal), join(dir, legal));
  execFileSync('zip', ['-qry', `${name}.zip`, name], { cwd: OUT });
  rmSync(dir, { recursive: true, force: true });
  console.log(`${OUT}/${name}.zip`);
}
