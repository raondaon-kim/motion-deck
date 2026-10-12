"""Reusable diagram components: table, cards, flow, chart.

Each component = one runtime renderer + one template + variants + readability limits + a library of
proven examples. New lectures adapt these instead of rebuilding them.

- check(template, slots)   limit violations -> fed back to the storyboard LLM as repair instructions
- harvest(storyboard, ...) after a successful make, store each component slide in library/<component>/<hash>.json
- prompt_block()           variants, limits and a few library examples for the storyboard prompt
                           ("adapt the STRUCTURE, never copy the text")
"""
import hashlib, json, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "library"

MARKS = ("✓", "✗", "△", "O", "X")


def _n(x): return len(str(x or ""))


# ---------------------------------------------------------------- table
def _check_table(sl, w):
    errs, v = [], sl.get("variant", "compare")
    cols = sl.get("columns") or []
    lo, hi = (2, 4) if v == "matrix" else (2, 3)
    if not lo <= len(cols) <= hi: errs.append(f"{w}: table needs {lo}–{hi} columns, got {len(cols)}")
    errs += [f"{w}: header '{c}' is longer than 10 characters" for c in cols if _n(c) > 10]
    rows = sl.get("rows") or []
    if not 2 <= len(rows) <= 5: errs.append(f"{w}: table needs 2–5 rows, got {len(rows)}")
    for k, r in enumerate(rows):
        cells = r.get("cells") if isinstance(r, dict) else r
        if not isinstance(cells, list) or len(cells) != len(cols):
            errs.append(f"{w}: row {k + 1} must have exactly {len(cols)} cells"); continue
        for j, c in enumerate(cells):
            lim = 10 if j == 0 else 22
            if _n(c) > lim: errs.append(f"{w}: row {k + 1} cell '{c}' is longer than {lim} characters — shorten to a phrase")
            if v == "matrix" and j > 0 and str(c).strip() not in MARKS: errs.append(f"{w}: matrix cell '{c}' must be ✓, ✗ or △")
    return errs


def _body_table(sl):
    return {"columns": sl.get("columns"), "rows": [r.get("cells") if isinstance(r, dict) else r for r in sl.get("rows", [])]}


# ---------------------------------------------------------------- cards
def _check_cards(sl, w):
    errs, v = [], sl.get("variant", "icon")
    items = sl.get("items") or []
    if not 2 <= len(items) <= 4: errs.append(f"{w}: cards need 2–4 items, got {len(items)}")
    for k, it in enumerate(items):
        if not isinstance(it, dict): errs.append(f"{w}: card {k + 1} must be an object"); continue
        if _n(it.get("title")) > 10: errs.append(f"{w}: card {k + 1} title '{it.get('title')}' is longer than 10 characters")
        if _n(it.get("text")) > 40: errs.append(f"{w}: card {k + 1} text is longer than 40 characters — shorten")
        if v == "icon" and not (it.get("art") or {}).get("prompt"): errs.append(f"{w}: card {k + 1} needs art.prompt (variant icon) — or use variant number")
    return errs


def _body_cards(sl):
    return {"items": [{"title": it.get("title"), "text": it.get("text"), **({"art": it["art"]["prompt"]} if isinstance(it.get("art"), dict) else {})}
                      for it in sl.get("items", []) if isinstance(it, dict)]}


# ---------------------------------------------------------------- flow
def _check_flow(sl, w):
    errs, v = [], sl.get("variant", "linear")
    nodes, back = sl.get("nodes") or [], sl.get("back") or []
    if not 3 <= len(nodes) <= 6: errs.append(f"{w}: flow needs 3–6 nodes, got {len(nodes)}")
    for k, nd in enumerate(nodes):
        if _n(nd.get("label")) > 8: errs.append(f"{w}: node {k + 1} label '{nd.get('label')}' is longer than 8 characters")
        if _n(nd.get("sub")) > 12: errs.append(f"{w}: node {k + 1} sub '{nd.get('sub')}' is longer than 12 characters")
    if len(back) > 2: errs.append(f"{w}: at most 2 back edges")
    for b in back:
        if not (0 <= b.get("from", -1) < len(nodes) and 0 <= b.get("to", -1) < len(nodes)) or b.get("to", 0) >= b.get("from", 0):
            errs.append(f"{w}: back edge {b} must go from a later node to an earlier one (0-based)")
        if _n(b.get("label")) > 12: errs.append(f"{w}: back edge label '{b.get('label')}' is longer than 12 characters")
    if v == "loop" and not back: errs.append(f"{w}: variant loop needs at least one back edge")
    return errs


def _body_flow(sl):
    return {"nodes": [{k: nd.get(k) for k in ("label", "sub") if nd.get(k)} for nd in sl.get("nodes", [])],
            "back": [{k: b.get(k) for k in ("from", "to", "label")} for b in sl.get("back", []) or []]}


# ---------------------------------------------------------------- chart
def _num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _check_chart(sl, w):
    errs, c = [], sl.get("chart") or {}
    v = c.get("variant")
    if v not in ("donut", "bar", "line", "scatter"): return [f"{w}: chart.variant must be donut | bar | line | scatter"]
    if c.get("data_source") not in ("source", "example"):
        errs.append(f"{w}: chart.data_source must be 'source' (numbers come from the material) or 'example' (illustrative numbers)")
    if v == "donut":
        it = c.get("items") or []
        if not 2 <= len(it) <= 5: errs.append(f"{w}: donut needs 2–5 items (fold the rest into '기타'), got {len(it)}")
        for k, x in enumerate(it):
            if not _num(x.get("value")) or x["value"] <= 0: errs.append(f"{w}: donut item {k + 1} needs a positive numeric value")
            if _n(x.get("label")) > 8: errs.append(f"{w}: donut label '{x.get('label')}' is longer than 8 characters")
    elif v in ("bar", "line"):
        cats, ser = c.get("categories") or [], c.get("series") or []
        lo, hi = (2, 6) if v == "bar" else (3, 12)
        if not lo <= len(cats) <= hi: errs.append(f"{w}: {v} needs {lo}–{hi} categories, got {len(cats)}")
        if not 1 <= len(ser) <= 2: errs.append(f"{w}: {v} needs 1–2 series (never two y-axes), got {len(ser)}")
        for x in cats:
            lab = x.get("label") if isinstance(x, dict) else x
            if _n(lab) > (8 if v == "bar" else 5): errs.append(f"{w}: category '{lab}' is too long")
        for s_ in ser:
            vals = s_.get("values") or []
            if len(vals) != len(cats) or not all(_num(y) and y >= 0 for y in vals): errs.append(f"{w}: series '{s_.get('name')}' needs {len(cats)} non-negative numbers")
            if _n(s_.get("name")) > 10: errs.append(f"{w}: series name '{s_.get('name')}' is longer than 10 characters")
        for m in c.get("marks") or []:
            if not (0 <= m.get("index", -1) < len(cats)): errs.append(f"{w}: line mark {m} refers to a missing category")
            if _n(m.get("label")) > 10: errs.append(f"{w}: line mark label '{m.get('label')}' is longer than 10 characters")
        if len(c.get("marks") or []) > 3: errs.append(f"{w}: at most 3 line marks")
    elif v == "scatter":
        pts = c.get("points") or []
        if not 3 <= len(pts) <= 7: errs.append(f"{w}: scatter needs 3–7 points, got {len(pts)}")
        for q in pts:
            if not (_num(q.get("x")) and _num(q.get("y"))): errs.append(f"{w}: scatter point '{q.get('label')}' needs numeric x and y")
            if _n(q.get("label")) > 8: errs.append(f"{w}: scatter label '{q.get('label')}' is longer than 8 characters")
        for k in ("xLabel", "yLabel"):
            if not c.get(k) or _n(c.get(k)) > 8: errs.append(f"{w}: scatter needs {k} (≤ 8자)")
        z = c.get("zone")
        if z and not (isinstance(z.get("x"), list) and isinstance(z.get("y"), list) and len(z["x"]) == len(z["y"]) == 2):
            errs.append(f"{w}: scatter zone needs x:[from,to] and y:[from,to]")
    return errs


def _body_chart(sl):
    c = dict(sl.get("chart") or {})
    def strip(o):  # cues are lecture-specific
        if isinstance(o, dict): return {k: strip(x) for k, x in o.items() if k != "at"}
        if isinstance(o, list): return [strip(x) for x in o]
        return o
    return {"chart": strip(c)}


COMPONENTS = {
    "table": {"default": "compare", "check": _check_table, "body": _body_table, "variants": {
        "compare": "항목 × 속성 비교 (방법별 방식·장점, 도구별 특징). 첫 열 = 항목 이름",
        "matrix": "기능 × 선택지 가능 여부. 칸은 ✓ / ✗ / △ 중 하나 (손그림 기호). 열 최대 4",
        "before-after": "전/후 대비. 열 = [기준, 이전, 이후]. 마지막 열 강조 + 화살표",
        "steps": "순서가 있는 절차. 행마다 번호 배지 자동. 열 = [단계 이름, 할 일]"},
        "limits": "2–3 columns (matrix up to 4), 2–5 rows, header ≤ 10자, first-column label ≤ 10자, other cells ≤ 22자 (a phrase). "
                  "Rows: [{\"cells\": [...], \"at\": cue}] — one cue per row. Optional \"emph\" (column index), \"highlight\" (row index)."},
    "cards": {"default": "icon", "check": _check_cards, "body": _body_cards, "variants": {
        "icon": "같은 급의 항목 2~4개, 카드마다 작은 아이콘 일러스트 (역할, 도구, 사례)",
        "number": "번호가 큰 카드 (원칙, 체크리스트, 실패 사례). 일러스트 없음 → 생성 시간 절약"},
        "limits": "2–4 items [{\"title\": ≤10자, \"text\": ≤40자, \"art\": {\"prompt\"} (icon only), \"at\": cue}] — one cue per card."},
    "chart": {"default": None, "check": _check_chart, "body": _body_chart, "variant_of": lambda sl: (sl.get("chart") or {}).get("variant"), "variants": {
        "donut": "전체 중 비중 (하루 업무 시간 구성). items [{label ≤8자, value, at}] 2~5개, center {value, label}?, highlight (index)?",
        "bar": "항목별 크기 비교. categories [label ≤8자 | {label, at}] 2~6개, series [{name, values}] 1~2개. 전/후 비교면 series [전, 후] + delta: true (전은 자동으로 회색)",
        "line": "시간에 따른 변화. categories (x 라벨 3~12개), series 1~2개, marks [{index, label ≤10자, at}] 최대 3개로 단계 표시",
        "scatter": "두 지표의 관계. points [{label ≤8자, x, y, at}] 3~7개, xLabel/yLabel ≤8자, xEnds/yEnds [\"낮음\",\"높음\"]?, zone {x:[a,b], y:[c,d], label, at} 강조 영역"},
        "limits": "slots.chart = {variant, data_source: 'source'|'example', unit?, ...variant fields}. One y-axis only. "
                  "If the material gives no numbers, invent plausible ILLUSTRATIVE numbers, set data_source 'example' (the slide shows '예시 수치') "
                  "and the narration must say so (예를 들어 / 예시로). Never present example numbers as facts. The numbers must SUPPORT what the narration says (if it says 'the biggest share', that item must be the largest); a donut center shows a meaningful total (e.g. '8시간'), not '100%'. Cues: one per item/category/point/mark ('at')."},
    "flow": {"default": "linear", "check": _check_flow, "body": _body_flow, "variants": {
        "linear": "한 방향 단계 (입력 → 처리 → 결과)",
        "loop": "반복·순환 (검수 → 반려 → 재작업). back 연결선 1~2개 필수"},
        "limits": "3–6 nodes [{\"label\": ≤8자, \"sub\": ≤12자 optional, \"at\": cue}]; back [{\"from\": later, \"to\": earlier (0-based), \"label\": ≤12자, \"at\": cue}]."},
}


def check(template, slots, where):
    c = COMPONENTS.get(template)
    if not c: return []
    v = c["variant_of"](slots) if c.get("variant_of") else slots.get("variant", c["default"])
    if v not in c["variants"]: return [f"{where}: {template} variant '{v}' unknown (use {', '.join(c['variants'])})"]
    return c["check"](slots, where)


def infer_variant(template, sl):
    """storyboards written before variants existed: derive the variant from the content"""
    if template == "flow": return "loop" if sl.get("back") else "linear"
    if template == "cards": return "icon" if any(isinstance(i, dict) and i.get("art") for i in sl.get("items", [])) else "number"
    return COMPONENTS[template]["default"]


def harvest(storyboard, project_name, title):
    n = 0
    for s in storyboard.get("slides", []):
        t = s.get("template"); c = COMPONENTS.get(t)
        if not c: continue
        sl = s.get("slots", {})
        v = c["variant_of"](sl) if c.get("variant_of") else (sl.get("variant") or infer_variant(t, sl))
        body = {"variant": v, "title": sl.get("title"), **c["body"](sl)}
        key = hashlib.sha1(json.dumps(body, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
        d = LIB / t; d.mkdir(parents=True, exist_ok=True)
        f = d / f"{key}.json"
        if not f.exists():
            f.write_text(json.dumps({**body, "topic": title, "project": project_name, "added": time.strftime("%Y-%m-%d")},
                                    ensure_ascii=False, indent=1), encoding="utf-8"); n += 1
    return n


def examples(template, limit=None):
    """newest first, one per variant first"""
    d = LIB / template
    if not d.exists(): return []
    limit = limit or max(3, len(COMPONENTS[template]["variants"]))
    items = sorted((json.loads(f.read_text(encoding="utf-8")) for f in d.glob("*.json")), key=lambda x: x.get("added", ""), reverse=True)
    out, seen = [], set()
    for x in items:
        if x["variant"] not in seen: out.append(x); seen.add(x["variant"])
    for x in items:
        if len(out) >= limit: break
        if x not in out: out.append(x)
    return out[:limit]


def prompt_block():
    lines = ["## Diagram components (table, cards, flow, chart)",
             "Prefer these over plain bullets when the content has structure. Always set \"variant\" in slots."]
    for name, c in COMPONENTS.items():
        lines.append(f"\n### {name}")
        lines += [f"- variant {k}: {v}" for k, v in c["variants"].items()]
        lines.append(f"- limits: {c['limits']}")
        ex = examples(name)
        if ex:
            lines.append("- reference examples from previous lectures (adapt the STRUCTURE to the new topic, never copy the text):")
            for x in ex:
                body = {k: v for k, v in x.items() if k not in ("topic", "project", "added", "title")}
                lines.append("  " + json.dumps(body, ensure_ascii=False) + f"  (topic: {x.get('topic', '')})")
    return "\n".join(lines)
