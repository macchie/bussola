// The only place that launches processes. Paths never go through the command line:
// end up, quoted, in a temporary script, so there's no need for the
// cmd.exe escaping.
import { quoteSh, quotePs, join } from './paths.js';

export const OS = globalThis.NL_OS;
export const windows = OS === 'Windows';
export const sep = windows ? '\\' : '/';
export const q = windows ? quotePs : quoteSh;
const N = () => globalThis.Neutralino;

const handlers = new Map();
const early = new Map();
let listening = false;
let seq = 0;
let temp = null;

async function tempDir() {
  if (!temp) temp = (await N().os.getPath('temp')).replace(/[\\/]$/, '');
  return temp;
}
export const tempFile = async (ext) => join(await tempDir(), `stiva-${Date.now()}-${++seq}${ext}`, sep);

function listen() {
  if (listening) return;
  listening = true;
  N().events.on('spawnedProcess', ({ detail }) => {
    const handler = handlers.get(detail.id);
    if (handler) handler(detail);
    else {
      if (!early.has(detail.id)) early.set(detail.id, []);
      early.get(detail.id).push(detail);
    }
  });
}

// Launches a script and returns { id, exited }. exited resolves with { code, out, err }.
export async function spawn(body) {
  listen();
  const file = await tempFile(windows ? '.ps1' : '.sh');
  const prelude = windows
    ? '﻿[Console]::OutputEncoding=[Text.Encoding]::UTF8\n$ErrorActionPreference="Stop"\n'
    : '';
  await N().filesystem.writeFile(file, prelude + body);
  const command = windows
    ? `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${file}"`
    : `/bin/sh ${quoteSh(file)}`;
  const { id } = await N().os.spawnProcess(command);
  const exited = new Promise((resolve) => {
    let out = '';
    let err = '';
    const onEvent = (d) => {
      if (d.action === 'stdOut') out += d.data;
      else if (d.action === 'stdErr') err += d.data;
      else if (d.action === 'exit') {
        handlers.delete(id);
        N().filesystem.remove(file).catch(() => {});
        resolve({ code: d.data, out, err });
      }
    };
    handlers.set(id, onEvent);
    for (const d of early.get(id) || []) onEvent(d);
    early.delete(id);
  });
  return { id, exited };
}

export async function run(body) {
  const { exited } = await spawn(body);
  return exited;
}

export const kill = (id) => N().os.updateSpawnedProcess(id, 'exit').catch(() => {});

// The command that writes a folder's listing to outFile.
export function scanScript(root, outFile, errFile, scanner) {
  if (windows) {
    return `Add-Type -TypeDefinition @'\n${scanner}\n'@\n[StivaScan]::Run(${q(root)}, ${q(outFile)}, ${q(errFile)})\n`;
  }
  return `exec du -akx ${q(root)} > ${q(outFile)} 2> ${q(errFile)}\n`;
}

export function removeScript(target) {
  if (windows) {
    // rmdir doesn't follow junctions and removes read-only files too.
    return `$env:STIVA_TARGET = ${q(target)}\n& cmd.exe /d /c 'rmdir /s /q "%STIVA_TARGET%"'\nif (Test-Path -LiteralPath ${q(target)}) { exit 1 }\n`;
  }
  // find doesn't follow links: it only unlocks real read-only folders.
  return `rm -rf ${q(target)} 2>/dev/null || { find ${q(target)} -type d -exec chmod u+rwx {} + 2>/dev/null; rm -rf ${q(target)}; }\n[ ! -e ${q(target)} ]\n`;
}

export function revealScript(target, parent) {
  if (windows) return `Start-Process explorer.exe -ArgumentList ('/select,"' + ${q(target)} + '"')\n`;
  if (OS === 'Darwin') return `open -R ${q(target)}\n`;
  return `xdg-open ${q(parent)}\n`;
}
