export const OS = globalThis.NL_OS;
export const SUPPORTED = OS === 'Darwin' || OS === 'Linux';
export const NETTOP_COMMAND = '/usr/bin/nettop -L 1';
export const PS_COMMAND = '/bin/ps -axo pid=,comm=';
// A single run: connections, interface counters, executables.
export const LINUX_COMMAND = `sh -c 'echo ===SS; ss -Htinp || echo SSMISSING; echo ===DEV; cat /proc/net/dev; echo ===EXE; ls -l /proc/[0-9]*/exe 2>/dev/null; exit 0'`;
const N = () => globalThis.Neutralino;
const handlers = new Map();
const early = new Map();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  N().events.on('spawnedProcess', ({ detail }) => {
    const h = handlers.get(detail.id);
    if (h) h(detail);
    else {
      if (!early.has(detail.id)) early.set(detail.id, []);
      early.get(detail.id).push(detail);
    }
  });
}

export async function run(command, timeoutMs = 15000) {
  listen();
  const { id } = await N().os.spawnProcess(command);
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const timer = setTimeout(() => N().os.updateSpawnedProcess(id, 'exit').catch(() => {}), timeoutMs);
    const onEvent = (d) => {
      if (d.action === 'stdOut') out += d.data;
      else if (d.action === 'stdErr') err += d.data;
      else if (d.action === 'exit') {
        clearTimeout(timer);
        handlers.delete(id);
        resolve({ code: d.data, out, err });
      }
    };
    handlers.set(id, onEvent);
    for (const d of early.get(id) || []) onEvent(d);
    early.delete(id);
  });
}
export const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
