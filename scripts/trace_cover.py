#!/usr/bin/env python3
"""Trace the reference artwork into millimetre point lists for build_cover.py.

Usage: python scripts/trace_cover.py [--emit] REFERENCE.png

The reference is a low-resolution screenshot of the template, so every shape edge is
extracted as a sub-pixel contour (Gaussian-smoothed mask, marching squares), filtered
along its arc length to remove the raster's stair-steps, simplified with
Ramer–Douglas–Peucker, and printed in millimetres from the trim corner.

Without --emit the script prints diagnostics (component sizes, text bounding boxes,
checker period, colour samples are taken separately). With --emit it prints the
`SHAPES` literal that is pasted into scripts/build_cover.py; the build itself never
needs the reference image. Needs scipy and scikit-image, which are development-only
dependencies (not in requirements.txt).
"""
import sys
from pathlib import Path

import numpy as np
import pymupdf
from scipy import ndimage
from skimage import measure

# Trim box of the uploaded screenshot inside the image, in pixels.
TRIM = pymupdf.Rect(8, 10, 237, 335)
# Millimetre box removed from the green mask so the two touching ribbons label apart.
RIBBON_CUT = (81.0, 88.8, 82.2, 91.6)
# Shared apex of the left ribbon tip and the crescent head, restored after the cut.
APEX = (80.3, 90.0)


def load(path):
    pix = pymupdf.open(stream=Path(path).read_bytes())[0].get_pixmap()
    a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    return a[:, :, :3].astype(float)


def mm_grid(shape):
    h, w = shape
    ys = (np.arange(h) - TRIM.y0) * 297 / TRIM.height
    xs = (np.arange(w) - TRIM.x0) * 210 / TRIM.width
    return xs, ys


def box(xs, ys, x0, y0, x1, y1):
    """Boolean mask of the mm rectangle (used to exclude or cut regions)."""
    return (ys[:, None] >= y0) & (ys[:, None] < y1) & (xs[None, :] >= x0) & (xs[None, :] < x1)


def rdp(points, tol):
    """Ramer–Douglas–Peucker on an open polyline."""
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    d = b - a
    norm = np.hypot(*d) or 1.0
    dist = np.abs((d[0] * (points[:, 1] - a[1]) - d[1] * (points[:, 0] - a[0])) / norm)
    i = int(dist.argmax())
    if dist[i] > tol:
        return np.vstack([rdp(points[:i + 1], tol)[:-1], rdp(points[i:], tol)])
    return np.vstack([a, b])


def resample(points, step):
    """Resample an open polyline at uniform arc length `step`."""
    d = np.hypot(*np.diff(points, axis=0).T)
    s = np.r_[0, np.cumsum(d)]
    if s[-1] < step:
        return points
    t = np.arange(0, s[-1], step)
    return np.c_[np.interp(t, s, points[:, 0]), np.interp(t, s, points[:, 1])]


def smooth_along(points, sigma_mm, closed, step=1.0):
    """Low-pass filter a polyline along its own arc length (removes pixel stair-steps)."""
    pts = resample(points, step)
    if len(pts) < 5:
        return pts
    mode = 'wrap' if closed else 'nearest'
    out = np.empty_like(pts)
    for axis in range(2):
        out[:, axis] = ndimage.gaussian_filter1d(pts[:, axis], sigma_mm / step, mode=mode)
    return out


def field(a, sigma_mm=1.5):
    """Luminance of the reference, blurred by `sigma_mm` so the checker averages out.

    Blurring a monotonic edge ramp does not move its midpoint, so 50% crossings found
    on this field are the true edge positions; the binary colour thresholds in
    masks() are not (they sit 30–40% into the ramp, i.e. up to 1 mm inside).
    """
    return ndimage.gaussian_filter(a.mean(axis=2), sigma_mm * a.shape[0] / TRIM.height)


def sampler(field):
    """Bilinear sampler of a reference-sized array at (x, y) millimetres."""
    def sample(x, y):
        px = np.clip(x / 210 * TRIM.width + TRIM.x0 - 0.5, 0, field.shape[1] - 1.001)
        py = np.clip(y / 297 * TRIM.height + TRIM.y0 - 0.5, 0, field.shape[0] - 1.001)
        x0, y0 = int(px), int(py)
        fx, fy = px - x0, py - y0
        return ((1 - fx) * (1 - fy) * field[y0, x0] + fx * (1 - fy) * field[y0, x0 + 1]
                + (1 - fx) * fy * field[y0 + 1, x0] + fx * fy * field[y0 + 1, x0 + 1])
    return sample


def plateaus(left, right):
    """Extreme values of the two far ends of a profile: the interior and exterior
    levels, ignoring faint halos or shadows that would bias a median."""
    if np.median(left) > np.median(right):
        return float(left.max()), float(right.min())
    return float(left.min()), float(right.max())


def crossing(sample, p, normal, reach=3.0, step=0.1):
    """Offset along `normal` (mm) where the field crosses the inside/outside midpoint.

    Returns 0 when the contrast is too weak to trust.
    """
    s = np.arange(-reach, reach + step / 2, step)
    prof = np.array([sample(p[0] + normal[0] * d, p[1] + normal[1] * d) for d in s])
    far = reach * 0.55
    inside, outside = plateaus(prof[s <= -far], prof[s >= far])
    if abs(outside - inside) < 20:
        return 0.0
    w = (prof - inside) / (outside - inside)              # 0 inside … 1 outside
    hits = []
    for i in range(len(s) - 1):
        if (w[i] < .5) != (w[i + 1] < .5):
            hits.append(s[i] + (0.5 - w[i]) / (w[i + 1] - w[i]) * step)
    return float(min(hits, key=abs)) if hits else 0.0


def snap_closed(pts, sample, reach=3.0):
    """Move every point of a dense closed contour to the 50% edge along its outward normal."""
    moved = pts.copy()
    for i, p in enumerate(pts):
        prev, nxt = pts[i - 1], pts[(i + 1) % len(pts)]
        t = nxt - prev
        t /= np.hypot(*t) or 1.0
        normal = np.array([t[1], -t[0]])
        if in_polygon(p + normal * 0.8, pts):              # make it point outward
            normal = -normal
        moved[i] = p + normal * crossing(sample, p, normal, reach)
    return moved


def snap_edge_y(points, sample, reach=3.0, inside_below=True):
    """Refine (x, y) samples of a mostly horizontal edge to the 50% crossing, searching
    vertically around the given y (the interior is below by default)."""
    out = []
    for x, y in points:
        sign = 1.0 if inside_below else -1.0
        prof_y = np.arange(-reach, reach + 0.05, 0.1)
        prof = np.array([sample(x, y + sign * d) for d in prof_y])   # d>0 runs toward the interior
        inside, outside = plateaus(prof[prof_y <= -reach * 0.55], prof[prof_y >= reach * 0.55])
        if abs(outside - inside) < 20:
            out.append((x, y))
            continue
        w = (prof - inside) / (outside - inside)
        hits = []
        for i in range(len(prof_y) - 1):
            if (w[i] < .5) != (w[i + 1] < .5):
                hits.append(prof_y[i] + (0.5 - w[i]) / (w[i + 1] - w[i]) * 0.1)
        out.append((x, y + sign * (min(hits, key=abs) if hits else 0.0)))
    return out


def contour(mask, xs, ys, tol=0.3, sigma=0.7, smooth_mm=2.5, sample=None):
    """Longest sub-pixel contour of `mask` as (x, y) mm points (see module docstring).

    With `sample` (a reference sampler) the smoothed contour is snapped to the true
    50% edge before simplification.
    """
    soft = ndimage.gaussian_filter(mask.astype(float), sigma) if sigma else mask.astype(float)
    curves = measure.find_contours(soft, 0.5)
    if not curves:
        return np.zeros((0, 2))
    c = max(curves, key=len)
    pts = np.c_[np.interp(c[:, 1], np.arange(len(xs)), xs), np.interp(c[:, 0], np.arange(len(ys)), ys)]
    closed = bool(np.allclose(pts[0], pts[-1]))
    if smooth_mm:
        pts = smooth_along(pts, smooth_mm, closed)
    if sample is not None:
        pts = smooth_along(snap_closed(pts, sample), 0.6, closed)
    if closed:
        k = int(np.hypot(*(pts - pts[0]).T).argmax())
        return np.vstack([rdp(pts[:k + 1], tol)[:-1], rdp(pts[k:], tol)[:-1]])
    return rdp(pts, tol)


def despike(points, centre, k=4, limit=1.5):
    """Drop points of a convex contour that dent inward toward `centre` (mask bleeds)."""
    m = len(points)
    keep = np.ones(m, bool)
    for i in range(m):
        p0, p1, p2 = points[(i - k) % m], points[i], points[(i + k) % m]
        d = p2 - p0
        normal = np.array([-d[1], d[0]]) / (np.hypot(*d) or 1)
        if np.dot(p1 - p0, normal) * np.sign(np.dot(centre - p0, normal)) > limit:
            keep[i] = False
    return points[keep]


def in_polygon(point, polygon):
    x, y = point
    inside = False
    for i in range(len(polygon)):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % len(polygon)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def into_bleed(points, edge=0.5, reach=-4.0, far=214.0):
    """Push contour points lying on the trim edges out into the bleed area."""
    pts = points.copy()
    pts[pts[:, 1] < edge, 1] = reach
    pts[pts[:, 0] < edge, 0] = reach
    pts[pts[:, 0] > 210 - edge, 0] = far
    pts[pts[:, 1] > 297 - edge, 1] = 297 - reach
    return pts


def dilate(points, amount):
    """Offset a closed polygon outward by `amount` along its vertex normals."""
    pts = points.astype(float)
    if np.allclose(pts[0], pts[-1]):
        pts = pts[:-1]
    area = 0.5 * np.sum(pts[:, 0] * np.roll(pts[:, 1], -1) - np.roll(pts[:, 0], -1) * pts[:, 1])
    sign = 1.0 if area > 0 else -1.0
    prev = np.roll(pts, 1, axis=0) - pts
    nxt = np.roll(pts, -1, axis=0) - pts
    t = prev / np.hypot(*prev.T)[:, None] + nxt / np.hypot(*nxt.T)[:, None]
    t /= (np.hypot(*t.T) + 1e-9)[:, None]
    normal = np.c_[t[:, 1], -t[:, 0]] * sign      # outward for CCW (positive area) polygons
    return pts + normal * amount


def masks(a):
    xs, ys = mm_grid(a.shape[:2])
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = a.mean(axis=2)
    inside = box(xs, ys, 0, 0, 210, 297)
    green = (g > r + 14) & (g >= b - 2) & (lum < 235) & inside
    green &= ~box(xs, ys, 12, 194, 115, 218)          # NAME text and the name rule
    green &= ~box(xs, ys, 125, 84, 207, 105)           # DESIGN
    green &= ~box(xs, ys, 0, 222, 210, 297)            # contact panel
    green &= ~box(xs, ys, *RIBBON_CUT)                 # split the two touching ribbons
    navy = (lum < 100) & (b > g + 4) & inside & ~box(xs, ys, 0, 222, 210, 297)
    navy &= ~box(xs, ys, 150, 5, 185, 40)              # logo diamond and YOUR LOGO
    grey = (np.abs(r - g) < 8) & (np.abs(g - b) < 8) & (lum > 170) & (lum < 236) & inside
    return xs, ys, r, g, b, lum, green, navy, grey


def largest(mask):
    labels, n = ndimage.label(mask)
    if not n:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    return labels == (int(np.argmax(sizes)) + 1)


def ribbons(green, xs, ys, trace=None):
    labels, n = ndimage.label(green)
    sizes = ndimage.sum(green, labels, range(1, n + 1))
    found = {}
    for idx in np.argsort(sizes)[::-1][:3]:
        pts = trace(labels == idx + 1, xs, ys) if trace else contour(labels == idx + 1, xs, ys)
        x0, x1, y0, y1 = pts[:, 0].min(), pts[:, 0].max(), pts[:, 1].min(), pts[:, 1].max()
        name = 'crescent' if y0 < 85 and x1 > 150 else ('left' if x0 < 20 else 'swoosh')
        found[name] = pts
    return found


def emit(a, xs, ys):
    xs, ys, r, g, b, lum, green, navy, grey = masks(a)
    sample = sampler(field(a))
    with_sample = lambda mask, xs_, ys_: contour(mask, xs_, ys_, sample=sample)
    shapes = {name: into_bleed(pts) for name, pts in ribbons(green, xs, ys, trace=with_sample).items()}

    # Disc: traced, de-spiked against the crescent's dark tip, extended into the bleed.
    raw = contour(largest(navy), xs, ys, tol=0.0, smooth_mm=0)
    dense = despike(raw, raw.mean(axis=0))
    centre = dense.mean(axis=0)
    dense = smooth_along(dense, 2.5, True)
    dense = smooth_along(snap_closed(dense, sample), 0.6, True)
    k = int(np.hypot(*(dense - dense[0]).T).argmax())
    disc = np.vstack([rdp(dense[:k + 1], 0.3)[:-1], rdp(dense[k:], 0.3)[:-1]])
    disc = into_bleed(disc, edge=2.0)

    # Crescent: tuck the points that run along the disc 2 mm inside it, restore the apex.
    crescent = shapes['crescent'].copy()
    for i, p in enumerate(crescent):
        if np.hypot(*(dense - p).T).min() < 5.0 and not in_polygon(p, dense):
            crescent[i] = p + (centre - p) / np.hypot(*(centre - p)) * 2.0
    i = np.argmin(np.hypot(crescent[:, 0] - 82.1, crescent[:, 1] - 90.5))
    crescent[i] = APEX

    # Grid: grey cells closed over the white cells, largest region, dilated 1 mm so
    # the ribbons and disc painted on top hide any hairline gap.
    closed = ndimage.binary_fill_holes(ndimage.binary_closing(grey, structure=np.ones((5, 5)), iterations=2))
    grid_sample = sampler(field(a, sigma_mm=2.5))
    grid = into_bleed(dilate(contour(largest(closed), xs, ys, sample=grid_sample), 1.0))

    # Panel top edge and the foot-band swell, per 2 mm column, smoothed along x.
    lum = a.mean(axis=2)
    g, b = a[..., 1], a[..., 2]
    gb_sample = sampler(ndimage.gaussian_filter(g - b, 1.5))
    panel_top, band_top = [], {}
    for x in range(0, 211, 2):
        col = min(int(round(TRIM.x0 + x / 210 * TRIM.width)), a.shape[1] - 1)
        y0 = int(round(TRIM.y0 + 218 / 297 * TRIM.height))
        y1 = int(round(TRIM.y0 + 296.5 / 297 * TRIM.height))
        dark = np.where(lum[y0:y1, col] < 215)[0]
        if len(dark):
            panel_top.append((x, (y0 + dark[0] - TRIM.y0) * 297 / TRIM.height))
        if x >= 108:                                     # x=106 is the swell's soft cliff
            lime = np.where(g[y0:y1, col] - b[y0:y1, col] >= 62)[0]
            if len(lime) and lime[-1] >= len(lime) and lime[-1] >= (y1 - y0) - 4:
                band_top[x] = (y0 + lime[0] - TRIM.y0) * 297 / TRIM.height
    lo = max(kk for kk in band_top if kk <= 140)
    hi = min(kk for kk in band_top if kk >= 172)
    for x in range(lo + 2, hi, 2):                      # under the lime "20": interpolate
        band_top[x] = band_top[lo] + (band_top[hi] - band_top[lo]) * (x - lo) / (hi - lo)
    # Both edges are functions y(x) sampled every 2 mm: smooth y along x only.
    def smooth_edge(points):
        pts = np.array(points, dtype=float)
        pts[:, 1] = ndimage.gaussian_filter1d(pts[:, 1], 2.5 / 2, mode='nearest')
        return pts
    band = smooth_edge(snap_edge_y(sorted(band_top.items()), gb_sample))
    panel = smooth_edge(snap_edge_y(panel_top, sample))

    def lit(pts, per=5, decimals=1):
        rows = []
        for i in range(0, len(pts), per):
            if decimals == 1:
                rows.append('        ' + ' '.join(f'({x:.1f}, {y:.1f}),' for x, y in pts[i:i + per]))
            else:
                rows.append('        ' + ' '.join(f'({int(x)}, {y:.1f}),' for x, y in pts[i:i + per]))
        return '\n'.join(rows)

    out = ['# Edges traced from the reference with scripts/trace_cover.py --emit; millimetres\n'
           '# from the trim corner. Ribbon, disc and grid contours are closed; panel_top and\n'
           '# band_top are open edges running left to right.\n',
           'SHAPES = {\n']
    for name in ('swoosh', 'left', 'crescent'):
        out.append(f"    '{name}': [\n{lit(shapes[name] if name != 'crescent' else crescent)}\n    ],\n")
    out.append(f"    'disc': [\n{lit(disc)}\n    ],\n")
    out.append(f"    'grid': [\n{lit(grid)}\n    ],\n")
    out.append(f"    'panel_top': [\n{lit(panel, decimals=0)}\n    ],\n")
    out.append(f"    'band_top': [\n{lit(band, decimals=0)}\n    ],\n")
    out.append('}\n')
    sys.stdout.write(''.join(out))


def diagnostics(a, xs, ys):
    r, g, b, lum, green, navy, grey = masks(a)
    print(f'# green components: {ndimage.label(green)[1]}')
    for name, pts in ribbons(green, xs, ys).items():
        x0, x1, y0, y1 = pts[:, 0].min(), pts[:, 0].max(), pts[:, 1].min(), pts[:, 1].max()
        print(f'#   {name:9} {len(pts):3d} pts  bbox x {x0:.1f}-{x1:.1f} y {y0:.1f}-{y1:.1f}')
    d = contour(largest(navy), xs, ys)
    print(f'#   disc      {len(d):3d} pts  bbox x {d[:, 0].min():.1f}-{d[:, 0].max():.1f} '
          f'y {d[:, 1].min():.1f}-{d[:, 1].max():.1f}')
    inside = box(xs, ys, 0, 0, 210, 297)
    white_t = (lum > 215) & inside
    dark_t = (lum < 110) & inside
    lime_t = (g > r + 35) & (g > 150) & inside

    def bbox(mask):
        rr, cc = np.where(mask)
        return None if not len(rr) else tuple(round(float(v), 1) for v in
                                              (xs[cc.min()], ys[rr.min()], xs[cc.max()], ys[rr.max()]))
    print('# text bboxes (x0, y0, x1, y1):')
    for label, mask in (('diamond', white_t & box(xs, ys, 150, 5, 185, 27)),
                        ('COVER', white_t & box(xs, ys, 125, 60, 210, 84)),
                        ('DESIGN', lime_t & box(xs, ys, 120, 84, 210, 106)),
                        ('YOUR BUSINESS', dark_t & box(xs, ys, 10, 176, 120, 193)),
                        ('NAME', lime_t & box(xs, ys, 10, 194, 70, 209)),
                        ('20', lime_t & box(xs, ys, 135, 244, 172, 271)),
                        ('50', white_t & box(xs, ys, 172, 244, 210, 271))):
        print(f'#   {label:14} {bbox(mask)}')
    row = int(round(TRIM.y0 + 50 / 297 * TRIM.height))
    starts = [i for i in range(1, a.shape[1]) if grey[row, i] and not grey[row, i - 1]]
    starts_mm = [(i - TRIM.x0) * 210 / TRIM.width for i in starts]
    print('# checker grey run starts along y=50 (mm):', [round(v, 1) for v in starts_mm[:8]],
          ' mean period', round(float(np.mean(np.diff(starts_mm))), 2))


def main():
    args = [arg for arg in sys.argv[1:] if not arg.startswith('--')]
    if len(args) < 1:
        sys.exit(__doc__)
    a = load(args[0])
    xs, ys = mm_grid(a.shape[:2])
    if '--emit' in sys.argv:
        emit(a, xs, ys)
    else:
        diagnostics(a, xs, ys)


if __name__ == '__main__':
    main()
