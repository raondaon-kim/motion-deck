"""Source text -> storyboard.json (narration + template + slots + cues) with one LLM call,
validated by expanding it with the real templates; errors are fed back (max 2 repairs)."""
import json

from . import llm
from .deck import catalog, expand
from . import components as CP

SYSTEM = """You are a lecture video storyboard writer for a hand-drawn motion-graphics slide engine.
You turn source material into a narrated slide sequence. You never write code, coordinates or colors —
only pick templates from the catalog and fill their slots. Output ONLY one JSON object in a ```json block."""

RULES = """## Output schema
{"title": str, "slides": [ {"template": <catalog name>, "narration": str, "slots": {...}, "cues": {"<slot>": "<cue>"}} ]}

## Narration (spoken Korean, read by a TTS)
- Polite spoken style (~입니다/~합니다), short sentences. 2–5 sentences per slide, 60–220 characters.
- Explain, don't read the slide: the slide shows keywords, the narration gives the meaning and an example.
- Place cue markers [[c1]], [[c2]] ... right before the word at which a visual element should appear.
  Cue names are unique within a slide. Every cue you reference must exist in that slide's narration.
- EVERY number must be read in Korean words: write it as {표기|한글 읽기}. Native numerals with counters like
  시/시간/개/명/번/가지/살 (≤99), Sino numerals otherwise: {9시|아홉 시}, {8시간|여덟 시간}, {240시간|이백사십 시간},
  {15인|십오 인}, {2~3회|두세 번}, {11월 20일(금)|십일월 이십일 금요일}, {6월|유월}, {10월|시월}, {1.2kg|일 점 이 킬로그램}.
  No digit may appear outside the left side of {표기|읽기} (checked). English words and acronyms too: {AI|에이아이}, {Zoom|줌}.
  The left side is shown in captions, the right side is spoken.
- Do not put [[cues]] or {표기|읽기} inside slot texts — only in narration.

## Slots
- Follow each template's slot kinds exactly. "lines:2" = array of 2 short strings (each ≤ 12 Korean characters).
- kicker: short uppercase English section label like "01 — WHY TEAMS".
- Respect the length limits written in slot kinds (e.g. "text (≤16자)"): long subtitles break the layout.
- illustration slot: {"prompt": "<English description of ONE concrete visual metaphor>", "at": "<cue>"}.
  Describe objects/characters and their action, not style (style is added automatically). Never ask for text in images.
- cards items: [{"title": ≤10자, "text": ≤40자, "art": {"prompt": "..."}, "at": "<cue>"}] — art is a small icon-like subject.
- flow nodes: [{"label": ≤8자, "sub": optional ≤12자, "at": "<cue>"}]; back edges: [{"from": i, "to": j, "label": ≤12자, "at": "<cue>"}] (0-based node indices).
- "cues" maps a slot name to the cue at which it appears (e.g. {"title": "c1", "body": "c2"}). Item-level cues go in "at".

## Structure
- First slide: cover. Last slide: ending. Use section/quote sparingly. Avoid the same template twice in a row
  (alternate concept-left / concept-right). Aim for the requested length.
- One message per slide. Keep every fact from the source; never state invented numbers as facts.
  Illustrative numbers are allowed only inside a chart with data_source 'example', announced in the narration."""


def build_prompt(source, templates, project):
    return (f"## Template catalog\n```json\n{json.dumps(catalog(templates), ensure_ascii=False, indent=1)}\n```\n\n{RULES}\n\n{CP.prompt_block()}\n\n"
            f"## Project\ntitle: {project.get('title', '')}\ntarget length: {project.get('length', '4min')} of narration\n"
            f"audience: {project.get('audience', '직장인 대상 실무 강의')}\n"
            + (f"requirements from the producer: {project['brief']}\n" if project.get("brief") else "")
            + f"\n## Source material\n{source}\n")


def check(sb, templates, project, theme):
    errs = []
    if not isinstance(sb.get("slides"), list) or not sb["slides"]: return ["no slides"]
    _, _, e = expand(sb, project, theme, templates); errs += e
    import re
    for i, s in enumerate(sb["slides"], 1):
        errs += CP.check(s.get("template"), s.get("slots", {}), f"slide {i} ({s.get('template')})")
        ch = (s.get("slots") or {}).get("chart") or {}
        if ch.get("data_source") == "example" and not any(w in s.get("narration", "") for w in ("예를 들", "예시", "가정", "가령")):
            errs.append(f"slide {i}: chart uses example numbers — the narration must say so (예를 들어 / 예시로)")
        nar = s.get("narration", "")
        bare = re.sub(r"\{[^{}|]*\|([^{}]*)\}", lambda m: " " if not re.search(r"\d", m.group(1)) else " #DIGIT# ", nar)
        bare = re.sub(r"\[\[[\w.-]+\]\]", "", bare)
        for num in sorted(set(re.findall(r"[^\s]*\d[^\s]*", bare))):
            errs.append(f"slide {i}: number '{num}' must be written as {{표기|한글 읽기}} (e.g. {{9시|아홉 시}}) — digits are not allowed in the spoken text")
        if "#DIGIT#" in bare: errs.append(f"slide {i}: the spoken side of a {{표기|읽기}} contains digits — spell it out in Korean")
        have = set(re.findall(r"\[\[([\w.-]+)\]\]", nar))
        refs = set((s.get("cues") or {}).values())
        def walk(o):  # cue references at any depth (cards items, table rows, chart data …)
            if isinstance(o, dict):
                if isinstance(o.get("at"), str): refs.add(o["at"].lstrip("@"))
                for v in o.values(): walk(v)
            elif isinstance(o, list):
                for v in o: walk(v)
        walk(s.get("slots", {}))
        for r in sorted(refs - have): errs.append(f"slide {i}: cue '{r}' is referenced but [[{r}]] is not in the narration")
    return errs


def make(source, templates, project, theme, log=print, model=None):
    prompt = build_prompt(source, templates, project)
    text = llm.complete(SYSTEM, prompt, model=model)
    for attempt in range(3):
        try:
            sb = llm.extract_json(text); errs = check(sb, templates, project, theme)
        except Exception as e:
            sb, errs = None, [f"invalid JSON: {e}"]
        if not errs: return sb
        log(f"storyboard: {len(errs)} problem(s), repair {attempt + 1}: " + "; ".join(errs[:4]))
        if attempt == 2: break
        text = llm.complete(SYSTEM, prompt + "\n\n## Your previous answer\n```json\n" + (json.dumps(sb, ensure_ascii=False) if sb else text[:6000]) +
                            "\n```\n\n## Fix these problems and return the full corrected JSON\n- " + "\n- ".join(errs), model=model)
    raise RuntimeError("storyboard still invalid after repairs:\n  " + "\n  ".join(errs))
