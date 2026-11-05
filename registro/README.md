# Registro

Collects errors, shutdowns and restarts from the system logs and sorts them by app, merging messages that repeat.
Part of the suite with Anelli, Correnti, Battiti, Scorte, Sentinelle and Radici. A desktop app for macOS, Windows
and Linux built with Neutralinojs.

## Install

| System | Package | Notes |
| --- | --- | --- |
| macOS 10.15+ | `Registro-macos.zip` | Unzip in Downloads, then `bash ~/Downloads/Registro-macos/Install\ Registro.command` |
| Windows 10/11 x64 | `Registro-windows-x64.zip` | WebView2 required, already present on Windows 11 |
| Linux x64 / arm64 | `Registro-linux-*.zip` | WebKitGTK required: `sudo apt install libwebkit2gtk-4.1-0` |

Keep `resources.neu` next to the executable.

## How to use

- The tabs split the events into Errors, Warnings, Shutdowns and restarts.
- Click an app to see its messages, most frequent first. Double-click a message for the full text.
- The chart shows errors and shutdowns on top, warnings below, on the same scale.

Messages equal except for numbers, addresses and paths count as a single one: an error repeated 500 times
takes up one row, with its count.

## How it works

Every minute the app reads what happened since the last read: `journalctl` on Linux, `log show`, the reports in
`DiagnosticReports` and `kern.boottime` on macOS, `Get-WinEvent` on Windows. The system keeps the logs, so
on reopening it also recovers what happened while it was closed. On first launch it looks back 24 hours
(3 hours on macOS, where reading is slow).

## Limits

- Logs often contain file and account names. Registro keeps one sample per message on this computer,
  for seven days, and sends nothing. Diagnostics lets you clear the history.
- macOS distinguishes only errors and faults: the Warnings tab stays empty.
- macOS produces many harmless errors: lots of errors don't mean a problem.
- On Linux, without the `systemd-journal` group you see only part of the log; the app flags it.
- On macOS, restarts appear only from when the app is in use.
- A single read is capped at 20,000 events.

## Develop

```bash
npm install
npm run setup
npm test
npm run build    # builds the packages into dist/packages
```
