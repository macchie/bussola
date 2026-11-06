# Battiti

The machine's vitals in one app, with two views switched from the header, sharing the suite's ring map:
from the center apps and processes, the heaviest first. A desktop app for macOS, Windows and Linux built
with Neutralinojs.

- **Load** — what weighs on CPU and memory, by app and process. Runs everywhere.
- **Energy** — battery level, health, cycles and temperature, plus the energy each app draws. Appears only
  on machines with a battery, so on desktops Battiti stays on Load.

## Install

| System | Package | Notes |
| --- | --- | --- |
| macOS 10.15+ | `Battiti-macos.zip` | Unzip in Downloads, then `bash ~/Downloads/Battiti-macos/Install\ Battiti.command` |
| Windows 10/11 x64 | `Battiti-windows-x64.zip` | WebView2 required, already present on Windows 11 |
| Linux x64 / arm64 | `Battiti-linux-*.zip` | WebKitGTK required: `sudo apt install libwebkit2gtk-4.1-0` |

Keep `resources.neu` next to the executable.

## How to use

- Switch **Load** / **Energy** from the view control in the header (Energy appears only with a battery).
- Pick the measure (CPU / Memory in Load; Impact / Power / Battery in Energy) and the period.
- Click an app to drill in, click the center to go back up. 100% CPU is the whole machine. Diagnostics shows
  the raw system output and clears the history.

## How it works

- **Load:** every 2 seconds, `/proc` on Linux; `ps`, `vm_stat`, `sysctl` on macOS; .NET via PowerShell on
  Windows. CPU usage comes from the delta against the previous sample. Shared memory can be counted more than
  once, and the app flags it.
- **Energy:** every 5 seconds, `/sys` and `/proc` on Linux; `pmset`, `ioreg`, `ps` on macOS; WMI on Windows.
  Per-app watts are **estimates** proportional to CPU time and are measured only on battery.

History stays on the computer for seven days, under `Battiti` (load) and `Battiti Energy` in the user data
folder.

## Limits

- Data is recorded only while the app is open; processes can't be terminated, and there's no per-core detail.
- On Windows, battery capacity and cycles may require running as administrator; many laptops don't expose them.
- The battery view has little to show on desktops, which is why it appears only when a battery is present.

## Develop

Dependencies live at the repo root. Run `make setup` there once, then in this folder:

```bash
make dev      # run the app in development
make test     # run the logic tests (load + energy)
make build    # build the packages into dist/packages
```
