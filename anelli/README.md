# Anelli

Visual disk space analyzer in the style of DaisyDisk: a desktop app for macOS, Linux and Windows.
Built with [Neutralinojs](https://neutralino.js.org): no Node and no server to start at runtime, just a
few-MB executable that uses the system webview.

## Install

Download the package for your system.

| System | Package | Notes |
| --- | --- | --- |
| macOS 10.15+ (Intel and Apple Silicon) | `Anelli-macos.zip` | Unzip and run `bash "Install Anelli.command"`: it signs the app on your Mac and puts it in Applications |
| Windows 10/11 x64 | `Anelli-windows-x64.zip` | WebView2 required, already present on Windows 11. SmartScreen may ask for confirmation |
| Linux x64 / arm64 | `Anelli-linux-*.zip` | WebKitGTK required: `sudo apt install libwebkit2gtk-4.1-0` |

Keep `resources.neu` next to the executable.

## Develop

Node is only used here, as a tool, never in the final app.

```bash
npm install
npm run setup    # downloads the runtime and client library
npm run dev      # starts the app
npm test         # pure logic, no runtime
npm run build    # builds the packages into dist/packages for every system, from any system
```

## How to use

1. Pick a disk or a folder and start the scan.
2. Explore the map: each ring is a level, starting at 12 o'clock with the heaviest. Click a folder
   to enter, click the center to go back up. The list beside it has the same content.
3. Drag into the Collection, or press +. The collection doesn't touch the disk.
4. "Move to Trash" actually moves the items, instantly and reversibly.
5. From the Trash you can restore, or permanently delete after a 5-second countdown.

Keyboard in the list: arrows, Enter to open, Space for the preview, Delete for the collection,
Backspace to go up. Right-click opens the actions menu.

## How it works

Neutralino has no `lstat` and no threads, and a per-file call would be too slow. The scan therefore uses
native tools that write a listing to a temporary file; the app reads it in chunks and passes it to a Web
Worker, which keeps the tree.

- **Linux and macOS:** `du -akx`, which gives allocated space, counts hardlinks once and stays on the volume.
- **Windows:** a small C# enumerator compiled on the fly by PowerShell. It skips junctions and links, and counts
  cloud-only files as zero. Sizes are logical, not allocated space.

Every path destined for the shell ends up quoted in a temporary script, never on the command line.

## The Trash

As long as an item is in the Trash it still takes up space. There is no automatic emptying. Moving
is a rename on the same volume, never a copy. Items go into the user data folder if it's on the same
volume, otherwise into `.anelli-trash-<user>` in the topmost writable folder.
The listing is in `trash.json` and survives restarts.

| System | Data folder |
| --- | --- |
| Linux | `~/.local/share/Anelli` |
| macOS | `~/Library/Application Support/Anelli` |
| Windows | `%APPDATA%\Anelli` |

## Security

- Only the native APIs listed in `nativeAllowList` are available, with one-time tokens.
- Deletion accepts only Trash ids, never paths; links are removed without following them.
- It refuses roots, mount points, the home and its ancestors, and each platform's system folders.
- Restore never overwrites: in case of a conflict it proposes a different name.

## Full Disk Access on macOS

macOS ties the permission to the app's signature. Without a Developer ID certificate the signature is local and
changes with every version: after an update, re-run the installer and re-enable the permission. If an old Anelli
entry remains in Settings, remove it with the minus button before adding it again.

Even with the permission enabled, macOS keeps out some areas protected by SIP and the data of sandboxed apps:
the scan counts them as excluded and they can't be moved.

## Limits

- Protected folders require running the app as an administrator.
- On Linux and macOS an empty folder appears as a file, because `du` doesn't tell the two cases apart.
- A partial re-scan may recount a file with hardlinks outside the folder.
- Each folder keeps its 200 largest files; the rest stay in the total as a group.
- Media preview up to 256 MB.
