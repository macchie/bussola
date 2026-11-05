<div align="center">

# 🧭 Bussola Suite

**Seven tiny desktop apps that answer seven questions about your computer — plus Bussola, the launcher that installs and updates them.**

Every app shares the same ring map, the same time periods and the same structure, and runs with no account and no server.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](#-install)
[![Built with Neutralinojs](https://img.shields.io/badge/built%20with-Neutralinojs-00c58e.svg)](https://neutralino.js.org)
[![CI](https://github.com/macchie/bussola/actions/workflows/ci.yml/badge.svg)](https://github.com/macchie/bussola/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/macchie/bussola?sort=semver)](https://github.com/macchie/bussola/releases/latest)
[![No tracking](https://img.shields.io/badge/telemetry-none-success.svg)](#-privacy--security)

[Download](#-install) · [The apps](#-the-apps) · [How they work](#-how-they-work) · [Privacy](#-privacy--security) · [Develop](#-develop--publish)

</div>

---

> [!NOTE]
> **Early days.** Every app has been tried on Linux. On macOS and Windows verification is still in progress — see [Verification status](#-verification-status).

## 📦 The suite at a glance

| App | The question | Version | 🍎 macOS | 🪟 Windows | 🐧 Linux |
| --- | --- | :---: | :---: | :---: | :---: |
| 🧭 **Bussola** | What's installed, and what needs updating? | 1.1.0 | ✅ | ✅ | ✅ |
| 💿 **Anelli** | Where did my disk space go? | 2.1.0 | ✅ | ✅ | ✅ |
| 🌐 **Correnti** | Which apps use the network, and where to? | 1.2.0 | ✅ | ❌ | ✅ |
| ⚡ **Battiti** | What's weighing on CPU and memory? | 1.1.0 | ✅ | ✅ | ✅ |
| 🔋 **Scorte** | How much battery is left, and who's draining it? | 1.1.0 | ✅ | ✅ | ✅ |
| 🛡️ **Sentinelle** | What's listening, and who does the computer talk to? | 1.1.0 | ✅ | ✅ | ✅ |
| 🌱 **Radici** | What launches on its own at startup? | 1.1.0 | ✅ | ✅ | ✅ |
| 📓 **Registro** | What errors, shutdowns and restarts happened? | 1.1.0 | ✅ | ✅ | ✅ |

Packages for macOS (universal Intel + Apple Silicon), Windows 10/11 x64, Linux x64 and arm64. Each package weighs **1.2–2.1 MB**. Available in English, Italian, French, Spanish and German.

## 🚀 Install

### With Bussola (recommended)

Download Bussola, then install, open, update and remove every app from one place — all together if you like.

| Platform | Direct download | Then |
| --- | --- | --- |
| 🍎 **macOS** (universal) | [**Bussola-macos.zip**](https://github.com/macchie/bussola/releases/latest/download/Bussola-macos.zip) | Unzip in Downloads, then run `bash ~/Downloads/Bussola-macos/Install\ Bussola.command` |
| 🪟 **Windows** (x64) | [**Bussola-windows-x64.zip**](https://github.com/macchie/bussola/releases/latest/download/Bussola-windows-x64.zip) | Unzip and open `Bussola.exe`. SmartScreen may ask for confirmation |
| 🐧 **Linux** (x64) | [**Bussola-linux-x64.zip**](https://github.com/macchie/bussola/releases/latest/download/Bussola-linux-x64.zip) | `sudo apt install libwebkit2gtk-4.1-0`, unzip and run `bussola` |
| 🐧 **Linux** (arm64) | [**Bussola-linux-arm64.zip**](https://github.com/macchie/bussola/releases/latest/download/Bussola-linux-arm64.zip) | `sudo apt install libwebkit2gtk-4.1-0`, unzip and run `bussola` |

Or grab everything from the [latest release](https://github.com/macchie/bussola/releases/latest). Bussola doesn't update itself: when a new version ships, it shows the link to the release.

Apps land in:

| Platform | Folder |
| --- | --- |
| macOS | `/Applications`, or `~/Applications` if that's not writable |
| Windows | `%LOCALAPPDATA%\Programs\Bussola`, with a Start menu shortcut |
| Linux | `~/.local/share/bussola/apps`, with an entry in the applications menu |

### A single app

Each app has its own package in the same release.

- **macOS:** unzip in Downloads and run `bash ~/Downloads/<Name>-macos/Install\ <Name>.command`. The app is signed locally with Apple's tool and copied to Applications.
- **Windows:** unzip and open the executable. WebView2 is required (already present on Windows 11).
- **Linux:** unzip and run the program. `libwebkit2gtk-4.1-0` is required.

Keep `resources.neu` next to the executable.

> [!WARNING]
> **Unsigned apps.** The apps carry no Apple or Microsoft certificates. On macOS the signature is local and changes with every version: Anelli must be re-authorized in Full Disk Access after each update. On Windows, SmartScreen may show a warning.

## 🧩 The apps

All offer a light and dark theme, a name filter and — except Anelli and Bussola — the periods **Now, Last hour, Today and 7 days**, plus **Diagnostics** with the raw system output.

<details>
<summary>💿 <b>Anelli</b> — where your disk space goes</summary>

Radial disk map inspired by DaisyDisk. Shows disks and folders heaviest-first, with a ranking of the largest files and previews of images, video, audio and text.

Freeing space takes two steps. The **Collection** doesn't touch the disk, the **Trash** actually moves files but stays reversible, and permanent deletion starts after a 5-second countdown. Roots, home, mount points and system folders can't be moved, and restore never overwrites.

- **Sources:** `du` on Linux and macOS, a .NET enumerator on Windows.
- **Limits:** each folder keeps its 200 largest files; the rest stay in the total as a group. On Windows sizes are logical. On macOS some areas remain excluded even with Full Disk Access.
</details>

<details>
<summary>🌐 <b>Correnti</b> — which apps use the network, and where to</summary>

Traffic map by app, process and destination, with received and sent, current speed and trend.

- **Sources:** `nettop` on macOS; `ss` and `/proc/net/dev` on Linux, without root.
- **Limits:** on Linux UDP and QUIC aren't attributed to apps without root and appear as Unattributed traffic. Traffic is recorded only while the app is open. There's no Windows version.
</details>

<details>
<summary>⚡ <b>Battiti</b> — what weighs on CPU and memory</summary>

CPU and memory by app and process, with processes of the same program grouped. 100% CPU is the whole machine.

- **Sources:** `/proc` on Linux; `ps`, `vm_stat` and `sysctl` on macOS; .NET via PowerShell on Windows.
- **Limits:** shared memory is counted more than once, and the app flags it when the sum exceeds memory in use. No per-core detail, and processes can't be terminated.
</details>

<details>
<summary>🔋 <b>Scorte</b> — battery and energy by app</summary>

Battery level and runtime, health, cycles, capacity and temperature, with each app's energy impact. Without a battery it still shows which apps work hardest.

- **Sources:** `/sys` and `/proc` on Linux; `pmset`, `ioreg` and `ps` on macOS; WMI on Windows.
- **Limits:** per-app watts are **estimates** proportional to CPU time and don't separate screen, network or GPU. Measured only on battery.
</details>

<details>
<summary>🛡️ <b>Sentinelle</b> — open ports and connections</summary>

Exposed ports, local ports and active connections per app. Flags what appeared in the last 24 hours and exposed remote access, like SSH or Remote Desktop. It looks only at this computer: it doesn't scan other devices and doesn't touch the firewall.

- **Sources:** `/proc/net` on Linux, `nettop` on macOS, `Get-NetTCPConnection` and `Get-NetUDPEndpoint` on Windows.
- **Limits:** "exposed" doesn't mean reachable from the internet, since firewalls and routers can block it.
</details>

<details>
<summary>🌱 <b>Radici</b> — what starts by itself at boot</summary>

Login items, services and scheduled tasks, flagging what's new. It can disable user-level items: it deletes nothing, asks for confirmation, re-checks the state and restores the previous value. System services and OS components stay read-only.

| Platform | Editable | Mechanism |
| --- | --- | --- |
| macOS | Agents in `~/Library/LaunchAgents` and `/Library/LaunchAgents` | `launchctl disable` |
| Linux | Autostart and systemd user units | `Hidden=true`, `systemctl --user disable` |
| Windows | User `Run` values | `StartupApproved` |
</details>

<details>
<summary>📓 <b>Registro</b> — errors, shutdowns and restarts</summary>

Errors, warnings, shutdowns and restarts per app, with repeated messages merged into a single line. It also recovers what happened while it was closed, because the system keeps the logs.

- **Sources:** `journalctl` on Linux; `log show`, `DiagnosticReports` and `kern.boottime` on macOS; `Get-WinEvent` on Windows.
- **Limits:** macOS distinguishes only errors and faults, so Warnings stays empty. A single read is capped at 20,000 events.
</details>

<details>
<summary>🧭 <b>Bussola</b> — the launcher</summary>

Reads the catalog from the most recent release, downloads with `curl` and verifies the SHA-256 checksum before extracting. When uninstalling you can also wipe the data, except for Anelli and Radici, whose data holds the Trash and the changes to restore.
</details>

## 🌍 Languages & settings

The apps and the landing page are available in English, Italian, French, Spanish and German. On first launch they follow the system language; if it isn't one of those five, English. The **Settings** button, top-right in every app, lets you pick language and theme. The choice applies across the whole suite and is saved in `Bussola Suite/settings.json`, in the user data folder.

Messages coming from the operating system, such as logs or service descriptions, stay in the system language.

## 🔧 How they work

Each app is an independent [Neutralinojs](https://neutralino.js.org) project: a few-MB executable that uses the system webview. No Node, no Electron, no server, no UI build at runtime.

They all follow the same rules:

- **System tools:** data comes from native commands and system files, to avoid per-file calls.
- **Deltas between samples:** cumulative counters become real usage by difference.
- **No command-line paths:** values end up quoted in temporary scripts.
- **Local data:** a seven-day history in the user data folder, readable as line-based JSON.
- **Shared interface:** a canvas map, a sorted list, a single-scale chart, IBM Plex Sans embedded.

| Platform | Data folder |
| --- | --- |
| macOS | `~/Library/Application Support/<App>` |
| Windows | `%APPDATA%\<App>` |
| Linux | `~/.local/share/<App>` |

## 🔒 Privacy & security

- No account, no telemetry, no suite server.
- The only apps that use the network on their own are Bussola, for the catalog and packages from GitHub, and Correnti on Linux, which asks the configured DNS for destination names.
- Registro keeps one sample per message: logs may contain file and account names. They stay on the computer.
- Each app can use only the native APIs listed in its own `nativeAllowList`.
- Bussola installs only the seven apps written in its code, and accepts only HTTPS downloads from `macchie/bussola`.

The catalog and packages live in the same release: the checksum protects against corrupted or swapped files along the way, not against whoever controls the GitHub account. Protect it with two-factor authentication.

## ✅ Verification status

| App | Linux x64 | macOS | Windows |
| --- | --- | --- | --- |
| Anelli | Tried with real scans and operations | Used on a Mac; 2.0.1 signature to confirm | Never run |
| Correnti | Tried with real traffic of known size | Never run, format checked against public sources | Not available |
| Battiti | Tried with a known load | Never run | Never run |
| Scorte | Tried with a simulated battery and without one | Never run | Never run |
| Sentinelle | Tried with deliberately opened ports | Never run | Never run |
| Radici | Changes on real files, `systemctl` simulated | Never run | Never run |
| Registro | Simulated events with known counts | Never run | Never run |
| Bussola | Real installs from a local server | Script tried with simulators | Never run |

Linux arm64 is compiled but hasn't been launched. If something looks off, Diagnostics has **Copy data** with the raw system output (Anelli excepted).

## 🛠️ Develop & publish

All apps live in this repository, one per folder. Node is only a development tool. You need `node`, `npm`, `zip`, `make`, and to publish `git` and [`gh`](https://cli.github.com). Run `make help` for the commands.

```
anelli/ correnti/ battiti/ scorte/ sentinelle/ radici/ registro/ bussola/
  neutralino.config.json   configuration and allowed APIs
  resources/               interface and logic
  scripts/package.mjs      packages for each system
  test/                    logic tests
  Makefile                 local dev: make dev / test / build
shared/                    translations.js, settings.js, i18n.js, startup.js
landing/index.html         site published on GitHub Pages
scripts/                   release checks
.github/workflows/         checks, release and landing
Makefile
LICENSE  LICENSING.md  THIRD-PARTY.md  CONTRIBUTING.md
```

| Command | What it does |
| --- | --- |
| `make setup` | Installs the tools and downloads each app's runtime |
| `make test` | Runs all the logic tests |
| `make build` | Builds the packages into `<app>/dist/packages` |
| `make release` | Test, packages and catalog into `bussola/dist/release`, without publishing |
| `make versions` | Shows each app's version |
| `make landing` | Local preview of the landing page |

#### Working on a single app

Every app has its own `Makefile` with the same targets — `setup`, `dev`, `test`, `build`, `clean` — so you can `cd correnti && make dev`. The same commands are available from the repo root as `<target>-<app>` aliases (they run the app's Makefile for you):

| Command | What it does |
| --- | --- |
| `make dev-correnti` | Runs Correnti in development (`neu run`) |
| `make build-anelli` | Builds just Anelli's packages |
| `make test-registro` | Runs just Registro's tests |
| `make setup-scorte` | Downloads just Scorte's runtime |

### Shared translations & settings

The shared code lives in `shared/`: `translations.js` has one entry per text, with English as the key, and `settings.js` is the preferences panel. After a change run `make sync`, which copies it into each app's `resources/shared/`: `make test` fails if the copies don't match, if a text lacks a translation, or if the `{0}` placeholders don't line up. A new preference is added with `addSection()`.

### First publish

With `gh auth login` already done:

```bash
make bootstrap    # creates the public macchie/bussola repo, uploads the code and enables Pages
make publish      # creates the tag: GitHub builds and publishes the release
```

The repository must be public, because Bussola downloads without authentication.

### New version

1. Change `version` in the app's `neutralino.config.json`, and in `package.json`.
2. Commit on `master`.
3. Run `make publish`, or `make publish TAG=suite-2026.11.5.1` for a second release on the same day.

`make publish` refuses to start if there are unsaved changes, if you're not on `master`, if the tag already exists, or if a test fails.

### GitHub automation

| Workflow | When it runs | What it does |
| --- | --- | --- |
| `ci.yml` | Push to `master` and pull requests | Tests and builds all apps |
| `release.yml` | `suite-*` tag | Tests, builds, checks the catalog and releases on GitHub |
| `pages.yml` | Changes to `landing/` on `master` | Publishes the landing to `https://macchie.github.io/bussola/` |

Before publishing, `scripts/check-release.mjs` verifies that the catalog and files line up: tag, addresses, sizes and checksums. All packages are built on Linux, for every system. macOS signing happens on the installer's own computer.

## 📄 License

Dual license, explained in [LICENSING.md](LICENSING.md):

- **[AGPL-3.0](LICENSE):** free. Use, modify and redistribute the project as long as it stays open source under the same license.
- **Commercial, paid:** to use it in proprietary products or without complying with the AGPL.

To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md).

## 🙏 Credits

Built with [Neutralinojs](https://neutralino.js.org) (MIT) and IBM Plex Sans (SIL Open Font License), as noted in [THIRD-PARTY.md](THIRD-PARTY.md). Anelli is inspired by DaisyDisk, with which it has no affiliation.
