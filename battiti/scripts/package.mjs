// Dev tool: from the result of `neu build` to the packages for every system.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/battiti';
const OUT = 'dist/packages';
const { version } = JSON.parse(readFileSync('neutralino.config.json', 'utf8'));
rmSync(OUT, { recursive: true, force: true });
const root = join(OUT, 'Battiti-macos');
const contents = join(root, 'Battiti.app', 'Contents');
mkdirSync(join(contents, 'MacOS'), { recursive: true });
cpSync(join(DIST, 'battiti-mac_universal'), join(contents, 'MacOS', 'battiti'));
chmodSync(join(contents, 'MacOS', 'battiti'), 0o755);
cpSync(join(DIST, 'resources.neu'), join(contents, 'MacOS', 'resources.neu'));
writeFileSync(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Battiti</string>
<key>CFBundleDisplayName</key><string>Battiti</string>
<key>CFBundleIdentifier</key><string>it.battiti.app</string>
<key>CFBundleExecutable</key><string>battiti</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>10.15</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
const installer = join(root, 'Install Battiti.command');
writeFileSync(installer, `#!/bin/bash
# Sign Battiti with Apple's tool and install it in Applications.
set -e
cd "$(dirname "$0")"
pkill -x battiti 2>/dev/null || true
xattr -cr Battiti.app
codesign --force --deep --sign - --identifier it.battiti.app Battiti.app
codesign --verify --deep --strict Battiti.app
rm -rf /Applications/Battiti.app
ditto Battiti.app /Applications/Battiti.app
echo
echo "Battiti is installed in Applications."
open /Applications/Battiti.app
`);
chmodSync(installer, 0o755);
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--identifier', 'it.battiti.app', join(root, 'Battiti.app')]);
}
function plain(id, binary, target) {
  const dir = join(OUT, `Battiti-${id}`);
  mkdirSync(dir, { recursive: true });
  cpSync(join(DIST, binary), join(dir, target));
  chmodSync(join(dir, target), 0o755);
  cpSync(join(DIST, 'resources.neu'), join(dir, 'resources.neu'));
  return dir;
}
const folders = [root, plain('windows-x64', 'battiti-win_x64.exe', 'Battiti.exe'), plain('linux-x64', 'battiti-linux_x64', 'battiti'), plain('linux-arm64', 'battiti-linux_arm64', 'battiti')];
for (const dir of folders) {
  const name = dir.split(/[\\/]/).pop();
  for (const legal of ['LICENSE', 'LICENSING.md', 'THIRD-PARTY.md']) cpSync(join('..', legal), join(dir, legal));
  execFileSync('zip', ['-qry', `${name}.zip`, name], { cwd: OUT });
  rmSync(dir, { recursive: true, force: true });
  console.log(`${OUT}/${name}.zip`);
}
