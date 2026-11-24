#!/usr/bin/env python3
"""Fit each line of type to the reference: size × weight × condense × fit × offset.

Usage: python scripts/fit_type.py REFERENCE.png [LINE ...]

Each candidate is outlined with the builder's own Art.text(), rendered as a coverage
mask and scored against the reference's ink mask (both blurred equally, so the
reference's softness does not dominate). Prints the best parameters per line as the
keyword arguments build_cover.py uses, with the score before and after.

Development-only: needs the reference image, resvg, pymupdf and scipy.
"""
import sys
from pathlib import Path

import numpy as np
import pymupdf
import resvg_py
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.build_cover import Art, mm, n  # noqa: E402

TRIM = pymupdf.Rect(8, 10, 237, 335)
Z = 6.0                                   # px per mm for scoring
SIGMA = 1.2 * Z                           # blur, px

# name, copy, size, faces, align, fit, x, baseline, ink box (x0, y0, x1, y1), light
# `light`: True light text on dark, False dark text on light, None lime text.
LINES = [
    ('logo', 'YOUR LOGO', 26.7, ('regular', 'medium'), 'center', 30.0, 165.0, 35.33, (147, 27, 183, 38), True),
    ('cover', 'COVER', 80, ('bold',), 'center', 60.7, 165.0, 80.7, (124, 58, 206, 88), True),
    ('design', 'DESIGN', 86, ('bold',), 'center', 78, 166.0, 103.0, (118, 82, 212, 110), None),
    ('business', 'YOUR BUSINESS', 51.4, ('bold',), 'left', 94.5, 17.5, 190.25, (12, 176, 118, 194), False),
    ('name', 'NAME', 50.5, ('bold',), 'left', 35.5, 17.83, 206.33, (12, 194, 60, 209), None),
    ('info', 'FOR MORE INFO', 35.5, ('semibold',), 'left', 63.3, 18.3, 258.3, (12, 244, 128, 262), True),
    ('phone', '+012 3456 789', 23.6, ('semibold',), 'left', 45.9, 18.3, 273.4, (12, 266, 72, 277), True),
    ('site', 'your website here', 24, ('semibold',), 'left', 55, 18.3, 282.4, (12, 275, 84, 290), True),
    ('year', '20', 99, ('jost',), 'right', 27.6, 169.7, 266.4, (138, 244, 175, 272), None),
    ('tail', '50', 99, ('jost',), 'right', 25.7, 199.9, 266.4, (172, 244, 212, 272), True),
    # per-digit fits (used when a two-digit word fits poorly as a whole)
    ('two', '2', 99, ('jost',), 'left', 11.0, 142.3, 266.9, (140, 246, 155, 270), None),
    ('zero_a', '0', 99, ('jost',), 'right', 12.0, 170.0, 266.9, (155, 246, 173, 270), None),
    ('five', '5', 99, ('jost',), 'left', 11.3, 173.4, 266.9, (171, 246, 187, 270), True),
    ('zero_b', '0', 99, ('jost',), 'right', 12.7, 200.7, 266.9, (186, 246, 203, 270), True),
]
CURRENT = {  # parameters in build_cover.py before fitting
    'logo': (28, 'bold', .68, 29.3), 'cover': (73, 'black', .87, 58.7), 'design': (86, 'black', .87, 77),
    'business': (47.4, 'bold', .92, 94.5), 'name': (40, 'bold', .88, 32.1), 'info': (39, 'bold', .76, 63.3),
    'phone': (23, 'regular', 1.0, 45.9), 'site': (23, 'regular', 1.0, 55), 'year': (99, 'bold', .88, 27.6),
    'tail': (99, 'bold', .82, 25.7), 'two': (99, 'jost', 1.0, 11), 'zero_a': (99, 'jost', 1.0, 12),
    'five': (99, 'jost', 1.0, 11.3), 'zero_b': (99, 'jost', 1.0, 12.7),
}


def reference_mask(page, box, light):
    """Soft ink mask of the reference inside `box` (+2 mm margin) at Z px/mm."""
    x0, y0, x2, y2 = box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 2
    sx, sy = TRIM.width / 210, TRIM.height / 297
    clip = pymupdf.Rect(TRIM.x0 + x0 * sx, TRIM.y0 + y0 * sy, TRIM.x0 + x2 * sx, TRIM.y0 + y2 * sy)
    pix = page.get_pixmap(clip=clip, matrix=pymupdf.Matrix(Z / sx, Z / sy), alpha=False)
    arr = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[..., :3].astype(float)
    chan = arr[..., 1] - arr[..., 2] if light is None else arr.mean(-1)
    ring = np.concatenate([chan[0], chan[-1], chan[:, 0], chan[:, -1]])
    bg = float(np.median(ring))
    ink = float(np.percentile(chan, 99 if light is not False else 1))
    mask = np.clip((chan - bg) / (ink - bg), 0, 1)
    return gaussian_filter(mask, SIGMA), (x0, y0, x2 - x0, y2 - y0)


def candidate(copy, size, face, align, fit, x, baseline, dx, dy, condense, window, word=0):
    """Coverage mask of one text line, rendered alone at Z px/mm over `window`."""
    x0, y0, win_w, win_h = window
    a = Art()
    a.rect(mm(x0 - 1), mm(y0 - 1), mm(win_w + 2), mm(win_h + 2), '#000000')
    a.text(mm(x + dx), mm(baseline + dy), copy, size, face, '#ffffff', align=align,
           fit=mm(fit), condense=condense, word=mm(word))
    wx, wy, ww, wh = (x0 - 1) * 4, (y0 - 1) * 4, (win_w + 2) * 4, (win_h + 2) * 4
    # resvg treats a unitless width as CSS px and emits 0.75 px per unit: ask for 4/3.
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{n(wx)} {n(wy)} {n(ww)} {n(wh)}" '
           f'width="{int(round(ww * Z / 4 * 4 / 3))}" height="{int(round(wh * Z / 4 * 4 / 3))}">'
           f'{"".join(a.content)}</svg>')
    png = resvg_py.svg_to_bytes(svg_string=svg, dpi=96)
    pix = pymupdf.open(stream=png, filetype='png')[0].get_pixmap()
    lum = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[..., :3].mean(-1) / 255
    return gaussian_filter(lum, SIGMA)


def score(ref, mine):
    """Mean |Δ| over the common window; the candidate has a 1 mm black border."""
    h, w = ref.shape
    m = mine[round(Z):round(Z) + h, round(Z):round(Z) + w]
    hh, ww = min(h, m.shape[0]), min(w, m.shape[1])
    return float(np.abs(ref[:hh, :ww] - m[:hh, :ww]).mean())


def fit_line(page, spec):
    name, copy, size0, faces, align, fit0, x0, base0, box, light = spec
    ref, window = reference_mask(page, box, light)

    def sc(size, face, fit, dx, dy, condense, word=0):
        return score(ref, candidate(copy, size, face, align, fit, x0, base0, dx, dy, condense, window, word))

    best = (9e9, None)
    # stage 1: size × condense × word gap (fit and position at the measured values)
    for face in faces:
        for size in size0 * np.arange(0.90, 1.101, 0.025):
            for condense in np.arange(0.64, 1.121, 0.04):
                for word in ((0, .5, 1, 1.5, 2, 3) if ' ' in copy else (0,)):
                    s = sc(size, face, fit0, 0, 0, condense, word)
                    if s < best[0]:
                        best = (s, (size, face, fit0, 0.0, 0.0, condense, word))
    size, face, fit, dx, dy, condense, word = best[1]
    # stage 2: fit width × offsets
    for f in fit * np.arange(0.96, 1.041, 0.01):
        for ddx in np.arange(-0.75, 0.76, 0.25):
            for ddy in np.arange(-0.75, 0.76, 0.25):
                s = sc(size, face, f, ddx, ddy, condense, word)
                if s < best[0]:
                    best = (s, (size, face, f, float(ddx), float(ddy), condense, word))
    size, face, fit, dx, dy, condense, word = best[1]
    # stage 3: fine pass on size, condense, fit
    for sz in size * np.arange(0.975, 1.026, 0.0125):
        for c in condense + np.arange(-0.03, 0.031, 0.01):
            for f in fit * np.arange(0.99, 1.011, 0.005):
                for w in (word - .25, word, word + .25):
                    s = sc(sz, face, f, dx, dy, c, w)
                    if s < best[0]:
                        best = (s, (sz, face, f, dx, dy, float(c), float(w)))
    return best


def main():
    page = pymupdf.open(sys.argv[1])[0]
    only = sys.argv[2:]                      # optional line names to refit
    for spec in LINES:
        if only and spec[0] not in only:
            continue
        size, face, condense, fit = CURRENT[spec[0]]
        ref, window = reference_mask(page, spec[8], spec[9])
        base = score(ref, candidate(spec[1], size, face, spec[4], fit, spec[6], spec[7], 0, 0,
                                    condense, window))
        s, (sz, fc, ft, dx, dy, c, w) = fit_line(page, spec)
        print(f'{spec[0]:9s} {base:.4f} -> {s:.4f}   size={sz:.1f} face={fc!r} condense={c:.2f} '
              f'fit={ft:.1f} word={w:.2f} x={spec[6] + dx:.2f} baseline={spec[7] + dy:.2f}')


if __name__ == '__main__':
    main()
