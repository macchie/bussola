# Sentinelle

Shows what's listening on your computer and who it's talking to, with the suite's ring map
(Anelli, Correnti, Battiti, Scorte). A desktop app for macOS, Windows and Linux built with Neutralinojs.

Sentinelle watches only this computer: it doesn't scan other devices and doesn't modify the firewall.

## Install

| System | Package | Notes |
| --- | --- | --- |
| macOS 10.15+ | `Sentinelle-macos.zip` | Unzip in Downloads, then `bash ~/Downloads/Sentinelle-macos/Install\ Sentinelle.command` |
| Windows 10/11 x64 | `Sentinelle-windows-x64.zip` | WebView2 required, already present on Windows 11 |
| Linux x64 / arm64 | `Sentinelle-linux-*.zip` | WebKitGTK required: `sudo apt install libwebkit2gtk-4.1-0` |

Keep `resources.neu` next to the executable.

## How to use

- **Exposed:** ports listening on an address reachable from the network.
- **Local:** ports reachable only from this computer.
- **Connections:** active links to other servers.

The **New** badge flags what appeared in the last 24 hours. The first run counts as a starting
point, so it flags nothing. **Remote access** flags exposed SSH, Telnet, Remote Desktop and VNC.

Exposed doesn't mean reachable from the internet: the computer's firewall or the router may block it.
It serves as a list of things to check, not as a diagnosis of a problem.

## How it works

Every 5 seconds the app reads `/proc/net` on Linux, `nettop` on macOS and `Get-NetTCPConnection` with
`Get-NetUDPEndpoint` on Windows. What it has already seen stays in `seen.json`, for seven days.

## Limits

- A short connection, opened and closed between two reads, may slip through.
- Without privileges, other users' processes may appear as "Unidentified processes".
- On Linux and Windows, destinations stay as IP addresses. On macOS `nettop` often provides the name.
- Port names themselves are conventions: a program may use another service's port.

## Develop

```bash
npm install
npm run setup
npm test
npm run build    # builds the packages into dist/packages
```
