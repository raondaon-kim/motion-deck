// table element — one renderer, several variants (reuse by changing data + `variant`, never new code).
//
//   variant  compare      (default) rows = items, columns = attributes; first column = bold row label
//            matrix       feature x option grid; cells "✓ O ○" / "✗ X ×" / "△" become hand-drawn marks, centered
//            before-after  last column is the "after": accent header, bold cells, arrow from the previous column
//            steps        numbered rows: a badge 1,2,3… before the first column
//   emph     column index to emphasise (tint + bold) — any variant
//   highlight row index to outline in accent — any variant
//   rows     [{cells:[...], at:<cue>}] or plain arrays; each row enters on its own cue
//
// readability rules baked in (learned while building the first lecture table):
//   - type starts at theme.type.tableHead/tableCell and grows up to 1.3x while the table fits 80% of its box
//   - every column >= 18% of the width; cells wrap balanced; text is vertically centered per row
//   - the table sits slightly above the vertical center of its box (0.4) — reads better under a title
import { S, E, clamp, color, jit, sticker, stroke, fill, withT, reportBox, inkA } from './core.js';
import { font, measure, wrapBalanced, text, animText } from './text.js';
import { roundBox } from './shapes.js';

const MARK = { '✓': 'check', '✔': 'check', 'O': 'check', 'o': 'check', '○': 'check', '◯': 'check',
  '✗': 'cross', '✕': 'cross', 'X': 'cross', 'x': 'cross', '×': 'cross', '△': 'tri', '▲': 'tri' };
const markOf = (s) => MARK[String(s ?? '').trim()];

const rowsOf = (el) => (el.rows || []).map((r) => (Array.isArray(r) ? { cells: r } : r));

function layoutAt(el, scale) {
  const ty = S.theme.type, v = el.variant || 'compare', cols = el.columns || [], rows = rowsOf(el);
  const nc = Math.max(cols.length, ...rows.map((r) => r.cells.length)), W = el.w ?? 1600;
  const hs = Math.round((el.headSize ?? ty.tableHead) * scale), cs = Math.round((el.cellSize ?? ty.tableCell) * scale);
  const padX = cs * 0.9, padY = cs * 0.62, lh = cs * 1.45;
  const hf = font('body', hs, 700), cf = font('body', cs, 500), bf = font('body', cs, 700);
  const emph = el.emph ?? (v === 'before-after' ? nc - 1 : null);
  const badge = v === 'steps' ? cs * 1.5 : 0, badgeGap = badge ? cs * 0.55 : 0;
  const fontOf = (c) => (c === 0 || c === emph ? bf : cf);
  const textW = (s, c) => (markOf(s) && v === 'matrix' ? cs * 1.4 : measure(String(s ?? ''), fontOf(c)).w);
  const want = [...Array(nc)].map((_, c) => Math.max(measure(cols[c] || '', hf).w, ...rows.map((r) => textW(r.cells[c], c))) + padX * 2 + (c === 0 ? badge + badgeGap : 0));
  const minW = W * 0.18;
  let cw;
  if (el.colWidths) cw = el.colWidths.map((f) => f * W);
  else if (v === 'matrix' && nc > 1) { const c0 = Math.max(minW, Math.min(want[0], W * 0.42)); cw = [c0, ...Array(nc - 1).fill((W - c0) / (nc - 1))]; }
  else { const sum = want.reduce((a, b) => a + b, 0); cw = want.map((w) => Math.max(minW, (w / sum) * W)); }
  const k = W / cw.reduce((a, b) => a + b, 0); cw = cw.map((w) => w * k);
  const headH = hs * 1.25 + padY * 2;
  const cells = rows.map((r) => r.cells.map((tx, c) => (markOf(tx) && v === 'matrix' ? [String(tx).trim()] :
    wrapBalanced(String(tx ?? ''), fontOf(c), cw[c] - padX * 2 - (c === 0 ? badge + badgeGap : 0)))));
  const rowH = cells.map((cl) => Math.max(badge ? badge / lh : 0, ...cl.map((ls) => ls.length)) * lh - (lh - cs) + padY * 2);
  const H = headH + rowH.reduce((a, b) => a + b, 0);
  return { v, cols, rows, nc, W, cw, hs, cs, padX, padY, lh, hf, cf, bf, headH, cells, rowH, H, emph, badge, badgeGap, fontOf };
}

export function tableLayout(el) {
  const base = layoutAt(el, 1);
  if (!el.h || el.cellSize || base.H >= el.h * 0.8) return base;
  let best = base;
  for (let s = 1.05; s <= 1.3 + 1e-6; s += 0.05) { const L = layoutAt(el, s); if (L.H > el.h * 0.8) break; best = L; }
  return best;
}

function tableStarts(el, start) {
  return rowsOf(el).map((r, i) => (typeof r.at === 'number' ? r.at : start + 0.55 + i * (el.step ?? 0.5)));
}
export const tableDur = (el, start) => Math.max(1, ...tableStarts(el, start).map((s) => s - start + 0.8));

// ---------------------------------------------------------------- hand-drawn marks
function mark(kind, cx, cy, r, p, seed) {
  if (p <= 0) return;
  const c = S.ctx, sc = E.outBack(p);
  withT(cx, cy, jit(seed, 3, 0.04), sc, () => {
    if (kind === 'check') {
      const bg = new Path2D(); bg.arc(0, 0, r, 0, Math.PI * 2); fill(bg, 'soft0');
      const pth = new Path2D(); pth.moveTo(-r * 0.5, r * 0.02); pth.lineTo(-r * 0.12, r * 0.42); pth.lineTo(r * 0.55, -r * 0.42);
      stroke(pth, r * 0.26, 'deep');
    } else if (kind === 'cross') {
      const pth = new Path2D(); pth.moveTo(-r * 0.42, -r * 0.42); pth.lineTo(r * 0.42, r * 0.42); pth.moveTo(r * 0.42, -r * 0.42); pth.lineTo(-r * 0.42, r * 0.42);
      stroke(pth, r * 0.2, inkA(0.45));
    } else if (kind === 'tri') {
      const pth = new Path2D(); pth.moveTo(0, -r * 0.55); pth.lineTo(r * 0.55, r * 0.42); pth.lineTo(-r * 0.55, r * 0.42); pth.closePath();
      stroke(pth, r * 0.18, inkA(0.7));
    }
  });
}

// ---------------------------------------------------------------- draw
export function drawTable(el, t, p, item) {
  const L = tableLayout(el), x0 = el.x ?? 160;
  const y0 = el.h ? (el.y ?? 300) + Math.max(0, (el.h - L.H) * 0.4) : el.y ?? 300;
  const starts = tableStarts(el, item.start), bp = clamp((t - item.start) / 0.45);
  const headCol = el.headColor || 'soft0', zebra = el.zebra ?? true, hl = el.highlight;
  const ghost = (fn) => { if (!S.report) return; const was = S.hideText; S.hideText = true; fn(); S.hideText = was; };
  const colX = (c) => x0 + L.cw.slice(0, c).reduce((a, b) => a + b, 0);
  const centered = (c) => L.v === 'matrix' && c > 0;
  const ty0 = y0 + L.headH, rowTop = (i) => ty0 + L.rowH.slice(0, i).reduce((a, b) => a + b, 0);

  // frame + header band (+ emphasised column tint)
  if (bp > 0) {
    const sc = 0.96 + 0.04 * E.outCubic(bp), c = S.ctx;
    c.save(); c.globalAlpha *= E.outCubic(bp);
    withT(x0 + L.W / 2, y0 + L.H / 2, 0, sc, () => {
      const box = roundBox(-L.W / 2, -L.H / 2, L.W, L.H, 26, 140);
      sticker(box, el.color || 'paper2', { dx: 9, dy: 11, shadow: 0.12 });
      c.save(); c.clip(box);
      fill(new Path2D(`M${-L.W / 2} ${-L.H / 2}h${L.W}v${L.headH}h${-L.W}z`), headCol);
      if (L.emph != null) {
        const ex = colX(L.emph) - x0 - L.W / 2, ew = L.cw[L.emph];
        fill(new Path2D(`M${ex} ${-L.H / 2}h${ew}v${L.headH}h${-ew}z`), 'accent');
        fill(new Path2D(`M${ex} ${-L.H / 2 + L.headH}h${ew}v${L.H - L.headH}h${-ew}z`), color('accent'), 0.07);
      }
      c.restore();
      stroke(box, 4);
    });
    c.restore();
  }
  // header
  L.cols.forEach((h, cI) => {
    const al = centered(cI) ? 'center' : 'left', tx = al === 'center' ? colX(cI) + L.cw[cI] / 2 : colX(cI) + L.padX + (cI === 0 ? L.badge + L.badgeGap : 0);
    const ty = y0 + L.padY + L.hs * 0.98, col = cI === L.emph ? 'paper2' : 'ink';
    if (bp <= 0) return ghost(() => text(h, tx, ty, { font: L.hf, align: al, color: col }));
    animText('lift', h, tx, ty, clamp((t - item.start - 0.2 - cI * 0.06) / 0.45), { font: L.hf, align: al, color: col });
  });
  // rows
  L.rows.forEach((r, i) => {
    const rh = L.rowH[i], lp = clamp((t - starts[i]) / 0.5), top = rowTop(i), mid = top + rh / 2;
    if (lp > 0) {
      const c = S.ctx; c.save(); c.globalAlpha *= E.outCubic(lp);
      if (zebra && i % 2 === 1) fill(new Path2D(`M${x0 + 3} ${top}h${L.W - 6}v${rh}h${-L.W + 6}z`), inkA(0.045));
      const ln = new Path2D(); ln.moveTo(x0 + 18, top + jit(i, 1, 1)); ln.lineTo(x0 + L.W - 18, top + jit(i, 2, 1));
      stroke(ln, 2.5, inkA(0.35));
      for (let cI = 1; cI < L.nc; cI++) {
        if (L.v === 'before-after' && cI === L.emph) { // arrow across the before|after border
          const ax = colX(cI), a = new Path2D(); a.moveTo(ax - 16, mid); a.lineTo(ax + 14, mid); a.moveTo(ax + 4, mid - 10); a.lineTo(ax + 14, mid); a.lineTo(ax + 4, mid + 10);
          stroke(a, 4, 'accent');
        } else { const v = new Path2D(); v.moveTo(colX(cI), top + 14); v.lineTo(colX(cI), top + rh - 14); stroke(v, 2, inkA(0.18)); }
      }
      if (hl === i) { const b = roundBox(x0 + 8, top + 6, L.W - 16, rh - 12, 18, 160 + i); stroke(b, 5, 'accent'); }
      c.restore();
    }
    if (L.badge) { // steps: number badge
      const bx = colX(0) + L.padX + L.badge / 2, bpp = clamp((t - starts[i]) / 0.4);
      if (bpp > 0) withT(bx, mid, 0, E.outBack(bpp), () => { const b = new Path2D(); b.arc(0, 0, L.badge / 2, 0, Math.PI * 2); fill(b, 'accent'); });
      const num = String(i + 1), nf = font('body', Math.round(L.cs * 0.8), 700);
      if (bpp <= 0) ghost(() => text(num, bx, mid + L.cs * 0.29, { font: nf, align: 'center', color: 'paper2' }));
      else text(num, bx, mid + L.cs * 0.29, { font: nf, align: 'center', color: 'paper2', alpha: clamp(bpp * 2 - 0.5) });
    }
    L.cells[i].forEach((lines, cI) => {
      const raw = r.cells[cI], mk = L.v === 'matrix' && cI > 0 ? markOf(raw) : null;
      const cp = clamp((t - starts[i] - 0.08 * cI) / 0.45);
      if (mk) { mark(mk, colX(cI) + L.cw[cI] / 2, mid, L.cs * 0.62, cp, i * 7 + cI); if (S.report) reportBox('visual', colX(cI) + L.cw[cI] / 2 - L.cs * 0.62, mid - L.cs * 0.62, L.cs * 1.24, L.cs * 1.24, { type: 'mark' }); return; }
      const f = L.fontOf(cI), al = centered(cI) ? 'center' : 'left', n = lines.length;
      const tx = al === 'center' ? colX(cI) + L.cw[cI] / 2 : colX(cI) + L.padX + (cI === 0 ? L.badge + L.badgeGap : 0);
      const by = top + (rh - (n * L.lh - (L.lh - L.cs))) / 2 + L.cs * 0.9;
      const col = hl === i && cI === 0 ? 'accent' : 'ink', alpha = cI === 0 || cI === L.emph ? 1 : L.v === 'before-after' ? 0.72 : 0.9;
      lines.forEach((s, k) => {
        if (lp <= 0) return ghost(() => text(s, tx, by + k * L.lh, { font: f, align: al }));
        animText('lift', s, tx, by + k * L.lh, clamp((t - starts[i] - 0.08 * cI - 0.05 * k) / 0.45), { font: f, align: al, color: col, alpha });
      });
    });
  });
}
