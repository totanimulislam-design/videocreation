#!/usr/bin/env python3
"""Development helper: reference vs proof crops with a 10 mm grid, side by side.

Usage: python scripts/compare_cover.py REFERENCE.png [PROOF.png] [OUTPUT_DIR]

Writes compare.png (full sheet side by side), blend.png (50/50 overlay), and
grid_*.png crops (reference above, proof below, 10 mm grid with labels) for the
regions listed in REGIONS, so shape edges can be read in millimetres.
"""
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
WIDTH = 620  # raster width of each panel in compare.png, in pixels

# Crop regions in mm: (name, x0, y0, x1, y1, zoom in px/mm)
REGIONS = [
    ('top', 0, 0, 210, 110, 5),
    ('middle', 0, 80, 210, 200, 5),
    ('bottom', 0, 170, 210, 297, 5),
]

# Trim box of the uploaded reference screenshot inside the image, in pixels.
REFERENCE_TRIM = pymupdf.Rect(8, 10, 237, 335)


def crop(page, box, region, grid=True):
    """Render `region` (mm) at the region's zoom with an optional labelled 10 mm grid."""
    x0, y0, x1, y1, z = region
    sx, sy = box.width / 210, box.height / 297
    clip = pymupdf.Rect(box.x0 + x0 * sx, box.y0 + y0 * sy, box.x0 + x1 * sx, box.y0 + y1 * sy)
    pix = page.get_pixmap(clip=clip, matrix=pymupdf.Matrix(z / sx, z / sy), alpha=False)
    sheet = pymupdf.open()
    out = sheet.new_page(width=pix.width, height=pix.height)
    out.insert_image(out.rect, pixmap=pix)
    if grid:
        for xmm in range(int(x0 // 10) * 10, int(x1) + 1, 10):
            if xmm < x0:
                continue
            x = (xmm - x0) * z
            out.draw_line((x, 0), (x, pix.height), color=(1, 0, 0), width=0.4)
            out.insert_text((x + 2, 10), str(xmm), fontsize=9, color=(1, 0, 0))
        for ymm in range(int(y0 // 10) * 10, int(y1) + 1, 10):
            if ymm < y0:
                continue
            y = (ymm - y0) * z
            out.draw_line((0, y), (pix.width, y), color=(1, 0, 0), width=0.4)
            out.insert_text((2, y - 2), str(ymm), fontsize=9, color=(1, 0, 0))
    return out.get_pixmap(alpha=False)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    reference = Path(sys.argv[1])
    proof = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'assets' / 'cover.png'
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else Path('/tmp')
    out.mkdir(parents=True, exist_ok=True)

    ref_page = pymupdf.open(stream=reference.read_bytes())[0]
    mine_doc = pymupdf.open(stream=proof.read_bytes())
    mine_page = mine_doc[0]
    mine_box = pymupdf.Rect(0, 0, mine_page.rect.width, mine_page.rect.height)

    for name, *_ in REGIONS:
        top = crop(ref_page, REFERENCE_TRIM, _)
        bottom = crop(mine_page, mine_box, _)
        sheet = pymupdf.open()
        page = sheet.new_page(width=top.width, height=top.height + bottom.height + 10)
        page.insert_image(pymupdf.Rect(0, 0, top.width, top.height), pixmap=top)
        page.insert_image(pymupdf.Rect(0, top.height + 10, bottom.width, top.height + 10 + bottom.height),
                          pixmap=bottom)
        page.get_pixmap(alpha=False).save(out / f'grid_{name}.png')

    def raster(page, box, width):
        zoom = width / box.width
        return page.get_pixmap(clip=box, matrix=pymupdf.Matrix(zoom, zoom), alpha=False)

    a, b = raster(ref_page, REFERENCE_TRIM, WIDTH), raster(mine_page, mine_box, WIDTH)
    sheet = pymupdf.open()
    page = sheet.new_page(width=WIDTH * 2 + 20, height=max(a.height, b.height))
    page.insert_image(pymupdf.Rect(0, 0, WIDTH, a.height), pixmap=a)
    page.insert_image(pymupdf.Rect(WIDTH + 20, 0, WIDTH * 2 + 20, b.height), pixmap=b)
    page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False).save(out / 'compare.png')

    blend = pymupdf.open()
    page = blend.new_page(width=WIDTH, height=b.height)
    page.insert_image(pymupdf.Rect(0, 0, WIDTH, b.height), pixmap=a)
    page.insert_image(pymupdf.Rect(0, 0, WIDTH, b.height), pixmap=b, overlay=True)
    page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False).save(out / 'blend.png')
    print(' '.join(str(out / n) for n in ('compare.png', 'blend.png', *(f'grid_{r[0]}.png' for r in REGIONS))))


if __name__ == '__main__':
    main()
