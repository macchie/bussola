// The only place that launches processes. Paths never go through the command line;
// they finish quoted in a single run with `sh -c`.
export const OS = globalThis.NL_OS;
export const SUPPORTED = OS === 'Darwin' || OS === 'Linux';
const N = () => globalThis.Neutralino;
export const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

const handlers = new Map();
const early = new Map();
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  N().events.on('spawnedProcess', ({ detail }) => {
    const h = handlers.get(detail.id);
    if (h) h(detail);
    else { if (!early.has(detail.id)) early.set(detail.id, []); early.get(detail.id).push(detail); }
  });
}
export async function run(command, timeoutMs = 120000) {
  listen();
  const { id } = await N().os.spawnProcess(command);
  return new Promise((resolve) => {
    let out = ''; let err = '';
    const timer = setTimeout(() => N().os.updateSpawnedProcess(id, 'exit').catch(() => {}), timeoutMs);
    const onEvent = (d) => {
      if (d.action === 'stdOut') out += d.data;
      else if (d.action === 'stdErr') err += d.data;
      else if (d.action === 'exit') { clearTimeout(timer); handlers.delete(id); resolve({ code: d.data, out, err }); }
    };
    handlers.set(id, onEvent);
    for (const d of early.get(id) || []) onEvent(d);
    early.delete(id);
  });
}

// One pass over the known sediment locations. `du -skx` keeps it on one filesystem and
// `find ... -prune` never descends into a dependency folder it has already measured. The
// whole program is a single `sh -c` argument, so it must never contain a ' quote (that would
// nest inside the outer quoting and break the command tokenizer) — hence "double quotes" only.
function script(home) {
  // ~/.cache/* and ~/Library/Caches/* already sweep most IDE and tool caches (JetBrains, pip,
  // pnpm, yarn, deno, Playwright, ccache…), so the explicit list below is only what lives elsewhere.
  const caches = OS === 'Darwin'
    ? `du -skx "$H/Library/Caches"/*/ "$H/.cache"/*/ 2>/dev/null`
    : `du -skx "$H/.cache"/*/ 2>/dev/null`;
  const trash = OS === 'Darwin' ? `"$H/.Trash"` : `"$H/.local/share/Trash"`;
  const xcode = OS === 'Darwin'
    ? `du -skx "$H/Library/Developer/Xcode/DerivedData" "$H/Library/Developer/CoreSimulator/Caches" 2>/dev/null\n`
    : '';
  // Per-project dependency and build folders, by name — the same shape as node_modules.
  const named = '-name node_modules -o -name bower_components -o -name .venv -o -name Pods'
    + ' -o -name __pycache__ -o -name _build -o -name .dart_tool -o -name .next -o -name .nuxt'
    + ' -o -name .svelte-kit -o -name .angular -o -name .turbo -o -name .parcel-cache'
    + ' -o -name .pytest_cache -o -name .mypy_cache -o -name .ruff_cache -o -name .terraform';
  return `sh -c ${q(`set -u
H="${home}"
${caches}
du -skx "$H/.npm" "$H/.gradle/caches" "$H/.m2/repository" "$H/.cargo/registry" "$H/.bun/install/cache" "$H/go/pkg/mod" "$H/.nuget/packages" "$H/.gem" "$H/.pub-cache" "$H/.ivy2" "$H/.sbt" "$H/.stack" "$H/.cabal" "$H/.yarn/berry/cache" 2>/dev/null
${xcode}du -skx ${trash} 2>/dev/null
find "$H" -maxdepth 6 -type d \\( ${named} \\) -prune 2>/dev/null -exec du -skx {} + 2>/dev/null
find "$H" -maxdepth 6 -type d \\( -name target -o -name build -o -name vendor \\) -prune 2>/dev/null | while IFS= read -r d; do
  p=\${d%/*}; b=\${d##*/}
  case $b in
  target) [ -e "$p/Cargo.toml" ] || [ -e "$p/pom.xml" ] || [ -e "$p/build.sbt" ] || continue ;;
  build) [ -e "$p/build.gradle" ] || [ -e "$p/build.gradle.kts" ] || [ -e "$p/CMakeLists.txt" ] || [ -e "$p/pubspec.yaml" ] || continue ;;
  vendor) [ -e "$p/composer.json" ] || [ -e "$p/go.mod" ] || [ -e "$p/Gemfile" ] || continue ;;
  esac
  du -skx "$d" 2>/dev/null
done
if command -v docker >/dev/null 2>&1; then
  echo "===DOCKER==="; docker image ls --format "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.Containers}}" 2>/dev/null
  echo "===CONTAINERS==="; docker ps -a -s --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Size}}|{{.State}}" 2>/dev/null
  echo "===VOLUMES==="; docker system df -v 2>/dev/null
  echo "===BUILD==="; docker system df --format "{{.Type}}|{{.Reclaimable}}" 2>/dev/null
fi
exit 0`)}`;
}
export const scanCommand = (home) => script(home);

// Docker items are removed by their own command (there is no Trash for them), so these
// are the only destructive paths; each is confirmed in the UI before it runs.
export async function dockerRemove(real, force = false) {
  const [, kind, ...rest] = String(real).split(':');
  const ref = rest.join(':');
  if (!ref) return { ok: false, err: 'missing reference' };
  const f = force ? '-f ' : '';
  const cmd = kind === 'image' ? `docker image rm ${f}${q(ref)}`
    : kind === 'container' ? `docker rm ${f}${q(ref)}`
      : kind === 'volume' ? `docker volume rm ${q(ref)}`
        : null;
  if (!cmd) return { ok: false, err: 'unsupported' };
  const res = await run(cmd, 30000);
  return { ok: res.code === 0, err: (res.err || res.out || '').trim() };
}
export const dockerPrune = (sub) => sub === 'image' ? 'docker image prune -a'
  : sub === 'container' ? 'docker container prune'
    : sub === 'volume' ? 'docker volume prune'
      : sub === 'buildcache' ? 'docker builder prune'
        : 'docker system prune';

export async function reveal(real) {
  const cmd = OS === 'Darwin' ? `/usr/bin/open -R ${q(real)}` : `xdg-open ${q(real.replace(/\/[^/]+$/, '') || '/')}`;
  return (await run(cmd, 8000)).code === 0;
}
export async function trash(real) {
  const cmd = OS === 'Darwin'
    ? `/usr/bin/osascript -e ${q(`tell application "Finder" to delete (POSIX file "${real}" as alias)`)}`
    : `gio trash -- ${q(real)}`;
  return (await run(cmd, 20000)).code === 0;
}
