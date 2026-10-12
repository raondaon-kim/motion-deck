#!/usr/bin/env python3
"""motion-deck pipeline: project folder -> narrated lecture MP4, fully automatic.

  python md.py make projects/<name>                 run every stage (cached stages are skipped)
  python md.py make projects/<name> --redo storyboard   force a stage (and everything after it)
  python md.py make projects/<name> --until build   stop after a stage

project folder:
  project.json   {"title", "color": "#2E6BE6", "voice": "M1", "brand", "label", "length": "4min",
                  "templates": "lecture", "palette": {overrides}, "speed": 1.05}
  sources/       md / txt / pdf / pptx / docx (mixed)
  build/         everything generated (see README)

stages: ingest -> storyboard -> assets -> deck -> narrate -> build -> qa -> render -> report
LLM: storyboard only (claude -p). Images: codex. Everything else is deterministic and cached.
"""
import argparse, hashlib, json, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from pipeline import assets as A, deck as D, ingest as I, palette as P, report as R, storyboard as SB, components as CP  # noqa: E402

STAGES = ["ingest", "storyboard", "assets", "deck", "narrate", "build", "qa", "render", "report"]


def h(*parts):
    m = hashlib.sha1()
    for x in parts: m.update((x if isinstance(x, bytes) else json.dumps(x, ensure_ascii=False, sort_keys=True).encode()))
    return m.hexdigest()[:16]


def fh(path): return h(Path(path).read_bytes()) if Path(path).exists() else None


def py(script, *args, log):
    cmd = [sys.executable, str(ROOT / "scripts" / script), *map(str, args)]
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env={**__import__("os").environ, "PYTHONUTF8": "1"})
    for line in (p.stdout + p.stderr).splitlines():
        if line.strip() and not line.startswith("  video "): log("    " + line)
    return p.returncode


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["make"]); ap.add_argument("project")
    ap.add_argument("--redo", choices=STAGES, help="force this stage and all later stages")
    ap.add_argument("--until", choices=STAGES, default="report")
    ap.add_argument("--model", default=None, help="LLM model for the storyboard (claude -p --model)")
    ap.add_argument("--image-workers", type=int, default=5)
    a = ap.parse_args()
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(encoding="utf-8")
        except Exception: pass

    proj = Path(a.project).resolve(); bld = proj / "build"; bld.mkdir(exist_ok=True)
    project = json.loads((proj / "project.json").read_text(encoding="utf-8"))
    state_p = bld / "state.json"; state = json.loads(state_p.read_text(encoding="utf-8")) if state_p.exists() else {}
    forced = set(STAGES[STAGES.index(a.redo):]) if a.redo else set()
    timings, notes = {}, []
    logf = open(bld / "make.log", "a", encoding="utf-8")

    def log(s):
        print(s, flush=True); logf.write(s + "\n"); logf.flush()

    def stage(name, key, fn):
        """run fn() unless its input key is unchanged (and not forced); record time"""
        if name in forced or state.get(name) != key:
            t0 = time.time(); log(f"▶ {name}")
            fn(); state[name] = key; state_p.write_text(json.dumps(state, indent=1), encoding="utf-8")
            timings[name] = time.time() - t0; log(f"  ✓ {name} {timings[name]:.0f}s")
        else:
            log(f"· {name} (cached)"); timings[name] = 0.0
        return name == a.until

    log(f"\n=== make {proj.name}  {time.strftime('%Y-%m-%d %H:%M:%S')} ===")
    pal = P.make_palette(project.get("color", "#2E6BE6"), project.get("palette"))
    theme = P.theme_for(project.get("color", "#2E6BE6"), project.get("palette"))
    templates = D.load_templates(project.get("templates", "lecture")); tset = D.load_set(project.get("templates", "lecture"))
    src_files = sorted((proj / "sources").iterdir())

    # 1 ingest
    def do_ingest():
        text, names = I.ingest(proj / "sources"); (bld / "source.md").write_text(text, encoding="utf-8"); log(f"  sources: {', '.join(names)}")
    if stage("ingest", h([f.name for f in src_files], [fh(f) for f in src_files]), do_ingest): return

    # 2 storyboard (LLM). Manual edits to storyboard.json survive as long as the inputs don't change.
    def do_storyboard():
        if (bld / "storyboard.json").exists():  # never lose a storyboard (it may carry hand edits)
            hist = bld / "history"; hist.mkdir(exist_ok=True)
            import shutil; shutil.copy(bld / "storyboard.json", hist / f"storyboard-{time.strftime('%Y%m%d-%H%M%S')}.json")
            log(f"  previous storyboard kept in {hist.name}/")
        sb = SB.make((bld / "source.md").read_text(encoding="utf-8"), templates, project, theme, log=log, model=a.model)
        (bld / "storyboard.json").write_text(json.dumps(sb, ensure_ascii=False, indent=1), encoding="utf-8")
        md = [f"# {sb.get('title', project.get('title', ''))}\n"]
        for i, s in enumerate(sb["slides"], 1): md.append(f"## {i}. {s['template']}\n\n{s.get('narration', '')}\n")
        (bld / "script.md").write_text("\n".join(md), encoding="utf-8")
        log(f"  {len(sb['slides'])} slides: " + " · ".join(s["template"] for s in sb["slides"]))
    # the storyboard is slow, creative and hand-editable: it is regenerated ONLY when the source or the
    # project brief changes (or --redo storyboard). Template changes never trigger it — deck expansion
    # re-validates the existing storyboard against the current templates instead.
    sb_key = h(fh(bld / "source.md"), {k: project.get(k) for k in ("title", "length", "audience", "brief")})
    if stage("storyboard", sb_key, do_storyboard): return
    sb = json.loads((bld / "storyboard.json").read_text(encoding="utf-8"))

    # 3 deck expansion (needed first: it yields the asset manifest) + 4 assets
    deck, manifest, errs = D.expand(sb, project, theme, templates, tset)
    if errs:
        for e in errs: log("ERROR " + e)
        sys.exit(1)

    def do_assets():
        r = A.generate(manifest, pal, bld / "assets", workers=a.image_workers, log=log)
        if r["failed"]: notes.append(f"에셋 생성 실패: {', '.join(r['failed'])} — 해당 그림 없이 진행"); log("  WARN failed: " + ", ".join(r["failed"]))
    if stage("assets", h(manifest, pal, [fh(bld / "assets" / f"{k}.png") for k in manifest]), do_assets): return

    def do_deck():
        missing = {k for k in manifest if not (bld / "assets" / f"{k}.png").exists()}
        dk = drop_missing(deck, missing) if missing else deck
        (bld / "deck.json").write_text(json.dumps(dk, ensure_ascii=False, indent=1), encoding="utf-8")
    if stage("deck", h(deck, [fh(bld / "assets" / f"{k}.png") for k in manifest]), do_deck): return

    # 5 narrate (sync.py caches per-slide takes itself)
    narr = ["--voice", project.get("voice", "M1"), "--lang", project.get("lang", "ko"), "--speed", project.get("speed", 1.05)]
    def do_narrate():
        if py("sync.py", bld / "deck.json", "-o", bld / "narr", *narr, log=log): sys.exit("narrate failed")
    if stage("narrate", h(fh(bld / "deck.json"), narr), do_narrate): return

    def do_build():
        if py("build.py", bld / "deck.resolved.json", "-o", bld / "lecture.html", log=log): sys.exit("build failed")
    # the runtime and the builder are inputs too: a runtime change must rebuild the HTML
    build_key = h(fh(bld / "deck.resolved.json"), fh(ROOT / "runtime" / "dist" / "motion-deck.js"), fh(ROOT / "scripts" / "build.py"))
    if stage("build", build_key, do_build): return

    def do_qa():
        rc = py("capture.py", bld / "lecture.html", "--out", bld / "shots", "--qa", log=log)
        if rc: notes.append("QA ERROR가 있습니다 — 리포트의 QA 항목 참고")
    if stage("qa", h(fh(bld / "lecture.html")), do_qa): return

    def do_render():
        if py("capture.py", bld / "lecture.html", "--out", bld / "shots", "--video", bld / "lecture.mp4",
              "--audio", bld / "narr" / "narration.wav", "--subs", bld / "narr" / "captions.srt", log=log): sys.exit("render failed")
    if stage("render", h(fh(bld / "lecture.html"), fh(bld / "narr" / "narration.wav"), fh(ROOT / "scripts" / "capture.py")), do_render): return

    added = CP.harvest(sb, proj.name, project.get("title", proj.name))
    if added: log(f"  library: +{added} component example(s) -> {CP.LIB}")
    rp = R.write(bld, project, pal, timings, notes)
    log(f"\nDONE  video {bld / 'lecture.mp4'}\n      report {rp}")


def drop_missing(deck, missing):
    """an asset that failed to generate: drop image elements / card art that use it instead of failing the build"""
    import copy
    d = copy.deepcopy(deck)
    for s in d["slides"]:
        s["elements"] = [e for e in s["elements"] if not (e.get("type") == "image" and e.get("src") in missing)]
        for e in s["elements"]:
            for it in e.get("items") or []:
                if isinstance(it, dict) and it.get("art") in missing: it.pop("art")
    for k in missing: d["assets"]["images"].pop(k, None)
    return d


if __name__ == "__main__":
    main()
