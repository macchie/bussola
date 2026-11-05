import test from 'node:test';
import assert from 'node:assert';
import { parseBatteryLinux, parseBatteryMac, parseBatteryWindows, parseThermalLinux, parseLinux, splitBlocks } from '../resources/core/parse.js';
import { digest } from '../resources/core/sampler.js';
import { buildTree, SEP } from '../resources/core/store.js';

const P = '/sys/class/power_supply/BAT0/';
test('Linux: unità in energia', () => {
  const b = parseBatteryLinux([`${P}status:Discharging`, `${P}capacity:80`, `${P}energy_now:40000000`, `${P}energy_full:50000000`, `${P}energy_full_design:60000000`, `${P}power_now:10000000`, `${P}cycle_count:312`]);
  assert.equal(b.level, 0.8);
  assert.equal(b.watts, 10);
  assert.ok(Math.abs(b.health - 5 / 6) < 1e-9);
  assert.equal(b.cycles, 312);
  assert.equal(b.minutes, 240);
  assert.equal(b.unit, 'Wh');
  assert.equal(b.plugged, false);
});
test('Linux: unità in carica elettrica e corrente', () => {
  const b = parseBatteryLinux([`${P}status:Charging`, `${P}capacity:50`, `${P}charge_now:2000000`, `${P}charge_full:4000000`, `${P}charge_full_design:5000000`, `${P}current_now:1000000`, `${P}voltage_now:12000000`]);
  assert.equal(b.watts, 12);
  assert.equal(b.health, 0.8);
  assert.equal(b.unit, 'mAh');
  assert.ok(b.charging && b.plugged);
});
test('Linux senza batteria: nessun dato, nessun errore', () => {
  assert.equal(parseBatteryLinux([]), null);
  assert.equal(parseLinux('===PROC 4096 100\n===STAT\n===BAT\n').battery, null);
  assert.equal(parseThermalLinux(['/sys/x/thermal_zone0/temp:48000', '/sys/x/thermal_zone1/temp:52500']), 52.5);
});

const IOREG = ['+-o AppleSmartBattery  <class AppleSmartBattery>', '    {', '      "CycleCount" = 212', '      "DesignCapacity" = 4382', '      "AppleRawMaxCapacity" = 3944', '      "MaxCapacity" = 100', '      "Voltage" = 12000', '      "InstantAmperage" = 18446744073709549616', '      "Temperature" = 3006', '      "BatteryData" = {', '          "Voltage" = 1', '          "CycleCount" = 9', '        }'];
test('macOS: Apple Silicon, ampere negativi e chiavi annidate', () => {
  const b = parseBatteryMac(IOREG, ["Now drawing from 'Battery Power'", ' -InternalBattery-0 (id=1)\t82%; discharging; 3:20 remaining present: true']);
  assert.equal(b.level, 0.82);
  assert.equal(b.plugged, false);
  assert.equal(b.watts, 24, '2000 mA a 12 V');
  assert.equal(b.cycles, 212);
  assert.ok(Math.abs(b.health - 3944 / 4382) < 1e-9);
  assert.equal(b.temperature, 30.06);
  assert.equal(b.minutes, 200);
});
test('macOS: alimentato, senza stima, o senza batteria', () => {
  const b = parseBatteryMac([], ["Now drawing from 'AC Power'", ' -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining present: true']);
  assert.ok(b.plugged && !b.charging);
  const c = parseBatteryMac([], ["Now drawing from 'Battery Power'", ' -InternalBattery-0 (id=1)\t64%; discharging; (no estimate) present: true']);
  assert.equal(c.level, 0.64);
  assert.equal(c.minutes, undefined);
  assert.equal(parseBatteryMac([], ["Now drawing from 'AC Power'"]), null);
});
test('Windows: valori assenti restano assenti', () => {
  const b = parseBatteryWindows('B\t76\t1\t210\t9500\t0\r\nH\t50000\t45000\t120\r\n');
  assert.deepEqual([b.level, b.plugged, b.watts, b.minutes, b.health, b.cycles], [0.76, false, 9.5, 210, 0.9, 120]);
  const n = parseBatteryWindows('B\t50\t2\t71582788\t\t\r\nH\t\t\t\r\n');
  assert.equal(n.plugged, true);
  assert.equal(n.minutes, undefined);
  assert.equal(n.health, undefined);
  assert.equal(parseBatteryWindows('P\t1\ta\t1\t1\n'), null);
  assert.equal(splitBlocks('B\t1\nEND\n').blocks.length, 1);
});

const ctx = (t) => ({ t, paths: new Map(), bundles: new Map() });
const machine = { cores: 2 };
const proc = (pid, name, cpuMs) => ({ pid, ppid: 1, name, cpuMs, mem: 1 });
test('la potenza si divide per tempo di CPU, solo a batteria', () => {
  const a = digest(null, ctx(0), { procs: [proc(1, 'a', 0), proc(2, 'b', 0)], battery: null }, machine, 'Darwin');
  const prev = { t: 0, cpu: a.cpuMap, sys: null };
  const sample = (battery) => ({ procs: [proc(1, 'a', 3000), proc(2, 'b', 1000)], battery });
  const onBat = digest(prev, ctx(4000), sample({ level: 0.5, plugged: false, watts: 8 }), machine, 'Darwin');
  assert.deepEqual(onBat.entries.map((e) => e.mem), [6, 2]);
  assert.equal(onBat.draw, 8);
  assert.equal(onBat.machine.cpu, 0.5, 'il grafico riceve il livello');
  assert.equal(onBat.machine.mem, 0.5, 'e il carico: 4 s di CPU su 8 disponibili');
  const ac = digest(prev, ctx(4000), sample({ level: 0.5, plugged: true, watts: 30 }), machine, 'Darwin');
  assert.equal(ac.draw, 0, 'la potenza in carica non è il consumo del computer');
  assert.deepEqual(ac.entries.map((e) => e.mem), [0, 0]);
  assert.deepEqual(digest(prev, ctx(4000), sample(null), machine, 'Darwin').entries.map((e) => e.mem), [0, 0]);
});
test('albero per potenza', () => {
  const t = buildTree(new Map([[`A${SEP}a`, [0.1, 3, 1]], [`B${SEP}b`, [0.5, 1, 1]]]), 'mem');
  assert.deepEqual(t.c.map((c) => c.n), ['A', 'B']);
});
