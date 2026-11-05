# Battiti

Shows what weighs on CPU and memory, with the ring map of Anelli and Correnti: from the center apps and processes,
the heaviest first. A desktop app for macOS, Windows and Linux built with Neutralinojs.

## Install

| System | Package | Notes |
| --- | --- | --- |
| macOS 10.15+ | `Battiti-macos.zip` | Unzip in Downloads, then `bash ~/Downloads/Battiti-macos/Install\ Battiti.command` |
| Windows 10/11 x64 | `Battiti-windows-x64.zip` | WebView2 required, already present on Windows 11. SmartScreen may ask for confirmation |
| Linux x64 / arm64 | `Battiti-linux-*.zip` | WebKitGTK required: `sudo apt install libwebkit2gtk-4.1-0` |

Keep `resources.neu` next to the executable.

## How to use

- Pick the measure, CPU or Memory, and the period: Now, Last hour, Today, 7 days.
- Click an app with several processes to enter, click the center to go back up.
- The chart at the bottom shows CPU on top and memory below, both from 0 to 100%.
- Diagnostics shows what the system returned and clears the history.

100% CPU is the whole machine: a process using one core out of 8 is worth 12.5%.

## How it works

Every 2 seconds the app reads the process counters and derives CPU usage from the delta against the previous
sample.

- **Linux:** `/proc`.
- **macOS:** `ps`, `vm_stat` and `sysctl`. Memory in use follows Activity Monitor's calculation
  (active, wired and compressed).
- **Windows:** a single PowerShell process stays open, because starting it for each sample would cost
  too much. It exits on its own when Battiti is no longer running.

The history stays on the computer, seven days, in the user data folder.

## Limits

- Data is recorded only while the app is open.
- Process memory is the resident one: the shared part is counted more than once, so the sum may
  exceed memory in use. Memory not attributed to a process appears as "System memory".
- On macOS, per-process values may differ from Activity Monitor, which uses the "memory footprint".
- Processes can't be terminated, and there's no per-core detail.

## Develop

Dependencies live at the repo root. Run `make setup` there once, then in this folder:

```bash
make dev      # run the app in development
make test     # run the logic tests
make build    # build the packages into dist/packages
```
