// Dev tool: from `neu build` to the packages to distribute.
// The final app doesn't use Node.
import { execFileSync } from 'node:child_process';
import { cpSync, chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/anelli';
const OUT = 'dist/packages';
const { version: VERSION } = JSON.parse(readFileSync('neutralino.config.json', 'utf8'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

function plain(id, binary, target) {
  const dir = join(OUT, `Anelli-${id}`);
  mkdirSync(dir, { recursive: true });
  cpSync(join(DIST, binary), join(dir, target));
  chmodSync(join(dir, target), 0o755);
  cpSync(join(DIST, 'resources.neu'), join(dir, 'resources.neu'));
  return dir;
}

function macApp() {
  const root = join(OUT, 'Anelli-macos');
  const contents = join(root, 'Anelli.app', 'Contents');
  mkdirSync(join(contents, 'MacOS'), { recursive: true });
  cpSync(join(DIST, 'anelli-mac_universal'), join(contents, 'MacOS', 'anelli'));
  chmodSync(join(contents, 'MacOS', 'anelli'), 0o755);
  cpSync(join(DIST, 'resources.neu'), join(contents, 'MacOS', 'resources.neu'));
  writeFileSync(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Anelli</string>
<key>CFBundleDisplayName</key><string>Anelli</string>
<key>CFBundleIdentifier</key><string>it.anelli.app</string>
<key>CFBundleExecutable</key><string>anelli</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${VERSION}</string>
<key>CFBundleVersion</key><string>${VERSION}</string>
<key>LSMinimumSystemVersion</key><string>10.15</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
  writeFileSync(join(root, 'Install Anelli.command'), `#!/bin/bash
# Sign Anelli with Apple's tool and install it in Applications.
# macOS ties Full Disk Access to the app's signature.
set -e
cd "$(dirname "$0")"
pkill -x anelli 2>/dev/null || true
xattr -cr Anelli.app
codesign --force --deep --sign - --identifier it.anelli.app Anelli.app
codesign --verify --deep --strict Anelli.app
rm -rf /Applications/Anelli.app
ditto Anelli.app /Applications/Anelli.app
tccutil reset SystemPolicyAllFiles it.anelli.app >/dev/null 2>&1 || true
echo
echo "Anelli is installed in Applications."
echo "Now enable Anelli in Full Disk Access, then open it from the Applications folder."
open 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'
`);
  chmodSync(join(root, 'Install Anelli.command'), 0o755);
  if (process.platform === 'darwin') {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--identifier', 'it.anelli.app', join(root, 'Anelli.app')]);
  }
  return root;
}

const folders = [
  plain('linux-x64', 'anelli-linux_x64', 'anelli'),
  plain('linux-arm64', 'anelli-linux_arm64', 'anelli'),
  plain('windows-x64', 'anelli-win_x64.exe', 'Anelli.exe'),
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
