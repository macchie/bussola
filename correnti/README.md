# Correnti

Everything your computer does on the network, in one app with two views switched from the header, sharing
the suite's ring map. A desktop app for macOS, Windows and Linux built with Neutralinojs.

- **Traffic** — which apps use the network, where to and how much: a map by app, process and destination,
  with received/sent and a trend. Runs on **macOS and Linux**.
- **Ports** — what's listening and who the computer talks to: exposed ports, local ports and active
  connections per app, flagging what appeared in the last 24 hours. Runs on **all three systems**.

On Windows, where traffic has no native tooling, Correnti opens straight into Ports.

## Install

| System | Package | Notes |
| --- | --- | --- |
| macOS 10.15+ | `Correnti-macos.zip` | Unzip in Downloads, then `bash ~/Downloads/Correnti-macos/Install\ Correnti.command` |
| Windows 10/11 x64 | `Correnti-windows-x64.zip` | WebView2 required, already present on Windows 11 |
| Linux x64 / arm64 | `Correnti-linux-*.zip` | WebKitGTK and `ss`: `sudo apt install libwebkit2gtk-4.1-0 iproute2` |

No root needed. On macOS the installer signs the app locally and copies it to Applications.

## How to use

- Switch **Traffic** / **Ports** from the view control in the header.
- Pick the period (Now, Last hour, Today, 7 days) and the sub-view (direction for Traffic; Exposed / Local /
  Connections for Ports).
- Click an app to drill in, click the center to go back up. Pause stops sampling; Diagnostics shows the raw
  system output and clears the history.

## How it works

- **Traffic:** every 3 seconds, `/usr/bin/nettop -L 1` on macOS, or `ss -tinp` + `/proc/net/dev` on Linux,
  without root. Traffic is derived from the delta against the previous sample; `ps` links each process to its
  app. On Linux UDP and QUIC aren't attributed without root and appear as **Unattributed traffic**.
- **Ports:** every 5 seconds, `/proc/net` on Linux, `nettop` on macOS, `Get-NetTCPConnection` and
  `Get-NetUDPEndpoint` on Windows. "Exposed" doesn't mean reachable from the internet.

History stays on the computer for seven days, under `Correnti` (traffic) and `Correnti Ports` in the user
data folder. Nothing is sent anywhere.

## Limits

- Traffic is recorded only while the app is open; a connection opened and closed between samples may slip through.
- Traffic destinations come from reverse DNS: many show as the infrastructure provider (Google, Akamai, AWS) or a plain IP.
- Correnti only looks at this computer: it doesn't scan other devices and doesn't touch the firewall.

## Develop

Dependencies live at the repo root. Run `make setup` there once, then in this folder:

```bash
make dev      # run the app in development
make test     # run the logic tests (traffic + ports)
make build    # build the packages into dist/packages
```
