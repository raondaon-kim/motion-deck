import { S, E, clamp, color, jit, reportBox } from './core.js';

const FALLBACK = 'system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "Hiragino Sans", sans-serif';

// role: 'display' | 'body'; returns a CSS font string
export function font(role = 'body', size = 32, weight = 500) {
  const f = S.theme.fonts[role] || S.theme.fonts.body, b = S.theme.fonts.body;
  // portrait: small text gets bigger so it survives phone screens
  const s = S.portrait && size < 30 ? Math.round(size * 1.3) : size;
  // display fonts are often latin-only -> fall back to the body font for Hangul/Kana
  const chain = f.family === b.family ? `"${f.family}"` : `"${f.family}", "${b.family}"`;
  return `${weight} ${s}px ${chain}, ${FALLBACK}`;
}
export const fontPx = (f) => parseFloat(f.match(/(\d+(?:\.\d+)?)px/)[1]);

export function measure(text, f, track = 0) {
  const c = S.ctx; c.save(); c.font = f; c.letterSpacing = track + 'px';
  const m = c.measureText(text); c.restore();
  return { w: m.width, asc: m.actualBoundingBoxAscent || fontPx(f) * 0.8, desc: m.actualBoundingBoxDescent || fontPx(f) * 0.2 };
}

// word wrap. Korean/latin wrap on spaces (keep-all); very long tokens break per char (CJK).
export function wrap(text, f, maxW, track = 0) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = '';
    for (const w of words) {
      const test = line + w;
      if (measure(test.trimEnd(), f, track).w <= maxW || !line.trim()) {
        if (!line.trim() && measure(w, f, track).w > maxW) {
          // hard break per char
          for (const ch of w) {
            if (measure(line + ch, f, track).w > maxW && line) { out.push(line); line = ch; } else line += ch;
          }
        } else line = test;
      } else { out.push(line.trimEnd()); line = w.trimStart(); }
    }
    out.push(line.trimEnd());
  }
  return out;
}

// balanced wrap: same number of lines as wrap(), but the narrowest width that keeps that count,
// so the last line is never a lone word (common in Korean captions/cards)
export function wrapBalanced(text, f, maxW, track = 0) {
  const base = wrap(text, f, maxW, track);
  if (base.length < 2) return base;
  let lo = maxW * 0.45, hi = maxW;
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (wrap(text, f, mid, track).length > base.length) lo = mid; else hi = mid; }
  return wrap(text, f, hi, track);
}

// draw one string. opt: font, color, alpha, align, track, rot, scale
export function text(str, x, y, opt = {}) {
  const f = opt.font || font('body', 32);
  const track = opt.track || 0;
  const m = measure(str, f, track);
  const align = opt.align || 'left';
  const left = align === 'center' ? x - m.w / 2 : align === 'right' ? x - m.w : x;
  if (opt.report !== false) reportBox(opt.kind || 'text', left, y - m.asc, m.w, m.asc + m.desc, { color: color(opt.color), size: fontPx(f), text: str.slice(0, 40) });
  if (S.hideText) return m;
  const c = S.ctx; c.save();
  c.globalAlpha *= opt.alpha ?? 1; c.font = f; c.fillStyle = color(opt.color);
  c.textAlign = align; c.textBaseline = 'alphabetic'; c.letterSpacing = track + 'px';
  c.translate(x, y); if (opt.rot) c.rotate(opt.rot); if (opt.scale != null) c.scale(opt.scale, opt.scale);
  c.fillText(str, 0, 0); c.restore();
  return m;
}

// ---------- animated text. p = 0..1 progress ----------
// wipe: clip reveals left->right
export function textWipe(str, x, y, p, opt = {}) {
  if (p <= 0) { ghost(str, x, y, opt); return; }
  const f = opt.font, m = measure(str, f, opt.track || 0), px = fontPx(f);
  const align = opt.align || 'left';
  const left = align === 'center' ? x - m.w / 2 : align === 'right' ? x - m.w : x;
  const c = S.ctx; c.save(); c.beginPath();
  c.rect(left - 20, y - px * 1.25, (m.w + 40) * E.outCubic(clamp(p)), px * 1.7); c.clip();
  text(str, x, y, opt); c.restore();
}
// rise: slides up from below inside a clip
export function textRise(str, x, y, p, opt = {}) {
  if (p <= 0) { ghost(str, x, y, opt); return; }
  const f = opt.font, px = fontPx(f), m = measure(str, f, opt.track || 0);
  const align = opt.align || 'left';
  const left = align === 'center' ? x - m.w / 2 : align === 'right' ? x - m.w : x;
  const c = S.ctx; c.save(); c.beginPath(); c.rect(left - 30, y - px * 1.2, m.w + 60, px * 1.6); c.clip();
  // report at final position so QA sees the settled layout
  text(str, x, y + (1 - E.outExpo(clamp(p))) * px * 1.2, { ...opt, report: false });
  c.restore();
  reportBox('text', left, y - m.asc, m.w, m.asc + m.desc, { color: color(opt.color), size: px, text: str.slice(0, 40) });
}
// pop: each character scales in with overshoot
export function textPop(str, x, y, p, opt = {}) {
  const f = opt.font, track = opt.track || 0;
  const chars = [...str];
  const widths = chars.map((ch) => measure(ch, f, track).w);
  const total = widths.reduce((a, b) => a + b, 0);
  const align = opt.align || 'left';
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const full = measure(str, f, track);
  reportBox('text', cx, y - full.asc, total, full.asc + full.desc, { color: color(opt.color), size: fontPx(f), text: str.slice(0, 40) });
  const n = chars.length, win = 0.45;
  chars.forEach((ch, i) => {
    const start = n > 1 ? (i / (n - 1)) * (1 - win) : 0;
    const lp = clamp((p - start) / win);
    if (lp > 0) text(ch, cx + widths[i] / 2, y, { ...opt, align: 'center', scale: E.outBack(lp), rot: jit(i + 40, 0, 0.05) + (1 - lp) * 0.3, report: false });
    cx += widths[i];
  });
}
// lift: soft entrance for sub-text - fades in while rising a little, no clip (calmer than rise)
export function textLift(str, x, y, p, opt = {}) {
  if (p <= 0) { ghost(str, x, y, opt); return; }
  const px = fontPx(opt.font), e = E.outCubic(clamp(p));
  text(str, x, y + (1 - e) * px * 0.55, { ...opt, alpha: (opt.alpha ?? 1) * e, report: false });
  const m = measure(str, opt.font, opt.track || 0), al = opt.align || 'left';
  const left = al === 'center' ? x - m.w / 2 : al === 'right' ? x - m.w : x;
  reportBox('text', left, y - m.asc, m.w, m.asc + m.desc, { color: color(opt.color), size: px, text: str.slice(0, 40) });
}
export function textFade(str, x, y, p, opt = {}) {
  text(str, x, y, { ...opt, alpha: (opt.alpha ?? 1) * clamp(p) });
}
// invisible but still reported (so QA sees final layout before reveal)
function ghost(str, x, y, opt) {
  const was = S.hideText; S.hideText = true; text(str, x, y, opt); S.hideText = was;
}

export function animText(kind, str, x, y, p, opt) {
  if (kind === 'pop') return textPop(str, x, y, p, opt);
  if (kind === 'rise') return textRise(str, x, y, p, opt);
  if (kind === 'fade') return textFade(str, x, y, p, opt);
  if (kind === 'lift') return textLift(str, x, y, p, opt);
  if (kind === 'none') return text(str, x, y, opt);
  return textWipe(str, x, y, p, opt);
}
