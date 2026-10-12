// Diagram elements drawn natively (text stays real text: fonts, QA, cues all work).
//   cards: 2-4 cards in a row — illustration + title + short text, each card can have its own `at`
//   flow:  step boxes joined by arrows + optional back edges (loops) with labels
import { S, E, clamp, prog, color, jit, sticker, stroke, fill, withT, reportBox, inkA } from './core.js';
import { font, fontPx, measure, wrap, wrapBalanced, text, animText } from './text.js';
import { arrow, roundBox } from './shapes.js';
import { drawTable, tableDur } from './table.js';
import { drawChart, chartDur } from './chart.js';

const STEP = 0.35; // default gap between items when no cue is given

// when each item starts: its own (resolved) `at`, else start + i*step
const itemStarts = (el, start) => (el.items || el.nodes || []).map((it, i) => (typeof it.at === 'number' ? it.at : start + i * (el.step ?? STEP)));
export const itemsDur = (el, start) => Math.max(0.6, ...itemStarts(el, start).map((s) => s - start + 0.7));


// ---------------------------------------------------------------- cards
function drawCards(el, t, p, item) {
  const items = el.items || [], n = items.length; if (!n) return;
  const x0 = el.x ?? 160, y0 = el.y ?? 360, W = el.w ?? 1600, H = el.h ?? 600, gap = el.gap ?? 40;
  const cw = (W - gap * (n - 1)) / n, starts = itemStarts(el, item.start);
  const cols = el.colors || ['soft1', 'soft4', 'soft6', 'soft2'];
  const ty = S.theme.type, ts = el.titleSize ?? (n >= 4 ? ty.cardTitle - 4 : ty.cardTitle), bs = el.textSize ?? (n >= 4 ? ty.caption - 2 : ty.caption), blh = bs * ty.captionLh;
  const bf0 = font('body', bs, 500), maxBodyLines = Math.max(1, ...items.map((it) => wrapBalanced(it.text || '', bf0, cw - 64).length));
  items.forEach((it, i) => {
    const lp = clamp((t - starts[i]) / 0.5);
    const cx = x0 + i * (cw + gap), cy = y0;
    const tf = font('body', ts, 700), bf = font('body', bs, 500);
    const lines = wrapBalanced(it.text || '', bf, cw - 64);
    // variant "number": a big numeral badge instead of an illustration (no image generation needed)
    const numMode = el.variant === 'number', numH = numMode ? Math.min(H * 0.3, 170) : 0;
    const artH = numMode ? numH : it.art && S.images[it.art] ? Math.min(H * 0.42, cw * 0.56) : 0;
    // number cards: centre the whole block vertically; icon cards keep the art at the top
    const contentH = artH + (artH ? 30 : 0) + ts + bs * 0.9 + bs + (maxBodyLines - 1) * blh;
    const top = numMode ? cy + Math.max(40, (H - contentH) / 2 - 10) : cy + 40;
    // report text boxes at final positions even before reveal (QA sees the settled layout)
    const tyT = top + artH + (artH ? 30 : 0) + ts, by = tyT + bs * 0.9 + bs;
    if (lp <= 0) {
      if (S.report) { const was = S.hideText; S.hideText = true; text(it.title || '', cx + cw / 2, tyT, { font: tf, align: 'center' }); lines.forEach((ln, k) => text(ln, cx + cw / 2, by + k * blh, { font: bf, align: 'center' })); S.hideText = was; }
      return;
    }
    const sc = E.outBack(lp), rise = (1 - E.outExpo(lp)) * 60;
    withT(cx + cw / 2, cy + H / 2 + rise, jit(i + 70, 1, 0.006), sc, () => {
      const box = roundBox(-cw / 2, -H / 2, cw, H, 28, 40 + i);
      sticker(box, it.color || cols[i % cols.length], { dx: 9, dy: 11, shadow: 0.14 }); stroke(box, 4);
    });
    if (numMode) {
      const r = numH * 0.46, ncx = cx + cw / 2, ncy = top + numH / 2 + rise, np = E.outBack(clamp((t - starts[i] - 0.08) / 0.5));
      withT(ncx, ncy, jit(i + 90, 4, 0.02), np, () => { const c0 = new Path2D(); c0.arc(0, 0, r, 0, Math.PI * 2); sticker(c0, 'paper2', { dx: 5, dy: 6, shadow: 0.12 }); stroke(c0, 4); });
      const num = String(it.num ?? i + 1).padStart(2, '0'), nf = font('display', Math.round(numH * 0.42), 700);
      text(num, ncx, ncy + numH * 0.15, { font: nf, align: 'center', color: 'accent', alpha: clamp(np * 1.5 - 0.3) });
    } else if (artH) {
      const img = S.images[it.art], iw = (artH * img.naturalWidth) / img.naturalHeight, aw = Math.min(iw, cw - 40), ah = (aw * img.naturalHeight) / img.naturalWidth;
      withT(cx + cw / 2, top + artH / 2 + rise, 0, E.outBack(clamp((t - starts[i] - 0.08) / 0.5)), () => S.ctx.drawImage(img, -aw / 2, -ah / 2, aw, ah));
      reportBox('visual', cx + cw / 2 - aw / 2, top, aw, ah, { type: 'image' });
    }
    const tp = clamp((t - starts[i] - 0.15) / 0.45);
    animText('rise', it.title || '', cx + cw / 2, tyT + rise, tp, { font: tf, align: 'center', color: it.titleColor || 'ink' });
    lines.forEach((ln, k) => animText(ty.subAnim, ln, cx + cw / 2, by + k * blh + rise, clamp((t - starts[i] - 0.4 - k * ty.subStagger) / ty.subDur), { font: bf, align: 'center', alpha: 0.85 }));
  });
}

// ---------------------------------------------------------------- flow
function drawFlow(el, t, p, item) {
  const nodes = el.nodes || [], n = nodes.length; if (!n) return;
  // a linear flow (no back edges) sits at the visual centre of the content area (yLinear); loops keep room below
  const x0 = el.x ?? 160, y = (el.back && el.back.length) || el.yLinear == null ? el.y ?? 640 : el.yLinear, W = el.w ?? 1600;
  const size = el.size ?? (n >= 5 ? 34 : 42), f = font('body', size, 700), sf = font('body', Math.max(S.theme.type.caption, Math.round(size * 0.68)), 500);
  const gap = el.gap ?? 90, bw = (W - gap * (n - 1)) / n, lhL = size * 1.25, subPx = Math.max(S.theme.type.caption, Math.round(size * 0.68));
  const maxLines = Math.max(1, ...nodes.map((nd) => wrapBalanced(nd.label || '', f, bw - 36).length)), anySub = nodes.some((nd) => nd.sub);
  const bh = el.boxHeight ?? Math.max(size * 3.0, maxLines * lhL + (anySub ? subPx * 1.5 : 0) + size * 1.4);
  const starts = itemStarts(el, item.start), cols = el.colors || ['soft0', 'soft3', 'soft1', 'soft4', 'soft6', 'soft2'];
  const cxOf = (i) => x0 + i * (bw + gap) + bw / 2;
  nodes.forEach((nd, i) => {
    const lp = clamp((t - starts[i]) / 0.45), cx = cxOf(i);
    // arrow from the previous node draws in just before this node pops
    if (i > 0) {
      const ap = clamp((t - starts[i] + 0.25) / 0.3);
      if (ap > 0) arrow(cxOf(i - 1) + bw / 2 + 12, y, cx - bw / 2 - 14, y, 0, 60 + i, ap, 'ink', 5);
    }
    const lines = wrapBalanced(nd.label || '', f, bw - 36), lh = size * 1.25;
    const blockH = lines.length * lh - (lh - size) + (nd.sub ? subPx * 1.5 : 0);
    const ty = y - blockH / 2 + size * 0.88;
    if (lp <= 0) {
      if (S.report) { const was = S.hideText; S.hideText = true; lines.forEach((ln, k) => text(ln, cx, ty + k * lh, { font: f, align: 'center' })); S.hideText = was; }
      return;
    }
    if (el.numbered) text(String(i + 1).padStart(2, '0'), cx, y - bh / 2 - 26, { font: font('display', Math.round(size * 0.82), 700), align: 'center', color: 'accent', alpha: clamp(lp * 1.6 - 0.2) });
    withT(cx, y, jit(i + 90, 2, 0.008), E.outBack(lp), () => {
      const box = roundBox(-bw / 2, -bh / 2, bw, bh, 26, 80 + i);
      sticker(box, nd.color || cols[i % cols.length], { dx: 7, dy: 9, shadow: 0.14 }); stroke(box, 4);
    });
    lines.forEach((ln, k) => animText('fade', ln, cx, ty + k * lh, clamp((lp - 0.3) / 0.7), { font: f, align: 'center' }));
    if (nd.sub) animText(S.theme.type.subAnim, nd.sub, cx, ty + (lines.length - 1) * lh + subPx * 1.5, clamp((lp - 0.5) / 0.5), { font: sf, align: 'center', alpha: 0.75 });
  });
  // back edges: curve under the row from `from` to `to`, label under the curve
  (el.back || []).forEach((b, k) => {
    const s0 = typeof b.at === 'number' ? b.at : Math.max(...starts) + 0.4 + k * 0.3, bp = clamp((t - s0) / 0.6);
    const x1 = cxOf(b.from), x2 = cxOf(b.to), yb = y + bh / 2 + 18, depth = b.depth ?? 150;
    const lf = font('body', Math.round(size * 0.8), 700);
    const ly = yb + depth + size * 1.25; // label sits under the lowest point of the curve
    if (bp <= 0) {
      if (S.report && b.label) { const was = S.hideText; S.hideText = true; text(b.label, (x1 + x2) / 2, ly, { font: lf, align: 'center' }); S.hideText = was; }
      return;
    }
    // quadratic dip drawn as a polyline so the arrow helper can trim it
    const pts = []; for (let s = 0; s <= 24; s++) { const u = s / 24; pts.push([x1 + (x2 - x1) * u, yb + Math.sin(Math.PI * u) * depth]); }
    const c = S.ctx, m = Math.max(2, Math.floor(pts.length * clamp(bp))), path = new Path2D();
    path.moveTo(pts[0][0], pts[0][1]); for (let s = 1; s < m; s++) path.lineTo(pts[s][0] + jit(k + 120, s, 1.2), pts[s][1] + jit(k + 121, s, 1.2));
    c.save(); c.setLineDash([16, 12]); stroke(path, 5, b.color || 'accent'); c.restore();
    if (bp >= 1) { // arrow head at `to`
      const [ex, ey] = pts[pts.length - 1], [px, py] = pts[pts.length - 3], a = Math.atan2(ey - py, ex - px), hd = new Path2D();
      hd.moveTo(ex - Math.cos(a - 0.5) * 22, ey - Math.sin(a - 0.5) * 22); hd.lineTo(ex, ey); hd.lineTo(ex - Math.cos(a + 0.5) * 22, ey - Math.sin(a + 0.5) * 22);
      stroke(hd, 5, b.color || 'accent');
    }
    if (b.label) animText('rise', b.label, (x1 + x2) / 2, ly, clamp((bp - 0.4) / 0.6), { font: lf, align: 'center', color: b.color || 'accent' });
  });
}

export const DIAGRAMS = {
  chart: { phase: 'decor', layer: 'front', dur: chartDur, draw: drawChart },
  table: { phase: 'decor', layer: 'front', dur: tableDur, draw: drawTable },
  cards: { phase: 'decor', layer: 'front', dur: itemsDur, draw: drawCards },
  flow: { phase: 'decor', layer: 'front', draw: drawFlow,
    dur: (el, start) => Math.max(itemsDur({ ...el, items: el.nodes }, start) + (el.back?.length ? 1.2 : 0),
      ...(el.back || []).map((b) => (typeof b.at === 'number' ? b.at - start + 1.0 : 0))) },
};
