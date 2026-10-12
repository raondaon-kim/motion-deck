import { S, E, clamp, lerp, jit, color, blobPath, smoothClosed, trimPath, stroke, fill, sticker, withT, inkA } from './core.js';

// Every sticker: (x, y, size, seed, color, scale) — scale 0 = hidden. Drawn with ink outline.
export const STICKERS = {
  star(x, y, r, seed, c = 'butter', sc = 1, rot = 0) {
    if (sc <= 0) return;
    withT(x, y, rot + jit(seed, 9, 0.08), sc, () => {
      const p = new Path2D();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2, d = (i % 2 ? r * 0.45 : r) * (1 + jit(seed, i, 0.08));
        i ? p.lineTo(Math.cos(a) * d, Math.sin(a) * d) : p.moveTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      p.closePath(); fill(p, c); stroke(p, 4);
    });
  },
  sparkle(x, y, r, seed, c = 'ink', sc = 1, rot = 0) {
    if (sc <= 0) return;
    withT(x, y, rot + jit(seed, 1, 0.1), sc, () => {
      const p = new Path2D();
      p.moveTo(0, -r); p.quadraticCurveTo(0, 0, r, 0); p.quadraticCurveTo(0, 0, 0, r);
      p.quadraticCurveTo(0, 0, -r, 0); p.quadraticCurveTo(0, 0, 0, -r); p.closePath(); fill(p, c);
    });
  },
  cloud(x, y, r, seed, c = '#ffffff', sc = 1) {
    if (sc <= 0) return;
    withT(x, y, 0, sc, () => {
      const p = new Path2D();
      [[-0.9, 0, 0.55], [-0.3, -0.35, 0.7], [0.45, -0.2, 0.6], [1, 0.08, 0.45], [0, 0.2, 0.6]].forEach(([a, b, d], i) =>
        p.addPath(blobPath(a * r, b * r, d * r, d * r * 0.9, seed + i, 0.03, 12)));
      S.ctx.save(); S.ctx.translate(6, 8); fill(p, inkA(0.12)); S.ctx.restore();
      fill(p, c); stroke(p, 3.5, inkA(0.5));
    });
  },
  sun(x, y, r, seed, c = 'tomato', sc = 1) {
    if (sc <= 0) return;
    withT(x, y, S.tick * (12 / S.fps) * 0.05 * S.motion, sc, () => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, p = new Path2D();
        p.moveTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2);
        p.lineTo(Math.cos(a) * r * (1.5 + jit(seed, i, 0.08)), Math.sin(a) * r * (1.5 + jit(seed, i, 0.08)));
        stroke(p, 5, c);
      }
      const b = blobPath(0, 0, r, r, seed, 0.03, 18); fill(b, c); stroke(b, 4);
    });
  },
  moon(x, y, r, seed, c = 'butter', sc = 1) {
    if (sc <= 0) return;
    withT(x, y, -0.3 + jit(seed, 2, 0.05), sc, () => {
      const p = new Path2D();
      p.arc(0, 0, r, Math.PI * 0.35, Math.PI * 1.65, false);
      p.bezierCurveTo(-r * 0.2, -r * 0.55, -r * 0.2, r * 0.55, Math.cos(Math.PI * 0.35) * r, Math.sin(Math.PI * 0.35) * r);
      p.closePath(); fill(p, c); stroke(p, 4);
    });
  },
  heart(x, y, r, seed, c = 'pink', sc = 1) {
    if (sc <= 0) return;
    withT(x, y, jit(seed, 3, 0.06), sc, () => {
      const p = new Path2D();
      p.moveTo(0, r * 0.9);
      p.bezierCurveTo(-r * 1.3 + jit(seed, 4, 3), r * 0.1, -r * 0.9, -r * 1.0, 0, -r * 0.35);
      p.bezierCurveTo(r * 0.9, -r * 1.0, r * 1.3 + jit(seed, 5, 3), r * 0.1, 0, r * 0.9);
      p.closePath(); sticker(p, c, { dx: 5, dy: 6, shadow: 0.14 }); stroke(p, 4);
    });
  },
  feather(x, y, len, seed, c = 'paper2', sc = 1, rot = 0.3) {
    if (sc <= 0) return;
    withT(x, y, rot, sc, () => {
      const o = len * 0.2, l = (k) => jit(seed, k, len * 0.012), p = new Path2D();
      p.moveTo(0, -len * 0.12);
      p.bezierCurveTo(-o * 1.25 + l(1), -len * 0.3, -o * 1.1 + l(2), -len * 0.8, 0, -len);
      p.bezierCurveTo(o * 1.05 + l(3), -len * 0.78, o * 1.2 + l(4), -len * 0.32, 0, -len * 0.12);
      p.closePath(); sticker(p, c, { dx: 5, dy: 6, shadow: 0.14 }); stroke(p, 3.5);
      const q = new Path2D(); q.moveTo(0, len * 0.08); q.quadraticCurveTo(o * 0.15 + l(6), -len * 0.5, 0, -len * 0.97); stroke(q, 3.5);
    });
  },
  dot(x, y, r, seed, c = 'ink', sc = 1) {
    if (sc <= 0) return;
    withT(x, y, 0, sc, () => fill(blobPath(0, 0, r, r, seed, 0.06, 10), c));
  },
  flower(x, y, r, seed, c = 'pink', sc = 1) {
    if (sc <= 0) return;
    withT(x, y, S.tick * (12 / S.fps) * 0.02 * S.motion + seed, sc, () => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2, b = blobPath(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, r * 0.45, r * 0.45, seed + i, 0.05, 10);
        fill(b, c); stroke(b, 3.5);
      }
      const m = blobPath(0, 0, r * 0.32, r * 0.32, seed, 0.05, 10); fill(m, 'butter'); stroke(m, 3.5);
    });
  },
};

// ---------- line decorations (p = draw-on progress) ----------
export function squiggle(x, y, w, amp, seed, p, c = 'accent', lw = 6, waves = 3) {
  if (p <= 0) return;
  const pts = [];
  for (let i = 0; i <= 40; i++) { const h = i / 40; pts.push([x + h * w + jit(seed, i, 1.5), y + Math.sin(h * Math.PI * 2 * waves) * amp + jit(seed + 1, i, 1.5)]); }
  stroke(trimPath(pts, p)[0], lw, c);
}
export function underline(x, y, w, seed, p, c = 'accent', lw = 7) {
  if (p <= 0) return;
  const pts = [];
  for (let i = 0; i <= 24; i++) { const h = i / 24; pts.push([x + h * w + jit(seed, i, 1.2), y + Math.sin(h * 3 + seed) * 4 + jit(seed + 1, i, 1.2)]); }
  stroke(trimPath(pts, p)[0], lw, c);
}
// circling scribble around a point (e.g. highlight a lens)
export function scribble(x, y, r, seed, p, c = 'accent', lw = 6) {
  if (p <= 0) return;
  const pts = [];
  for (let i = 0; i <= 70; i++) {
    const u = i / 70, a = -Math.PI * 0.6 + u * Math.PI * 2 * 1.15, rr = r * (1 + 0.06 * Math.sin(u * 9 + seed) + u * 0.06);
    pts.push([x + Math.cos(a) * rr + jit(seed, i, 1.8), y + Math.sin(a) * rr * 0.92 + jit(seed + 2, i, 1.8)]);
  }
  stroke(trimPath(pts, p)[0], lw, c);
}
export function arrow(x1, y1, x2, y2, bend, seed, p, c = 'ink', lw = 5) {
  if (p <= 0) return;
  const cx = (x1 + x2) / 2 - (y2 - y1) * bend, cy = (y1 + y2) / 2 + (x2 - x1) * bend, pts = [];
  for (let i = 0; i <= 30; i++) {
    const m = i / 30, a = (1 - m) * (1 - m), b = 2 * (1 - m) * m, d = m * m;
    pts.push([a * x1 + b * cx + d * x2 + jit(seed, i, 1.2), a * y1 + b * cy + d * y2 + jit(seed + 1, i, 1.2)]);
  }
  const [path, end] = trimPath(pts, p); stroke(path, lw, c);
  if (p > 0.95) {
    const prev = pts[27], ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]), h = new Path2D();
    h.moveTo(end[0] - Math.cos(ang - 0.5) * 26, end[1] - Math.sin(ang - 0.5) * 26); h.lineTo(end[0], end[1]);
    h.lineTo(end[0] - Math.cos(ang + 0.5) * 26, end[1] - Math.sin(ang + 0.5) * 26); stroke(h, lw, c);
  }
}
// leader line with ringed dot at the target end
export function leader(x1, y1, x2, y2, seed, p, c = 'ink') {
  if (p <= 0) return;
  const pts = [];
  for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push([lerp(x1, x2, u) + jit(seed, i, 1.4), lerp(y1, y2, u) + jit(seed + 1, i, 1.4)]); }
  stroke(trimPath(pts, p)[0], 3.5, c);
  if (p >= 1) {
    const x = S.ctx; x.fillStyle = color(c); x.beginPath(); x.arc(x2, y2, 8 + jit(seed, 30, 1), 0, 7); x.fill();
    x.fillStyle = color('paper2'); x.beginPath(); x.arc(x2, y2, 3.5, 0, 7); x.fill();
  }
}
// halftone dot shadow (under floating objects)
export function halftone(x, y, rx, ry, alpha = 0.3) {
  const c = S.ctx; c.save(); c.globalAlpha *= alpha; c.fillStyle = color('ink');
  const g = 11;
  for (let b = -ry; b <= ry; b += g) for (let a = -rx; a <= rx; a += g) {
    const l = (a * a) / (rx * rx) + (b * b) / (ry * ry); if (l > 1) continue;
    c.beginPath(); c.arc(x + a + (Math.floor(b / g) % 2 ? g / 2 : 0), y + b, 4.2 * (1 - l), 0, 7); c.fill();
  }
  c.restore();
}

// hand-drawn rounded rect (corners wobble a little; fixed unless boil is on)
export function roundBox(x, y, w, h, r, seed) {
  // hand-drawn rounded rect: corners wobble a little but stay fixed unless boil is on
  const p = new Path2D(), j = (k) => jit(seed, k, 3);
  p.moveTo(x + r + j(1), y + j(2));
  p.lineTo(x + w - r + j(3), y + j(4)); p.quadraticCurveTo(x + w + j(5), y + j(6), x + w + j(7), y + r + j(8));
  p.lineTo(x + w + j(9), y + h - r + j(10)); p.quadraticCurveTo(x + w + j(11), y + h + j(12), x + w - r + j(13), y + h + j(14));
  p.lineTo(x + r + j(15), y + h + j(16)); p.quadraticCurveTo(x + j(17), y + h + j(18), x + j(19), y + h - r + j(20));
  p.lineTo(x + j(21), y + r + j(22)); p.quadraticCurveTo(x + j(23), y + j(24), x + r + j(1), y + j(2));
  p.closePath();
  return p;
}
