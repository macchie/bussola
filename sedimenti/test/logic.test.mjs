import test from 'node:test';
import assert from 'node:assert';
import { classify, SAFE, CAUTION, CAREFUL } from '../resources/core/classify.js';
import { parseScan, parseDocker, parseVolumes, humanToBytes } from '../resources/core/scan.js';
import { buildTree, summary, ROOT } from '../resources/core/tree.js';

const H = '/home/u';

test('classify sorts paths into category and safety', () => {
  assert.deepEqual(classify(`${H}/.cache/google-chrome`, H), { category: 'caches', safety: SAFE, name: 'google-chrome' });
  assert.deepEqual(classify(`${H}/Library/Caches/com.apple.Safari`, H), { category: 'caches', safety: SAFE, name: 'com.apple.Safari' });
  assert.deepEqual(classify(`${H}/.npm`, H), { category: 'packages', safety: SAFE, name: 'npm' });
  assert.deepEqual(classify(`${H}/.m2/repository`, H), { category: 'packages', safety: SAFE, name: 'repository' });
  assert.deepEqual(classify(`${H}/code/proj/node_modules`, H), { category: 'node_modules', safety: CAUTION, name: 'proj' });
  assert.deepEqual(classify(`${H}/.local/share/Trash`, H), { category: 'trash', safety: SAFE, name: 'Trash' });
  assert.deepEqual(classify(`${H}/.Trash`, H), { category: 'trash', safety: SAFE, name: 'Trash' });
  assert.equal(classify(`${H}/.local/share/odd-leftover`, H).category, 'leftovers');
  assert.equal(classify(`${H}/.local/share/odd-leftover`, H).safety, CAUTION);
});

test('docker items get a safety by type', () => {
  assert.deepEqual(classify('docker:buildcache', H), { category: 'docker', safety: SAFE, name: 'buildcache' });
  assert.deepEqual(classify('docker:image:abc123', H), { category: 'docker', safety: CAUTION, name: 'image:abc123' });
  assert.deepEqual(classify('docker:container:c1', H), { category: 'docker', safety: CAUTION, name: 'container:c1' });
  assert.deepEqual(classify('docker:volume:pgdata', H), { category: 'docker', safety: CAREFUL, name: 'volume:pgdata' });
});

test('humanToBytes reads docker sizes', () => {
  assert.equal(humanToBytes('3.1GB'), 3.1e9);
  assert.equal(humanToBytes('400MB'), 400e6);
  assert.equal(humanToBytes('512kB'), 512e3);
  assert.equal(humanToBytes('0B'), 0);
});

const DOCKER = `===DOCKER===
abc123def456|nginx|latest|187MB|0
0a0a0a0a0a0a|<none>|<none>|50MB|1
===CONTAINERS===
c1c1c1c1c1c1|web|nginx:latest|1.2kB (virtual 187MB)|running
===VOLUMES===
Images space usage:

REPOSITORY   TAG   IMAGE ID   SIZE
nginx        latest abc123    187MB

Local Volumes space usage:

VOLUME NAME   LINKS     SIZE
pgdata        2         1.2GB
scratch       0         0B

Build cache usage:

CACHE ID   CACHE TYPE   SIZE
x1y2z3     regular      100MB
===BUILD===
Images|3.1GB (59%)
Containers|0B
Local Volumes|1.2GB
Build Cache|2.2GB`;

test('parseScan reads du lines and the docker per-item sections', () => {
  const out = `12000\t${H}/.cache/chrome/\n5000\t${H}/.npm\n8000\t${H}/code/p/node_modules\n` + DOCKER;
  const items = parseScan(out);
  assert.deepEqual(items.map((i) => i.path), [
    `${H}/.cache/chrome`, `${H}/.npm`, `${H}/code/p/node_modules`,
    'docker:image:abc123def456', 'docker:image:0a0a0a0a0a0a',
    'docker:container:c1c1c1c1c1c1',
    'docker:volume:pgdata', 'docker:volume:scratch',
    'docker:buildcache',
  ]);
  assert.equal(items[0].bytes, 12000 * 1024); // kB from du -> bytes
  const img = items.find((i) => i.path === 'docker:image:abc123def456');
  assert.deepEqual([img.name, img.bytes, img.use], ['nginx:latest', 187e6, 0]);
  assert.equal(items.find((i) => i.path === 'docker:image:0a0a0a0a0a0a').name, '0a0a0a0a0a0a');
  const con = items.find((i) => i.sub === 'container');
  assert.deepEqual([con.name, con.state, con.bytes], ['web', 'running', 1200]);
  assert.equal(items.find((i) => i.path === 'docker:buildcache').bytes, 2.2e9);
});

test('parseVolumes ignores other sections of docker system df -v', () => {
  const vols = parseVolumes(DOCKER.split('===VOLUMES===')[1].split('===BUILD===')[0].split('\n'));
  assert.deepEqual(vols.map((v) => [v.name, v.bytes, v.use]), [['pgdata', 1.2e9, 2], ['scratch', 0, 0]]);
});

test('buildTree groups by category, with docker drilling into per-item subgroups', () => {
  const tree = buildTree([
    { path: `${H}/.cache/a`, bytes: 100 },
    { path: `${H}/.cache/b`, bytes: 300 },
    { path: `${H}/x/node_modules`, bytes: 50 },
    { path: 'docker:image:abc', bytes: 9000, name: 'nginx:latest', sub: 'image', use: 0 },
    { path: 'docker:volume:data', bytes: 400, name: 'data', sub: 'volume', use: 1 },
  ], H);
  assert.equal(tree.n, ROOT);
  assert.equal(tree.s, 9850);
  const caches = tree.c.find((c) => c.cat === 'caches');
  assert.deepEqual(caches.c.map((i) => i.n), ['b', 'a']); // size desc
  assert.equal(caches.c[0].real, `${H}/.cache/b`);
  assert.ok(tree.c.every((c) => c.s > 0));
  const docker = tree.c.find((c) => c.cat === 'docker');
  assert.equal(docker.d, true);
  const images = docker.c.find((c) => c.sub === 'image');
  assert.deepEqual([images.n, images.d, images.c[0].real], ['Images', true, 'docker:image:abc']);
  const volumes = docker.c.find((c) => c.sub === 'volume');
  assert.equal(volumes.safety, CAREFUL);
});

test('summary totals bytes and counts per safety level', () => {
  const tree = buildTree([{ path: `${H}/.cache/a`, bytes: 100 }, { path: `${H}/x/node_modules`, bytes: 400 }], H);
  const s = summary(tree);
  assert.deepEqual(s.counts, [1, 1, 0]);
  assert.deepEqual(s.bytes, [100, 400, 0]);
});
