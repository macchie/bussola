// Dev tool: from the result of `neu build` to the packages for every system.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/registro';
const OUT = 'dist/packages';
const { version } = JSON.parse(readFileSync('neutralino.config.json', 'utf8'));
rmSync(OUT, { recursive: true, force: true });
const root = join(OUT, 'Registro-macos');
const contents = join(root, 'Registro.app', 'Contents');
mkdirSync(join(contents, 'MacOS'), { recursive: true });
cpSync(join(DIST, 'registro-mac_universal'), join(contents, 'MacOS', 'registro'));
chmodSync(join(contents, 'MacOS', 'registro'), 0o755);
cpSync(join(DIST, 'resources.neu'), join(contents, 'MacOS', 'resources.neu'));
writeFileSync(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Registro</string>
<key>CFBundleDisplayName</key><string>Registro</string>
<key>CFBundleIdentifier</key><string>it.registro.app</string>
<key>CFBundleExecutable</key><string>registro</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>10.15</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
const installer = join(root, 'Install Registro.command');
writeFileSync(installer, `#!/bin/bash
# Sign Registro with Apple's tool and install it in Applications.
set -e
cd "$(dirname "$0")"
pkill -x registro 2>/dev/null || true
xattr -cr Registro.app
codesign --force --deep --sign - --identifier it.registro.app Registro.app
codesign --verify --deep --strict Registro.app
rm -rf /Applications/Registro.app
ditto Registro.app /Applications/Registro.app
echo
echo "Registro is installed in Applications."
open /Applications/Registro.app
`);
chmodSync(installer, 0o755);
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--identifier', 'it.registro.app', join(root, 'Registro.app')]);
}
function plain(id, binary, target) {
  const dir = join(OUT, `Registro-${id}`);
  mkdirSync(dir, { recursive: true });
  cpSync(join(DIST, binary), join(dir, target));
  chmodSync(join(dir, target), 0o755);
  cpSync(join(DIST, 'resources.neu'), join(dir, 'resources.neu'));
  return dir;
}
const folders = [root, plain('windows-x64', 'registro-win_x64.exe', 'Registro.exe'), plain('linux-x64', 'registro-linux_x64', 'registro'), plain('linux-arm64', 'registro-linux_arm64', 'registro')];
for (const dir of folders) {
  const name = dir.split(/[\\/]/).pop();
  for (const legal of ['LICENSE', 'LICENSING.md', 'THIRD-PARTY.md']) cpSync(join('..', legal), join(dir, legal));
  execFileSync('zip', ['-qry', `${name}.zip`, name], { cwd: OUT });
  rmSync(dir, { recursive: true, force: true });
  console.log(`${OUT}/${name}.zip`);
}
