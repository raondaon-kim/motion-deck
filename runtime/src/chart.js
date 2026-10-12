// chart element — one renderer, variants by data shape (reuse by changing data + `variant`).
//
//   variant  donut    parts of a whole: items [{label, value, at}], center {value, label}?
//            bar      magnitude by category (1 series) or grouped comparison (2 series, e.g. before/after):
//                     categories [label | {label, at}], series [{name, values[]}], delta?: true
//            line     change over time: categories (x labels), series [{name, values[]}] (1–2),
//                     marks [{index, label, at}] (annotated phases)
//            scatter  two measures per item: points [{label, x, y, at}], xLabel, yLabel,
//                     xEnds/yEnds ["낮음","높음"]?, zone {x:[a,b], y:[c,d], label} (highlighted region)
//   common   unit, note (e.g. "예시 수치"), emph (series index whose values are labelled)
//
// rules (dataviz method, adapted to 1920x1080 video): thin marks with rounded data-ends, one y-axis,
// solid recessive gridlines, a surface-colour gap between touching marks and a ring on dots,
// colour from the validated series order (never cycled), legend for >= 2 series + sparing direct
// labels, all text in ink tokens (never the series colour). Every text goes through text() so QA sees it.
import { S, E, clamp, lerp, color, jit, sticker, stroke, fill, withT, reportBox, inkA } from './core.js';
import { font, measure, wrapBalanced, text, animText } from './text.js';
import { roundBox } from './shapes.js';

const ser = (i) => (S.theme.palette[`series${i}`] ? `series${i}` : inkA(0.35)); // past the palette: neutral, never a generated hue
// colour per series: tone "muted" = de-emphasis gray; otherwise the next validated slot (muted ones don't consume a slot)
const serColors = (series) => { let k = 0; return series.map((s) => (s.tone === 'muted' ? inkA(0.3) : ser(k++))); };
const T = () => S.theme.type;
const ghostText = (str, x, y, opt) => { if (!S.report) return; const was = S.hideText; S.hideText = true; text(str, x, y, opt); S.hideText = was; };
const say = (str, x, y, p, opt) => (p <= 0 ? ghostText(str, x, y, opt) : animText('lift', str, x, y, p, opt));
const fmt = (v, unit = '') => `${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${unit}`;
const cueOf = (o) => (o && typeof o === 'object' && typeof o.at === 'number' ? o.at : null);
const labelOf = (o) => (o && typeof o === 'object' ? o.label : o);

function niceMax(v, n = 5) {
  const raw = v / n, mag = 10 ** Math.floor(Math.log10(raw || 1)), r = raw / mag;
  const step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
  return { step, max: Math.ceil(v / step - 1e-9) * step };
}
function starts(list, start, step) { return list.map((o, i) => cueOf(o) ?? start + 0.5 + i * step); }

function card(el, t, start, x, y, w, h) {
  const bp = clamp((t - start) / 0.45); if (bp <= 0) return 0;
  const c = S.ctx; c.save(); c.globalAlpha *= E.outCubic(bp);
  withT(x + w / 2, y + h / 2, 0, 0.97 + 0.03 * E.outCubic(bp), () => { const b = roundBox(-w / 2, -h / 2, w, h, 28, 170); sticker(b, el.color || 'paper2', { dx: 9, dy: 11, shadow: 0.12 }); stroke(b, 4); });
  c.restore(); return bp;
}
function legend(series, xr, y, t, start, cols = serColors(series)) {
  if (series.length < 2) return;
  const f = font('body', T().caption, 600), sw = 22, gap = 36;
  const widths = series.map((s) => sw + 12 + measure(s.name || '', f).w);
  let x = xr - widths.reduce((a, b) => a + b + gap, -gap);
  series.forEach((s, i) => {
    const p = clamp((t - start - 0.3 - i * 0.1) / 0.4);
    if (p > 0) { const r = new Path2D(); r.roundRect(x, y - sw * 0.85, sw, sw, 6); fill(r, cols[i], p); }
    say(s.name || '', x + sw + 12, y, p, { font: f, alpha: 0.9 });
    x += widths[i] + gap;
  });
}
function note(el, x, y, t, start) { if (el.note) say(el.note, x, y, clamp((t - start - 0.4) / 0.4), { font: font('body', Math.max(28, T().caption - 4), 500), align: 'right', alpha: 0.6 }); }

// ---------------------------------------------------------------- donut
function donut(el, t, item, B) {
  const items = el.items || [], total = items.reduce((a, b) => a + Math.max(0, +b.value || 0), 0) || 1;
  const st = starts(items, item.start, el.step ?? 0.45);
  const cx = B.x + B.w * 0.3, cy = B.y + B.h / 2 + 6, R = Math.min(B.h * 0.4, B.w * 0.22), th = R * 0.36;
  let a0 = -Math.PI / 2;
  const c = S.ctx, gapC = color(el.color || 'paper2');
  items.forEach((it, i) => {
    const frac = Math.max(0, +it.value || 0) / total, a1 = a0 + frac * Math.PI * 2, p = clamp((t - st[i]) / 0.55);
    if (p > 0) {
      const pull = el.highlight === i ? 14 : 0, mid = (a0 + a1) / 2, ox = Math.cos(mid) * pull, oy = Math.sin(mid) * pull;
      const ae = lerp(a0, a1, E.outCubic(p)), arc = new Path2D();
      arc.arc(cx + ox, cy + oy, R, a0, ae); arc.arc(cx + ox, cy + oy, R - th, ae, a0, true); arc.closePath();
      fill(arc, ser(i));
      // surface gap between touching slices
      c.save(); c.strokeStyle = gapC; c.lineWidth = 6; c.stroke(arc); c.restore();
    }
    a0 = a1;
  });
  // center figure
  if (el.center) {
    const cp = clamp((t - item.start - 0.3) / 0.5);
    say(String(el.center.value ?? ''), cx, cy + 14, cp, { font: font('body', Math.round(R * 0.36), 700), align: 'center' });
    if (el.center.label) say(el.center.label, cx, cy + R * 0.36, cp, { font: font('body', T().caption - 2, 500), align: 'center', alpha: 0.7 });
  }
  // label list (swatch + name + share): direct identity for every slice, appears with its slice
  const lf = font('body', T().caption + 6, 600), vf = font('body', T().caption + 8, 700), rowH = Math.min(96, (B.h - 80) / Math.max(1, items.length));
  const lx = B.x + B.w * 0.58, top = cy - (rowH * items.length) / 2 + rowH * 0.62;
  items.forEach((it, i) => {
    const p = clamp((t - st[i] - 0.15) / 0.45), y = top + i * rowH;
    if (p > 0) { const d = new Path2D(); d.arc(lx + 12, y - 12, 13, 0, Math.PI * 2); fill(d, ser(i), p); }
    const pct = Math.round((Math.max(0, +it.value || 0) / total) * 100);
    say(it.label || '', lx + 42, y, p, { font: el.highlight === i ? vf : lf });
    say(el.unit && el.unit !== '%' ? `${fmt(it.value, el.unit)} · ${pct}%` : `${pct}%`, B.x + B.w - 56, y, p, { font: vf, align: 'right' });
  });
}

// ---------------------------------------------------------------- bar (single or grouped)
function plotFrame(el, B, t, start, maxV, catLabels) {
  const tf = font('body', Math.max(28, T().caption - 4), 500), cf = font('body', T().caption, 600);
  // headroom: value labels (+ delta labels) above the tallest bar must stay inside the plot, below the legend
  const { step, max } = niceMax(maxV * (el.delta ? 1.3 : 1.12));
  const ticks = []; for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  const tw = Math.max(...ticks.map((v) => measure(fmt(v, el.unit), tf).w));
  const legendH = (el.series || []).length >= 2 ? 56 : 12;
  const catLines = catLabels.map((s) => wrapBalanced(String(s), cf, (B.w - tw - 140) / Math.max(1, catLabels.length) - 16));
  const catH = Math.max(1, ...catLines.map((l) => l.length)) * T().caption * 1.3 + 22;
  const P = { x: B.x + 56 + tw + 20, y: B.y + 40 + legendH, w: 0, h: 0, max, step, ticks, tf, cf, catLines };
  P.w = B.x + B.w - 56 - P.x; P.h = B.y + B.h - 52 - catH - P.y;
  const gp = clamp((t - start - 0.15) / 0.5);
  if (gp > 0) ticks.forEach((v) => {
    const y = P.y + P.h - (v / max) * P.h, g = new Path2D(); g.moveTo(P.x, y); g.lineTo(P.x + P.w, y);
    stroke(g, v === 0 ? 3 : 2, inkA(v === 0 ? 0.45 : 0.1), gp);
  });
  ticks.forEach((v) => say(fmt(v, el.unit), P.x - 16, P.y + P.h - (v / max) * P.h + 10, gp, { font: tf, align: 'right', alpha: 0.6 }));
  return P;
}
function bars(el, t, item, B) {
  const cats = el.categories || [], ns = Math.max(1, (el.series || []).length);
  // before/after (delta): the first series is the 'before' -> muted unless told otherwise
  const series = (el.series || []).map((s, i) => (el.delta && ns >= 2 && i === 0 && !s.tone ? { ...s, tone: 'muted' } : s)), cols = serColors(series);
  const maxV = Math.max(1, ...series.flatMap((s) => s.values || []));
  const P = plotFrame(el, B, t, item.start, maxV, cats.map(labelOf));
  legend(series, B.x + B.w - 56, B.y + 66, t, item.start, cols);
  const st = starts(cats, item.start, el.step ?? 0.45), slot = P.w / Math.max(1, cats.length);
  const bw = Math.min(ns === 1 ? 84 : 64, (slot * 0.62) / ns), inner = 6, gw = bw * ns + inner * (ns - 1);
  const emph = el.emph ?? (ns >= 2 ? ns - 1 : 0), vf = font('body', T().caption, 700);
  cats.forEach((cat, ci) => {
    const gx = P.x + slot * ci + (slot - gw) / 2;
    series.forEach((s, si) => {
      const v = (s.values || [])[ci] ?? 0, p = clamp((t - st[ci] - si * 0.18) / 0.6), hgt = (v / P.max) * P.h * E.outCubic(p);
      const x = gx + si * (bw + inner), yb = P.y + P.h;
      if (hgt > 1) { const r = new Path2D(); r.roundRect(x, yb - hgt, bw, hgt, [Math.min(10, bw / 3), Math.min(10, bw / 3), 0, 0]); fill(r, cols[si]); }
      if (S.report) reportBox('visual', x, yb - (v / P.max) * P.h, bw, (v / P.max) * P.h, { type: 'bar' });
      if (si === emph || series.length === 1) say(fmt(v, el.unit), x + bw / 2, yb - (v / P.max) * P.h - 14, clamp((p - 0.6) / 0.4), { font: vf, align: 'center' });
    });
    if (el.delta && series.length >= 2) {
      const a = (series[0].values || [])[ci], b = (series[series.length - 1].values || [])[ci];
      if (a) {
        const d = Math.round(((b - a) / a) * 100), top = Math.max(P.y + 30, P.y + P.h - (Math.max(a, b) / P.max) * P.h - 62);
        say(`${d > 0 ? '+' : ''}${d}%`, gx + gw / 2, top, clamp((t - st[ci] - 0.9) / 0.4), { font: font('body', T().caption + 2, 700), align: 'center', alpha: 0.85 });
      }
    }
    P.catLines[ci].forEach((ln, k) => say(ln, P.x + slot * ci + slot / 2, P.y + P.h + 44 + k * T().caption * 1.3, clamp((t - st[ci]) / 0.45), { font: P.cf, align: 'center' }));
  });
}

// ---------------------------------------------------------------- line
function line(el, t, item, B) {
  const cats = el.categories || [], series = el.series || [], n = cats.length, cols = serColors(series);
  const maxV = Math.max(1, ...series.flatMap((s) => s.values || []));
  const P = plotFrame(el, B, t, item.start, maxV, cats.map(labelOf));
  legend(series, B.x + B.w - 56, B.y + 66, t, item.start, cols);
  const X = (i) => P.x + (n <= 1 ? P.w / 2 : (P.w * i) / (n - 1)), Y = (v) => P.y + P.h - (v / P.max) * P.h;
  const t0 = item.start + 0.6, dur = el.drawDur ?? Math.max(1.2, 0.35 * n), surface = color(el.color || 'paper2');
  const vf = font('body', T().caption + 2, 700);
  // x labels (thin out when crowded)
  const every = n > 8 ? 2 : 1;
  cats.forEach((cat, i) => { if (i % every === 0 || i === n - 1) say(String(labelOf(cat)), X(i), P.y + P.h + 44, clamp((t - item.start - 0.3) / 0.45), { font: P.cf, align: 'center' }); });
  series.forEach((s, si) => {
    const vals = s.values || [], u = clamp((t - t0 - si * 0.3) / dur) * (n - 1), k = Math.floor(u), f = u - k;
    if (u <= 0) return;
    const pts = vals.slice(0, k + 1).map((v, i) => [X(i), Y(v)]);
    if (k < n - 1) pts.push([lerp(X(k), X(k + 1), f), lerp(Y(vals[k]), Y(vals[k + 1]), f)]);
    if (series.length === 1) { // area wash (~10%)
      const a = new Path2D(); a.moveTo(pts[0][0], P.y + P.h); pts.forEach(([x, y]) => a.lineTo(x, y)); a.lineTo(pts[pts.length - 1][0], P.y + P.h); a.closePath(); fill(a, cols[si], 0.12);
    }
    const ln = new Path2D(); ln.moveTo(...pts[0]); pts.slice(1).forEach((q) => ln.lineTo(...q)); stroke(ln, 6, cols[si]);
    vals.forEach((v, i) => { if (i > k) return; const d = new Path2D(); d.arc(X(i), Y(v), i === n - 1 ? 12 : 8, 0, Math.PI * 2); const c = S.ctx; c.save(); c.strokeStyle = surface; c.lineWidth = 5; c.stroke(d); c.restore(); fill(d, cols[si]); });
    // value at the end of the line (sparing direct label)
    say(fmt(vals[n - 1], el.unit), X(n - 1), Y(vals[n - 1]) - 28, clamp((u - (n - 1)) * 4 + 0.001) * (u >= n - 1 ? 1 : 0), { font: vf, align: 'center' });
  });
  // annotated phases
  (el.marks || []).forEach((m, j) => {
    const i = clamp(m.index ?? 0, 0, n - 1), v = (series[0]?.values || [])[i] ?? 0, p = clamp((t - (cueOf(m) ?? t0 + dur * (i / Math.max(1, n - 1)))) / 0.5);
    const x = X(i), y = Y(v), ly = Math.max(P.y + 34, y - 110 - (j % 2) * 56);
    if (p > 0) { const l = new Path2D(); l.moveTo(x, y - 16); l.lineTo(x, ly + 14); stroke(l, 2.5, inkA(0.45), p); }
    say(m.label || '', clamp(x, P.x + 120, P.x + P.w - 120), ly, p, { font: font('body', T().caption, 700), align: 'center' });
  });
}

// ---------------------------------------------------------------- scatter
function scatter(el, t, item, B) {
  const pts = el.points || [], st = starts(pts, item.start + 0.4, el.step ?? 0.4);
  const af = font('body', T().caption, 700), ef = font('body', Math.max(28, T().caption - 4), 500), pf = font('body', T().caption, 600);
  const zx = el.zone ? el.zone.x : [], zy = el.zone ? el.zone.y : [];
  const xMax = el.xMax ?? Math.max(1, ...pts.map((q) => (+q.x || 0) * 1.1), ...zx), yMax = el.yMax ?? Math.max(1, ...pts.map((q) => (+q.y || 0) * 1.1), ...zy);
  const P = { x: B.x + 110, y: B.y + 96, w: B.w - 200, h: B.h - 236 };
  const X = (v) => P.x + (clamp(v / xMax, 0, 1)) * P.w, Y = (v) => P.y + P.h - clamp(v / yMax, 0, 1) * P.h;
  const gp = clamp((t - item.start - 0.15) / 0.5);
  // zone (highlighted region) under everything
  const z = el.zone; let zoneBox = null;
  if (z) {
    const zp = clamp((t - (cueOf(z) ?? item.start + 0.3)) / 0.6), zx0 = X(z.x[0]), zx1 = X(z.x[1]), zy0 = Y(z.y[1]), zy1 = Y(z.y[0]);
    if (zp > 0) { const r = new Path2D(); r.roundRect(zx0, zy0, zx1 - zx0, zy1 - zy0, 24); fill(r, 'accent', 0.1 * E.outCubic(zp)); const c = S.ctx; c.save(); c.setLineDash([]); stroke(r, 3, 'accent', 0.5 * zp); c.restore(); }
    if (z.label) say(z.label, zx1 - 22, zy1 - 24, clamp((zp - 0.3) / 0.7), { font: af, align: 'right' });
    zoneBox = z.label ? { x: zx1 - 22 - measure(z.label, af).w, y: zy1 - 24 - T().caption, w: measure(z.label, af).w, h: T().caption * 1.2 } : null;
  }
  // axes: baseline + left axis, end labels instead of numeric ticks when the scale is conceptual
  if (gp > 0) { const a = new Path2D(); a.moveTo(P.x, P.y - 10); a.lineTo(P.x, P.y + P.h); a.lineTo(P.x + P.w + 10, P.y + P.h); stroke(a, 3, inkA(0.45), gp); }
  say(`${el.xLabel || ''} →`, P.x + P.w, P.y + P.h + 52, gp, { font: af, align: 'right' });
  say(`↑ ${el.yLabel || ''}`, P.x - 10, P.y - 34, gp, { font: af });
  if (el.xEnds) { say(el.xEnds[0], P.x + 8, P.y + P.h + 52, gp, { font: ef, alpha: 0.6 }); }
  if (el.yEnds) { say(el.yEnds[0], P.x - 18, P.y + P.h - 8, gp, { font: ef, align: 'right', alpha: 0.6 }); say(el.yEnds[1], P.x - 18, P.y + 26, gp, { font: ef, align: 'right', alpha: 0.6 }); }
  // points + labels (greedy placement: right, left, above, below; avoid earlier labels/points/plot edge)
  const placed = pts.map((q) => ({ x: X(+q.x || 0) - 14, y: Y(+q.y || 0) - 14, w: 28, h: 28 }));
  if (zoneBox) placed.push(zoneBox);
  const M = 12, hit = (b) => placed.some((o) => b.x - M < o.x + o.w && b.x + b.w + M > o.x && b.y - M < o.y + o.h && b.y + b.h + M > o.y);
  const inZone = (q) => z && q.x >= z.x[0] && q.x <= z.x[1] && q.y >= z.y[0] && q.y <= z.y[1];
  pts.forEach((q, i) => {
    const x = X(+q.x || 0), y = Y(+q.y || 0), p = clamp((t - st[i]) / 0.45), r = 14;
    if (p > 0) withT(x, y, 0, E.outBack(p), () => { const d = new Path2D(); d.arc(0, 0, r, 0, Math.PI * 2); const c = S.ctx; c.save(); c.strokeStyle = color(el.color || 'paper2'); c.lineWidth = 5; c.stroke(d); c.restore(); fill(d, z && !inZone(q) ? inkA(0.4) : ser(0)); });
    const w = measure(q.label || '', pf).w, h = T().caption * 1.1;
    const opts = [[x + 24, y + h * 0.35, 'left'], [x - 24, y + h * 0.35, 'right'], [x, y - 28, 'center'], [x, y + 52, 'center'],
      [x + 20, y - 26, 'left'], [x + 20, y + 50, 'left'], [x - 20, y - 26, 'right'], [x - 20, y + 50, 'right']];
    const boxOf = (o) => { const bx = o[2] === 'left' ? o[0] : o[2] === 'right' ? o[0] - w : o[0] - w / 2; return { x: bx, y: o[1] - h, w, h }; };
    const inside = (b) => b.x >= P.x + 6 && b.x + b.w <= B.x + B.w - 24 && b.y >= B.y + 20 && b.y + b.h <= P.y + P.h - 4;
    const overlap = (b) => placed.reduce((a, o) => a + Math.max(0, Math.min(b.x + b.w + M, o.x + o.w) - Math.max(b.x - M, o.x)) * Math.max(0, Math.min(b.y + b.h + M, o.y + o.h) - Math.max(b.y - M, o.y)), 0);
    // first free slot; if none is free, the slot with the least overlap (never blindly the first)
    let pick = opts.find((o) => inside(boxOf(o)) && !hit(boxOf(o)));
    if (!pick) pick = opts.filter((o) => inside(boxOf(o))).sort((a, b) => overlap(boxOf(a)) - overlap(boxOf(b)))[0] || opts[0];
    placed.push(boxOf(pick));
    say(q.label || '', pick[0], pick[1], clamp((t - st[i] - 0.12) / 0.4), { font: pf, align: pick[2] });
  });
}

const VARIANTS = { donut, bar: bars, line, scatter };

// the frame (card, axes, grid) must be in place before the first data item enters on its cue
function frameStart(el, start) {
  const cues = [el.items, el.categories, el.points, el.marks].filter(Array.isArray).flatMap((l) => l.map(cueOf)).filter((v) => v != null);
  if (el.zone && cueOf(el.zone) != null) cues.push(cueOf(el.zone));
  return cues.length ? Math.max(0, Math.min(start, Math.min(...cues) - 0.7)) : start;
}

export function drawChart(el, t, p, item0) {
  const item = { ...item0, start: frameStart(el, item0.start) };
  const B = { x: el.x ?? 200, y: el.y ?? 300, w: el.w ?? 1520, h: el.h ?? 660 };
  if (card(el, t, item.start, B.x, B.y, B.w, B.h) <= 0 && !S.report) return;
  const fn = VARIANTS[el.variant || 'bar']; if (!fn) throw new Error(`chart variant "${el.variant}" unknown (use ${Object.keys(VARIANTS).join(', ')})`);
  fn(el, t, item, B);
  note(el, B.x + B.w - 40, B.y + B.h - 22, t, item.start);
}
export function chartDur(el, start) {
  const lists = [el.items, el.categories, el.points, el.marks].filter(Array.isArray);
  const cues = lists.flatMap((l) => l.map(cueOf)).filter((v) => v != null);
  const n = Math.max(1, ...lists.map((l) => l.length));
  const auto = el.variant === 'line' ? 0.6 + (el.drawDur ?? Math.max(1.2, 0.35 * n)) + 0.8 : 0.5 + n * (el.step ?? 0.45) + 1.0;
  return Math.max(auto, ...cues.map((c) => c - start + 1.2), el.zone && cueOf(el.zone) ? cueOf(el.zone) - start + 1.0 : 0);
}
