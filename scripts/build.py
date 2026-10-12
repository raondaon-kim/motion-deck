#!/usr/bin/env python3
"""Build a motion deck: deck.json -> one self-contained HTML file.

  python build.py deck.json -o out/deck.html [--offline] [--runtime path]

- validates deck.json (unknown types, missing fields, bad refs) -> errors stop the build
- inlines images (png/jpg/webp/svg) and GLB models as base64
- fonts: Google Fonts fetched with `text=` (only glyphs the deck uses), or local
  font files subset with fontTools. --offline skips fetching (system fallback fonts).
"""
import argparse, base64, html, json, mimetypes, os, re, sys, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNTIME = HERE.parent / "runtime" / "dist" / "motion-deck.js"

STACK = {"kicker", "title", "body", "bullets", "stats", "specs", "quote", "chips", "text", "spacer"}
ABS = {"blob", "model", "image", "sticker", "squiggle", "underline", "scribble", "arrow", "halftone", "callout", "rain", "custom", "cards", "flow", "table", "chart"}
LAYOUTS = {"text-left", "text-right", "hero", "center", "top", "full"}
STICKERS = {"star", "sparkle", "cloud", "sun", "moon", "heart", "feather", "dot", "flower"}
PRESETS = {"phone", "laptop"}
REQUIRED = {
    "kicker": ["text"], "title": [["lines", "text"]], "body": [["lines", "text"]], "bullets": ["items"],
    "stats": ["items"], "specs": ["rows"], "quote": [["lines", "text"]], "chips": ["items"], "text": [["lines", "text"]],
    "blob": ["x", "y"], "model": ["model", "x", "y"], "image": ["src", "x", "y"], "sticker": ["x", "y"],
    "squiggle": ["x", "y"], "underline": ["x", "y"], "scribble": [["target", "x"]], "arrow": ["from", "to"],
    "halftone": ["x", "y"], "callout": ["target", "label"], "custom": ["code"], "cards": ["items"], "flow": ["nodes"], "table": ["columns", "rows"], "chart": ["variant"],
}
DEFAULT_PALETTE = {"tomato", "butter", "sage", "sky", "lilac", "pink", "cobalt", "peach", "mint"}
THEME_KEYS = {"ink", "paper", "paper2", "accent", "letterbox"}
MOTIONS = {"full", "calm", "still"}
CUE = re.compile(r"^@[\w.-]+([+-]\d+(\.\d+)?)?$")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def validate(deck, root):
    errs, warns = [], []
    theme = deck.get("theme", {})
    colors = DEFAULT_PALETTE | set(theme.get("palette", {})) | THEME_KEYS
    images = set(deck.get("assets", {}).get("images", {}))
    mo = theme.get("motion", "full")
    if not (mo in MOTIONS or (isinstance(mo, (int, float)) and 0 <= mo <= 1)):
        errs.append(f"theme.motion: '{mo}' (use full | calm | still | 0..1)")
    models = deck.get("models", {})
    for k, m in models.items():
        if not any(x in m for x in ("preset", "shapes", "src")):
            errs.append(f"models.{k}: needs preset | shapes | src")
        if m.get("preset") and m["preset"] not in PRESETS:
            errs.append(f"models.{k}: unknown preset '{m['preset']}' (have: {', '.join(sorted(PRESETS))})")
        if m.get("src") and not (root / m["src"]).exists():
            errs.append(f"models.{k}: file not found {m['src']}")
    for k, p in deck.get("assets", {}).get("images", {}).items():
        if not (root / p).exists():
            errs.append(f"assets.images.{k}: file not found {p}")

    def chk_color(c, where):
        if isinstance(c, str) and not c.startswith(("#", "rgb")) and c not in colors:
            warns.append(f"{where}: color '{c}' is not a palette/theme key (will be used as raw CSS)")

    slides = deck.get("slides", [])
    if not slides:
        errs.append("deck has no slides")
    for i, s in enumerate(slides, 1):
        w = f"slide {i}"
        if s.get("layout", "text-left") not in LAYOUTS:
            errs.append(f"{w}: unknown layout '{s.get('layout')}' (have: {', '.join(sorted(LAYOUTS))})")
        chk_color(s.get("bg", "paper"), f"{w}.bg")
        if "duration" in s and not (isinstance(s["duration"], (int, float)) and s["duration"] > 0):
            errs.append(f"{w}.duration: must be a positive number of seconds")
        if "narration" in s and not isinstance(s["narration"], (str, list)):
            errs.append(f"{w}.narration: must be a string or a list of strings")
        ids = {e.get("id") for e in s.get("elements", []) if e.get("type") == "model"}
        for j, e in enumerate(s.get("elements", [])):
            t = e.get("type"); we = f"{w} el#{j} ({t})"
            if t not in STACK | ABS:
                errs.append(f"{we}: unknown type"); continue
            def walk(o, path):
                if isinstance(o, dict):
                    for k2, v2 in o.items():
                        if k2 == "at" and isinstance(v2, str) and path: errs.append(f"{we}{path}.at: unresolved cue '{v2}' -> run scripts/sync.py")
                        else: walk(v2, f"{path}.{k2}")
                elif isinstance(o, list):
                    for k2, v2 in enumerate(o): walk(v2, f"{path}[{k2}]")
            walk({k: v for k, v in e.items() if k not in ("at", "dur")}, "")
            for tk in ("at", "dur"):
                v = e.get(tk)
                if isinstance(v, str):
                    if CUE.match(v): errs.append(f"{we}.{tk}: unresolved cue '{v}' -> run scripts/sync.py and build the *.resolved.json it writes")
                    else: errs.append(f"{we}.{tk}: '{v}' is not a number or @cue")
            for req in REQUIRED.get(t, []):
                opts = req if isinstance(req, list) else [req]
                if not any(o in e for o in opts):
                    errs.append(f"{we}: missing '{' | '.join(opts)}'")
            for ck in ("color", "accentColor", "ringColor", "bulletColor"):
                if ck in e: chk_color(e[ck], f"{we}.{ck}")
            if t == "model":
                if e.get("model") not in models: errs.append(f"{we}: model '{e.get('model')}' not in deck.models")
                if not e.get("id"): warns.append(f"{we}: give models an id so callouts can target them")
                for part, tex in (e.get("textures") or {}).items():
                    if isinstance(tex, str) and tex not in images: errs.append(f"{we}: texture image '{tex}' not in assets.images")
            if t == "cards":
                for k, it in enumerate(e.get("items", [])):
                    if it.get("art") and it["art"] not in images: errs.append(f"{we}.items[{k}]: art image '{it['art']}' not in assets.images")
            if t == "flow":
                nn = len(e.get("nodes", []))
                for b in e.get("back", []):
                    if not (0 <= b.get("from", -1) < nn and 0 <= b.get("to", -1) < nn): errs.append(f"{we}: back edge {b} refers to a missing node")
            if t == "image" and e.get("src") not in images: errs.append(f"{we}: image '{e.get('src')}' not in assets.images")
            if t == "sticker" and e.get("shape", "star") not in STICKERS: errs.append(f"{we}: unknown sticker '{e.get('shape')}' (have: {', '.join(sorted(STICKERS))})")
            if t in ("callout", "scribble") and isinstance(e.get("target"), dict) and e["target"].get("model") not in ids:
                errs.append(f"{we}: target model id '{e['target'].get('model')}' not on this slide")
            if t == "title":
                ls = e.get("lines") or []
                for ln in ls:
                    if est_width(ln, e.get("size", 84)) > 1000:
                        warns.append(f"{we}: title line may be too wide: '{ln}' (shorten or lower size)")
    return errs, warns


def est_width(s, size):
    return sum(size * (1.0 if ord(ch) > 0x2E80 else 0.56) for ch in s)


def collect_text(o, out):
    if isinstance(o, str): out.add(o)
    elif isinstance(o, list):
        for x in o: collect_text(x, out)
    elif isinstance(o, dict):
        for k, v in o.items():
            if k in ("code", "src", "type", "model", "color", "bg", "layout", "shape", "id", "anchor", "enter", "anim", "align", "mark", "part", "kind", "preset", "narration", "at", "dur"):
                continue
            collect_text(v, out)


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read() if binary else r.read().decode()


def google_font(family, weight, chars):
    """Return list of (url_data, unicode_range) for the given chars, chunked."""
    out = []
    chars = sorted(chars)
    for k in range(0, len(chars), 300):
        chunk = "".join(chars[k:k + 300])
        q = urllib.parse.urlencode({"family": f"{family}:wght@{weight}", "text": chunk, "display": "swap"})
        css = fetch("https://fonts.googleapis.com/css2?" + q)
        for m in re.finditer(r"src:\s*url\(([^)]+)\)", css):
            data = fetch(m.group(1), binary=True)
            rng = ",".join(f"U+{ord(c):X}" for c in chunk)
            out.append(("data:font/woff2;base64," + base64.b64encode(data).decode(), rng))
    return out


def local_font(path, chars):
    from fontTools import subset
    from fontTools.ttLib import TTFont
    f = TTFont(path)
    sub = subset.Subsetter(subset.Options())
    sub.populate(text="".join(chars)); sub.subset(f)
    import io
    buf = io.BytesIO()
    try:
        f.flavor = "woff2"; f.save(buf); mime = "font/woff2"
    except Exception:
        f.flavor = None; buf = io.BytesIO(); f.save(buf); mime = "font/ttf"
    return "data:%s;base64,%s" % (mime, base64.b64encode(buf.getvalue()).decode())


def build_fonts(deck, root, chars, offline):
    theme = deck.get("theme", {})
    fonts = {"display": {"family": "DM Sans"}, "body": {"family": "Noto Sans KR"}, **theme.get("fonts", {})}
    need = {"display": [500, 700], "body": [500, 700]}
    out, notes, seen = [], [], set()
    for role, spec in fonts.items():
        fam = spec["family"]
        for wgt in spec.get("weights", need.get(role, [500, 700])):
            if (fam, wgt) in seen: continue
            seen.add((fam, wgt))
            files = spec.get("files", {})
            try:
                if str(wgt) in files:
                    out.append({"family": fam, "weight": wgt, "url": local_font(root / files[str(wgt)], chars)})
                elif not offline:
                    for url, rng in google_font(fam, wgt, chars):
                        out.append({"family": fam, "weight": wgt, "url": url, "range": rng})
                else:
                    notes.append(f"font {fam} {wgt}: offline, using system fallback")
            except Exception as e:
                notes.append(f"font {fam} {wgt}: {e} -> system fallback")
    return out, notes


HTML = """<!doctype html><html lang="{lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>html,body{{margin:0;height:100%;background:{letterbox};overflow:hidden}}
#out{{position:absolute;inset:0;margin:auto;width:min(100vw,177.78vh);height:min(56.25vw,100vh);display:block;cursor:pointer}}
body.port #out{{width:min(100vw,56.25vh);height:min(177.78vw,100vh)}}
#hint{{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);font:500 12px/1 system-ui,sans-serif;letter-spacing:.12em;color:#fff;opacity:.55;transition:opacity .6s;pointer-events:none}}
body.port #hint{{display:none}}</style></head>
<body><canvas id="out" role="img" aria-label="{title}"></canvas><div id="hint">{hint}</div>
<script>window.DECK={deck};window.DECK_ASSETS={assets};</script>
<script>{runtime}</script></body></html>"""


html_mod = html


def main():
    for st in (sys.stdout, sys.stderr):  # Windows consoles default to cp949 -> mojibake
        try: st.reconfigure(encoding="utf-8")
        except Exception: pass
    ap = argparse.ArgumentParser()
    ap.add_argument("deck"); ap.add_argument("-o", "--out", default=None)
    ap.add_argument("--offline", action="store_true"); ap.add_argument("--runtime", default=str(RUNTIME))
    a = ap.parse_args()
    dp = Path(a.deck).resolve(); root = dp.parent
    deck = json.loads(dp.read_text(encoding="utf-8"))
    errs, warns = validate(deck, root)
    for w in warns: print("WARN ", w)
    if errs:
        for e in errs: print("ERROR", e)
        sys.exit(1)
    assets = {"images": {}, "models": {}, "fonts": []}
    for k, p in deck.get("assets", {}).get("images", {}).items():
        mime = mimetypes.guess_type(p)[0] or "image/png"
        assets["images"][k] = f"data:{mime};base64," + base64.b64encode((root / p).read_bytes()).decode()
    for k, m in deck.get("models", {}).items():
        if m.get("src"):
            assets["models"][k] = base64.b64encode((root / m["src"]).read_bytes()).decode()
    chars = set()
    collect_text(deck.get("slides", []), chars); collect_text(deck.get("meta", {}), chars)
    chars = set("".join(chars)) | set("0123456789 /—–-.,:%+#&()·“”'\"") | set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
    chars.discard("\n")
    assets["fonts"], notes = build_fonts(deck, root, chars, a.offline)
    for n in notes: print("NOTE ", n)
    meta = deck.get("meta", {})
    html = HTML.format(lang=html_mod.escape(meta.get("lang", "ko")), title=html_mod.escape(meta.get("title", "Motion Deck")),
                       letterbox=deck.get("theme", {}).get("letterbox", "#1E1B2E"),
                       hint=html_mod.escape(meta.get("hint", "← → / 클릭으로 이동 · F 전체화면 · R 다시 재생")),
                       deck=json.dumps(deck, ensure_ascii=False).replace("</", "<\\/"),
                       assets=json.dumps(assets).replace("</", "<\\/"),
                       runtime=Path(a.runtime).read_text(encoding="utf-8"))
    out = Path(a.out) if a.out else dp.with_suffix(".html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    fb = sum(len(f["url"]) for f in assets["fonts"])
    print(f"OK   {out}  {len(html)/1024:.0f} KB  (slides {len(deck['slides'])}, fonts {fb/1024:.0f} KB, warnings {len(warns)})")


if __name__ == "__main__":
    main()
