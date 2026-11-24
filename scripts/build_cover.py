#!/usr/bin/env python3
"""Compose a print-ready A4 cover as vector paths, then export SVG and a PNG proof.

The artwork reproduces a stock "cover design" template: a transparency-grid panel,
three green ribbons, a navy disc carrying the wordmark, a business name block, and a
waving contact panel with a soft green swell along its foot. Every shape edge was
traced from the reference at millimetre resolution (scripts/trace_cover.py) and is
stored below in SHAPES; everything is drawn in design units of 4 per millimetre and
typeset from the bundled Montserrat cuts, so the SVG has no live text and no raster.
"""
import argparse
from contextlib import contextmanager
from functools import lru_cache
from html import escape
from math import atan, cos, sin
from pathlib import Path

import resvg_py
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
MM = 4                        # design units per millimetre
W, H = 210 * MM, 297 * MM     # A4 trim
BLEED = 3 * MM                # 3 mm bleed on every side

INK = '#262626'               # near-black used for the business name
GREEN = '#8fc64a'              # lime used for DESIGN, NAME and the year
WHITE = '#ffffff'
NAVY = '#1c2c3b'               # flat navy of the disc
CHECKER = '#bebebe'            # grey cells of the transparency grid (190 in the reference raster)
CHECKER_LIGHT = '#f7f7f7'       # the reference's 'white' cells are a faint grey (247)
CHECKER_SOFT = .5               # mm; the reference grid is a slightly blurred raster, not crisp vector

FONTS = {'regular': 'montserrat-latin-400-regular',
         'medium': 'montserrat-latin-500-medium',
         'semibold': 'montserrat-latin-600-semibold',
         'bold': 'montserrat-latin-700-bold',
         'black': 'montserrat-latin-800-extrabold',
         'jost': 'jost-latin-700-bold',       # the year's digits: Jost's short-bar 5
         'jost-semibold': 'jost-latin-600-semibold', 'jost-medium': 'jost-latin-500-medium'}

# The copy is template copy. Change these values before repurposing.
COPY = {
    'logo': 'YOUR LOGO',
    'cover': ('COVER', 'DESIGN'),
    'business': ('YOUR BUSINESS', 'NAME'),
    'contact': ('FOR MORE INFO', '+012 3456 789', 'your website here'),
    'year': '2050',
}


def mm(value):
    return value * MM


def n(value):
    return f'{value:.4f}'.rstrip('0').rstrip('.')


def attrs(**values):
    return ' '.join(f'{key.replace("_", "-")}="{escape(str(val), quote=True)}"'
                    for key, val in values.items() if val is not None)


def smooth(points, closed=False):
    """Catmull-Rom spline through `points`, written as cubic Béziers."""
    pts = [points[-1]] + list(points) + [points[0], points[1]] if closed else \
          [points[0]] + list(points) + [points[-1]]
    d = [f'M{n(pts[1][0])},{n(pts[1][1])}']
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f'C{n(c1[0])},{n(c1[1])} {n(c2[0])},{n(c2[1])} {n(p2[0])},{n(p2[1])}')
    if closed:
        d.append('Z')
    return ' '.join(d)


@lru_cache(None)
def font(face):
    f = TTFont(ROOT / 'assets' / 'fonts' / (FONTS[face] + '.woff'))
    return f.getGlyphSet(), f.getBestCmap(), f['head'].unitsPerEm


@lru_cache(None)
def kerning(face):
    """Pair kerning from GPOS, in font units."""
    f = TTFont(ROOT / 'assets' / 'fonts' / (FONTS[face] + '.woff'))
    pairs = {}
    if 'GPOS' not in f:
        return pairs
    for lookup in f['GPOS'].table.LookupList.Lookup:
        for table in lookup.SubTable:
            if lookup.LookupType == 9:
                table = table.ExtSubTable
            if table.LookupType != 2:
                continue
            if table.Format == 1:
                for index, first in enumerate(table.Coverage.glyphs):
                    for record in table.PairSet[index].PairValueRecord:
                        value = record.Value1.XAdvance if record.Value1 else 0
                        if value:
                            pairs[(first, record.SecondGlyph)] = value
            else:
                for first, class1 in table.ClassDef1.classDefs.items():
                    for second, class2 in table.ClassDef2.classDefs.items():
                        record = table.Class1Record[class1].Class2Record[class2]
                        value = record.Value1.XAdvance if record.Value1 else 0
                        if value:
                            pairs[(first, second)] = value
    return pairs


@lru_cache(None)
def glyph(face, char):
    glyphs, cmap, _ = font(face)
    shape = glyphs[cmap[ord(char)]]
    pen = SVGPathPen(glyphs, ntos=n)
    shape.draw(pen)
    return shape.width, pen.getCommands()


@lru_cache(None)
def glyph_bounds(face, char):
    """Ink box of `char` in font units (xMin, yMin, xMax, yMax), or None if blank."""
    glyphs, cmap, _ = font(face)
    pen = BoundsPen(glyphs)
    glyphs[cmap[ord(char)]].draw(pen)
    return pen.bounds


class Art:
    """A tiny SVG writer: every mark is a path, text is outlined from the fonts."""

    def __init__(self):
        self.defs = []
        self.content = []
        self.filters = {}

    def tag(self, element, **props):
        self.content.append(f'<{element} {attrs(**props)}/>')

    @contextmanager
    def group(self, **props):
        self.content.append(f'<g {attrs(**props)}>')
        yield
        self.content.append('</g>')

    def layer(self, id_, label):
        return self.group(id=id_, **{'inkscape:groupmode': 'layer', 'inkscape:label': label})

    def rect(self, x, y, w, h, fill, **props):
        self.tag('rect', x=n(x), y=n(y), width=n(w), height=n(h), fill=fill, **props)

    def circle(self, cx, cy, r, fill, **props):
        self.tag('circle', cx=n(cx), cy=n(cy), r=n(r), fill=fill, **props)

    def path(self, d, fill='none', **props):
        self.tag('path', d=d, fill=fill, **props)

    def gradient(self, id_, stops, x1, y1, x2, y2):
        """A linear gradient in design units; stops are (offset, colour[, opacity])."""
        body = ''.join(f'<stop offset="{n(offset)}" stop-color="{colour}"'
                       + (f' stop-opacity="{n(stops_[2])}"' if len(stops_) > 2 else '') + '/>'
                       for stops_ in stops for offset, colour in [stops_[:2]])
        self.defs.append(f'<linearGradient id="{id_}" gradientUnits="userSpaceOnUse" '
                         f'x1="{n(x1)}" y1="{n(y1)}" x2="{n(x2)}" y2="{n(y2)}">{body}</linearGradient>')
        return f'url(#{id_})'

    def radial(self, id_, stops, cx, cy, r):
        body = ''.join(f'<stop offset="{n(offset)}" stop-color="{colour}"/>'
                       for offset, colour in stops)
        self.defs.append(f'<radialGradient id="{id_}" gradientUnits="userSpaceOnUse" '
                         f'cx="{n(cx)}" cy="{n(cy)}" r="{n(r)}">{body}</radialGradient>')
        return f'url(#{id_})'

    def clip(self, id_, d):
        self.defs.append(f'<clipPath id="{id_}"><path d="{d}"/></clipPath>')
        return f'url(#{id_})'

    def shadow(self, id_, dx, dy, blur, colour='#000000', opacity=.5):
        """A drop-shadow filter in design units (used for the type and the logo mark).

        Filters are shared: asking for the same id twice returns the first definition.
        """
        if id_ in self.filters:
            return self.filters[id_]
        self.defs.append(
            f'<filter id="{id_}" x="-15%" y="-40%" width="130%" height="180%">'
            f'<feDropShadow dx="{n(dx)}" dy="{n(dy)}" stdDeviation="{n(blur)}" '
            f'flood-color="{colour}" flood-opacity="{n(opacity)}"/></filter>')
        return self.filters.setdefault(id_, f'url(#{id_})')

    def svg(self, margin=0):
        """Serialise the sheet; `margin` adds bleed space around the trim."""
        w, h = W + 2 * margin, H + 2 * margin
        head = (f'<svg xmlns="http://www.w3.org/2000/svg" '
                f'xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
                f'width="{n(w / MM)}mm" height="{n(h / MM)}mm" '
                f'viewBox="{n(-margin)} {n(-margin)} {n(w)} {n(h)}" '
                f'role="img" aria-labelledby="title desc">\n'
                '<title id="title">Cover Design — business cover template</title>\n'
                '<desc id="desc">An A4 cover with a transparency grid, green ribbons, '
                'a navy disc carrying the wordmark, a business name block, and a waving '
                'contact panel.</desc>\n')
        return (head + '<defs>\n' + '\n'.join(self.defs) + '\n</defs>\n'
                + '\n'.join(self.content) + '\n</svg>\n')

    def text(self, x, baseline, copy, size, face='bold', fill=INK, track=0,
             align='left', fit=None, condense=1.0, word=0):
        """Outline `copy` at `size` design units and return the width of the line.

        `condense` narrows the letterforms horizontally (1 = Montserrat as drawn).
        `fit` then sets the width of the visible ink by tracking, and `x` refers to
        that ink: its left edge, right edge, or centre. Narrowing the glyphs first
        keeps the word spaces intact when a line must be much narrower than its
        natural width, which is how the reference's condensed setting behaves.
        `word` adds that much extra space (design units) at every word gap.
        """
        shapes = [glyph(face, char) for char in copy]
        pairs = kerning(face)
        advances = [width for width, _ in shapes]
        for index in range(len(copy) - 1):
            advances[index] += pairs.get((copy[index], copy[index + 1]), 0)
        scale = size / font(face)[2]
        stretch = scale * condense
        bounds = [glyph_bounds(face, copy[0]), glyph_bounds(face, copy[-1])]
        lsb = bounds[0][0] if bounds[0] else 0
        rsb = advances[-1] - bounds[1][2] if bounds[1] else 0
        ink = (sum(advances) - lsb - rsb) * stretch          # before tracking
        spaces = copy.count(' ')
        step = track
        if fit is not None:
            step += (fit - ink - track * (len(copy) - 1) - word * spaces) / max(len(copy) - 1, 1)
        width = ink + step * (len(copy) - 1) + word * spaces
        x -= {'left': 0, 'right': width, 'center': width / 2}[align]
        x -= lsb * stretch
        with self.group(transform=f'translate({n(x)} {n(baseline)}) scale({n(stretch)} {n(-scale)})',
                        fill=fill, aria_label=copy):
            at = 0
            for char, advance, (_, d) in zip(copy, advances, shapes):
                if d:
                    self.tag('path', d=d, transform=f'translate({n(at)} 0)')
                at += advance + step / stretch + (word / stretch if char == ' ' else 0)
        return width

# Edges traced from the reference with scripts/trace_cover.py --emit; millimetres
# from the trim corner. Ribbon, disc and grid contours are closed; panel_top and
# band_top are open edges running left to right.
SHAPES = {
    'swoosh': [  # lower edge (tail -> top-left), bleed corner, upper edge (-> tail), all 50 % crossings
        (114.0, 47.2), (110.0, 46.0), (106.0, 45.0), (104.0, 44.0), (100.0, 43.25),
        (95.7, 42.2), (91.8, 41.4), (84.3, 39.1), (80.4, 38.2), (73.1, 35.1),
        (67.4, 32.7), (57.9, 27.8), (53.3, 25.0), (48.3, 21.9), (37.9, 13.3),
        (28.4, 3.6), (27.8, 1.7),
        (27.9, -4.0), (29.5, -4.0), (44.5, -4.0), (47.4, -4.0),
        (51.2, 3.65), (62.4, 15.2), (72.4, 23.1), (80.7, 29.2), (88.0, 33.6),
        (96.0, 37.9), (102.0, 40.7), (106.0, 42.8), (110.0, 44.4), (114.0, 45.6),
    ],
    'left': [  # upper edge (bleed -> tip) then lower edge (tip -> bleed); 50 % crossings
        (-4.0, 173.3), (0.0, 167.33), (5.0, 159.92), (10.0, 153.42), (15.0, 146.5),
        (20.0, 141.0), (25.0, 135.5), (30.0, 129.92), (35.0, 124.75), (40.0, 120.08),
        (45.0, 115.67), (50.0, 111.42), (55.0, 107.42), (60.0, 103.92), (65.0, 100.33),
        (70.0, 96.75), (75.0, 93.83), (80.0, 91.33), (82.5, 90.7),
        (80.0, 92.42), (75.0, 96.25), (70.0, 100.42), (65.0, 104.92), (60.0, 110.0),
        (55.0, 115.25), (50.0, 120.92), (45.0, 127.08), (40.0, 133.58), (35.0, 140.42),
        (30.0, 147.5), (25.0, 155.08), (20.0, 163.08), (15.0, 171.25), (10.0, 179.83),
        (5.0, 188.83), (0.0, 197.58), (-4.0, 203.6),
    ],
    'crescent': [
        (206.0, 190.4), (196.0, 190.2), (190.0, 189.9), (184.0, 189.2), (178.0, 188.2),
        (172.0, 187.2), (166.0, 186.0), (160.0, 184.3), (153.0, 181.8), (149.4, 180.4),
        (140.3, 176.5),
        (132.4, 171.6), (124.1, 166.0), (116.4, 159.7), (110.8, 154.0), (104.3, 146.3),
        (99.8, 139.7), (97.3, 136.0), (95.1, 132.0), (93.1, 128.0), (91.5, 124.0),
        (89.8, 120.0), (88.4, 116.0), (87.2, 112.0), (86.2, 108.0), (85.3, 104.0),
        (84.5, 100.0), (83.8, 96.0), (83.5, 92.0), (85.9, 88.0), (89.8, 86.0),
        (95.8, 84.0), (101.0, 82.0), (103.1, 80.8), (104.5, 80.6), (104.8, 84.0), (107.3, 97.6),
        (109.2, 105.9), (111.3, 113.0), (116.7, 127.0), (124.1, 140.4), (133.2, 154.8),
        (143.0, 162.6), (151.5, 169.4), (163.0, 177.0), (170.0, 182.0), (178.0, 186.0),
        (186.0, 188.2), (196.0, 189.2), (206.0, 189.5), (214.0, 189.6),
    ],
    'disc': [  # left/top edge: circle centre (218.9, 78.1) r 115.3, fitted to the reference
        (137.8, -4.0), (132.2, 2.0), (127.3, 8.0), (123.0, 14.0),
        (119.2, 20.0), (116.0, 26.0), (113.1, 32.0), (110.7, 38.0),
        (108.7, 44.0), (107.0, 50.0), (105.7, 56.0), (104.7, 62.0),
        (104.0, 68.0), (103.6, 74.0), (103.6, 80.0), (103.8, 86.0),
        (104.4, 92.0), (105.3, 98.0), (106.5, 104.0), (108.1, 110.0),
        (110.0, 116.0), (112.3, 122.0), (114.9, 128.0), (118.0, 134.0),
        (121.6, 140.0), (122.1, 142.0), (123.5, 144.0), (124.9, 146.0),
        (126.3, 148.0), (127.8, 150.0), (129.3, 152.0), (131.2, 154.0),
        (132.8, 156.0), (134.7, 158.0), (136.6, 160.0), (138.8, 162.0),
        (140.8, 164.0), (143.1, 166.0), (147.5, 170.0), (153.5, 174.0),
        (159.5, 178.0), (167.5, 182.0), (174.0, 184.6), (180.0, 188.3), (187.2, 189.6),
        (194.0, 190.3), (200.0, 190.4), (206.0, 190.5), (212.0, 190.5),
        (214.0, 190.5), (214.0, 150.0), (214.0, 100.0), (214.0, 50.0),
        (214.0, 0.0), (214.0, -4.0),
    ],
    'grid': [
        (-4.0, 162.5), (-4.0, 157.9), (-4.0, 150.9), (-4.0, 73.9),
        (-4.0, 73.0), (-4.0, 67.0), (-4.0, 64.1), (-4.0, 58.1), (-4.0, 56.2),
        (-4.0, 50.2), (-4.0, 47.3), (-4.0, 41.3), (-4.0, 39.4), (-4.0, 33.5),
        (-4.0, 30.5), (-4.0, 24.6), (-4.0, 22.6), (-4.0, 16.7), (-4.0, 14.8),
        (-4.0, 7.8), (0.7, 2.2), (2.1, 0.7), (3.9, -4.0), (6.9, -4.0),
        (11.9, -4.0), (17.8, -4.0), (24.7, 0.6), (26.4, 1.6), (28.4, 4.6),
        (31.3, 7.6), (40.0, 16.0), (50.5, 24.3), (58.2, 29.0), (67.1, 33.5),
        (80.1, 39.1), (90.0, 41.5), (100.0, 44.2), (105.0, 45.3), (108.3, 46.4),
        (108.6, 47.6), (107.0, 48.8), (104.4, 62.3), (102.9, 77.2), (100.8, 80.6),
        (98.2, 82.1), (85.4, 87.7), (81.5, 88.2), (77.3, 90.7), (77.3, 90.2),
        (62.4, 100.7), (46.1, 112.7), (41.2, 116.9), (29.6, 129.1), (17.2, 142.8),
        (8.0, 154.3), (3.0, 161.5), (0.9, 164.7),
    ],
    'panel_top': [
        (0, 227.5), (2, 227.3), (4, 227.0), (6, 226.7), (8, 226.4),
        (10, 226.1), (12, 225.8), (14, 225.6), (16, 225.4), (18, 225.2),
        (20, 225.1), (22, 225.1), (24, 225.0), (26, 225.0), (28, 225.0),
        (30, 225.1), (32, 225.2), (34, 225.3), (36, 225.5), (38, 225.8),
        (40, 226.0), (42, 226.3), (44, 226.6), (46, 227.0), (48, 227.4),
        (50, 227.8), (52, 228.3), (54, 228.9), (56, 229.4), (58, 230.0),
        (60, 230.7), (62, 231.4), (64, 232.1), (66, 232.9), (68, 233.7),
        (70, 234.5), (72, 235.5), (74, 236.5), (76, 237.4), (78, 238.4),
        (80, 239.5), (82, 240.6), (84, 241.8), (86, 243.0), (88, 244.2),
        (90, 245.4), (92, 246.8), (94, 248.2), (96, 249.6), (98, 251.1),
        (100, 252.5), (102, 253.9), (104, 254.9), (106, 255.2), (108, 254.7),
        (110, 253.5), (112, 252.1), (114, 250.6), (116, 249.1), (118, 247.7),
        (120, 246.4), (122, 245.1), (124, 243.8), (126, 242.5), (128, 241.3),
        (130, 240.2), (132, 239.1), (134, 238.1), (136, 237.1), (138, 236.1),
        (140, 235.2), (142, 234.3), (144, 233.5), (146, 232.7), (148, 231.9),
        (150, 231.2), (152, 230.5), (154, 229.9), (156, 229.3), (158, 228.8),
        (160, 228.2), (162, 227.8), (164, 227.3), (166, 226.9), (168, 226.6),
        (170, 226.3), (172, 226.0), (174, 225.7), (176, 225.5), (178, 225.3),
        (180, 225.2), (182, 225.1), (184, 225.0), (186, 225.0), (188, 225.0),
        (190, 225.1), (192, 225.2), (194, 225.3), (196, 225.5), (198, 225.7),
        (200, 225.9), (202, 226.1), (204, 226.4), (206, 226.7), (208, 227.1),
        (210, 227.3),
    ],
    'band_top': [
        (108, 261.5), (110, 261.8), (112, 262.5), (114, 263.5), (116, 264.8),
        (118, 266.1), (120, 267.3), (122, 268.5), (124, 269.6), (126, 270.8),
        (128, 272.1), (130, 273.2), (132, 274.2), (134, 275.3), (136, 276.3),
        (138, 277.3), (140, 278.2), (142, 279.1), (144, 279.9), (146, 280.7),
        (148, 281.4), (150, 282.2), (152, 282.8), (154, 283.5), (156, 284.1),
        (158, 284.7), (160, 285.3), (162, 285.8), (164, 286.3), (166, 286.7),
        (168, 287.2), (170, 287.5), (172, 287.9), (174, 288.2), (176, 288.4),
        (178, 288.6), (180, 288.7), (182, 288.8), (184, 288.9), (186, 288.9),
        (188, 288.8), (190, 288.7), (192, 288.6), (194, 288.4), (196, 288.2),
        (198, 287.9), (200, 287.6), (202, 287.2), (204, 286.8), (206, 286.4),
        (208, 285.9), (210, 285.6),
    ],
}

def rounded_rhombus(cx, cy, half_w, half_h, radius):
    """Path of a rhombus with tips rounded by `radius` (mm), outer size 2·half × 2·half.

    The polygon is shrunk so that, once stroked with `radius` and a round join, the
    stroke's outer edge reaches exactly the four tips and rounds them with `radius`.
    """
    stroke = radius
    theta = atan(half_w / half_h)                   # half-angle at the top/bottom tips
    inset = stroke / 2 / sin(theta)                  # shrink along the axis at the tips
    top = (cx, cy - half_h + inset)
    bottom = (cx, cy + half_h - inset)
    right = (cx + half_w - stroke / 2 / cos(theta), cy)
    left = (cx - half_w + stroke / 2 / cos(theta), cy)
    return ('M' + ' L'.join(f'{n(mm(x))} {n(mm(y))}' for x, y in (top, right, bottom, left)) + ' Z',
            stroke)


def path_mm(points, closed=True):
    """Catmull-Rom spline through traced (x, y) millimetre points."""
    return smooth([(mm(x), mm(y)) for x, y in points], closed=closed)


def checker(a):
    """The transparency grid, filling the traced region left of the swoosh and disc."""
    # Cells measure 3.92 × 4.17 mm with edges at x ≡ 2.49, y ≡ 2.90 (mod cell).
    cw, ch = 3.92, 4.17
    a.defs.append(
        f'<pattern id="p-grid" patternUnits="userSpaceOnUse" x="{n(mm(2.49 - cw))}" y="{n(mm(2.9))}" '
        f'width="{n(mm(2 * cw))}" height="{n(mm(2 * ch))}">'
        f'<rect width="{n(mm(2 * cw))}" height="{n(mm(2 * ch))}" fill="{CHECKER_LIGHT}"/>'
        f'<rect width="{n(mm(cw))}" height="{n(mm(ch))}" fill="{CHECKER}"/>'
        f'<rect x="{n(mm(cw))}" y="{n(mm(ch))}" width="{n(mm(cw))}" height="{n(mm(ch))}" fill="{CHECKER}"/>'
        '</pattern>')
    a.defs.append(f'<filter id="f-grid" x="-5%" y="-5%" width="110%" height="110%">'
                  f'<feGaussianBlur stdDeviation="{n(mm(CHECKER_SOFT))}"/></filter>')
    a.path(path_mm(SHAPES['grid']), fill='url(#p-grid)', filter='url(#f-grid)')


def ribbons(a):
    """Three tapering ribbons, each with its own gradient from lime to deep green."""
    swoosh = a.gradient('g-swoosh', [(0, '#8cc642'), (.2, '#7db247'), (.42, '#649a4b'),
                                     (.62, '#507f51'), (.8, '#3f7352'), (1, '#326855')],
                        mm(28), mm(2), mm(108), mm(44))
    left = a.gradient('g-left', [(0, '#8dc541'), (.37, '#86c23c'), (.68, '#5f8959'),
                                 (.79, '#4e7b55'), (.9, '#406f56'), (1, '#3f6b57')],
                      mm(3), mm(190), mm(80), mm(90))
    crescent = a.gradient('g-crescent', [(0, '#8cc542'), (.1, '#84bb44'), (.23, '#7bb04a'),
                                         (.38, '#6c9d4f'), (.53, '#588753'), (.67, '#497655'),
                                         (.81, '#326851'), (.93, '#225755'), (1, '#1f5355')],
                          mm(95), mm(90), mm(180), mm(187))
    a.path(path_mm(SHAPES['swoosh']), swoosh)
    # The crescent's right edge runs under the disc, which is painted after it.
    a.path(path_mm(SHAPES['crescent']), crescent)
    a.path(path_mm(SHAPES['left']), left)


def disc(a):
    """The flat navy disc, bleeding off the top and right trim edges."""
    a.path(path_mm(SHAPES['disc']), NAVY)


def wordmark(a):
    """Logo diamond, logo line, the two-line wordmark, and its gradient rule."""
    glow = a.shadow('f-glow', mm(.2), mm(.5), mm(.8), '#06131c', .6)
    with a.group(filter=glow):
        # Filled diamond: 14.1 × 16.8 mm, centre (165, 16.9), tips rounded ≈1.6 mm.
        d, stroke = rounded_rhombus(165, 16.9, 7.3, 8.7, 1.6)
        a.tag('path', d=d, fill='#e2e3e5', stroke='#e2e3e5',
              **{'stroke-width': n(mm(stroke)), 'stroke-linejoin': 'round'})
        a.text(mm(165), mm(35.5), COPY['logo'], 28.5, 'medium', WHITE, align='center', condense=.67)
        a.text(mm(165.25), mm(80.95), COPY['cover'][0], 80, 'bold', WHITE, align='center',
               fit=mm(61), condense=.84)
        a.text(mm(165.5), mm(103.0), COPY['cover'][1], 91.4, 'bold', GREEN, align='center',
               fit=mm(78.8), condense=.88)
    rule = a.gradient('g-rule-cover', [(0, '#8fc847'), (.13, '#8cc443'), (.28, '#82b846'),
                                       (.43, '#6b9a4d'), (.59, '#4c7d55'), (.74, '#316353'),
                                       (.89, '#174c52'), (1, '#0a3c53')],
                      mm(132.2), mm(112.9), mm(197.9), mm(112.9))
    a.rect(mm(132.2), mm(111.6), mm(65.7), mm(2.6), rule)


def name_block(a):
    """The business name, its green second line, and the rule beneath."""
    soft = a.shadow('f-soft', mm(.2), mm(.6), mm(.9), '#000000', .22)
    with a.group(filter=soft):
        a.text(mm(16.75), mm(190.25), COPY['business'][0], 51.4, 'bold', INK, fit=mm(95.4),
               condense=.91)
        a.text(mm(17.83), mm(206.58), COPY['business'][1], 53.1, 'bold', '#9bcf4f', fit=mm(35.5),
               condense=.90)
    rule = a.gradient('g-rule-name', [(0, '#8dc456'), (.07, '#8cc240'), (.2, '#8ac248'),
                                      (.33, '#79ad4c'), (.45, '#639152'), (.58, '#4c7a54'),
                                      (.7, '#39664f'), (.77, '#2b5b50'), (.87, '#1e4a52'),
                                      (.97, '#0a3d49'), (1, '#0a3d49')],
                      mm(16.5), mm(214.5), mm(113.3), mm(214.5))
    a.rect(mm(16.5), mm(213.0), mm(96.8), mm(3.0), rule)


#            size  condense  fit    x       align     baseline  face
YEAR_DIGITS = [(110.5, .85, 14.3, 142.15, 'left', 268.0, 'jost-semibold'), (108.5, .84, 13.5, 170.85, 'right', 267.7, 'jost-semibold'),
               (109, .86, 12.67, 172.9, 'left', 267.95, 'jost-semibold'), (109, .86, 12.6, 201.15, 'right', 267.95, 'jost-semibold')]


def panel(a):
    """The waving contact panel: a horizontal teal-green gradient, the copy, the year,
    and a soft lime swell along the foot."""
    top = SHAPES['panel_top']
    edge = [(-3.5, top[0][1])] + top + [(213.5, top[-1][1])]
    ground = smooth([(mm(x), mm(y)) for x, y in edge], closed=False)
    ground += (f' L{n(mm(213.5))},{n(mm(300))} L{n(mm(-3.5))},{n(mm(300))} Z')
    # Horizontal teal→green→teal ramp; the green peak sits at x≈105 in the reference
    # (samples on y=262: 69,115,82 at x=80 → 87,133,84 at x=100 → 77,122,89 at x=120).
    a.path(ground, a.gradient('g-panel', [(0, '#053b54'), (.024, '#053b54'), (.143, '#134252'),
                                          (.26, '#2a5a54'), (.38, '#3f7259'), (.476, '#528a55'),
                                          (.52, '#578d56'), (.6, '#457559'), (.714, '#316253'),
                                          (.81, '#235657'), (.905, '#144856'),
                                          (.976, '#083f52'), (1, '#083f52')],
                              mm(0), mm(0), mm(210), mm(0)))

    # Lime swell: a wedge whose top edge is the traced diagonal from (108, 261) to the
    # right trim (≈286), flat vertically beneath it, and blending leftward into the
    # panel's own green with no visible face (reference at y=294: 79,125,87 at x=90 →
    # 98,147,82 at x=110 → 109,161,76 at x=120 → 140,197,66 from x=150).
    band = SHAPES['band_top']
    swell = f'M{n(mm(108))},{n(mm(312))} L{n(mm(band[0][0]))},{n(mm(band[0][1]))} '
    swell += smooth([(mm(x), mm(y)) for x, y in band], closed=False)[1:]
    swell += f' L{n(mm(225))},{n(mm(band[-1][1]))} L{n(mm(225))},{n(mm(312))} Z'
    # Its fill: the panel's local green at the face ramping into the flat lime by x≈150.
    a.path(swell, a.gradient('g-band', [(0, '#5c8953'), (.12, '#639452'), (.25, '#6b9e51'),
                                        (.45, '#75ab4a'), (.65, '#80b846'), (.85, '#88c044'),
                                        (1, '#8cc542')],
                             mm(108), mm(0), mm(150), mm(0)))

    glow = a.shadow('f-glow', mm(.2), mm(.5), mm(.7), '#06131c', .45)
    heading, phone, site = COPY['contact']
    with a.group(filter=glow):
        a.text(mm(17.8), mm(258.8), heading, 35.5, 'semibold', '#eef6f4', fit=mm(65), condense=.9,
               word=mm(1.75))
        a.text(mm(18.8), mm(274.15), phone, 25.4, 'semibold', '#eef6f4', fit=mm(46.8), condense=1.15,
               word=mm(.25))
        a.text(mm(17.55), mm(282.9), site, 25.2, 'semibold', '#eef6f4', fit=mm(56.4), condense=1.15,
               word=mm(.25))
        # The year is set digit by digit in Jost (its short-bar 5 and oval 0 match the
        # reference); "20" lime, "50" white. (size, condense, fit, x, align, baseline)
        for digit, (size, condense, fit, x, align, baseline, face), fill in zip(
                COPY['year'], YEAR_DIGITS, (GREEN, GREEN, WHITE, WHITE)):
            a.text(mm(x), mm(baseline), digit, size, face, fill, align=align, fit=mm(fit),
                   condense=condense)


def layout():
    a = Art()
    with a.layer('stock', '01 · Stock and bleed'):
        a.rect(-BLEED, -BLEED, W + 2 * BLEED, H + 2 * BLEED, WHITE)
    with a.layer('grid', '02 · Transparency grid'):
        checker(a)
    with a.layer('ribbons', '03 · Green ribbons'):
        ribbons(a)
    with a.layer('disc', '04 · Navy disc'):
        disc(a)
    with a.layer('wordmark', '05 · Logo and wordmark'):
        wordmark(a)
    with a.layer('identity', '06 · Business name'):
        name_block(a)
    with a.layer('panel', '07 · Contact panel'):
        panel(a)
    return a


def export(destination, proof=None):
    """Write the two SVG sheets, a 300 dpi PNG, and (optionally) a 150 dpi proof."""
    destination.mkdir(parents=True, exist_ok=True)
    a = layout()
    trim = a.svg()
    (destination / 'cover.svg').write_text(trim, encoding='utf-8')
    (destination / 'cover-bleed.svg').write_text(a.svg(BLEED), encoding='utf-8')
    # resvg scales from a 96 dpi CSS base, so 400 dpi in its terms is 300 dpi here.
    (destination / 'cover.png').write_bytes(
        resvg_py.svg_to_bytes(svg_string=trim, dpi=400, background='#ffffff'))
    if proof:
        Path(proof).write_bytes(
            resvg_py.svg_to_bytes(svg_string=trim, dpi=200, background='#ffffff'))


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--output', type=Path, default=ROOT / 'cover',
                      help='directory for the SVG and 300 dpi PNG exports')
    cli.add_argument('--proof', type=Path, default=ROOT / 'assets' / 'cover.png',
                      help='path for the 150 dpi PNG proof checked into the repo')
    args = cli.parse_args()
    export(args.output, args.proof)
