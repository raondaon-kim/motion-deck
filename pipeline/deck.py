"""storyboard.json + templates + palette -> deck.json (deterministic, no LLM).

Template mini-language (templates/<set>/<name>.json):
  "{slot}"      whole-string placeholder -> the slot's value (any JSON type)
  "{slot@}"     the slot's cue -> "@c1"; the key is dropped when the slot has no cue
  "$soft"       this slide's rotating background pastel; "$soft+2" = 2 steps further
  "$accent" "$ink" "$paper" "$deep" "$soft3" "$series1"  palette roles
  "if": "slot"  element kept only when the slot is filled ("if": "!slot" = only when empty)
  "vary": {"x": 40, "r": 30}  deterministic per-slide offset (+-value), seeded by slide index
Slot kinds (template "slots"): text, text?, lines:N, items:N-M, illustration, illustration?, nodes:N-M, back?
"""
import copy, hashlib, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PH = re.compile(r"^\{([\w.]+)(@?)\}$")


def load_templates(name="lecture"):
    d = ROOT / "templates" / name
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(d.glob("*.json")) if not p.stem.startswith("_")}


def load_set(name="lecture"):
    """template-set settings: type scale, font, meta defaults (templates/<set>/_set.json)"""
    f = ROOT / "templates" / name / "_set.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


def catalog(templates):
    """compact description for the storyboard LLM"""
    return [{"name": k, "use": t["use"], "slots": t["slots"]} for k, t in templates.items()]


def _hash01(*parts):
    return int(hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def _cue(v):
    if v is None: return None
    v = str(v).strip().lstrip("@")
    return f"@{v}" if v else None


class SlideCtx:
    def __init__(self, idx, slide, soft_i, assets, kinds):
        self.idx, self.slide, self.soft_i, self.assets, self.kinds = idx, slide, soft_i, assets, kinds
        self.slots = slide.get("slots", {}); self.cues = slide.get("cues", {})

    def color(self, s):
        m = re.match(r"^\$soft(?:\+(\d+))?$", s)
        if m: return f"soft{(self.soft_i + int(m.group(1) or 0)) % 8}"
        return s[1:]

    def art_key(self, slot, spec, sub=None):
        """register an illustration request -> asset key"""
        if isinstance(spec, str): spec = {"prompt": spec}
        key = f"s{self.idx + 1:02d}_{slot}" + (f"{sub}" if sub is not None else "")
        self.assets[key] = {"prompt": spec["prompt"], "kind": spec.get("kind", "icon" if sub is not None else "scene"), "slide": self.idx + 1}
        return key, spec

    def slot_value(self, name):
        v = self.slots.get(name)
        if v is None: return None
        if isinstance(v, dict) and "prompt" in v:  # illustration slot
            return self.art_key(name, v)[0]
        if self.kinds.get(name, "").startswith("lines") and isinstance(v, str):
            return [x for x in v.splitlines() if x.strip()]
        if name in ("items", "nodes") and isinstance(v, list):
            out = []
            for k, it in enumerate(v):
                if not isinstance(it, dict): out.append(it); continue
                it = dict(it)
                if it.get("art"): it["art"] = self.art_key(name, it["art"], k)[0]
                if it.get("at"): it["at"] = _cue(it["at"])
                out.append(it)
            return out
        if name == "chart" and isinstance(v, dict):
            def cues(o):
                if isinstance(o, dict): return {k: (_cue(x) if k == "at" and isinstance(x, str) else cues(x)) for k, x in o.items()}
                if isinstance(o, list): return [cues(x) for x in o]
                return o
            spec = cues({k: x for k, x in v.items() if k != "data_source"})
            if v.get("data_source", "example") == "example" and not spec.get("note"): spec["note"] = "예시 수치"
            return spec
        if name == "rows" and isinstance(v, list):
            return [({**r, "at": _cue(r["at"])} if r.get("at") else r) if isinstance(r, dict) else r for r in v]
        if name == "back" and isinstance(v, list):
            return [{**b, "at": _cue(b["at"])} if b.get("at") else b for b in v]
        return v

    def slot_cue(self, name):
        if name in self.cues: return _cue(self.cues[name])
        v = self.slots.get(name)
        if isinstance(v, dict) and v.get("at"): return _cue(v["at"])
        return None

    def fill(self, o):
        if isinstance(o, str):
            m = PH.match(o)
            if m: return (self.slot_cue(m.group(1)) if m.group(2) else self.slot_value(m.group(1)))
            if o.startswith("$"): return self.color(o)
            return o
        if isinstance(o, list): return [self.fill(x) for x in o]
        if isinstance(o, dict):
            out = {}
            if "$merge" in o:
                m = self.fill(o["$merge"])
                if isinstance(m, dict): out.update(m)
            for k, v in o.items():
                if k == "$merge": continue
                fv = self.fill(v)
                if fv is None and isinstance(v, str) and PH.match(v): continue  # empty slot / no cue -> drop key
                out[k] = fv
            return out
        return o

    def keep(self, el):
        c = el.get("if")
        if not c: return True
        neg = c.startswith("!"); name = c.lstrip("!")
        filled = self.slots.get(name) not in (None, "", [], {})
        return filled != neg

    def vary(self, el):
        for k, amp in (el.pop("vary", None) or {}).items():
            if isinstance(el.get(k), (int, float)):
                el[k] = round(el[k] + (_hash01(self.idx, k, el.get("type")) * 2 - 1) * amp)
        return el


STACK = {"kicker", "title", "body", "bullets", "quote", "text", "stats", "chips", "specs"}


def stagger_cues(els):
    """sub-text that shares the previous text block's cue would enter together with the title;
    drop the duplicate so it follows automatically (after the title, per the type scale)"""
    seen = set()
    for e in els:
        if e.get("type") in STACK and "x" not in e and isinstance(e.get("at"), str):
            if e["at"] in seen: e.pop("at")
            else: seen.add(e["at"])
    return els


def expand(storyboard, project, theme, templates, tset=None):
    """-> (deck dict, assets manifest {key: {prompt, kind, slide}})"""
    slides, assets, errors = [], {}, []
    for i, sb in enumerate(storyboard["slides"]):
        name = sb.get("template")
        if name not in templates:
            errors.append(f"slide {i + 1}: unknown template '{name}' (have: {', '.join(templates)})"); continue
        t = copy.deepcopy(templates[name])
        for sname, kind in t["slots"].items():
            # optional: "text?", "back? [...]" (the '?' ends the first word), or a kind with a default
            optional = kind.endswith("?") or kind.split()[0].endswith("?") or "default" in kind
            if not optional and sb.get("slots", {}).get(sname) in (None, "", [], {}):
                errors.append(f"slide {i + 1} ({name}): slot '{sname}' ({kind}) is required")
        ctx = SlideCtx(i, sb, (i * 3) % 8, assets, t["slots"])  # *3 -> neighbouring slides never share a hue family
        els = [ctx.vary(ctx.fill({k: v for k, v in e.items() if k != "if"})) for e in t["elements"] if ctx.keep(e)]
        slide = {"layout": t.get("layout", "text-left"), "bg": ctx.color(t.get("bg", "$soft")), "elements": stagger_cues(els)}
        for k in ("textY", "textStart", "chrome"):
            if k in t: slide[k] = t[k]
        if sb.get("narration"): slide["narration"] = sb["narration"]
        slides.append(slide)
    p, ts = project, (tset or {})
    fam = p.get("font") or ts.get("font")
    fonts = {"fonts": {"display": {"family": fam}, "body": {"family": fam}}} if fam else {}
    deck = {
        "meta": {"title": p.get("title", "Lecture"), "lang": p.get("lang", "ko"), "brand": p.get("brand", ""),
                 "label": p.get("label", ""), "portrait": False, **ts.get("meta", {})},
        "theme": {**theme, **ts.get("theme", {}), **fonts, **({"motion": p["motion"]} if p.get("motion") else {}), **({"boil": p["boil"]} if "boil" in p else {}), **({"fps": p["fps"]} if p.get("fps") else {})},
        "assets": {"images": {k: f"assets/{k}.png" for k in assets}},
        "slides": slides,
    }
    return deck, assets, errors
