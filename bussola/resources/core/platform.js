export const OS = globalThis.NL_OS;
const N = () => globalThis.Neutralino;
const handlers = new Map();
const early = new Map();
let listening = false;
let seq = 0;

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

// Lancia un comando e consegna stdout a blocchi man mano che arriva.
export async function spawn(command, { onOut, onExit }) {
  listen();
  const { id } = await N().os.spawnProcess(command);
  let err = '';
  const onEvent = (d) => {
    if (d.action === 'stdOut') onOut(d.data);
    else if (d.action === 'stdErr') err += d.data;
    else if (d.action === 'exit') { handlers.delete(id); onExit(d.data, err); }
  };
  handlers.set(id, onEvent);
  for (const d of early.get(id) || []) onEvent(d);
  early.delete(id);
  return id;
}
export const kill = (id) => N().os.updateSpawnedProcess(id, 'exit').catch(() => {});

export function run(command) {
  return new Promise((resolve, reject) => {
    let out = '';
    spawn(command, { onOut: (d) => { out += d; }, onExit: (code, err) => resolve({ code, out, err }) }).catch(reject);
  });
}

// Scrive uno script temporaneo e restituisce il comando che lo avvia.
export async function scriptCommand(body) {
  const temp = (await N().os.getPath('temp')).replace(/[\\/]$/, '');
  const win = OS === 'Windows';
  const file = `${temp}${win ? '\\' : '/'}bussola-${Date.now()}-${++seq}${win ? '.ps1' : '.sh'}`;
  await N().filesystem.writeFile(file, (win ? '\uFEFF' : '') + body);
  const command = win
    ? `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${file}"`
    : `/bin/sh ${quoteSh(file)}`;
  return { command, file };
}
export const quoteSh = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
export const quotePs = (s) => `'${s.replace(/'/g, "''")}'`;

export async function runScript(body, onOut) {
  const { command, file } = await scriptCommand(body);
  return new Promise((resolve, reject) => {
    let out = '';
    spawn(command, {
      onOut: (d) => { out += d; onOut?.(d); },
      onExit: (code, err) => { globalThis.Neutralino.filesystem.remove(file).catch(() => {}); resolve({ code, out, err }); },
    }).catch(reject);
  });
}
