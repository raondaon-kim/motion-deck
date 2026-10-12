// Declarative slide elements -> timed render items.
import { S, E, clamp, lerp, prog, quant, deg, color, jit, blobPath, sticker, stroke, fill, withT, reportBox, inkA } from './core.js';
import { font, fontPx, measure, wrap, wrapBalanced, text, animText } from './text.js';
import { STICKERS, squiggle, underline, scribble, arrow, leader, halftone } from './shapes.js';
import * as T3 from './three-layer.js';
import { DIAGRAMS } from './diagrams.js';

// ---------- layouts: text column + visual zone, per orientation ----------
// col: [x, width]; vis: [x, y, w, h] (landscape coords of visuals map into P.vis in portrait)
export const LAYOUTS = {
  'text-left':  { L: { col: [120, 760], vis: [880, 0, 1040, 1080] }, P: { col: [80, 920], vis: [0, 840, 1080, 1080] } },
  'text-right': { L: { col: [1060, 760], vis: [0, 0, 1000, 1080] }, P: { col: [80, 920], vis: [0, 840, 1080, 1080] } },
  hero:         { L: { col: [140, 860], vis: [900, 0, 1020, 1080], hero: true }, P: { col: [80, 920], vis: [0, 840, 1080, 1080], hero: true } },
  center:       { L: { col: [260, 1400], align: 'center', vis: [0, 0, 1920, 1080] }, P: { col: [80, 920], align: 'center', valign: 'center', vis: [0, 0, 1080, 1920] } },
  top:          { L: { col: [160, 1600], align: 'center', valign: 'top', vis: [0, 330, 1920, 750] }, P: { col: [80, 920], align: 'center', valign: 'top', vis: [0, 620, 1080, 1300] } },
  full:         { L: { col: null, vis: [0, 0, 1920, 1080] }, P: { col: null, vis: [0, 0, 1080, 1920] } },
};
const lay = (s) => LAYOUTS[s.layout || 'text-left'] || LAYOUTS['text-left'];
const Z = (L) => (S.portrait ? L.P : L.L);

const SIZE_KEYS = ['r', 'rx', 'ry', 'size', 'w', 'height', 'len', 'amp', 'dx', 'dy', 'ring'];
// resolve element props for current orientation (landscape coords mapped into portrait visual zone)
function eff(el, L) {
  if (!S.portrait) return el;
  const a = L.L.vis, b = L.P.vis, s = Math.min(b[2] / a[2], b[3] / a[3]);
  // uniform scale about the zone centers: keeps the composition, never stretches it
  const mp = ([x, y]) => [b[0] + b[2] / 2 + (x - a[0] - a[2] / 2) * s, b[1] + b[3] / 2 + (y - a[1] - a[3] / 2) * s];
  const o = { ...el };
  if (el.x != null && el.y != null) [o.x, o.y] = mp([el.x, el.y]);
  for (const k of ['from', 'to']) if (Array.isArray(el[k])) o[k] = mp(el[k]);
  if (Array.isArray(el.target)) o.target = mp(el.target);
  for (const k of SIZE_KEYS) if (typeof el[k] === 'number') o[k] = el[k] * s;
  return { ...o, ...(el.p || {}) };
}

// ---------- text stack blocks ----------
// each returns {h, draw(t)} given (el, x, y, cw, align); y = top of block
const BLOCKS = {
  kicker(el, x, y, cw, al) {
    const f = font('display', el.size || S.theme.type.kicker, 500), px = fontPx(f);
    return { h: px, dur: 0.45, draw: (t, p) => animText(el.anim || 'rise', el.text, x, y + px * 0.85, p, { font: f, track: el.track ?? 8, align: al, alpha: 0.85, color: el.color }) };
  },
  title(el, x, y, cw, al, ctx) {
    const size = el.size || (ctx.hero ? 120 : 84), f = font(el.role || 'body', size, el.weight || 700), track = el.track ?? 1;
    const lines = Array.isArray(el.lines) ? el.lines : wrapBalanced(el.text || '', f, cw, track);
    const lh = size * (el.lh || 1.24), acc = [].concat(el.accent ?? []);
    const n = lines.length, stag = 0.38, lastAcc = Math.max(-1, ...acc.filter((k) => k < n));
    return {
      h: n * lh - (lh - size), dur: stag * (n - 1) + 0.55 + (el.mark ? 0.45 : 0),
      draw: (t, p, local) => lines.forEach((ln, k) => {
        const by = y + size * 0.92 + k * lh, isA = acc.includes(k);
        const lp = clamp((local - k * stag) / 0.5);
        animText(el.anim || 'wipe', ln, x, by, lp, { font: f, track, align: al, color: isA ? 'accent' : el.color });
        if (isA && el.mark && k === lastAcc) {
          const mp = clamp((local - (n - 1) * stag - 0.5) / 0.45), w = measure(ln, f, track).w;
          const lx = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x;
          if (el.mark === 'squiggle') squiggle(lx, by + size * 0.42, Math.min(w, 320), 10, 7 + k, mp, 'accent', 6);
          else if (el.mark === 'underline') underline(lx - 6, by + size * 0.22, w + 12, 7 + k, mp, el.markColor || 'butter', size * 0.16);
          else if (el.mark === 'circle') scribble(lx + w / 2, by - size * 0.35, Math.max(w, size) * 0.62, 7 + k, mp, 'accent', 5);
        }
      }),
    };
  },
  body(el, x, y, cw, al) {
    const ty = S.theme.type, size = el.size || ty.body, f = font('body', size, el.weight || 500), track = el.track ?? 1;
    const lines = Array.isArray(el.lines) ? el.lines : wrapBalanced(el.text || '', f, Math.min(cw, el.maxWidth || cw), track);
    const lh = size * (el.lh || ty.bodyLh), st = ty.subStagger, d = ty.subDur;
    return { h: lines.length * lh - (lh - size), dur: st * (lines.length - 1) + d,
      draw: (t, p, local) => lines.forEach((ln, k) => animText(el.anim || ty.subAnim, ln, x, y + size * 0.9 + k * lh, clamp((local - k * st) / d), { font: f, track, align: al, alpha: el.alpha ?? 0.88, color: el.color })) };
  },
  bullets(el, x, y, cw, al) {
    const ty = S.theme.type, size = el.size || ty.bullet, f = font('body', size, el.weight || 500), lh = size * (el.lh || ty.bulletLh), ind = size * 1.4, st = ty.bulletStagger;
    const rows = []; (el.items || []).forEach((it) => wrapBalanced(it, f, cw - ind).forEach((ln, j) => rows.push([ln, j === 0])));
    return { h: rows.length * lh - (lh - size), dur: st * (rows.length - 1) + 0.5,
      draw: (t, p, local) => rows.forEach(([ln, first], k) => {
        const lp = clamp((local - k * st) / 0.45), by = y + size * 0.9 + k * lh;
        if (first) STICKERS[el.bullet || 'sparkle'](x + size * 0.45, by - size * 0.33, size * 0.38, k + 3, el.bulletColor || 'accent', E.outBack(lp));
        animText(el.anim || ty.subAnim, ln, x + ind, by, lp, { font: f, align: 'left', alpha: 0.9, color: el.color });
      }) };
  },
  stats(el, x, y, cw, al) {
    const items = el.items || [];
    let vs = el.size || 150;
    const widthAt = (v) => items.reduce((a, it) => a + measure(String(it.value), font('display', v, 700), -4).w + measure(it.unit || '', font('display', v * 0.32, 500)).w + v * 0.55, 0);
    while (vs > 60 && widthAt(vs) > cw) vs -= 6;
    const ls = Math.round(vs * 0.19) + 4, top = ls + 18;
    return { h: top + vs * 0.78, dur: 0.3 * (items.length - 1) + 0.9,
      draw: (t, p, local) => {
        let cx = al === 'center' ? x - widthAt(vs) / 2 : x;
        items.forEach((it, k) => {
          const fv = font('display', vs, 700), fu = font('display', vs * 0.32, 500), wv = measure(String(it.value), fv, -4).w;
          const lp = clamp((local - k * 0.3) / 0.6);
          animText('rise', it.label || '', cx + 4, y + ls, lp, { font: font('body', ls, 500), track: 3, alpha: 0.75 });
          animText('pop', String(it.value), cx, y + top + vs * 0.78, lp, { font: fv, track: -4, color: it.color });
          text(it.unit || '', cx + wv + 10, y + top + vs * 0.78, { font: fu, alpha: clamp((local - k * 0.3 - 0.4) / 0.2) });
          cx += wv + measure(it.unit || '', fu).w + vs * 0.55;
        });
      } };
  },
  specs(el, x, y, cw, al) {
    const rows = el.rows || [], rh = el.rowHeight || 66, ks = el.size || 26, kw = cw * (el.keyWidth || 0.3);
    return { h: rows.length * rh, dur: 0.1 * rows.length + 0.5,
      draw: (t, p, local) => rows.forEach(([k, v], i) => {
        const lp = clamp((local - i * 0.1) / 0.4), by = y + i * rh + rh * 0.62;
        animText('rise', k, x, by, lp, { font: font('body', ks, 500), alpha: 0.7 });
        animText('rise', v, x + kw, by, lp, { font: font('body', ks + 4, 700) });
        underline(x, y + (i + 1) * rh - 4, cw, 20 + i, lp, 'ink', 2.5);
      }) };
  },
  quote(el, x, y, cw, al) {
    const size = el.size || 56, f = font('body', size, 700), lines = Array.isArray(el.lines) ? el.lines : wrap(el.text || '', f, cw - 40);
    const lh = size * 1.35, by0 = y + size * 1.1;
    return { h: size * 0.4 + lines.length * lh + (el.by ? 40 + S.theme.type.quoteBy * 1.3 : 0), dur: 0.35 * lines.length + 0.6,
      draw: (t, p, local) => {
        text('“', (al === 'center' ? x - cw / 2 : x) - 10, y + size * 0.9, { font: font('display', size * 2, 700), color: 'accent', alpha: clamp(local / 0.3) });
        lines.forEach((ln, k) => animText('wipe', ln, x, by0 + k * lh, clamp((local - k * 0.35) / 0.5), { font: f, align: al }));
        if (el.by) animText(S.theme.type.subAnim, '— ' + el.by, x, by0 + lines.length * lh + 30 + S.theme.type.quoteBy * 0.3, clamp((local - lines.length * 0.35) / 0.5), { font: font('body', S.theme.type.quoteBy, 500), align: al, alpha: 0.75 });
      } };
  },
  chips(el, x, y, cw, al) {
    const size = el.size || 26, f = font('body', size, 700), padX = size * 0.8, h = size * 2, gap = 16;
    const rows = [[]]; let w = 0;
    for (const it of el.items || []) { const iw = measure(it, f).w + padX * 2; if (w + iw > cw && rows[rows.length - 1].length) { rows.push([]); w = 0; } rows[rows.length - 1].push([it, iw]); w += iw + gap; }
    const cols = el.colors || ['butter', 'sky', 'pink', 'mint', 'lilac', 'peach'];
    return { h: rows.length * (h + gap) - gap, dur: 0.08 * (el.items || []).length + 0.5,
      draw: (t, p, local) => { let n = 0; rows.forEach((r, ri) => {
        const rw = r.reduce((a, [, iw]) => a + iw + gap, -gap); let cx = al === 'center' ? x - rw / 2 : x;
        r.forEach(([it, iw]) => { const lp = E.outBack(clamp((local - n * 0.08) / 0.4)), cy = y + ri * (h + gap) + h / 2;
          if (lp > 0) withT(cx + iw / 2, cy, jit(n, 5, 0.03), lp, () => { const b = blobPath(0, 0, iw / 2, h / 2, n + 11, 0.02, 18); sticker(b, cols[n % cols.length], { dx: 4, dy: 5, shadow: 0.14 }); stroke(b, 3); });
          text(it, cx + iw / 2, cy + size * 0.36, { font: f, align: 'center', alpha: clamp(lp * 2 - 1) });
          cx += iw + gap; n++; }); }); } };
  },
  text(el, x, y, cw, al) {
    const ty = S.theme.type, size = el.size || ty.body, f = font(el.role || 'body', size, el.weight || 500), lines = Array.isArray(el.lines) ? el.lines : wrap(el.text || '', f, cw, el.track || 0);
    const lh = size * (el.lh || 1.5), st = ty.subStagger, d = ty.subDur;
    return { h: lines.length * lh - (lh - size), dur: st * (lines.length - 1) + d, draw: (t, p, local) => lines.forEach((ln, k) => animText(el.anim || ty.subAnim, ln, x, y + size * 0.9 + k * lh, clamp((local - k * st) / d), { font: f, align: el.align || al, color: el.color, alpha: el.alpha, track: el.track })) };
  },
  spacer(el) { return { h: el.h || 40, dur: 0, draw: () => {} }; },
};
const GAP0 = { kicker: 30, title: 40, body: 44, bullets: 44, stats: 50, specs: 40, quote: 40, chips: 40, text: 32, spacer: 0 };
// title/body gaps follow the theme type scale
const GAP = new Proxy(GAP0, { get: (o, k) => (k === 'title' ? S.theme.type.gapTitle : k === 'body' || k === 'bullets' || k === 'text' ? S.theme.type.gapBody : o[k]) });
export const STACK_TYPES = new Set(Object.keys(BLOCKS));

// ---------- prepare (cached per orientation) ----------
const cache = new Map();
const instByEl = new WeakMap();
export function resetCache() { cache.clear(); }

export function prepare(slide, idx) {
  const key = idx + (S.portrait ? 'P' : 'L');
  if (cache.has(key)) return cache.get(key);
  const L = lay(slide), Zc = Z(L), items = [];
  const els = slide.elements || [];
  // text stack
  const stack = els.filter((e) => STACK_TYPES.has(e.type) && e.x == null);
  if (stack.length && Zc.col) {
    const [cx, cw] = Zc.col, al = Zc.align || 'left', ax = al === 'center' ? cx + cw / 2 : cx;
    const blocks = stack.map((el) => ({ el, b: BLOCKS[el.type](el, ax, 0, cw, al, { hero: Zc.hero }) }));
    const total = blocks.reduce((a, { el, b }, i) => a + b.h + (i < blocks.length - 1 ? el.gap ?? GAP[el.type] : 0), 0);
    let y = Zc.valign === 'top' ? (S.portrait ? 200 : 150) : S.portrait && Zc.valign !== 'center' ? 210 : clamp((S.H - total) / 2 - 10, 150, S.H - 140 - total);
    const ty = S.portrait ? slide.p?.textY : slide.textY;
    if (ty != null) y = ty;
    let tc = slide.textStart ?? 0.25;
    for (const { el, b: b0 } of blocks) {
      const b = BLOCKS[el.type](el, ax, y, cw, al, { hero: Zc.hero });
      const start = el.at ?? tc, dur = el.dur ?? b.dur;
      items.push({ el, id: el.id || el.type, layer: 'front', start, dur, kind: 'text', draw: (t) => b.draw(t, prog(t, start, start + Math.max(0.01, b.dur)), t - start) });
      tc = start + Math.max(0.15, dur * S.theme.type.overlap);
      y += b.h + (el.gap ?? GAP[el.type]);
    }
    items.textEnd = tc;
  }
  // absolute elements
  let bi = 0, di = 0, ci = 0;
  const textEnd = items.textEnd ?? 0.6;
  els.forEach((el, j) => {
    if (STACK_TYPES.has(el.type) && el.x == null && Zc.col) return;
    const id = el.id || `${el.type}${j}`;
    const R = RENDER[el.type];
    if (!R) throw new Error(`slide ${idx + 1}: unknown element type "${el.type}"`);
    const phase = R.phase || 'decor';
    let start = el.at;
    if (start == null) start = phase === 'back' ? 0.02 + bi++ * 0.06 : phase === 'callout' ? 1.0 + ci++ * 0.22 : Math.max(0.9, textEnd - 0.2) + di++ * 0.14;
    const dur = el.dur ?? (typeof R.dur === 'function' ? R.dur(el, start) : R.dur) ?? 0.6;
    const layer = el.layer || R.layer || 'front';
    const item = { el, id, layer, start, dur, kind: R.kind || 'visual', phase, slideIdx: idx };
    if (el.type === 'model') { item.inst = getInst(el); }
    item.draw = (t) => R.draw(eff(el, L), t, prog(t, start, start + dur), item, idx);
    items.push(item);
  });
  // slide.duration (e.g. narration length, set by sync.py) overrides the auto length
  const end = typeof slide.duration === 'number' ? slide.duration : Math.max(1.2, ...items.map((i) => i.start + i.dur)) + 0.25;
  // settle: time after which nothing changes any more (unless something keeps moving: live)
  const settle = Math.max(0, ...items.map((i) => i.start + i.dur));
  const live = !!S.boil || els.some((el) => el.type === 'rain' || el.type === 'custom' ||
    (el.type === 'model' && S.motion > 0 && ((el.float ?? 12) || (el.sway ?? 4) || el.spin)) ||
    (el.type === 'sticker' && S.motion > 0 && ['sun', 'flower'].includes(el.shape)));
  const out = { items, end, L, settle, live };
  cache.set(key, out);
  return out;
}

function getInst(el) {
  if (instByEl.has(el)) return instByEl.get(el);
  const tmpl = S.models[el.model];
  if (!tmpl) throw new Error(`model "${el.model}" is not defined in deck.models`);
  const i = T3.instance(tmpl, { colors: el.colors, textures: el.textures });
  instByEl.set(el, i); return i;
}

// ---------- absolute element renderers: draw(el, t, p, item) ----------
const enterOffset = (dir, p, dist = 1100) => {
  const k = 1 - E.outExpo(p);
  return dir === 'left' ? [-dist * k, 0] : dir === 'right' ? [dist * k, 0] : dir === 'up' ? [0, dist * k] : dir === 'down' ? [0, -dist * k] : [0, 0];
};
export const RENDER = {
  blob: { phase: 'back', layer: 'back', dur: 0.75, draw(el, t, p) {
    const dir = el.enter || 'grow';
    const sc = dir === 'grow' ? E.outBack(p) : dir === 'none' ? 1 : 1;
    if (sc <= 0) return;
    const [ox, oy] = dir === 'grow' || dir === 'none' ? [0, 0] : enterOffset(dir, p);
    const rx = (el.rx ?? el.r ?? 300) * sc, ry = (el.ry ?? el.r ?? 300) * sc;
    const b = blobPath(el.x + ox, el.y + oy, rx, ry, el.seed ?? 1, el.wobble ?? 0.025, 22);
    if (el.outline) { fill(b, el.color || 'butter'); stroke(b, 4); } else sticker(b, el.color || 'butter', { shadow: el.shadow ?? 0.12 });
    reportBox('visual', el.x - rx, el.y - ry, rx * 2, ry * 2, { type: 'blob', color: color(el.color || 'butter') });
  } },
  model: { phase: 'back', layer: '3d', kind: 'model', dur: 0.8, draw(el, t, p, item) {
    const qt = quant(t), enter = el.enter || 'rise';
    const e = E.outBack(p), ex = E.outExpo(p);
    let x = el.x, y = el.y, h = el.height || 700;
    if (enter === 'rise') y += (1 - e) * 900; else if (enter === 'drop') y -= (1 - e) * 900;
    else if (enter === 'left') x -= (1 - ex) * 1200; else if (enter === 'right') x += (1 - ex) * 1200;
    else if (enter === 'pop') h *= Math.max(0.001, e);
    const fl = (el.float ?? 12) * S.motion, sw = (el.sway ?? 4) * S.motion, ph = el.seed ?? 0;
    y += Math.sin(qt * 2 + ph) * fl;
    const r0 = el.rot || [0, 0, 0], rf = el.rotFrom || r0, rp = E.outCubic(p);
    const rot = [lerp(rf[0], r0[0], rp), lerp(rf[1], r0[1], rp) + Math.sin(qt * 1.1 + ph) * sw + (el.spin || 0) * qt, lerp(rf[2], r0[2], rp) + Math.sin(qt * 1.7 + ph) * sw * 0.3];
    T3.place(item.inst, x, y, h, rot, { fit: el.fit || 'height', pin: el.pin || null });
    if (S.report) { const b = T3.screenBox(item.inst); reportBox('visual', b[0], b[1], b[2], b[3], { type: 'model' }); }
    if (el.shadow) { const b = T3.screenBox(item.inst); halftone(b[0] + b[2] / 2, b[1] + b[3] + 20, b[2] * 0.4, 16, 0.3); }
  } },
  image: { phase: 'back', layer: 'back', dur: 0.6, draw(el, t, p) {
    const img = S.images[el.src]; if (!img) throw new Error('missing image ' + el.src);
    const w = el.w || 600, h = el.h || (w * img.naturalHeight) / img.naturalWidth, enter = el.enter || 'pop';
    const sc = enter === 'pop' ? E.outBack(p) : 1; if (sc <= 0) return;
    const [ox, oy] = enter === 'rise' ? [0, (1 - E.outExpo(p)) * 600] : enterOffset(enter, p);
    const al = enter === 'fade' ? p : 1;
    withT(el.x + ox, el.y + oy, deg(el.rot) + jit(el.seed || 3, 1, 0.004), sc, () => {
      const c = S.ctx; c.save(); c.globalAlpha *= al;
      const frame = el.frame || 'sticker', pad = frame === 'polaroid' ? 22 : 0;
      if (frame !== 'none') { const r = new Path2D(); r.roundRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2 + (frame === 'polaroid' ? 60 : 0), el.radius ?? 18); sticker(r, frame === 'polaroid' ? '#ffffff' : 'paper2', { dx: 10, dy: 12, shadow: 0.16 }); }
      const clip = new Path2D(); clip.roundRect(-w / 2, -h / 2, w, h, frame === 'none' ? 0 : el.radius ?? 18); c.save(); c.clip(clip); c.drawImage(img, -w / 2, -h / 2, w, h); c.restore();
      if (frame !== 'none') stroke(clip, 4);
      c.restore();
    });
    reportBox('visual', el.x - w / 2, el.y - h / 2, w, h, { type: 'image' });
  } },
  sticker: { phase: 'decor', dur: 0.4, draw(el, t, p) {
    const fn = STICKERS[el.shape || 'star']; if (!fn) throw new Error(`unknown sticker "${el.shape}". use: ${Object.keys(STICKERS).join(', ')}`);
    fn(el.x, el.y, el.size || 40, el.seed ?? 1, el.color, E.outBack(p), deg(el.rot));
  } },
  squiggle: { phase: 'decor', dur: 0.5, draw(el, t, p) { squiggle(el.x, el.y, el.w || 300, el.amp || 12, el.seed ?? 4, p, el.color || 'accent', el.width || 6, el.waves || 3); } },
  underline: { phase: 'decor', dur: 0.4, draw(el, t, p) { underline(el.x, el.y, el.w || 300, el.seed ?? 4, p, el.color || 'accent', el.width || 7); } },
  scribble: { phase: 'decor', dur: 0.6, draw(el, t, p, item, idx) { const [x, y] = targetXY(el, idx); scribble(x, y, el.r || 80, el.seed ?? 5, p, el.color || 'accent', el.width || 6); } },
  arrow: { phase: 'decor', dur: 0.5, draw(el, t, p) { arrow(el.from[0], el.from[1], el.to[0], el.to[1], el.bend ?? 0.2, el.seed ?? 6, p, el.color || 'ink', el.width || 5); } },
  halftone: { phase: 'back', layer: 'back', dur: 0.4, draw(el, t, p) { halftone(el.x, el.y, el.rx || 200, el.ry || 30, (el.alpha ?? 0.3) * p); } },
  callout: { phase: 'callout', dur: 0.75, kind: 'callout', draw(el, t, p, item, idx) {
    const [tx, ty] = targetXY(el, idx);
    const dx = el.dx ?? -220, dy = el.dy ?? -160, al = el.align || (dx < 0 ? 'right' : 'left');
    const lx = tx + dx, ly = ty + dy, lp = clamp(p / 0.5), tp = clamp((p - 0.4) / 0.6);
    if (el.ring) scribble(tx, ty, el.ring, (el.seed ?? 30) + 2, lp, el.ringColor || 'butter', 6);
    const gap = el.ring ? el.ring + 6 : 0, ang = Math.atan2(ly - ty, lx - tx);
    leader(lx + (al === 'right' ? 10 : -10), ly - 12, tx + Math.cos(ang) * gap, ty + Math.sin(ang) * gap, el.seed ?? 30, lp, el.color || 'ink');
    const ox = al === 'right' ? -14 : 14, ty2 = dy > 0 ? ly + 34 : ly - 26;
    animText('wipe', el.label || '', lx + ox, ty2, tp, { font: font('body', el.size || 30, 700), align: al, track: 1 });
    if (el.sub) animText('rise', el.sub, lx + ox, ty2 + 14 + S.theme.type.calloutSub, clamp((p - 0.6) / 0.4), { font: font('display', S.theme.type.calloutSub, 500), align: al, track: 5, alpha: 0.7 });
  } },
  rain: { phase: 'back', layer: 'back', dur: 0.1, draw(el, t, p, item) {
    const qt = quant(t) - item.start; if (qt < 0) return;
    const n = el.count || 14, shapes = el.shapes || ['feather'], cols = el.colors || ['paper2', 'butter', 'pink', 'sky', 'lilac'];
    const [zx, zy, zw, zh] = el.zone || [0, 0, S.W, S.H];
    for (let i = 0; i < n; i++) {
      const sx = (i + 0.5) / n + (S.portrait ? 0 : 0), sp = 60 + ((i * 37) % 90), ph = (i * 7.7) % 6;
      const yy = zy - 200 + ((qt * sp + i * 260) % (zh + 400)), xx = zx + sx * zw + Math.sin(qt * 1.4 + ph) * 80;
      const fn = STICKERS[shapes[i % shapes.length]];
      if (shapes[i % shapes.length] === 'feather') fn(xx, yy, 90 + ((i * 53) % 110), i, cols[i % cols.length], 1, Math.sin(qt * 1.4 + ph) * 0.5 + 0.3);
      else fn(xx, yy, 18 + ((i * 13) % 20), i, cols[i % cols.length], 1, qt + i);
    }
  } },
  custom: { phase: 'decor', dur: 0.6, draw(el, t, p, item) {
    if (!item.fn) item.fn = new Function('md', 'el', 't', 'p', el.code); // eslint-disable-line no-new-func
    item.fn(window.__md.api, el, t, p);
  } },
};
Object.assign(RENDER, DIAGRAMS);
// stack types may also be placed absolutely with x,y
for (const k of Object.keys(BLOCKS)) {
  RENDER[k] = { phase: 'decor', dur: 0.6, kind: 'text', draw(el, t, p, item) {
    const b = BLOCKS[k](el, el.x, el.y, el.w || 700, el.align || 'left', {});
    b.draw(t, clamp(p), t - item.start);
  } };
}

let curPrepared = null;
function targetXY(el, idx) {
  if (Array.isArray(el.target)) return el.target;
  if (el.target && el.target.model) {
    const it = curPrepared.items.find((i) => i.el.type === 'model' && (i.id === el.target.model || i.el.id === el.target.model));
    if (!it) throw new Error(`callout target model "${el.target.model}" not on this slide (give the model element an id)`);
    const pt = T3.project(it.inst, el.target.anchor || el.target.point || [0, 0, 0]);
    return [pt[0] + (el.target.dx || 0), pt[1] + (el.target.dy || 0)];
  }
  return [el.x, el.y];
}

// ---------- draw one slide at time t ----------
export function drawSlide(slide, idx, t) {
  const P = prepare(slide, idx); curPrepared = P;
  const qt = quant(t), c = S.ctx;
  c.fillStyle = color(slide.bg || 'paper'); c.fillRect(0, 0, S.W, S.H);
  T3.beginFrame();
  const run = (pred) => P.items.filter(pred).forEach((it) => { if (qt < it.start - 0.001 && !S.report) return; S.curId = `${idx}:${it.id}`; it.draw(qt); });
  run((i) => i.layer === 'back');
  run((i) => i.layer === '3d');
  T3.render(c);
  run((i) => i.layer === 'front' && i.kind !== 'callout');
  run((i) => i.kind === 'callout');
  S.curId = null;
  return P;
}
