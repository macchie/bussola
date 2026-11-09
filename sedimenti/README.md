# Sedimenti

Finds what settles on your disk and is easy to forget — caches, project dependency and build folders
across many languages, and Docker's reclaimable space — and lays them on the suite's ring map, **coloured
by how safe each item is to remove**. A desktop app for macOS and Linux built with Neutralinojs.

- 🟢 **Safe** — caches, package-manager caches, build output and the Trash: they regenerate.
- 🟡 **Caution** — dependency folders (`node_modules`, `vendor`, `.venv`, `Pods`…) and Docker images:
  you need the project, a manifest or the network to rebuild them.
- 🔴 **Careful** — Docker volumes and odd leftovers: they may hold data worth keeping.

## Install

| System | Package | Notes |
| --- | --- | --- |
| macOS 10.15+ | `Sedimenti-macos.zip` | Unzip in Downloads, then `bash ~/Downloads/Sedimenti-macos/Install\ Sedimenti.command` |
| Linux x64 / arm64 | `Sedimenti-linux-*.zip` | WebKitGTK required: `sudo apt install libwebkit2gtk-4.1-0`. `gio` (GNOME) is used to Trash items |

No root needed.

## How to use

- Sedimenti scans on open; press **Rescan** to run it again.
- Click a category to drill in, click the center to go back up. Each ring and list row is coloured by safety.
- Select an item to **reveal** it in the file manager, **copy its path**, or **move it to the Trash** (reversible).
- When Docker is present, drill into **Images**, **Containers** and **Local Volumes** to see each one on its own
  — with an *in use* / *running* hint — and **Delete** it individually (this runs a `docker … rm`, which can't be
  undone), or copy the command to run yourself. Each group also offers the matching `docker … prune`.

## How it works

One pass over the known sediment locations:

- `du -skx` of `~/.cache/*` (and `~/Library/Caches/*` on macOS) — which already sweeps most IDE and tool
  caches — plus the package/module stores that live elsewhere (`.npm`, Gradle, Maven, Cargo, Bun, Go modules,
  NuGet, RubyGems, Pub, Ivy, sbt, Stack, Cabal, Yarn Berry), the Trash, and on macOS Xcode's `DerivedData`
  and the simulator caches. `-x` keeps it on one filesystem.
- `find "$HOME" -maxdepth 6 -prune` for per-project dependency and build folders across languages:
  `node_modules`, `.venv`, `Pods`, `bower_components`, `__pycache__`, `.dart_tool`, `_build`, `.next`,
  `.nuxt`, `.svelte-kit`, `.angular`, `.turbo`, `.parcel-cache`, `.pytest_cache`, `.mypy_cache`,
  `.ruff_cache`, `.terraform`. The generic names `target`, `build` and `vendor` are only counted when a
  sibling manifest (`Cargo.toml`/`pom.xml`, `build.gradle`/`CMakeLists.txt`, `composer.json`/`go.mod`…)
  confirms they belong to a project, so an unrelated folder named "build" is never flagged.
- `docker image ls`, `docker ps -a -s` and `docker system df -v` when Docker is present, to list each image,
  container and volume (with its size and whether it's in use), plus the reclaimable Build Cache.

Everything stays on this computer; nothing is sent anywhere. Files you remove go through the system Trash;
only Docker items are deleted outright (see Limits).

## Limits

- "Leftovers" is a best-effort heuristic; look before you remove.
- Deleting a Docker image, container or volume runs a `docker … rm` and is **not** reversible (unlike the Trash).
  An in-use image or running container is removed with `-f`; an in-use volume is refused, and the error is shown.
- The scan reads sizes at a point in time — press Rescan after a cleanup to refresh.

## Develop

Dependencies live at the repo root. Run `make setup` there once, then in this folder:

```bash
make dev      # run the app in development
make test     # run the logic tests (classify, parse, tree)
make build    # build the packages into dist/packages
```
