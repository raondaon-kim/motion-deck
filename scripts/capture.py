#!/usr/bin/env python3
"""Render, inspect and export a built motion deck (uses the ?capture hook).

  python capture.py deck.html --out shots/            # final frame of every slide + sheet.png
  python capture.py deck.html --qa                    # + layout QA -> qa.json, exit 1 on errors
  python capture.py deck.html --portrait              # also render 1080x1920 versions
  python capture.py deck.html --timeline 0.3,1,2.5    # build-up frames per slide
  python capture.py deck.html --video deck.mp4        # full playback video (needs ffmpeg)
  python capture.py deck.html --video l.mp4 --audio narration.wav [--subs captions.srt]
                                                      # narrated video (sync.py output; hold defaults to 0)
  python capture.py deck.html --slides 2,3            # 1-based subset
  python capture.py deck.html --anchors               # list model anchor names (callout targets)

QA checks (per orientation):
  ERROR overlap    two text boxes intersect (incl. chrome like page numbers)
  ERROR offcanvas  text box leaves the canvas;  WARN margin: closer than 40px to the edge
  ERROR/WARN contrast  worst-10% WCAG contrast of text color vs pixels behind it < 2.0 / < 3.0
  WARN  small      text under 18px
  ERROR runtime    any error thrown while rendering
"""
import argparse, asyncio, base64, io, json, os, subprocess, sys, time
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

TRANS_SEC = 0.5   # torn-paper transition between slides; sync.py inserts the same gap of silence
# video fps = the deck's theme.fps (window.__md.fps); transition frames = TRANS_SEC * fps
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
CANDIDATES = [os.environ.get("CHROME_PATH"), "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"]


async def launch(p):
    try:
        return await p.chromium.launch(args=ARGS)
    except Exception as first:
        for c in CANDIDATES:
            if c and Path(c).exists():
                return await p.chromium.launch(executable_path=c, args=ARGS)
        raise first


def lum(rgb):
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb[:3]
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def hex2rgb(h):
    h = h.strip()
    if h.startswith("rgb"):
        return tuple(int(float(x)) for x in h[h.index("(") + 1:h.index(")")].split(",")[:3])
    h = h.lstrip("#")
    if len(h) == 3: h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def contrast_worst(img, box, text_rgb):
    x, y, w, h = box
    W, H = img.size
    x0, y0, x1, y1 = max(0, int(x)), max(0, int(y)), min(W, int(x + w)), min(H, int(y + h))
    if x1 <= x0 or y1 <= y0: return None
    crop = img.crop((x0, y0, x1, y1)).resize((max(1, (x1 - x0) // 4), max(1, (y1 - y0) // 4)))
    lt = lum(text_rgb)
    rs = []
    for px in list(crop.getdata()):
        lb = lum(px)
        hi, lo = max(lt, lb), min(lt, lb)
        rs.append((hi + 0.05) / (lo + 0.05))
    rs.sort()
    return rs[max(0, int(len(rs) * 0.10) - 1)]


def inter(a, b):
    x = max(a["x"], b["x"]); y = max(a["y"], b["y"])
    x2 = min(a["x"] + a["w"], b["x"] + b["w"]); y2 = min(a["y"] + a["h"], b["y"] + b["h"])
    return max(0, x2 - x) * max(0, y2 - y)


def qa_slide(rep, bgimg, orient, min_text=18):
    issues = []
    W, H = rep["W"], rep["H"]
    texts = [b for b in rep["boxes"] if b["kind"] in ("text", "chrome") and b["w"] > 0 and b["h"] > 0]
    sid = rep["slide"] + 1
    for i, a in enumerate(texts):
        tag = f"slide {sid} [{orient}] {a['id']} '{a.get('text', '')}'"
        if a["x"] < 0 or a["y"] < 0 or a["x"] + a["w"] > W or a["y"] + a["h"] > H:
            issues.append(("ERROR", "offcanvas", tag))
        elif a["kind"] == "text" and (a["x"] < 40 or a["y"] < 40 or a["x"] + a["w"] > W - 40 or a["y"] + a["h"] > H - 40):
            issues.append(("WARN", "margin", tag))
        if a.get("size", 99) < (min_text if a["kind"] == "text" else 18):  # chrome (page no., label) keeps the 18px floor
            issues.append(("WARN", "small", f"{tag} size {a.get('size')}"))
        for b in texts[i + 1:]:
            ov = inter(a, b)
            if a["id"] == b["id"] and a["kind"] == b["kind"] == "text" and abs(a["y"] - b["y"]) < 2 and ov <= 0.3 * min(a["w"] * a["h"], b["w"] * b["h"]):
                continue  # same element, same line, barely touching (e.g. value + unit) — real collisions still count
            if ov > 0.06 * min(a["w"] * a["h"], b["w"] * b["h"]):
                issues.append(("ERROR", "overlap", f"{tag} <-> {b['id']} '{b.get('text', '')}'"))
        if a.get("color") and bgimg is not None:
            sc = bgimg.size[0] / W
            c = contrast_worst(bgimg, (a["x"] * sc, a["y"] * sc, a["w"] * sc, a["h"] * sc), hex2rgb(a["color"]))
            if c is not None and c < 2.0:
                issues.append(("ERROR", "contrast", f"{tag} worst={c:.2f}"))
            elif c is not None and c < 3.0:
                issues.append(("WARN", "contrast", f"{tag} worst={c:.2f}"))
    return issues


async def grab(pg, js):
    d = await pg.evaluate(f"(()=>{{{js};return document.getElementById('out').toDataURL('image/png')}})()")
    return Image.open(io.BytesIO(base64.b64decode(d.split(",")[1]))).convert("RGB")


def sheet(imgs, cols, cell_w, path, labels=None):
    if not imgs: return
    w, h = imgs[0].size; ch = int(cell_w * h / w)
    rows = (len(imgs) + cols - 1) // cols
    S = Image.new("RGB", (cols * cell_w, rows * ch), "white"); d = ImageDraw.Draw(S)
    for i, im in enumerate(imgs):
        x, y = (i % cols) * cell_w, (i // cols) * ch
        S.paste(im.resize((cell_w, ch)), (x, y))
        if labels: d.rectangle([x, y, x + 64, y + 26], fill="black"); d.text((x + 6, y + 6), labels[i], fill="white")
    S.save(path)


async def run(a):
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await launch(p)
        pg = await b.new_page(viewport={"width": 1920, "height": 1080})
        logs = []
        pg.on("pageerror", lambda e: logs.append(str(e)))
        await pg.goto(Path(a.html).resolve().as_uri() + f"?capture&scale={a.scale}")
        await pg.wait_for_function("window.__md && window.__md.ready === true", timeout=120000)
        n = await pg.evaluate("__md.count || 0")
        errors = await pg.evaluate("__md.errors")
        if await pg.evaluate("!!__md.bootFailed"):
            print("BOOT FAILED:", errors, logs); sys.exit(2)
        if a.anchors:
            for name in await pg.evaluate("Object.keys(window.DECK.models||{})"):
                print(f"ANCHORS {name}: {', '.join(await pg.evaluate(f'__md.anchors({json.dumps(name)})') or [])}")
            await b.close(); return
        sel = [int(s) - 1 for s in a.slides.split(",")] if a.slides else list(range(n))
        min_text = await pg.evaluate("(window.DECK.meta || {}).minText || 18")
        report = {"slides": n, "issues": [], "runtime_errors": []}
        orients = [False, True] if a.portrait else [False]
        for portrait in orients:
            o = "P" if portrait else "L"
            await pg.evaluate(f"__md.setPortrait({str(portrait).lower()})")
            durs = await pg.evaluate("__md.durations()")
            finals, labels = [], []
            for i in sel:
                tend = durs[i] + 0.5
                img = await grab(pg, f"__md.show({i},{tend})")
                img.save(out / f"{o}{i + 1:02d}.png"); finals.append(img); labels.append(f"{i + 1}")
                for t in ([float(x) for x in a.timeline.split(",")] if a.timeline else []):
                    (await grab(pg, f"__md.show({i},{t})")).save(out / f"{o}{i + 1:02d}_t{t}.png")
                if a.qa:
                    rep = await pg.evaluate(f"__md.layout({i},{tend})")
                    bg = await grab(pg, f"__md.show({i},{tend},{{hideText:true,noPaper:true}})")
                    report["issues"] += [dict(level=l, check=c, where=w) for l, c, w in qa_slide(rep, bg, o, min_text)]
            sheet(finals, 3 if not portrait else 5, 640 if not portrait else 300, out / f"sheet_{o}.png", labels)
        if a.video:
            await pg.evaluate("__md.setPortrait(false)")
            durs = await pg.evaluate("__md.durations()")
            hold = a.hold if a.hold is not None else (0.0 if a.audio else 1.5)
            fps = int(await pg.evaluate("__md.fps || 12")); TRANS_FRAMES = max(1, round(TRANS_SEC * fps))
            # 1) the whole video as a list of pure frame specs: __md.show(slide, t, opts) is a function of time only
            specs, clock = [], 0.0
            for n, i in enumerate(sel):
                frames = max(1, round((durs[i] + hold) * fps))  # round, not floor: no drift vs. audio
                specs += [f"__md.show({i},{f / fps},{{now:{clock + f / fps}}})" for f in range(frames)]
                clock += frames / fps
                if n < len(sel) - 1:
                    specs += [f"__md.show({i},{frames / fps + f / fps},{{to:{sel[n + 1]},u:{(f + 1) / TRANS_FRAMES},now:{clock + f / fps}}})" for f in range(TRANS_FRAMES)]
                    clock += TRANS_FRAMES / fps
            total = len(specs)
            # frames after a slide has settled (nothing animates any more) are identical: render one, copy the rest
            st = await pg.evaluate("__md.settle()")
            key_of, k = {}, 0
            for n, i in enumerate(sel):
                frames = max(1, round((durs[i] + hold) * fps)); first_static = None
                for f in range(frames):
                    if not st[i]["live"] and f / fps >= st[i]["settle"] + 2 / fps:
                        if first_static is None: first_static = k
                        else: key_of[k] = first_static
                    k += 1
                if n < len(sel) - 1: k += TRANS_FRAMES
            todo = [k for k in range(total) if k not in key_of]
            workers = a.workers or max(1, min((os.cpu_count() or 4) // 2, 6, len(todo) // 60))
            print(f"  {total} frames: render {len(todo)}, copy {len(key_of)} static ({len(key_of) / total:.0%})", flush=True)
            mime, ext = ("image/png", "png") if a.frame_format == "png" else ("image/jpeg", "jpg")
            q = 0.95 if ext == "jpg" else 1
            tmp = Path(a.video).with_suffix(".frames"); tmp.mkdir(parents=True, exist_ok=True)
            for old in tmp.glob("*.*"): old.unlink()
            t0 = time.time()

            # 2) contiguous ranges rendered by independent browsers (HyperFrames-style workers)
            async def worker(w, idx):
                bw = await launch(p); wp = await bw.new_page(viewport={"width": 1920, "height": 1080})
                await wp.goto(Path(a.html).resolve().as_uri() + f"?capture&scale={a.scale}")
                await wp.wait_for_function("window.__md && window.__md.ready === true", timeout=120000)
                await wp.evaluate("__md.setPortrait(false)")
                for j, k in enumerate(idx):
                    d = await wp.evaluate(f"(()=>{{{specs[k]};return document.getElementById('out').toDataURL('{mime}',{q})}})()")
                    (tmp / f"{k:06d}.{ext}").write_bytes(base64.b64decode(d.split(",", 1)[1]))
                    if w == 0 and j % 120 == 0:
                        print(f"  video {j}/{len(idx)} frames on worker 0 of {workers}  {time.time() - t0:.0f}s", flush=True)
                await bw.close()

            size = -(-len(todo) // workers)
            await asyncio.gather(*[worker(w, todo[w * size:(w + 1) * size]) for w in range(workers) if w * size < len(todo)])
            import shutil
            for k, src in key_of.items(): shutil.copyfile(tmp / f"{src:06d}.{ext}", tmp / f"{k:06d}.{ext}")
            print(f"  rendered {len(todo)} frames with {workers} workers in {time.time() - t0:.0f}s (+{len(key_of)} copied)", flush=True)

            # 3) one encode
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", str(tmp / f"%06d.{ext}")]
            if a.audio: cmd += ["-i", a.audio]
            if a.subs: cmd += ["-i", a.subs]
            cmd += ["-map", "0:v"] + (["-map", "1:a"] if a.audio else []) + (["-map", f"{2 if a.audio else 1}:s"] if a.subs else [])
            # tune=animation: flat fills + paper grain -> ~70% smaller than plain crf 18 at the same look
            # keep the source cadence: 24/25/30 stay native; 12 is doubled to 24 (even duplication, no 3:2 judder)
            out_fps = fps if fps >= 24 else fps * 2
            cmd += ["-vf", f"fps={out_fps},format=yuv420p", "-c:v", "libx264", "-crf", str(a.crf), "-preset", a.preset, "-tune", "animation", "-movflags", "+faststart"]
            if a.audio: cmd += ["-c:a", "aac", "-b:a", "192k"]
            if a.subs: cmd += ["-c:s", "mov_text", "-metadata:s:s:0", f"language={a.subs_lang}"]
            cmd += ["-t", f"{total / fps:.3f}", a.video]
            rc = subprocess.run(cmd).returncode
            if rc: print("ERROR ffmpeg exited", rc); sys.exit(3)
            if not a.keep_frames:
                for f in tmp.glob("*.*"): f.unlink()
                tmp.rmdir()
            print("VIDEO", a.video, f"{total} frames, {total / fps:.2f}s, {time.time() - t0:.0f}s" + (f", audio {a.audio}" if a.audio else ""))
        report["runtime_errors"] = (await pg.evaluate("__md.errors")) + logs
        await b.close()
    errs = [x for x in report["issues"] if x["level"] == "ERROR"] + [{"level": "ERROR", "check": "runtime", "where": e} for e in report["runtime_errors"]]
    warns = [x for x in report["issues"] if x["level"] == "WARN"]
    (out / "qa.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    for x in errs + warns: print(f"{x['level']:5} {x['check']:9} {x['where']}")
    print(f"DONE  {out}  errors={len(errs)} warnings={len(warns)}")
    if a.qa and errs: sys.exit(1)


if __name__ == "__main__":
    for st in (sys.stdout, sys.stderr):  # Windows consoles default to cp949 -> mojibake
        try: st.reconfigure(encoding="utf-8")
        except Exception: pass
    ap = argparse.ArgumentParser()
    ap.add_argument("html"); ap.add_argument("--out", default="shots")
    ap.add_argument("--qa", action="store_true"); ap.add_argument("--portrait", action="store_true")
    ap.add_argument("--timeline", default=None); ap.add_argument("--slides", default=None)
    ap.add_argument("--video", default=None)
    ap.add_argument("--hold", type=float, default=None, help="extra seconds per slide in --video (default 1.5, or 0 with --audio)")
    ap.add_argument("--audio", default=None, help="narration track to mux into --video (from sync.py)")
    ap.add_argument("--subs", default=None, help="SRT to embed as a soft subtitle track (from sync.py)")
    ap.add_argument("--subs-lang", default="kor")
    ap.add_argument("--workers", type=int, default=0, help="parallel browsers for --video (0 = auto: cpus-2, max 8)")
    ap.add_argument("--keep-frames", action="store_true")
    ap.add_argument("--preset", default="medium", help="x264 preset (slow = ~5% smaller, ~2x encode time)")
    ap.add_argument("--crf", type=int, default=20, help="x264 quality for --video (lower = better/larger; 23 halves the size)")
    ap.add_argument("--frame-format", choices=["jpeg", "png"], default="jpeg", help="frame transport to ffmpeg (png = lossless, ~2x slower)")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--anchors", action="store_true", help="list callout anchor names of every model and exit")
    asyncio.run(run(ap.parse_args()))
