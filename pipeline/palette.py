"""One base color -> a full motion-deck theme (OKLCH, no dependencies).

Roles (all referenced from templates as $name):
  ink, paper, paper2, accent, letterbox
  soft0..soft7    pastel backgrounds/blobs: equal lightness, hue rotated around the base
  series0..series4 chart/diagram colors: mid lightness, distinct hues
  deep            darker base hue for stickers/edges
Contrast guarantees: ink vs every soft >= 7, accent vs every soft and paper >= 3.2.
"""
import math

SOFT_HUES = (0, 35, -35, 70, 180, 145, 215, 105)
SERIES_HUES = (0, 180, 90, 270, 45)


def _lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def _gam(c): return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def hex_to_oklch(h):
    h = h.lstrip("#")
    if len(h) == 3: h = "".join(c * 2 for c in h)
    r, g, b = (_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360


def _rgb(L, C, H):
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)


def oklch_to_hex(L, C, H):
    """gamut-maps by lowering chroma until the color fits sRGB"""
    while C > 0 and any(v < -1e-6 or v > 1 + 1e-6 for v in _rgb(L, C, H)): C -= 0.002
    return "#" + "".join(f"{round(max(0, min(1, _gam(max(0, v)))) * 255):02X}" for v in _rgb(L, max(C, 0), H))


def luminance(h):
    h = h.lstrip("#")
    return sum(w * _lin(int(h[i:i + 2], 16) / 255) for w, i in ((0.2126, 0), (0.7152, 2), (0.0722, 4)))


def contrast(a, b):
    x, y = sorted((luminance(a), luminance(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


# chart series: a validated categorical order (dataviz reference palette, light mode) instead of
# hue rotation (rotation failed the CVD check: deutan dE 1.7). Slot 1 = the brand accent; the
# reference hues within OKLab dE 18 of it are dropped so the brand never sits next to a near-twin.
# Verified with the dataviz validate_palette.js (light, adjacent pairs) for 9 base hues.
REF_SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]


def _oklab(h):
    L, C, H = hex_to_oklch(h)
    return L, C * math.cos(math.radians(H)), C * math.sin(math.radians(H))


# colour-vision-deficiency simulation (Machado et al. 2009, severity 1.0) on linear sRGB
_CVD = {
    "protan": ((0.152286, 1.052583, -0.204868), (0.114503, 0.786281, 0.099216), (-0.003882, -0.048116, 1.051998)),
    "deutan": ((0.367322, 0.860646, -0.227968), (0.280085, 0.672501, 0.047413), (-0.011820, 0.042940, 0.968881)),
    "tritan": ((1.255528, -0.076749, -0.178779), (-0.078411, 0.930809, 0.147602), (0.004733, 0.691367, 0.303900)),
}


def _lab_lin(r, g, b):
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def _lin_rgb(h):
    h = h.lstrip("#"); return tuple(_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


def delta(a, b, cvd=None):
    """OKLab dE x100 between two colours, optionally as seen with a CVD"""
    ra, rb = _lin_rgb(a), _lin_rgb(b)
    if cvd:
        M = _CVD[cvd]; f = lambda c: tuple(max(0.0, min(1.0, sum(M[i][j] * c[j] for j in range(3)))) for i in range(3))
        ra, rb = f(ra), f(rb)
    return 100 * math.dist(_lab_lin(*ra), _lab_lin(*rb))


def separable(a, b, normal=20, cvd=8):
    return delta(a, b) >= normal and min(delta(a, b, k) for k in _CVD) >= cvd


def chart_series(brand, n=6):
    """series0 = the brand (chroma lifted to the chart floor so it never reads gray); then walk the
    validated reference order and keep a hue only if it is clearly separable from the previous slot
    and from the brand (normal dE >= 20, every CVD dE >= 8). Wrap-around (donut) is checked too."""
    L, C, H = hex_to_oklch(brand)
    for L2 in (0.55, 0.6, 0.5, 0.65):
        cand = oklch_to_hex(L2, max(C, 0.14), H)
        if hex_to_oklch(cand)[1] >= 0.11: brand = cand; break
    best = [brand]
    for nv, cv in ((20, 8), (15, 8), (15, 6)):  # relax to the validator floors only if needed for >= 5 slots
        out, pool = [brand], [c for c in REF_SERIES if separable(c, brand, nv, cv)]
        while len(out) < n and pool:
            pick = next((c for c in pool if separable(c, out[-1], nv, cv) and (len(out) < n - 1 or separable(c, out[0], nv, cv))), None)
            if pick is None: break
            out.append(pick); pool.remove(pick)
        if len(out) > len(best): best = out
        if len(best) >= 5: break
    return best


def make_palette(base, overrides=None):
    L, C, H = hex_to_oklch(base)
    soft = [oklch_to_hex(0.885, 0.075, H + d) for d in SOFT_HUES]
    paper = oklch_to_hex(0.965, 0.012, H)
    acc_L, acc_C = min(L, 0.56), max(C, 0.12)
    accent = oklch_to_hex(acc_L, acc_C, H)
    while min(contrast(accent, s) for s in soft + [paper]) < 3.2 and acc_L > 0.2:
        acc_L -= 0.02; accent = oklch_to_hex(acc_L, acc_C, H)
    t = {
        "ink": oklch_to_hex(0.24, 0.035, H), "paper": paper, "paper2": oklch_to_hex(0.985, 0.008, H),
        "accent": accent, "deep": oklch_to_hex(0.42, max(C, 0.1), H),
        **{f"soft{i}": c for i, c in enumerate(soft)},
        **{f"series{i}": c for i, c in enumerate(chart_series(accent))},
    }
    t["letterbox"] = t["ink"]
    t.update(overrides or {})
    return t


def theme_for(base, overrides=None):
    """-> deck.json `theme` block (palette keys usable anywhere as colors)"""
    p = make_palette(base, overrides)
    top = {k: p[k] for k in ("ink", "paper", "paper2", "accent", "letterbox")}
    return {**top, "palette": {k: v for k, v in p.items() if k not in top}}


def report(p):
    softs = [p[f"soft{i}"] for i in range(8)]
    return {"ink_vs_soft_min": round(min(contrast(p["ink"], s) for s in softs), 2),
            "accent_vs_soft_min": round(min(contrast(p["accent"], s) for s in softs), 2),
            "accent_vs_paper": round(contrast(p["accent"], p["paper"]), 2)}


if __name__ == "__main__":
    import json, sys
    p = make_palette(sys.argv[1] if len(sys.argv) > 1 else "#2E6BE6")
    print(json.dumps(p, indent=1)); print(report(p))
