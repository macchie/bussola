# Radici

Shows what starts on its own on your computer: login items, services and scheduled tasks, with the suite's
ring map (Stiva, Correnti, Battiti, Scorte, Sentinelle). A desktop app for macOS, Windows and Linux
built with Neutralinojs.

## Install

| System | Package | Notes |
| --- | --- | --- |
| macOS 10.15+ | `Radici-macos.zip` | Unzip in Downloads, then `bash ~/Downloads/Radici-macos/Install\ Radici.command` |
| Windows 10/11 x64 | `Radici-windows-x64.zip` | WebView2 required, already present on Windows 11 |
| Linux x64 / arm64 | `Radici-linux-*.zip` | WebKitGTK required: `sudo apt install libwebkit2gtk-4.1-0` |

Keep `resources.neu` next to the executable.

## How to use

- The tabs split the items into Login, Services, Scheduled and Disabled.
- The **New** badge flags what appeared in the last 24 hours. The first read counts as a starting point.
- **Disable at startup** stops an item from launching at the next login. If it's already open it stays open.
- **Re-enable**, from the Disabled tab, restores everything as it was.

## What it can change

Radici deletes nothing and always asks for confirmation. After each change it re-reads the state from the system and
flags whether it changed.

| System | Editable | How | Read-only |
| --- | --- | --- | --- |
| macOS | Agents in `~/Library/LaunchAgents` and `/Library/LaunchAgents` | `launchctl disable` | Daemons, Apple components, cron |
| Linux | Autostart and systemd user units | `Hidden=true`, `systemctl --user disable` | System services, timers, cron, graphical session |
| Windows | User `Run` values | `StartupApproved`, like Task Manager | Items for all users, services, tasks, Startup folder |

## Limits

- Some apps recreate their own startup items: disabling doesn't prevent it.
- On macOS, the items in Settings > General > Login Items aren't listed, and the components in
  `/System/Library` are excluded.
- The history stays on the computer for seven days and updates only while the app is open.

## Develop

Dependencies live at the repo root. Run `make setup` there once, then in this folder:

```bash
make dev      # run the app in development
make test     # run the logic tests
make build    # build the packages into dist/packages
```
