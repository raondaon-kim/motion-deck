"""Text LLM calls for the two creative stages.

Primary: Claude Code headless (`claude -p`, the user's subscription), tools disabled.
Fallback: Anthropic API (ANTHROPIC_API_KEY) via the `anthropic` package.
"""
import json, os, re, shutil, subprocess


def _claude_cli(system, prompt, model, timeout):
    exe = os.environ.get("CLAUDE_PATH") or shutil.which("claude") or shutil.which("claude.cmd")
    if not exe: raise FileNotFoundError("claude CLI not found")
    cmd = [exe, "-p", "--tools", "", "--output-format", "json", "--no-session-persistence", "--system-prompt", system]
    if model: cmd += ["--model", model]
    p = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    if p.returncode != 0: raise RuntimeError(f"claude -p failed ({p.returncode}): {(p.stderr or p.stdout)[-400:]}")
    out = json.loads(p.stdout)
    if out.get("is_error"): raise RuntimeError(f"claude -p error: {out.get('result', '')[:400]}")
    return out.get("result", "")


def _anthropic_api(system, prompt, model, timeout):
    import anthropic
    c = anthropic.Anthropic(timeout=timeout)
    m = c.messages.create(model=model or "claude-sonnet-4-6", max_tokens=16000, system=system,
                          messages=[{"role": "user", "content": prompt}])
    return "".join(b.text for b in m.content if getattr(b, "type", "") == "text")


def complete(system, prompt, model=None, timeout=900):
    errs = []
    for fn in (_claude_cli, _anthropic_api):
        if fn is _anthropic_api and not os.environ.get("ANTHROPIC_API_KEY"): continue
        try: return fn(system, prompt, model, timeout)
        except Exception as e: errs.append(f"{fn.__name__}: {e}")
    raise RuntimeError("no LLM backend worked:\n  " + "\n  ".join(errs))


def extract_json(text):
    """first ```json block, else the outermost {...}"""
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    s = m.group(1) if m else text[text.find("{"): text.rfind("}") + 1]
    return json.loads(s)
