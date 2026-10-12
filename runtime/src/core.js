// Core state, math, hand-drawn path primitives.
// Everything draws into the global context S.ctx in LOGICAL coordinates
// (1920x1080 landscape / 1080x1920 portrait). Pixel scaling is handled by main.js.

export const S = {
  W: 1920, H: 1080, portrait: false, scale: 1,
  fps: 12, tick: 0, btick: 0, now: 0, // tick = render frame, btick = 12fps boil frame
  jitter: 1, boil: 1, motion: 1,
  ctx: null, deck: null, theme: null,
  hideText: false, report: null, curId: null,
  images: {}, models: {},
};

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (t, a, b) => (b <= a ? (t >= a ? 1 : 0) : clamp((t - a) / (b - a)));
export const quant = (t) => Math.floor(t * S.fps) / S.fps;
export const deg = (d) => (d || 0) * Math.PI / 180;

export const E = {
  linear: (x) => x,
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  // stronger overshoot than the textbook outBack: "sticker pop"
  outBack: (x) => 1 + 3.2 * Math.pow(x - 1, 3) + 2.2 * Math.pow(x - 1, 2),
  outElastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
};

// deterministic hash in [0,1)
export const hash = (x) => { const t = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return t - Math.floor(t); };

// "line boil": changes every tick (12fps) but is stable within a tick
export const jit = (a, b, amp) =>
  (hash(a * 131.7 + b * 7.13 + S.btick * 17.31 * S.boil) - 0.5) * 2 * amp * S.jitter;

export function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function color(c) {
  if (!c) return S.theme.ink;
  const t = S.theme;
  return (t.palette && t.palette[c]) || t[c] || c;
}

// ---------- path primitives ----------
export function smoothClosed(pts) {
  const p = new Path2D(), n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const s = mid(pts[n - 1], pts[0]);
  p.moveTo(s[0], s[1]);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], m = mid(a, b);
    p.quadraticCurveTo(a[0], a[1], m[0], m[1]);
  }
  p.closePath();
  return p;
}

// wobbly ellipse ("blob")
export function blobPath(x, y, rx, ry, seed = 1, amt = 0.04, n = 20, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rot;
    const d = 1 + jit(seed, i, amt) + Math.sin(a * 3 + seed) * amt * 0.6;
    pts.push([x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d]);
  }
  return smoothClosed(pts);
}

// polyline trimmed to fraction p of its arc length -> [Path2D, endPoint]
export function trimPath(pts, p, closed = false) {
  const q = closed ? [...pts, pts[0]] : pts;
  const acc = [0];
  for (let i = 1; i < q.length; i++) acc.push(acc[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]));
  const L = acc[acc.length - 1] * clamp(p);
  const path = new Path2D();
  path.moveTo(q[0][0], q[0][1]);
  let end = q[0];
  for (let i = 1; i < q.length; i++) {
    if (acc[i] <= L) { path.lineTo(q[i][0], q[i][1]); end = q[i]; }
    else {
      const f = (L - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
      end = [lerp(q[i - 1][0], q[i][0], f), lerp(q[i - 1][1], q[i][1], f)];
      path.lineTo(end[0], end[1]);
      break;
    }
  }
  return [path, end];
}

export function stroke(path, w = 5, c = null, alpha = 1) {
  const x = S.ctx;
  x.save(); x.globalAlpha *= alpha; x.strokeStyle = color(c); x.lineWidth = w;
  x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke(path); x.restore();
}
export function fill(path, c, alpha = 1) {
  const x = S.ctx;
  x.save(); x.globalAlpha *= alpha; x.fillStyle = color(c); x.fill(path); x.restore();
}
// flat sticker with offset drop shadow
export function sticker(path, c, { shadow = 0.16, dx = 8, dy = 10, outline = 0 } = {}) {
  const x = S.ctx;
  if (shadow > 0) { x.save(); x.translate(dx, dy); fill(path, inkA(shadow)); x.restore(); }
  fill(path, c);
  if (outline) stroke(path, outline);
}
export function inkA(a) {
  const h = color('ink').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function withT(x, y, rot, sc, fn) {
  const c = S.ctx; c.save(); c.translate(x, y); c.rotate(rot || 0); c.scale(sc, sc); fn(); c.restore();
}

// report helper for QA
export function reportBox(kind, x, y, w, h, extra = {}) {
  if (!S.report) return;
  S.report.push({ id: S.curId, kind, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), ...extra });
}
