#!/usr/bin/env python3
"""Development helper: numeric reference-vs-proof difference map.

Usage: python scripts/diff_cover.py REFERENCE.png [PROOF.png] [OUTPUT_DIR]

Renders both at the same 3 px/mm, blurs them equally (the reference is an upscaled
screenshot, so its edges are soft), and writes:
  diff.png       heatmap of mean |ΔRGB| per pixel (white = identical)
  worst.txt      10 mm cells ranked by mean difference
  cell_<n>.png   reference | proof | diff for the worst cells
"""
import sys
from pathlib import Path

import numpy as np
import pymupdf
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parents[1]
Z = 3.0  # px per mm
W, H = round(210 * Z), round(297 * Z)
REFERENCE_TRIM = pymupdf.Rect(8, 10, 237, 335)


def raster(page, trim=None, dpi=None):
    if trim is not None:  # reference: crop the trim box and scale to Z
        sx, sy = trim.width / 210, trim.height / 297
        pix = page.get_pixmap(clip=trim, matrix=pymupdf.Matrix(Z / sx, Z / sy), alpha=False)
    else:  # proof: the page is the trim-sized image; scale it to exactly W×H
        r = page.rect
        pix = page.get_pixmap(matrix=pymupdf.Matrix(W / r.width, H / r.height), alpha=False)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3]
    arr = arr.astype(np.float32)
    # normalise to exactly W×H (rounding may leave ±1 pixel): crop or edge-pad
    if arr.shape[0] < H:
        arr = np.concatenate([arr, np.repeat(arr[-1:], H - arr.shape[0], 0)])
    if arr.shape[1] < W:
        arr = np.concatenate([arr, np.repeat(arr[:, -1:], W - arr.shape[1], 1)], 1)
    return arr[:H, :W]


def main():
    reference = Path(sys.argv[1])
    proof = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'assets' / 'cover.png'
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else Path('/tmp/diff')
    out.mkdir(parents=True, exist_ok=True)

    ref = raster(pymupdf.open(reference)[0], trim=REFERENCE_TRIM)
    mine = raster(pymupdf.open(proof)[0])
    assert ref.shape[:2] == mine.shape[:2] == (H, W), (ref.shape, mine.shape)

    sigma = 1.2
    ref_b = np.stack([gaussian_filter(ref[..., c], sigma) for c in range(3)], -1)
    mine_b = np.stack([gaussian_filter(mine[..., c], sigma) for c in range(3)], -1)
    diff = np.abs(ref_b - mine_b).mean(-1)           # 0..255

    # heatmap
    heat = np.zeros((H, W, 3), dtype=np.uint8)
    heat[..., 0] = 255
    heat[..., 1] = np.clip(255 - diff * 2.2, 0, 255)
    heat[..., 2] = np.clip(255 - diff * 2.2, 0, 255)
    page = pymupdf.open()
    img = page.new_page(width=W, height=H)
    img.insert_image(img.rect, pixmap=pymupdf.Pixmap(pymupdf.csRGB, W, H, heat.tobytes(), False))
    img.get_pixmap(alpha=False).save(out / 'diff.png')

    # cells
    cells = []
    for cy in range(0, 297, 10):
        for cx in range(0, 210, 10):
            y0, y1 = round(cy * Z), round(min(cy + 10, 297) * Z)
            x0, x1 = round(cx * Z), round(min(cx + 10, 210) * Z)
            cells.append((float(diff[y0:y1, x0:x1].mean()), cx, cy))
    cells.sort(reverse=True)
    with open(out / 'worst.txt', 'w') as f:
        f.write(f'overall mean diff: {diff.mean():.2f}\n')
        f.write('mean   cell (mm)\n')
        for value, cx, cy in cells[:30]:
            f.write(f'{value:6.2f}  x{cx:3d} y{cy:3d}\n')
    print((out / 'worst.txt').read_text())

    # crops of the worst 12 cells: reference | proof | diff, at 8 px/mm
    for rank, (value, cx, cy) in enumerate(cells[:12], 1):
        x0, y0 = max(cx - 5, 0), max(cy - 5, 0)
        x1, y1 = min(cx + 15, 210), min(cy + 15, 297)
        zz = 8
        box = pymupdf.Rect(x0, y0, x1, y1)

        def panel(arr):
            sub = arr[round(y0 * Z):round(y1 * Z), round(x0 * Z):round(x1 * Z)]
            h, w = sub.shape[:2]
            page_ = pymupdf.open()
            pg = page_.new_page(width=w, height=h)
            pg.insert_image(pg.rect, pixmap=pymupdf.Pixmap(pymupdf.csRGB, w, h, np.ascontiguousarray(sub.astype(np.uint8)).tobytes(), False))
            return pg.get_pixmap(matrix=pymupdf.Matrix(zz / Z, zz / Z), alpha=False)

        a, b = panel(ref), panel(mine)
        sub = diff[round(y0 * Z):round(y1 * Z), round(x0 * Z):round(x1 * Z)]
        h, w = sub.shape
        d = pymupdf.Pixmap(pymupdf.csRGB, w, h, np.ascontiguousarray(np.repeat(np.clip(255 - sub[..., None] * 2.2, 0, 255), 3, -1).astype(np.uint8)).tobytes(), False)
        sheet = pymupdf.open()
        pg = sheet.new_page(width=a.width + b.width + w * zz / Z + 20, height=a.height)
        pg.insert_image(pymupdf.Rect(0, 0, a.width, a.height), pixmap=a)
        pg.insert_image(pymupdf.Rect(a.width + 10, 0, a.width * 2 + 10, a.height), pixmap=b)
        pg.insert_image(pymupdf.Rect(a.width * 2 + 20, 0, a.width * 2 + 20 + w * zz / Z, a.height), pixmap=d)
        pg.insert_text((4, 12), f'#{rank} x{cx} y{cy}  diff {value:.1f}', fontsize=10, color=(1, 0, 0))
        pg.get_pixmap(alpha=False).save(out / f'cell_{rank:02d}.png')


if __name__ == '__main__':
    main()
