#!/usr/bin/env python3
"""Narrate a motion deck: TTS per slide -> cue times -> deck with real timings + audio track.

  python sync.py deck.json [-o out/narr] [--voice M1] [--lang ko] [--speed 1.05]
                 [--align whisper|segments|ratio] [--whisper large-v3-turbo] [--redo 2,9]

Narration (per slide):
  "narration": "folio의 무게는 [[w]]{1.2kg|일 점 이 킬로그램}입니다. [[t]]두께는 ..."
    [[name]]          cue: the time the next word starts being spoken
    {shown|spoken}    captions show `shown`, the TTS reads `spoken` (numbers, English, units)
  numbers left as digits are spelled out in Korean before TTS (scripts/ko_numbers.py): 9시 -> 아홉 시
  a list of strings is joined with spaces.

Elements reference cues (slide-relative seconds after resolving):
  "at": "@w"  "@w+0.2"  "@w-0.3"     built-ins: "@start" (voice begins), "@end" (voice ends)
  "dur": "@t"                        -> lasts until cue t (resolved to cue - at)

Outputs (in -o):
  slides/slide_NN.wav   per-slide voice (cached by text+voice settings; --redo forces)
  narration.wav         full track: each slide padded to its duration + transition gaps
  captions.srt          one caption per sentence (shown text), global times
  timeline.json         slide starts/durations, cue times, alignment coverage
  <deck>.resolved.json  written NEXT TO deck.json (asset paths keep working) -> build this

Then:
  python build.py deck.resolved.json -o out/lecture.html
  python capture.py out/lecture.html --out out/shots --video out/lecture.mp4 \
      --audio out/narr/narration.wav --subs out/narr/captions.srt

Alignment modes:
  whisper   (default) one TTS take per slide, faster-whisper word timestamps snapped onto the
            script by character alignment; unmatched spans are interpolated.
  segments  text between cues is synthesized separately -> cue times exact, no STT needed;
            prosody can break at cues placed mid-sentence.
  ratio     no STT: times proportional to character position (rough; for drafts).
"""
import argparse, copy, difflib, hashlib, json, math, re, sys
from pathlib import Path

import numpy as np
import soundfile as sf

from ko_numbers import spell_numbers  # every number is spoken in Korean words (captions keep digits)

FPS = 12                 # replaced by the deck's theme.fps in main(); must match capture.py
TRANS = 6 / FPS          # = round(0.5 * fps) / fps, same as capture.py
TOK = re.compile(r"\[\[([\w.-]+)\]\]|\{([^{}|]*)\|([^{}]*)\}")
SENT = re.compile(r"(?<=[.!?…。])\s+")
REF = re.compile(r"^@([\w.-]+)([+-]\d+(?:\.\d+)?)?$")


# ---------------------------------------------------------------- narration parsing
def parse_sentence(raw):
    """-> spoken, shown, {cue: spoken_char_index}"""
    spoken, shown, cues, pos = [], [], {}, 0
    for m in TOK.finditer(raw):
        lit = raw[pos:m.start()]; spoken.append(spell_numbers(lit)); shown.append(lit); pos = m.end()
        if m.group(1):
            cues[m.group(1)] = len("".join(spoken))
        else:
            shown.append(m.group(2)); spoken.append(spell_numbers(m.group(3)))
    spoken.append(spell_numbers(raw[pos:])); shown.append(raw[pos:])
    return "".join(spoken), "".join(shown), cues


def parse_narration(nar):
    """-> spoken text, cues {name: idx}, sentences [(shown, spoken_start, spoken_end)]"""
    raw = " ".join(nar) if isinstance(nar, list) else str(nar)
    raw = re.sub(r"[`*_#>]", "", raw)  # markdown markup would be read aloud / shown in captions
    raw = re.sub(r"\s+", " ", raw).strip()
    full, cues, sents = "", {}, []
    for sr in SENT.split(raw):
        sp, sh, cs = parse_sentence(sr.strip())
        lead_ws = len(sp) - len(sp.lstrip())
        sp = sp.strip()
        if full: full += " "
        base = len(full)
        for k, v in cs.items():
            if k in cues: sys.exit(f"ERROR cue [[{k}]] used twice")
            cues[k] = base + max(0, min(len(sp), v - lead_ws))
        if sp:
            sents.append((re.sub(r"\s+", " ", sh).strip(), base, base + len(sp)))
        full += sp
    return full, cues, sents


# ---------------------------------------------------------------- timing on characters
def norm_index(text):
    """per spoken char -> index into the alnum-only lowercase string; plus that string"""
    idx, out = [], []
    for ch in text:
        idx.append(len(out))
        if ch.isalnum(): out.append(ch.lower())
    idx.append(len(out))
    return idx, "".join(out)


class Timing:
    """start/end time of normalized char n from sparse anchors {n: (ts, te)}"""
    def __init__(self, anchors, n_chars, total):
        self.a = anchors; self.keys = sorted(anchors); self.n = n_chars; self.total = total

    def _nb(self, n):
        import bisect
        k = bisect.bisect_left(self.keys, n)
        prv = (self.keys[k - 1], self.a[self.keys[k - 1]][1]) if k > 0 else (-1, 0.0)
        nxt_i = k + 1 if k < len(self.keys) and self.keys[k] == n else k
        nxt = (self.keys[nxt_i], self.a[self.keys[nxt_i]][0]) if nxt_i < len(self.keys) else (self.n, self.total)
        return prv, nxt

    def start(self, n):
        if n in self.a: return self.a[n][0]
        (p, tp), (q, tq) = self._nb(n)
        return tp + (tq - tp) * (n - p) / max(1, q - p) if q > p else tp

    def end(self, n):
        if n in self.a: return self.a[n][1]
        return self.start(n + 1)


def anchors_from_words(ref, words):
    hyp, ts, te = [], [], []
    for w in words:
        cs = [c.lower() for c in w.word if c.isalnum()]
        L = len(cs)
        for j, c in enumerate(cs):
            hyp.append(c); ts.append(w.start + (w.end - w.start) * j / L); te.append(w.start + (w.end - w.start) * (j + 1) / L)
    sm = difflib.SequenceMatcher(None, ref, "".join(hyp), autojunk=False)
    an = {}
    for a, b, size in sm.get_matching_blocks():
        for k in range(size): an[a + k] = (ts[b + k], te[b + k])
    return an


def silences(wav, sr, min_len=0.12, rel=0.03, hop_s=0.02):
    """[(t0, t1)] pauses in a voice take (RMS below rel * peak for >= min_len)"""
    hop = max(1, int(sr * hop_s)); n = len(wav) // hop
    if n == 0: return []
    e = np.sqrt(np.mean(wav[: n * hop].reshape(n, hop) ** 2, axis=1)); q = e < e.max() * rel
    out, i = [], 0
    while i < n:
        if q[i]:
            j = i
            while j < n and q[j]: j += 1
            if (j - i) * hop_s >= min_len: out.append((i * hop_s, j * hop_s))
            i = j
        else: i += 1
    return out


def snap(t, sil, after=0.12):
    """recognizers glue a word's start to the previous word's end, across the pause.
    a time inside (or just after) a pause -> the pause end = real speech onset."""
    for s0, s1 in sil:
        if s0 - 0.02 <= t <= s1 + after: return max(t, s1)
    return t


# ---------------------------------------------------------------- engines
class Voice:
    def __init__(self, a):
        from supertonic import TTS
        self.tts = TTS(); self.sr = self.tts.sample_rate
        self.style = self.tts.get_voice_style(a.voice); self.a = a

    def say(self, text):
        wav, _ = self.tts.synthesize(text, voice_style=self.style, lang=self.a.lang, total_steps=self.a.steps, speed=self.a.speed)
        return np.asarray(wav, dtype=np.float32).reshape(-1)


class Ears:
    def __init__(self, name, device):
        from faster_whisper import WhisperModel
        self.WM, self.name = WhisperModel, name
        tries = [("cuda", "float16"), ("cuda", "int8_float16"), ("cpu", "int8")] if device == "auto" else [(device, "int8" if device == "cpu" else "float16")]
        self.tries, self.model = tries, None

    def words(self, path, lang, prompt):
        while True:
            if self.model is None:
                dev, ct = self.tries[0]
                try: self.model = self.WM(self.name, device=dev, compute_type=ct); self.dev = f"{dev}/{ct}"
                except Exception as e:
                    print(f"NOTE  whisper {dev}/{ct} unavailable ({str(e)[:80]})"); self.tries.pop(0)
                    if not self.tries: raise
                    continue
            try:
                segs, _ = self.model.transcribe(str(path), language=lang, word_timestamps=True, beam_size=5,
                                                condition_on_previous_text=False, initial_prompt=prompt[:220], vad_filter=False)
                return [w for s in segs for w in (s.words or [])]
            except Exception as e:  # e.g. cuDNN/cuBLAS missing -> fall back to the next device
                print(f"NOTE  whisper {self.dev} failed ({str(e)[:80]}) -> fallback"); self.model = None; self.tries.pop(0)
                if not self.tries: raise


# ---------------------------------------------------------------- main
def resolve(v, cues, where, at=None):
    m = REF.match(v)
    if not m: sys.exit(f"ERROR {where}: '{v}' is not a cue reference (@name, @name+0.2)")
    name, off = m.group(1), float(m.group(2) or 0)
    if name not in cues: sys.exit(f"ERROR {where}: cue '{name}' not found (have: {', '.join(sorted(cues))})")
    t = cues[name] + off
    return round(max(0.0, t - at if at is not None else t), 3)


def srt_time(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main():
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(encoding="utf-8")
        except Exception: pass
    ap = argparse.ArgumentParser()
    ap.add_argument("deck"); ap.add_argument("-o", "--out", default="out/narr")
    ap.add_argument("--voice", default="M1", help="Supertonic voice M1-M5 / F1-F5")
    ap.add_argument("--lang", default="ko"); ap.add_argument("--speed", type=float, default=1.05)
    ap.add_argument("--steps", type=int, default=8, help="Supertonic quality steps")
    ap.add_argument("--lead", type=float, default=0.6, help="silence before the voice on each slide (visual build-in)")
    ap.add_argument("--tail", type=float, default=0.8, help="silence after the voice on each slide")
    ap.add_argument("--silent", type=float, default=3.0, help="duration of slides without narration/duration")
    ap.add_argument("--align", choices=["whisper", "segments", "ratio"], default="whisper")
    ap.add_argument("--whisper", default="large-v3-turbo")
    ap.add_argument("--device", default="cpu", choices=["cpu", "cuda", "auto"],
                    help="cpu is the safe default: CTranslate2 can HANG (not fail) on Windows when cuDNN/cuBLAS are missing")
    ap.add_argument("--seg-gap", type=float, default=0.12, help="pause between segments in --align segments")
    ap.add_argument("--redo", default="", help="1-based slides to re-synthesize even if cached, e.g. 2,9")
    a = ap.parse_args()

    dp = Path(a.deck).resolve(); deck = json.loads(dp.read_text(encoding="utf-8"))
    global FPS, TRANS
    FPS = int(deck.get("theme", {}).get("fps", 12)); TRANS = max(1, round(0.5 * FPS)) / FPS
    out = Path(a.out); (out / "slides").mkdir(parents=True, exist_ok=True)
    redo = {int(x) for x in a.redo.split(",") if x.strip()}
    voice, ears, sr = None, None, None
    res = copy.deepcopy(deck); tl = {"fps": FPS, "transition": TRANS, "slides": []}
    track, srt, clock = [], [], 0.0

    for i, s in enumerate(res["slides"], 1):
        nar = s.get("narration")
        info = {"slide": i, "start": round(clock, 3)}
        cues_abs, sents_t, wav = {}, [], None
        if nar:
            spoken, cues, sents = parse_narration(nar)
            nidx, ref = norm_index(spoken)
            key = hashlib.sha1(json.dumps([spoken, sorted(cues.items()) if a.align == "segments" else 0, a.voice, a.lang, a.speed, a.steps, a.align, a.seg_gap, a.whisper if a.align == "whisper" else 0]).encode()).hexdigest()[:12]
            wp, mp = out / "slides" / f"slide_{i:02d}.wav", out / "slides" / f"slide_{i:02d}.json"
            meta = json.loads(mp.read_text(encoding="utf-8")) if mp.exists() else {}
            if meta.get("key") == key and wp.exists() and i not in redo:
                wav, sr = sf.read(wp, dtype="float32"); anchors = {int(k): tuple(v) for k, v in meta.get("anchors", {}).items()}
                cached = True; print(f"slide {i:02d}  cached  {len(wav) / sr:.2f}s")
            else:
                voice = voice or Voice(a); sr = voice.sr
                if a.align == "segments":
                    cuts = sorted({0, len(spoken), *cues.values()}); parts, anchors, t = [], {}, 0.0
                    gap = np.zeros(int(a.seg_gap * sr), np.float32)
                    for c0, c1 in zip(cuts, cuts[1:]):
                        seg = spoken[c0:c1].strip()
                        if not any(ch.isalnum() for ch in seg): continue
                        w = voice.say(seg)
                        anchors[nidx[c0]] = (t, t); anchors[max(nidx[c0], nidx[c1] - 1)] = (t + len(w) / sr, t + len(w) / sr)
                        parts += [w, gap]; t += (len(w) + len(gap)) / sr
                    wav = np.concatenate(parts[:-1]) if parts else np.zeros(1, np.float32)
                else:
                    wav, anchors = voice.say(spoken), {}
                sf.write(wp, wav, sr)
                if a.align == "whisper":
                    ears = ears or Ears(a.whisper, a.device)
                    anchors = anchors_from_words(ref, ears.words(wp, a.lang, spoken))
                mp.write_text(json.dumps({"key": key, "anchors": {str(k): v for k, v in anchors.items()}}), encoding="utf-8")
                cached = False; print(f"slide {i:02d}  tts     {len(wav) / sr:.2f}s  {spoken[:40]}…")
            vlen = len(wav) / sr
            cov = len(anchors) / max(1, len(ref)) if a.align == "whisper" else None
            T = Timing(anchors, len(ref), vlen); sil = silences(wav, sr)
            cues_rel = {k: snap(T.start(nidx[v]), sil) for k, v in cues.items()}
            first, last = (snap(T.start(0), sil), T.end(len(ref) - 1)) if ref else (0.0, vlen)
            cues_abs = {k: round(a.lead + v, 3) for k, v in cues_rel.items()}
            cues_abs["start"], cues_abs["end"] = round(a.lead + first, 3), round(a.lead + last, 3)
            for shown, c0, c1 in sents:
                n0, n1 = nidx[c0], max(nidx[c0], nidx[c1] - 1)
                sents_t.append((shown, a.lead + snap(T.start(n0), sil), a.lead + T.end(n1)))
            need = a.lead + vlen + a.tail
            info.update(voice=round(vlen, 3), coverage=None if cov is None else round(cov, 3))
            if cov is not None and cov < 0.6:
                print(f"WARN  slide {i:02d}: only {cov:.0%} of the script matched the recognized speech -> check slide_{i:02d}.wav (or use --align segments)")
        else:
            need = s.get("duration", a.silent)

        # resolve element cue references
        latest = 0.0
        for j, e in enumerate(s.get("elements", [])):
            w = f"slide {i} el#{j} ({e.get('type')})"
            if isinstance(e.get("at"), str): e["at"] = resolve(e["at"], cues_abs, w + ".at")
            if isinstance(e.get("dur"), str): e["dur"] = resolve(e["dur"], cues_abs, w + ".dur", at=e.get("at", 0))
            if isinstance(e.get("at"), (int, float)): latest = max(latest, e["at"] + (e.get("dur") or 0.8))
            def walk(o, path):  # per-item cues at any depth (cards items, flow nodes, table rows, chart data)
                nonlocal latest
                if isinstance(o, dict):
                    if isinstance(o.get("at"), str): o["at"] = resolve(o["at"], cues_abs, f"{w}{path}.at")
                    if isinstance(o.get("at"), (int, float)): latest = max(latest, o["at"] + 0.8)
                    for k2, v2 in o.items():
                        if k2 != "at": walk(v2, f"{path}.{k2}")
                elif isinstance(o, list):
                    for k2, v2 in enumerate(o): walk(v2, f"{path}[{k2}]")
            for k2, v2 in e.items():
                if k2 not in ("at", "dur"): walk(v2, f".{k2}")
        dur = math.ceil(max(need, latest + 0.4, s.get("duration", 0)) * FPS - 1e-6) / FPS
        s["duration"] = dur
        info.update(duration=dur, cues=cues_abs)
        tl["slides"].append(info)

        track.append((dur, wav))
        for shown, t0, t1 in sents_t:
            srt.append((clock + t0, clock + max(t1, t0 + 0.6), shown))
        clock += dur
        if i < len(res["slides"]):
            track.append((TRANS, None)); clock += TRANS
        cs = " ".join(f"{k}={v:.2f}" for k, v in cues_abs.items())
        print(f"       -> duration {dur:.2f}s" + (f"  cues {cs}" if cs else ""))

    # materialize the track on one sample rate (every take comes from the same engine)
    sr = sr or 44100; buf = []
    for d, w in track:
        seg = np.zeros(int(round(d * sr)), np.float32)
        if w is not None:
            o = int(round(a.lead * sr)); seg[o:o + len(w)] = w[: max(0, len(seg) - o)]
        buf.append(seg)
    sf.write(out / "narration.wav", np.concatenate(buf), sr)
    for k in range(len(srt) - 1):  # no overlapping captions
        srt[k] = (srt[k][0], min(srt[k][1], srt[k + 1][0] - 0.05), srt[k][2])
    (out / "captions.srt").write_text("".join(f"{n}\n{srt_time(t0)} --> {srt_time(t1)}\n{txt}\n\n" for n, (t0, t1, txt) in enumerate(srt, 1)), encoding="utf-8")
    tl["total"] = round(clock, 3)
    (out / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1), encoding="utf-8")
    rp = dp.with_name(dp.stem + ".resolved.json")
    rp.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK   {rp}\n     {out / 'narration.wav'}  {clock:.2f}s  ·  {out / 'captions.srt'}  ({len(srt)} captions)")
    if ears and getattr(ears, "dev", None): print(f"     whisper {a.whisper} on {ears.dev}")


if __name__ == "__main__":
    main()
