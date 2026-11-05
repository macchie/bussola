// Dev tool: from the result of `neu build` to the packages for every system.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/sentinelle';
const OUT = 'dist/packages';
const { version } = JSON.parse(readFileSync('neutralino.config.json', 'utf8'));
rmSync(OUT, { recursive: true, force: true });
const root = join(OUT, 'Sentinelle-macos');
const contents = join(root, 'Sentinelle.app', 'Contents');
mkdirSync(join(contents, 'MacOS'), { recursive: true });
cpSync(join(DIST, 'sentinelle-mac_universal'), join(contents, 'MacOS', 'sentinelle'));
chmodSync(join(contents, 'MacOS', 'sentinelle'), 0o755);
cpSync(join(DIST, 'resources.neu'), join(contents, 'MacOS', 'resources.neu'));
writeFileSync(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Sentinelle</string>
<key>CFBundleDisplayName</key><string>Sentinelle</string>
<key>CFBundleIdentifier</key><string>it.sentinelle.app</string>
<key>CFBundleExecutable</key><string>sentinelle</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>10.15</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
const installer = join(root, 'Install Sentinelle.command');
writeFileSync(installer, `#!/bin/bash
# Sign Sentinelle with Apple's tool and install it in Applications.
set -e
cd "$(dirname "$0")"
pkill -x sentinelle 2>/dev/null || true
xattr -cr Sentinelle.app
codesign --force --deep --sign - --identifier it.sentinelle.app Sentinelle.app
codesign --verify --deep --strict Sentinelle.app
rm -rf /Applications/Sentinelle.app
ditto Sentinelle.app /Applications/Sentinelle.app
echo
echo "Sentinelle is installed in Applications."
open /Applications/Sentinelle.app
`);
chmodSync(installer, 0o755);
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--identifier', 'it.sentinelle.app', join(root, 'Sentinelle.app')]);
}
function plain(id, binary, target) {
  const dir = join(OUT, `Sentinelle-${id}`);
  mkdirSync(dir, { recursive: true });
  cpSync(join(DIST, binary), join(dir, target));
  chmodSync(join(dir, target), 0o755);
  cpSync(join(DIST, 'resources.neu'), join(dir, 'resources.neu'));
  return dir;
}
const folders = [root, plain('windows-x64', 'sentinelle-win_x64.exe', 'Sentinelle.exe'), plain('linux-x64', 'sentinelle-linux_x64', 'sentinelle'), plain('linux-arm64', 'sentinelle-linux_arm64', 'sentinelle')];
for (const dir of folders) {
  const name = dir.split(/[\\/]/).pop();
  for (const legal of ['LICENSE', 'LICENSING.md', 'THIRD-PARTY.md']) cpSync(join('..', legal), join(dir, legal));
  execFileSync('zip', ['-qry', `${name}.zip`, name], { cwd: OUT });
  rmSync(dir, { recursive: true, force: true });
  console.log(`${OUT}/${name}.zip`);
}
