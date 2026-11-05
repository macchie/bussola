import { t as tt, tx } from './comune/i18n.js';
// Mappa radiale su canvas: un anello per livello, a partire dalle ore 12, i più
// pesanti per primi. I segmenti troppo sottili confluiscono nel settore "altri".
const TAU = Math.PI * 2;
const RINGS = 5;
const MIN_SPAN = 0.006;
const HUES = [272, 232, 196, 160, 118, 78, 42, 12, 342, 306];

const easeInOut = (t) => (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class RadialMap {
  constructor(canvas, { onHover, onClick, onContext }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.arcs = [];
    this.rings = [];
    this.view = null;
    this.hover = null;
    this.selected = null;
    this.collected = new Set();
    this.onHover = onHover;
    this.onClick = onClick;
    this.onContext = onContext;
    this.anim = 0;
    new ResizeObserver(() => { this.measure(); this.draw(); }).observe(canvas);
    canvas.addEventListener('mousemove', (e) => this.move(e));
    canvas.addEventListener('mouseleave', () => this.setHover(null));
    canvas.addEventListener('click', (e) => {
      const arc = this.at(e);
      if (arc) onClick(arc);
    });
    canvas.addEventListener('contextmenu', (e) => {
      const arc = this.at(e);
      if (arc && arc.path) { e.preventDefault(); onContext(arc, e); }
    });
    this.measure();
  }

  measure() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.w / 2;
    this.cy = this.h / 2;
    this.R = Math.max(40, Math.min(this.w, this.h) / 2 - 18);
    this.hole = this.R * 0.27;
    this.band = (this.R - this.hole) / RINGS;
    if (this.onMeasure) this.onMeasure(this.hole * 2);
  }

  theme() {
    const css = getComputedStyle(document.documentElement);
    this.bg = css.getPropertyValue('--bg').trim();
    this.dark = css.colorScheme === 'dark';
    this.file = this.dark ? '#59608a' : '#aeb4cc';
    this.other = this.dark ? '#3b4166' : '#cdd1e0';
  }

  tone(hue, ring) {
    const l = (this.dark ? .62 : .56) + ring * .055;
    const c = Math.max(.05, .15 - ring * .018);
    return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${hue.toFixed(1)})`;
  }

  build(view) {
    this.theme();
    const arcs = [];
    const { node, sep } = view;
    const total = node.s + view.hidden || 1;
    const join = (dir, name) => (dir.endsWith(sep) ? dir + name : dir + sep + name);
    const walk = (n, dir, a0, a1, ring, hue) => {
      const scale = (a1 - a0) / (ring === 0 ? total : (n.s || 1));
      let a = a0;
      let tiny = 0;
      let tinyCount = 0;
      (n.c || []).forEach((c, i) => {
        const span = c.s * scale;
        if (span < MIN_SPAN) { tiny += span; tinyCount += c.d ? (c.fc || 0) + 1 : 1; return; }
        const h = ring === 0 ? HUES[i % HUES.length] : hue + ((i % 5) - 2) * 7;
        const path = join(dir, c.n);
        arcs.push({
          a0: a, a1: a + span, ring, node: c, path, hue: h,
          color: c.d ? this.tone(h, ring) : this.file,
        });
        if (c.d && c.c && ring < RINGS - 1) walk(c, path, a, a + span, ring + 1, h);
        a += span;
      });
      const rest = tiny + (n.o ? n.o.size * scale : 0);
      if (rest > 0.0005) {
        arcs.push({
          a0: a, a1: Math.min(a + rest, a1), ring, color: this.other, kind: 'other', parent: dir,
          node: { n: tt('Elementi più piccoli'), s: rest / scale, count: tinyCount + (n.o ? n.o.count : 0) },
        });
      }
      return a + rest;
    };
    const end = walk(node, view.path, 0, TAU, 0, 0);
    if (view.hidden > 0) {
      arcs.push({ a0: end, a1: TAU, ring: 0, kind: 'hidden', color: this.other, node: { n: tt('Spazio non attribuito'), s: view.hidden } });
    }
    return arcs;
  }

  setView(view) {
    const prev = this.view;
    const oldArcs = this.arcs;
    const arcs = this.build(view);
    this.view = view;
    this.arcs = arcs;
    this.index();
    this.setHover(null);
    const sep = view.sep;
    if (!prev || reduced()) {
      const quiet = this.skipIntro;
      this.skipIntro = false;
      if (!prev && !quiet && !reduced()) this.play(650, (t) => this.paint(arcs, (a) => ({ a0: a.a0 * t, a1: a.a1 * t, ring: a.ring, alpha: 1 })));
      else this.draw();
      return;
    }
    if (prev.root === view.root && view.path.startsWith(prev.path.endsWith(sep) ? prev.path : prev.path + sep)) {
      const target = oldArcs.find((a) => a.path === view.path);
      if (target) { this.zoom(oldArcs, target, false); return; }
    }
    if (prev.root === view.root && prev.path.startsWith(view.path.endsWith(sep) ? view.path : view.path + sep)) {
      const target = arcs.find((a) => a.path === prev.path);
      if (target) { this.zoom(arcs, target, true); return; }
    }
    this.draw();
  }

  zoom(arcs, target, reverse) {
    const { a0: A0, a1: A1, ring: R } = target;
    const k = TAU / (A1 - A0 || TAU);
    this.play(320, (raw) => {
      const t = reverse ? 1 - raw : raw;
      this.paint(arcs, (a) => {
        const within = a.ring >= R && a.a0 >= A0 - 1e-9 && a.a1 <= A1 + 1e-9;
        if (!within) return { a0: a.a0, a1: a.a1, ring: a.ring, alpha: (1 - t) ** 2 };
        const ring = a.ring - (R + 1) * t;
        return {
          a0: lerp(a.a0, (a.a0 - A0) * k, t), a1: lerp(a.a1, (a.a1 - A0) * k, t), ring,
          alpha: a.ring === R ? 1 - t : 1,
        };
      });
    });
  }

  play(ms, frame) {
    cancelAnimationFrame(this.anim);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      frame(easeInOut(t));
      if (t < 1) this.anim = requestAnimationFrame(step);
      else { this.anim = 0; this.draw(); }
    };
    this.anim = requestAnimationFrame(step);
  }

  index() {
    this.rings = Array.from({ length: RINGS }, () => []);
    for (const a of this.arcs) this.rings[a.ring].push(a);
  }

  sector(a0, a1, r0, r1) {
    const { ctx, cx, cy } = this;
    const s = a0 - Math.PI / 2;
    const e = a1 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r1, s, e);
    ctx.arc(cx, cy, Math.max(0, r0), e, s, true);
    ctx.closePath();
  }

  hatch() {
    if (this.hatchFor === this.dark) return this.pattern;
    const p = document.createElement('canvas');
    p.width = p.height = 8;
    const c = p.getContext('2d');
    c.strokeStyle = this.other;
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(-2, 10); c.lineTo(10, -2); c.moveTo(-2, 2); c.lineTo(2, -2); c.moveTo(6, 10); c.lineTo(10, 6); c.stroke();
    this.pattern = this.ctx.createPattern(p, 'repeat');
    this.hatchFor = this.dark;
    return this.pattern;
  }

  paint(arcs, map) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.bg;
    for (const a of arcs) {
      const m = map(a);
      const r0 = this.hole + m.ring * this.band;
      const r1 = r0 + this.band;
      if (m.alpha <= 0.01 || r1 <= 0) continue;
      ctx.globalAlpha = m.alpha * (a.path && this.isCollected(a.path) ? .22 : 1);
      this.sector(m.a0, m.a1, r0, r1);
      ctx.fillStyle = a.kind === 'hidden' ? this.hatch() : a.color;
      ctx.fill();
      if (m.a1 - m.a0 > 0.012) ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  isCollected(path) {
    if (this.collected.has(path)) return true;
    const sep = this.view.sep;
    for (const c of this.collected) if (path.startsWith(c + sep)) return true;
    return false;
  }

  draw() {
    if (!this.view || this.anim) return;
    this.theme();
    this.paint(this.arcs, (a) => ({ a0: a.a0, a1: a.a1, ring: a.ring, alpha: 1 }));
    const { ctx } = this;
    if (this.hover) {
      const a = this.hover;
      const r0 = this.hole + a.ring * this.band;
      this.sector(a.a0, a.a1, r0, r0 + this.band);
      ctx.fillStyle = this.dark ? 'rgba(255,255,255,.24)' : 'rgba(255,255,255,.4)';
      ctx.fill();
    }
    const sel = this.selected && this.arcs.find((a) => a.path === this.selected);
    if (sel) {
      const r0 = this.hole + sel.ring * this.band;
      this.sector(sel.a0, sel.a1, r0 + 1, r0 + this.band - 1);
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  at(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - this.cx;
    const y = e.clientY - rect.top - this.cy;
    const r = Math.hypot(x, y);
    if (r < this.hole || r > this.R) return null;
    const ring = Math.min(RINGS - 1, Math.floor((r - this.hole) / this.band));
    let a = Math.atan2(y, x) + Math.PI / 2;
    if (a < 0) a += TAU;
    return (this.rings[ring] || []).find((s) => a >= s.a0 && a < s.a1) || null;
  }

  move(e) {
    const arc = this.at(e);
    this.setHover(arc);
    this.canvas.style.cursor = arc && arc.node.d ? 'pointer' : 'default';
    this.canvas.draggable = !!(arc && arc.path);
  }

  setHover(arc) {
    if (arc === this.hover) return;
    this.hover = arc;
    this.draw();
    this.onHover(arc);
  }

  hoverPath(path) {
    this.setHover(path ? this.arcs.find((a) => a.path === path) || null : null);
  }

  colorOf(path) {
    const arc = this.arcs.find((a) => a.path === path);
    return arc ? arc.color : null;
  }
}
