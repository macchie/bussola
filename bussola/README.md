# Bussola

Installs, opens, updates and removes the suite apps: Anelli, Correnti, Battiti, Scorte, Sentinelle,
Radici and Registro. A desktop app for macOS, Windows and Linux built with Neutralinojs.

## Install

| System | Package | Notes |
| --- | --- | --- |
| macOS 10.15+ | `Bussola-macos.zip` | Unzip in Downloads, then `bash ~/Downloads/Bussola-macos/Install\ Bussola.command` |
| Windows 10/11 x64 | `Bussola-windows-x64.zip` | WebView2 required, already present on Windows 11 |
| Linux x64 / arm64 | `Bussola-linux-*.zip` | WebKitGTK required: `sudo apt install libwebkit2gtk-4.1-0` |

Bussola doesn't update itself: when a new version ships, it shows the link to the release.

## Where it installs

| System | Folder |
| --- | --- |
| macOS | `/Applications`, or `~/Applications` if that's not writable |
| Windows | `%LOCALAPPDATA%\Programs\Bussola`, with a Start menu shortcut |
| Linux | `~/.local/share/bussola/apps`, with a menu entry |

No administrator privileges needed. On macOS each app is signed locally with `codesign`, so
Anelli must be re-authorized in Full Disk Access after every update.

## Publishing a version

The `macchie/bussola` repository must be **public**: Bussola downloads without authentication.

```bash
# the first time
gh repo create macchie/bussola --public

# in every changed app
npm run build

# in bussola
npm run build
node scripts/publish.mjs suite-2026.11.4
gh release create suite-2026.11.4 dist/release/* --repo macchie/bussola --title "Suite 2026.11.4" --latest
```

The script gathers the packages from the folders next to this one and writes `catalog.json` with versions,
addresses and checksums. Bussola always reads the catalog of the latest release.

## Security

- The app list is fixed in the code: the catalog only states versions and packages.
- Only HTTPS downloads from `macchie/bussola` releases are accepted.
- Each package is verified with SHA-256 before extraction, and only the expected content is copied.
- Uninstalling touches only known paths. Anelli's and Radici's data always stays: it holds the Trash and changes.

The catalog and packages come from the same release, so the checksum protects against corrupted or swapped files
along the way, not against whoever controls your GitHub account: protect it with two-factor authentication.

## Develop

```bash
npm install
npm run setup
npm test
```
