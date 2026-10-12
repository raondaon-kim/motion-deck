"""build/report.html — one page to judge a run: video, sheet, palette, QA, cue alignment, assets, timings."""
import html, json
from pathlib import Path


def _e(s): return html.escape(str(s))


def write(build, project, pal, timings, notes):
    b = Path(build)
    qa = json.loads((b / "shots" / "qa.json").read_text(encoding="utf-8")) if (b / "shots" / "qa.json").exists() else {"issues": [], "runtime_errors": []}
    tl = json.loads((b / "narr" / "timeline.json").read_text(encoding="utf-8")) if (b / "narr" / "timeline.json").exists() else {"slides": []}
    sb = json.loads((b / "storyboard.json").read_text(encoding="utf-8")) if (b / "storyboard.json").exists() else {"slides": []}
    assets = sorted((b / "assets").glob("*.json")) if (b / "assets").exists() else []
    errs = [i for i in qa["issues"] if i["level"] == "ERROR"] + [{"level": "ERROR", "check": "runtime", "where": e} for e in qa.get("runtime_errors", [])]
    warns = [i for i in qa["issues"] if i["level"] == "WARN"]
    sw = "".join(f'<div class="sw"><i style="background:{v}"></i><b>{_e(k)}</b><code>{v}</code></div>' for k, v in pal.items() if k != "letterbox")
    rows = []
    for k, s in enumerate(sb["slides"]):
        t = tl["slides"][k] if k < len(tl["slides"]) else {}
        cov = t.get("coverage"); cv = "—" if cov is None else f"{cov:.0%}"
        bad = ' class="bad"' if cov is not None and cov < 0.6 else ""
        cues = " ".join(f"{_e(n)}={v:.1f}" for n, v in (t.get("cues") or {}).items())
        rows.append(f"<tr><td>{k + 1}</td><td>{_e(s.get('template'))}</td><td>{_e(s.get('narration', ''))}</td>"
                    f"<td>{t.get('duration', 0):.1f}s</td><td{bad}>{cv}</td><td><small>{cues}</small></td></tr>")
    arts = "".join(
        f'<figure><img src="assets/{a.stem}.png" loading="lazy"><figcaption><b>{_e(a.stem)}</b> {json.loads(a.read_text(encoding="utf-8")).get("seconds", "?")}s</figcaption></figure>'
        for a in assets)
    issues = "".join(f'<li class="{i["level"].lower()}"><b>{i["level"]}</b> {_e(i["check"])} — {_e(i["where"])}</li>' for i in errs + warns) or "<li>없음</li>"
    tim = "".join(f"<tr><td>{_e(k)}</td><td>{v:.0f}s</td></tr>" for k, v in timings.items())
    total = sum(timings.values())
    nt = "".join(f"<li>{_e(n)}</li>" for n in notes)
    page = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_e(project.get('title', 'Lecture'))} — report</title><style>
:root{{--ink:{pal['ink']};--paper:{pal['paper']};--acc:{pal['accent']}}}
body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 system-ui,"Malgun Gothic",sans-serif}}
main{{max-width:1180px;margin:auto;padding:28px 16px 80px}} h1{{margin:0 0 4px}} h2{{margin:36px 0 10px;border-bottom:2px solid var(--ink);padding-bottom:4px}}
.kpi{{display:flex;gap:12px;flex-wrap:wrap}} .kpi div{{background:#fff8;border:1.5px solid var(--ink);border-radius:12px;padding:10px 16px}} .kpi b{{display:block;font-size:24px}}
video,img.sheet{{width:100%;border-radius:12px;border:1.5px solid var(--ink)}}
.pal{{display:flex;flex-wrap:wrap;gap:8px}} .sw{{display:flex;align-items:center;gap:6px;font-size:12px}} .sw i{{width:26px;height:26px;border-radius:6px;border:1px solid #0003}}
table{{border-collapse:collapse;width:100%;font-size:13px}} td,th{{border-bottom:1px solid #0002;padding:6px;vertical-align:top;text-align:left}} td.bad{{color:#b00;font-weight:700}}
.arts{{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}} figure{{margin:0;background:#fff;border-radius:10px;padding:8px}} figure img{{width:100%;height:120px;object-fit:contain}} figcaption{{font-size:11px}}
li.error{{color:#b00}} code{{font-size:11px}}</style></head><body><main>
<h1>{_e(project.get('title', 'Lecture'))}</h1><div>기준 색 <code>{_e(project.get('color'))}</code> · 목소리 {_e(project.get('voice', 'M1'))}</div>
<h2>요약</h2><div class="kpi"><div>슬라이드<b>{len(sb['slides'])}</b></div><div>영상 길이<b>{tl.get('total', 0):.0f}s</b></div>
<div>QA ERROR<b>{len(errs)}</b></div><div>QA WARN<b>{len(warns)}</b></div><div>에셋<b>{len(assets)}</b></div><div>총 소요<b>{total / 60:.1f}분</b></div></div>
{('<ul>' + nt + '</ul>') if nt else ''}
<h2>영상</h2><video src="lecture.mp4" controls preload="metadata"></video>
<h2>슬라이드 시트</h2><img class="sheet" src="shots/sheet_L.png">
<h2>슬라이드별 내레이션 · 싱크</h2><table><tr><th>#</th><th>템플릿</th><th>내레이션</th><th>길이</th><th>정렬</th><th>큐(초)</th></tr>{''.join(rows)}</table>
<h2>QA</h2><ul>{issues}</ul>
<h2>팔레트</h2><div class="pal">{sw}</div>
<h2>에셋</h2><div class="arts">{arts}</div>
<h2>단계별 소요</h2><table>{tim}</table>
</main></body></html>"""
    (b / "report.html").write_text(page, encoding="utf-8")
    return b / "report.html"
