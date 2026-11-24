#!/usr/bin/env python3
"""Development helper: stack the proof beside a reference image and blend them.

Usage: python scripts/compare_cover.py REFERENCE.png [PROOF.png] [OUTPUT_DIR]

Writes compare.png (side by side) and blend.png (50/50 overlay, scaled to the proof)
so the big shapes can be checked against the reference. The reference is not shipped
with the repository; pass the path to the image you are matching.
"""
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
WIDTH = 620  # raster width of each panel, in pixels


def raster(path, width):
    doc = pymupdf.open(stream=Path(path).read_bytes())
    page = doc[0]
    zoom = width / page.rect.width
    return page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    reference = Path(sys.argv[1])
    proof = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'assets' / 'cover.png'
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else Path('/tmp')
    a, b = raster(reference, WIDTH), raster(proof, WIDTH)
    height = max(a.height, b.height)

    sheet = pymupdf.open()
    page = sheet.new_page(width=WIDTH * 2 + 20, height=height)
    page.insert_image(pymupdf.Rect(0, 0, WIDTH, a.height), pixmap=a)
    page.insert_image(pymupdf.Rect(WIDTH + 20, 0, WIDTH * 2 + 20, b.height), pixmap=b)
    page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False).save(out / 'compare.png')

    blend = pymupdf.open()
    page = blend.new_page(width=WIDTH, height=b.height)
    page.insert_image(pymupdf.Rect(0, 0, WIDTH, b.height), pixmap=a)
    page.insert_image(pymupdf.Rect(0, 0, WIDTH, b.height), pixmap=b, overlay=True)
    page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False).save(out / 'blend.png')
    print(out / 'compare.png', out / 'blend.png')


if __name__ == '__main__':
    main()
