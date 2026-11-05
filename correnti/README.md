# Correnti

Shows which apps use the network, where to and how much, with the same ring map as Anelli: from the center
app, process and destination, the most active first. A desktop app for macOS and Linux built with Neutralinojs.

## Install

### Linux

Unzip `Correnti-linux-x64.zip` (or `arm64`) and run `correnti`. WebKitGTK and `ss` are required, usually already present:

```bash
sudo apt install libwebkit2gtk-4.1-0 iproute2
```

No root needed.

### macOS

Unzip `Correnti-macos.zip` in Downloads, then in Terminal:

```bash
bash ~/Downloads/Correnti-macos/Install\ Correnti.command
```

The installer signs the app on your Mac with Apple's tool and copies it to Applications. Neither Full Disk
Access nor an administrator is needed.

## How to use

- Pick the period: Now, Last hour, Today, 7 days.
- Pick the direction: Total, Received, Sent.
- Click an app to enter, click the center to go back up. The chart at the bottom shows the trend: received
  on top, sent below, on the same scale.
- Pause stops the sampling. Diagnostics shows what macOS returned and clears the history.

## How it works

Every 3 seconds the app launches a short run of `/usr/bin/nettop -L 1`, reads the bytes of each
connection and derives the traffic from the delta against the previous sample. `ps` links each process to
its app, so Chrome Helpers end up under Chrome.

The history stays on the computer, seven days, in `~/Library/Application Support/Correnti` on macOS and
`~/.local/share/Correnti` on Linux.

## How it works on Linux

Every 3 seconds `ss -tinp` gives the bytes of each TCP connection and `/proc/net/dev` the real bytes of the network cards.
The difference appears as **Unattributed traffic**, so the total stays honest. Addresses become
names via `getent hosts`, in the background.

- UDP traffic isn't attributable to apps without root. It includes QUIC, so much of YouTube and of
  Google sites in Chromium browsers ends up in Unattributed traffic.
- Without root, other users' processes appear as "Other users or system".
- VPN and container networks are excluded from the cards' total to avoid double counting.

## Limits

- Traffic is recorded only while the app is open.
- A connection opened and closed between two samples may slip through.
- Destinations come from reverse name resolution: many show up as the infrastructure
  provider (Google, Akamai, AWS) or as a plain IP.
- The traffic content isn't visible. VPNs and proxies may group traffic under their own app.
- App blocking isn't included.

## Develop

Dependencies live at the repo root. Run `make setup` there once, then in this folder:

```bash
make dev      # run the app in development
make test     # run the logic tests
make build    # build the packages into dist/packages
```
