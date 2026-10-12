import * as core from './core.js';
import { S, E, clamp, lerp, color, jit, hash, mulberry, inkA } from './core.js';
import * as TX from './text.js';
import * as SH from './shapes.js';
import * as T3 from './three-layer.js';
import { drawSlide, prepare, resetCache, LAYOUTS, RENDER } from './elements.js';

const DEFAULT_THEME = {
  ink: '#1E1B2E', paper: '#F4EEE3', paper2: '#FBF7F0', accent: '#C23A3C', letterbox: '#1E1B2E',
  palette: { tomato: '#EF5B3F', butter: '#F5D25E', sage: '#A9C49A', sky: '#A8CBEA', lilac: '#C8B6E6', pink: '#F5B6C1', cobalt: '#2E45B8', peach: '#F7BFA0', mint: '#BFE3D0' },
  fonts: { display: { family: 'DM Sans' }, body: { family: 'Noto Sans KR' } },
  fps: 12, jitter: 1, boil: false, motion: 'full', paperTexture: 0.9,
  transition: 'paper', transitionDur: 0.45,
  toon: { steps: [90, 170, 255], outline: 5.5, light: 2.3, ambient: 0.9 },
  // type scale: sizes (logical px on 1920x1080), line heights, gaps and how sub-text enters.
  // defaults = the original look; the lecture template set overrides these for readability.
  type: {
    kicker: 22, body: 32, bodyLh: 1.6, bullet: 32, bulletLh: 1.75, caption: 28, captionLh: 1.5, cardTitle: 40,
    quoteBy: 28, calloutSub: 19, gapTitle: 40, gapBody: 44, tableHead: 34, tableCell: 30,
    subAnim: 'rise', subStagger: 0.12, bulletStagger: 0.16, subDur: 0.45, overlap: 0.55,
  },
};

const Q = new URLSearchParams(location.search);
const CAPTURE = Q.has('capture');
const cv = document.getElementById('out');
let main2d, paperPattern = null, slides = [], cur = 0, slideT0 = 0, trans = null, lastTick = -1, dirty = true;
const errors = [];

function mergeTheme(t = {}) {
  return { ...DEFAULT_THEME, ...t, palette: { ...DEFAULT_THEME.palette, ...(t.palette || {}) }, fonts: { ...DEFAULT_THEME.fonts, ...(t.fonts || {}) }, toon: { ...DEFAULT_THEME.toon, ...(t.toon || {}) }, type: { ...DEFAULT_THEME.type, ...(t.type || {}) } };
}

// ---------- canvas sizing ----------
function setPortrait(p) {
  S.portrait = !!p; S.W = p ? 1080 : 1920; S.H = p ? 1920 : 1080;
  document.body.classList.toggle('port', S.portrait);
  resetCache(); sizeCanvas(); dirty = true;
}
function sizeCanvas() {
  let sc = 1;
  if (CAPTURE) sc = parseFloat(Q.get('scale') || '1');
  else {
    const r = cv.getBoundingClientRect();
    sc = clamp(((window.devicePixelRatio || 1) * (r.width || S.W)) / S.W, 1, S.deck.meta?.maxScale || 2);
  }
  S.scale = sc; cv.width = Math.round(S.W * sc); cv.height = Math.round(S.H * sc);
  T3.resize(); dirty = true;
}

// ---------- paper grain (multiply layer, offset each tick) ----------
function makePaper() {
  const n = 512, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), d = x.createImageData(n, n), r = mulberry(5);
  for (let i = 0; i < d.data.length; i += 4) { const v = 236 + r() * 19; d.data[i] = v; d.data[i + 1] = v - 1; d.data[i + 2] = v - 4; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  x.globalAlpha = 0.07; x.strokeStyle = '#6b5e4a'; x.lineWidth = 1;
  for (let i = 0; i < 240; i++) { const a = r() * n, b = r() * n, o = r() * Math.PI, l = 6 + r() * 26; x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo(a + Math.cos(o) * l * 0.5 + 3, b + Math.sin(o) * l * 0.5, a + Math.cos(o) * l, b + Math.sin(o) * l); x.stroke(); }
  x.globalAlpha = 0.18; x.fillStyle = '#5a4c3a';
  for (let i = 0; i < 650; i++) x.fillRect(r() * n, r() * n, 1.4, 1.4);
  paperPattern = main2d.createPattern(c, 'repeat');
}

// ---------- chrome: brand, label, page number, dots ----------
function chrome(i) {
  const m = S.deck.meta || {}; if (m.chrome === false) return;
  const ch = { brand: true, label: true, page: true, dots: true, ...(typeof m.chrome === 'object' ? m.chrome : {}) };
  const n = slides.length, first = i === 0, last = i === n - 1, s = slides[i];
  if (s.chrome === false) return;
  const k = { kind: 'chrome' };
  if (ch.brand && m.brand && !first && !last) TX.text(m.brand, 64, 84, { ...k, font: TX.font('display', 36, 700), track: -1 });
  if (ch.label && m.label) TX.text(m.label, S.W - 64, 78, { ...k, font: TX.font('display', 20, 500), align: 'right', track: 6, alpha: 0.7 });
  if (ch.page) TX.text(`${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, S.W - 64, S.H - 50, { ...k, font: TX.font('display', 22, 500), align: 'right', track: 4, alpha: 0.75 });
  if (ch.dots) { const c = S.ctx; for (let j = 0; j < n; j++) { c.fillStyle = color('ink'); c.globalAlpha = j === i ? 0.9 : 0.25; c.beginPath(); c.arc(70 + j * 26, S.H - 58, j === i ? 7 : 5, 0, 7); c.fill(); } c.globalAlpha = 1; }
}

// ---------- transition: torn-paper sheet of the next slide's bg rises ----------
function wipe(u, nextBg, seed) {
  if (u <= 0) return;
  const kind = S.theme.transition;
  if (kind === 'fade') { S.ctx.save(); S.ctx.globalAlpha = E.inOutCubic(u); S.ctx.fillStyle = color(nextBg); S.ctx.fillRect(0, 0, S.W, S.H); S.ctx.restore(); return; }
  const y0 = lerp(S.H + 80, -120, E.inOutCubic(u)), p = new Path2D();
  p.moveTo(-10, S.H + 10);
  for (let o = 0, N = 36; o <= N; o++) { const x = (o / N) * (S.W + 20) - 10; p.lineTo(x, y0 + Math.sin(o * 1.7 + seed) * 18 + (hash(seed + o * 3.1) - 0.5) * 34 + (x / S.W - 0.5) * 60); }
  p.lineTo(S.W + 10, S.H + 10); p.closePath();
  const c = S.ctx;
  c.save(); c.translate(0, -12); core.fill(p, 'paper2'); c.restore();
  c.save(); c.translate(0, 6); core.fill(p, inkA(0.12)); c.restore();
  core.fill(p, nextBg);
}

// ---------- frame ----------
function frame(i, t, now, tr, opts = {}) {
  S.now = now; S.tick = Math.floor(now * S.fps); S.btick = Math.floor(now * 12); S.ctx = main2d;
  const c = main2d; c.save(); c.setTransform(S.scale, 0, 0, S.scale, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  S.hideText = !!opts.hideText;
  try {
    drawSlide(slides[i], i, t);
    chrome(i);
    if (tr) wipe(tr.u, slides[tr.to].bg || 'paper', 3 + tr.to * 2);
    if (S.theme.paperTexture > 0 && !opts.noPaper) {
      c.globalCompositeOperation = 'multiply'; c.globalAlpha = S.theme.paperTexture; c.fillStyle = paperPattern;
      const ox = S.boil ? (S.btick * 13) % 64 : 0, oy = S.boil ? (S.btick * 29) % 64 : 0;
      c.translate(-ox, -oy); c.fillRect(0, 0, S.W + 64, S.H + 64);
    }
  } catch (e) {
    errors.push(`slide ${i + 1}: ${e.message}`); console.error(e);
    c.setTransform(S.scale, 0, 0, S.scale, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.fillStyle = '#300'; c.fillRect(0, 0, S.W, 140); c.fillStyle = '#fff'; c.font = '28px monospace';
    c.fillText(`ERROR slide ${i + 1}: ${e.message}`.slice(0, 110), 30, 80);
  }
  S.hideText = false; c.restore();
}

const clock = () => performance.now() / 1000;
function go(i) {
  i = clamp(i, 0, slides.length - 1);
  if (trans) { cur = trans.to; slideT0 = trans.start + S.theme.transitionDur; trans = null; }
  if (i === cur) return;
  if (S.theme.transition === 'none') { cur = i; slideT0 = clock(); dirty = true; return; }
  trans = { from: cur, to: i, start: clock() };
  const h = document.getElementById('hint'); if (h) h.style.opacity = 0;
  if (!CAPTURE) history.replaceState(null, '', '#' + (i + 1));
}
function loop() {
  requestAnimationFrame(loop);
  const now = clock(), tick = Math.floor(now * S.fps);
  if (tick === lastTick && !dirty) return;
  lastTick = tick; dirty = false;
  if (trans) {
    const u = (now - trans.start) / S.theme.transitionDur;
    if (u >= 1) { cur = trans.to; slideT0 = trans.start + S.theme.transitionDur; trans = null; }
    else { frame(trans.from, now - slideT0, now, { to: trans.to, u }); return; }
  }
  frame(cur, now - slideT0, now, null);
}

// ---------- boot ----------
async function boot() {
  const deck = window.DECK, A = window.DECK_ASSETS || {};
  S.deck = deck; S.theme = mergeTheme(deck.theme); S.fps = S.theme.fps;
  // motion: one knob for every idle movement (line boil, outline wobble, model float/sway,
  // sticker spin, paper grain). Entrances/builds are unaffected.
  //   'full'  as designed            'calm' boil at half strength, models drift at 35%
  //   'still' nothing moves after the build; lines keep their hand-drawn shape (boil frozen)
  //   0..1    idle motion amplitude only (jitter stays theme.jitter; 0 also freezes boil)
  const mo = S.theme.motion;
  const [mv, jm] = typeof mo === 'number' ? [clamp(mo, 0, 1), 1] : ({ full: [1, 1], calm: [0.35, 0.5], still: [0, 1] }[mo] ?? [1, 1]);
  S.motion = mv; S.jitter = S.theme.jitter * jm; S.boil = S.theme.boil && mv > 0 ? 1 : 0;
  slides = deck.slides || [];
  document.body.style.background = color(S.theme.letterbox);
  await Promise.all((A.fonts || []).map(async (f) => { try { const ff = new FontFace(f.family, `url(${f.url})`, { weight: String(f.weight), unicodeRange: f.range || undefined }); await ff.load(); document.fonts.add(ff); } catch (e) { errors.push('font ' + f.family + ' ' + f.weight + ': ' + e.message); } }));
  await Promise.all(Object.entries(A.images || {}).map(([k, url]) => new Promise((res) => { const im = new Image(); im.onload = () => { S.images[k] = im; res(); }; im.onerror = () => { errors.push('image ' + k + ' failed to load'); res(); }; im.src = url; })));
  main2d = cv.getContext('2d'); S.ctx = main2d;
  const models = deck.models || {};
  if (Object.keys(models).length) { T3.init(); for (const [k, def] of Object.entries(models)) { try { S.models[k] = await T3.loadModel(k, def, (A.models || {})[k]); } catch (e) { errors.push(`model ${k}: ${e.message}`); } } }
  makePaper();
  const allowPortrait = deck.meta?.portrait !== false;
  setPortrait(false);

  window.__md = {
    ready: true, errors, count: slides.length, fps: S.fps,
    durations: () => slides.map((s, i) => prepare(s, i).end),
    settle: () => slides.map((s, i) => { const P = prepare(s, i); return { settle: P.settle, live: P.live }; }),
    show: (i, t, o = {}) => { frame(i, t, o.now ?? t, o.to != null ? { to: o.to, u: o.u } : null, o); return true; },
    setPortrait: (p) => { setPortrait(p); return true; },
    layout: (i, t) => { S.report = []; frame(i, t, t, null); const r = S.report; S.report = null; return { slide: i, W: S.W, H: S.H, bg: color(slides[i].bg || 'paper'), boxes: r }; },
    anchors: (name) => (S.models[name] ? T3.anchorsOf(S.models[name]) : null),
    api: { ...core, ...TX, ...SH, S },
    layouts: Object.keys(LAYOUTS), elementTypes: Object.keys(RENDER),
  };
  if (CAPTURE) return;

  const fit = () => { if (allowPortrait) { const p = innerHeight > innerWidth * 1.15; if (p !== S.portrait) setPortrait(p); } sizeCanvas(); };
  fit(); addEventListener('resize', () => requestAnimationFrame(fit));
  const h = location.hash.match(/\d+/); if (h) cur = clamp(+h[0] - 1, 0, slides.length - 1);
  slideT0 = clock();
  const next = () => (trans ? trans.to : cur);
  addEventListener('keydown', (e) => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(next() + 1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(next() - 1); }
    else if (e.key === 'Home') go(0); else if (e.key === 'End') go(slides.length - 1);
    else if (e.key === 'f' || e.key === 'F') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
    else if (e.key === 'r' || e.key === 'R') { slideT0 = clock(); dirty = true; } // replay build
  });
  cv.addEventListener('click', (e) => { const r = cv.getBoundingClientRect(); go(next() + (e.clientX - r.left < r.width * 0.3 ? -1 : 1)); });
  let sx = null;
  addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  addEventListener('touchend', (e) => { if (sx == null) return; const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 40) go(next() + (d < 0 ? 1 : -1)); sx = null; });
  loop();
}
boot().catch((e) => { errors.push('boot: ' + e.message); console.error(e); window.__md = { ready: true, errors, bootFailed: true }; });
