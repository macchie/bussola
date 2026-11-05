# Scorte

Shows how much battery is left, what state it's in and which apps drain it most, with the suite's ring map
(Anelli, Correnti, Battiti). A desktop app for macOS, Windows and Linux built with Neutralinojs.

## Install

| System | Package | Notes |
| --- | --- | --- |
| macOS 10.15+ | `Scorte-macos.zip` | Unzip in Downloads, then `bash ~/Downloads/Scorte-macos/Install\ Scorte.command` |
| Windows 10/11 x64 | `Scorte-windows-x64.zip` | WebView2 required, already present on Windows 11 |
| Linux x64 / arm64 | `Scorte-linux-*.zip` | WebKitGTK required: `sudo apt install libwebkit2gtk-4.1-0` |

Keep `resources.neu` next to the executable.

## How to use

- **Impact:** each app's share of the CPU work. Works even without a battery.
- **Power:** the watts attributed to each app. Measured only when the computer runs on battery.
- **Battery:** state, runtime, health, cycles, capacity and temperature.

The chart shows the battery level on top and the CPU load below, both from 0 to 100%.

## How it works

Every 5 seconds the app reads the battery and processes: `/sys` and `/proc` on Linux, `pmset`, `ioreg` and `ps` on macOS,
PowerShell with the WMI classes on Windows. The estimate splits the measured power in proportion to CPU time.

## Limits

- Per-app watts are an estimate: they don't count screen, network or GPU, which weigh on the total but not on an
  app's CPU time. The measured power also includes the computer's idle consumption.
- While charging, the measured power concerns the battery, not the computer, so it isn't attributed.
- On Windows, capacity and cycles may require running as administrator; many laptops don't expose them.
- Temperature depends on the system and hardware, and may be missing.
- Data is recorded only while the app is open. The history stays on the computer for seven days.

## Develop

```bash
npm install
npm run setup
npm test
npm run build    # builds the packages into dist/packages
```
