// Dev tool: from `neu build` to the packages to distribute.
// The final app doesn't use Node.
import { execFileSync } from 'node:child_process';
import { cpSync, chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/stiva';
const OUT = 'dist/packages';
const { version: VERSION } = JSON.parse(readFileSync('neutralino.config.json', 'utf8'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

function plain(id, binary, target) {
  const dir = join(OUT, `Stiva-${id}`);
  mkdirSync(dir, { recursive: true });
  cpSync(join(DIST, binary), join(dir, target));
  chmodSync(join(dir, target), 0o755);
  cpSync(join(DIST, 'resources.neu'), join(dir, 'resources.neu'));
  return dir;
}

function macApp() {
  const root = join(OUT, 'Stiva-macos');
  const contents = join(root, 'Stiva.app', 'Contents');
  mkdirSync(join(contents, 'MacOS'), { recursive: true });
  cpSync(join(DIST, 'stiva-mac_universal'), join(contents, 'MacOS', 'stiva'));
  chmodSync(join(contents, 'MacOS', 'stiva'), 0o755);
  cpSync(join(DIST, 'resources.neu'), join(contents, 'MacOS', 'resources.neu'));
  writeFileSync(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Stiva</string>
<key>CFBundleDisplayName</key><string>Stiva</string>
<key>CFBundleIdentifier</key><string>it.stiva.app</string>
<key>CFBundleExecutable</key><string>stiva</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${VERSION}</string>
<key>CFBundleVersion</key><string>${VERSION}</string>
<key>LSMinimumSystemVersion</key><string>10.15</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
  writeFileSync(join(root, 'Install Stiva.command'), `#!/bin/bash
# Sign Stiva with Apple's tool and install it in Applications.
# macOS ties Full Disk Access to the app's signature.
set -e
cd "$(dirname "$0")"
pkill -x stiva 2>/dev/null || true
xattr -cr Stiva.app
codesign --force --deep --sign - --identifier it.stiva.app Stiva.app
codesign --verify --deep --strict Stiva.app
rm -rf /Applications/Stiva.app
ditto Stiva.app /Applications/Stiva.app
tccutil reset SystemPolicyAllFiles it.stiva.app >/dev/null 2>&1 || true
echo
echo "Stiva is installed in Applications."
echo "Now enable Stiva in Full Disk Access, then open it from the Applications folder."
open 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'
`);
  chmodSync(join(root, 'Install Stiva.command'), 0o755);
  if (process.platform === 'darwin') {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--identifier', 'it.stiva.app', join(root, 'Stiva.app')]);
  }
  return root;
}

const folders = [
  plain('linux-x64', 'stiva-linux_x64', 'stiva'),
  plain('linux-arm64', 'stiva-linux_arm64', 'stiva'),
  plain('windows-x64', 'stiva-win_x64.exe', 'Stiva.exe'),
  macApp(),
];

for (const dir of folders) {
  const name = dir.split(/[\\/]/).pop();
  for (const legal of ['LICENSE', 'LICENSING.md', 'THIRD-PARTY.md']) cpSync(join('..', legal), join(dir, legal));
  execFileSync('zip', ['-qry', `${name}.zip`, name], { cwd: OUT });
  rmSync(dir, { recursive: true, force: true });
  if (!existsSync(join(OUT, `${name}.zip`))) throw new Error(`Missing archive: ${name}`);
  console.log(`${OUT}/${name}.zip`);
}
