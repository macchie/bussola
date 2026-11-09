// Dev tool: from the result of `neu build` to the packages for every system.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/sedimenti';
const OUT = 'dist/packages';
const { version } = JSON.parse(readFileSync('neutralino.config.json', 'utf8'));
rmSync(OUT, { recursive: true, force: true });
const root = join(OUT, 'Sedimenti-macos');
const contents = join(root, 'Sedimenti.app', 'Contents');
mkdirSync(join(contents, 'MacOS'), { recursive: true });
cpSync(join(DIST, 'sedimenti-mac_universal'), join(contents, 'MacOS', 'sedimenti'));
chmodSync(join(contents, 'MacOS', 'sedimenti'), 0o755);
cpSync(join(DIST, 'resources.neu'), join(contents, 'MacOS', 'resources.neu'));
writeFileSync(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Sedimenti</string>
<key>CFBundleDisplayName</key><string>Sedimenti</string>
<key>CFBundleIdentifier</key><string>it.sedimenti.app</string>
<key>CFBundleExecutable</key><string>sedimenti</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>10.15</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
const installer = join(root, 'Install Sedimenti.command');
writeFileSync(installer, `#!/bin/bash
# Sign Sedimenti with Apple's tool and install it in Applications.
set -e
cd "$(dirname "$0")"
pkill -x sedimenti 2>/dev/null || true
xattr -cr Sedimenti.app
codesign --force --deep --sign - --identifier it.sedimenti.app Sedimenti.app
codesign --verify --deep --strict Sedimenti.app
rm -rf /Applications/Sedimenti.app
ditto Sedimenti.app /Applications/Sedimenti.app
echo
echo "Sedimenti is installed in Applications."
open /Applications/Sedimenti.app
`);
chmodSync(installer, 0o755);
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--identifier', 'it.sedimenti.app', join(root, 'Sedimenti.app')]);
}
function plain(id, binary, target) {
  const dir = join(OUT, `Sedimenti-${id}`);
  mkdirSync(dir, { recursive: true });
  cpSync(join(DIST, binary), join(dir, target));
  chmodSync(join(dir, target), 0o755);
  cpSync(join(DIST, 'resources.neu'), join(dir, 'resources.neu'));
  return dir;
}
const folders = [root, plain('linux-x64', 'sedimenti-linux_x64', 'sedimenti'), plain('linux-arm64', 'sedimenti-linux_arm64', 'sedimenti')];
for (const dir of folders) {
  const name = dir.split(/[\\/]/).pop();
  for (const legal of ['LICENSE', 'LICENSING.md', 'THIRD-PARTY.md']) cpSync(join('..', legal), join(dir, legal));
  execFileSync('zip', ['-qry', `${name}.zip`, name], { cwd: OUT });
  rmSync(dir, { recursive: true, force: true });
  console.log(`${OUT}/${name}.zip`);
}
