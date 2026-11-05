// Strumento di sviluppo: dal risultato di `neu build` ai pacchetti di ogni sistema.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/radici';
const OUT = 'dist/pacchetti';
const { version } = JSON.parse(readFileSync('neutralino.config.json', 'utf8'));
rmSync(OUT, { recursive: true, force: true });
const root = join(OUT, 'Radici-macos');
const contents = join(root, 'Radici.app', 'Contents');
mkdirSync(join(contents, 'MacOS'), { recursive: true });
cpSync(join(DIST, 'radici-mac_universal'), join(contents, 'MacOS', 'radici'));
chmodSync(join(contents, 'MacOS', 'radici'), 0o755);
cpSync(join(DIST, 'resources.neu'), join(contents, 'MacOS', 'resources.neu'));
writeFileSync(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Radici</string>
<key>CFBundleDisplayName</key><string>Radici</string>
<key>CFBundleIdentifier</key><string>it.radici.app</string>
<key>CFBundleExecutable</key><string>radici</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>10.15</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
const installer = join(root, 'Installa Radici.command');
writeFileSync(installer, `#!/bin/bash
# Firma Radici con lo strumento di Apple e la installa in Applicazioni.
set -e
cd "$(dirname "$0")"
pkill -x radici 2>/dev/null || true
xattr -cr Radici.app
codesign --force --deep --sign - --identifier it.radici.app Radici.app
codesign --verify --deep --strict Radici.app
rm -rf /Applications/Radici.app
ditto Radici.app /Applications/Radici.app
echo
echo "Radici è installata in Applicazioni."
open /Applications/Radici.app
`);
chmodSync(installer, 0o755);
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--identifier', 'it.radici.app', join(root, 'Radici.app')]);
}
function plain(id, binary, target) {
  const dir = join(OUT, `Radici-${id}`);
  mkdirSync(dir, { recursive: true });
  cpSync(join(DIST, binary), join(dir, target));
  chmodSync(join(dir, target), 0o755);
  cpSync(join(DIST, 'resources.neu'), join(dir, 'resources.neu'));
  return dir;
}
const folders = [root, plain('windows-x64', 'radici-win_x64.exe', 'Radici.exe'), plain('linux-x64', 'radici-linux_x64', 'radici'), plain('linux-arm64', 'radici-linux_arm64', 'radici')];
for (const dir of folders) {
  const name = dir.split(/[\\/]/).pop();
  for (const legal of ['LICENSE', 'LICENZA.md', 'TERZE-PARTI.md']) cpSync(join('..', legal), join(dir, legal));
  execFileSync('zip', ['-qry', `${name}.zip`, name], { cwd: OUT });
  rmSync(dir, { recursive: true, force: true });
  console.log(`${OUT}/${name}.zip`);
}
