"""Illustration assets via Codex CLI image generation -> transparent cutouts.

manifest {key: {prompt, kind: scene|icon, slide}} -> build/assets/<key>.png (RGBA, trimmed)
- one `codex exec` per asset, run in parallel; the PNG is taken from ~/.codex/generated_images/<session>
- cache: assets/<key>.json stores the full prompt hash; unchanged prompts are not regenerated
- style prompt is derived from the palette so every image matches the deck colors
- background removal: flood-fill the near-white background from the image border (OpenCV),
  so white shapes *inside* the ink outlines survive
"""
import hashlib, json, os, re, shutil, subprocess, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

GEN = Path.home() / ".codex" / "generated_images"


def find_codex():
    """CODEX_PATH env > PATH > npm global prefix (Windows npm globals are often missing from the bash PATH)"""
    cands = [os.environ.get("CODEX_PATH"), shutil.which("codex"), shutil.which("codex.cmd"),
             str(Path(os.environ.get("APPDATA", "")) / "npm" / "codex.cmd")]
    try:
        prefix = subprocess.run(["npm", "prefix", "-g"], capture_output=True, text=True, shell=os.name == "nt", timeout=20).stdout.strip()
        if prefix: cands += [str(Path(prefix) / "codex.cmd"), str(Path(prefix) / "bin" / "codex")]
    except Exception:
        pass
    for c in cands:
        if c and Path(c).exists(): return c
    raise FileNotFoundError("codex CLI not found: npm i -g @openai/codex, or set CODEX_PATH")


def style_prompt(pal, kind):
    soft = ", ".join(pal[f"soft{i}"] for i in (0, 1, 3, 4))
    common = (f"Style: flat hand-drawn sticker illustration, thick dark ink outline ({pal['ink']}) around every shape, "
              f"flat fills in soft pastel colors ({soft}) with small touches of the accent color {pal['accent']}, "
              "no gradients, no 3D render, no photo realism, absolutely no text, letters, numbers or logos. ")
    if kind == "icon":
        return common + ("A single simple object or character, icon-like, bold and readable at small size, "
                         "isolated and centered on a plain pure white background (#FFFFFF) with generous empty margin, no ground shadow. Square 1:1.")
    return common + ("One clear scene or metaphor with a single focal subject, isolated and centered on a plain pure white "
                     "background (#FFFFFF) with generous empty margin, no ground shadow, no frame. Square 1:1.")


def _ask(prompt):
    return ("Use your image generation tool to create exactly ONE image. " + prompt +
            " IMPORTANT: do NOT run any shell commands and do NOT try to save, copy or move the file. "
            "As soon as the image is generated, reply with the single word DONE.")


def cutout(src, dst, tol=12, pad=16):
    """near-white background connected to the border -> transparent; trim to content"""
    import cv2, numpy as np
    img = cv2.imread(str(src), cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    near_white = (img.min(axis=2) >= 255 - tol).astype(np.uint8)
    # flood fill the near-white mask from every border pixel that is near-white
    mask = np.zeros((h + 2, w + 2), np.uint8)
    fillable = near_white.copy() * 255
    for x, y in [(x, 0) for x in range(0, w, 8)] + [(x, h - 1) for x in range(0, w, 8)] + [(0, y) for y in range(0, h, 8)] + [(w - 1, y) for y in range(0, h, 8)]:
        if fillable[y, x] == 255 and mask[y + 1, x + 1] == 0:
            cv2.floodFill(fillable, mask, (x, y), 128, loDiff=0, upDiff=0, flags=4 | (1 << 8))
    bg = (fillable == 128).astype(np.uint8)
    # soften the edge: 1px erosion of the background, then a small blur on alpha
    bg = cv2.erode(bg, np.ones((3, 3), np.uint8), iterations=1)
    alpha = (1 - bg) * 255
    alpha = cv2.GaussianBlur(alpha.astype(np.float32), (3, 3), 0).astype(np.uint8)
    ys, xs = np.nonzero(alpha > 8)
    if not len(xs): raise ValueError("cutout removed everything")
    x0, x1, y0, y1 = max(0, xs.min() - pad), min(w, xs.max() + pad), max(0, ys.min() - pad), min(h, ys.max() + pad)
    rgba = np.dstack([img, alpha])[y0:y1, x0:x1]
    s = 1024 / max(rgba.shape[:2])
    if s < 1: rgba = cv2.resize(rgba, (round(rgba.shape[1] * s), round(rgba.shape[0] * s)), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(dst), rgba)
    return float((alpha > 8).mean())


def generate(manifest, pal, out_dir, workers=5, log=print, retries=1):
    out = Path(out_dir); (out / "raw").mkdir(parents=True, exist_ok=True)
    codex = find_codex()
    jobs = []
    for key, spec in manifest.items():
        full = spec["prompt"].rstrip(". ") + ". " + style_prompt(pal, spec.get("kind", "scene"))
        h = hashlib.sha1(full.encode()).hexdigest()[:12]
        meta_p, png = out / f"{key}.json", out / f"{key}.png"
        if png.exists() and meta_p.exists() and json.loads(meta_p.read_text(encoding="utf-8")).get("hash") == h:
            continue
        jobs.append((key, full, h))
    if not jobs:
        log(f"assets: all {len(manifest)} cached"); return {"generated": 0, "cached": len(manifest), "failed": []}
    log(f"assets: generating {len(jobs)} (cached {len(manifest) - len(jobs)}) with {workers} parallel codex sessions")

    def run(job):
        key, full, h = job
        for attempt in range(retries + 1):
            t0 = time.time()
            p = subprocess.run([codex, "exec", "--skip-git-repo-check", "-C", str(out), "--", _ask(full)],
                               stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900)
            logtxt = p.stdout + p.stderr
            (out / "raw" / f"{key}.log").write_text(logtxt, encoding="utf-8")
            m = re.search(r"session id:\s*([0-9a-f-]{36})", logtxt)
            cands = sorted((GEN / m.group(1)).glob("*.png"), key=lambda f: f.stat().st_mtime) if m and (GEN / m.group(1)).exists() else []
            if cands:
                raw = out / "raw" / f"{key}.png"; shutil.copy(cands[-1], raw)
                try:
                    cov = cutout(raw, out / f"{key}.png")
                    (out / f"{key}.json").write_text(json.dumps({"hash": h, "prompt": full, "coverage": round(cov, 3),
                                                                 "seconds": round(time.time() - t0)}, ensure_ascii=False), encoding="utf-8")
                    return key, True, round(time.time() - t0), cov
                except Exception as e:
                    log(f"  {key}: cutout failed ({e})")
            log(f"  {key}: no image (attempt {attempt + 1})")
        return key, False, 0, 0

    failed = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for key, ok, sec, cov in ex.map(run, jobs):
            log(f"  {key}: {'OK' if ok else 'FAILED'} {sec}s" + (f"  subject {cov:.0%} of frame" if ok else ""))
            if not ok: failed.append(key)
    return {"generated": len(jobs) - len(failed), "cached": len(manifest) - len(jobs), "failed": failed}
