// Dev tool: from the result of `neu build` to the packages for every system.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/scorte';
const OUT = 'dist/packages';
const { version } = JSON.parse(readFileSync('neutralino.config.json', 'utf8'));
rmSync(OUT, { recursive: true, force: true });
const root = join(OUT, 'Scorte-macos');
const contents = join(root, 'Scorte.app', 'Contents');
mkdirSync(join(contents, 'MacOS'), { recursive: true });
cpSync(join(DIST, 'scorte-mac_universal'), join(contents, 'MacOS', 'scorte'));
chmodSync(join(contents, 'MacOS', 'scorte'), 0o755);
cpSync(join(DIST, 'resources.neu'), join(contents, 'MacOS', 'resources.neu'));
writeFileSync(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Scorte</string>
<key>CFBundleDisplayName</key><string>Scorte</string>
<key>CFBundleIdentifier</key><string>it.scorte.app</string>
<key>CFBundleExecutable</key><string>scorte</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>10.15</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
const installer = join(root, 'Install Scorte.command');
writeFileSync(installer, `#!/bin/bash
# Sign Scorte with Apple's tool and install it in Applications.
set -e
cd "$(dirname "$0")"
pkill -x scorte 2>/dev/null || true
xattr -cr Scorte.app
codesign --force --deep --sign - --identifier it.scorte.app Scorte.app
codesign --verify --deep --strict Scorte.app
rm -rf /Applications/Scorte.app
ditto Scorte.app /Applications/Scorte.app
echo
echo "Scorte is installed in Applications."
open /Applications/Scorte.app
`);
chmodSync(installer, 0o755);
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--identifier', 'it.scorte.app', join(root, 'Scorte.app')]);
}
function plain(id, binary, target) {
  const dir = join(OUT, `Scorte-${id}`);
  mkdirSync(dir, { recursive: true });
  cpSync(join(DIST, binary), join(dir, target));
  chmodSync(join(dir, target), 0o755);
  cpSync(join(DIST, 'resources.neu'), join(dir, 'resources.neu'));
  return dir;
}
const folders = [root, plain('windows-x64', 'scorte-win_x64.exe', 'Scorte.exe'), plain('linux-x64', 'scorte-linux_x64', 'scorte'), plain('linux-arm64', 'scorte-linux_arm64', 'scorte')];
for (const dir of folders) {
  const name = dir.split(/[\\/]/).pop();
  for (const legal of ['LICENSE', 'LICENSING.md', 'THIRD-PARTY.md']) cpSync(join('..', legal), join(dir, legal));
  execFileSync('zip', ['-qry', `${name}.zip`, name], { cwd: OUT });
  rmSync(dir, { recursive: true, force: true });
  console.log(`${OUT}/${name}.zip`);
}
