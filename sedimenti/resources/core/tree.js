// Builds the ring-map tree from scanned items, grouped by category and coloured by safety.
import { classify, CATEGORIES, CAUTION, CAREFUL } from './classify.js';

export const SEP = '/';
export const ROOT = 'Sediments';

// Docker items drill one level deeper, so each image/container/volume can be acted on alone.
const DOCKER_SUB = {
  image: { label: 'Images', safety: CAUTION, order: 0 },
  container: { label: 'Containers', safety: CAUTION, order: 1 },
  volume: { label: 'Local Volumes', safety: CAREFUL, order: 2 },
};
const total = (list) => list.reduce((t, c) => t + c.s, 0);

function dockerCategory(items) {
  const subs = new Map();
  let buildCache = null;
  for (const it of items) {
    const { safety } = classify(it.path, '');
    const leaf = { n: it.name || it.path.slice(7), s: it.bytes || 0, safety, d: false, real: it.path, state: it.state, use: it.use };
    if (it.sub === 'buildcache') { if (it.bytes > 0) buildCache = leaf; continue; }
    if (!subs.has(it.sub)) subs.set(it.sub, []);
    subs.get(it.sub).push(leaf);
  }
  const children = [];
  for (const [sub, leaves] of subs) {
    const meta = DOCKER_SUB[sub] || { label: sub, safety: CAUTION, order: 9 };
    leaves.sort((a, b) => b.s - a.s);
    children.push({ n: meta.label, sub, s: total(leaves), safety: meta.safety, d: true, c: leaves, order: meta.order });
  }
  children.sort((a, b) => a.order - b.order);
  if (buildCache) children.push(buildCache);
  return { n: CATEGORIES.docker.label, cat: 'docker', s: total(children), safety: CATEGORIES.docker.safety, d: true, c: children };
}

// items: [{ path, bytes }]. Real filesystem paths are kept on each leaf as `real` for actions;
// the map navigates by synthetic Sediments/<category>/<name> paths.
export function buildTree(items, home = '') {
  const groups = new Map();
  const docker = [];
  for (const it of items || []) {
    if (!it) continue;
    if (String(it.path).startsWith('docker:')) { docker.push(it); continue; }
    if (!(it.bytes > 0)) continue;
    const { category, safety, name } = classify(it.path, home);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push({ n: name, s: it.bytes, safety, d: false, real: it.path });
  }
  const cats = [];
  for (const [cat, children] of groups) {
    children.sort((a, b) => b.s - a.s);
    cats.push({ n: CATEGORIES[cat].label, cat, s: total(children), safety: CATEGORIES[cat].safety, d: true, c: children });
  }
  if (docker.length) { const node = dockerCategory(docker); if (node.c.length) cats.push(node); }
  cats.sort((a, b) => CATEGORIES[a.cat].order - CATEGORIES[b.cat].order);
  return { n: ROOT, s: total(cats), c: cats, d: true };
}

// Totals per safety level for the legend — walks to the leaves at any depth.
export function summary(tree) {
  const bytes = [0, 0, 0];
  const counts = [0, 0, 0];
  const walk = (n) => { for (const c of n.c || []) { if (c.d) walk(c); else { bytes[c.safety] += c.s; counts[c.safety]++; } } };
  walk(tree);
  return { bytes, counts };
}
