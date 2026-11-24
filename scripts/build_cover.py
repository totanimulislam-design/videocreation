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
CHECKER = '#bfbfbf'            # grey cells of the transparency grid

FONTS = {'regular': 'montserrat-latin-400-regular',
         'bold': 'montserrat-latin-700-bold',
         'black': 'montserrat-latin-800-extrabold'}

# The copy is template copy. Change these values before repurposing.
COPY = {
    'logo': 'YOUR LOGO',
    'cover': ('COVER', 'DESIGN'),
    'business': ('YOUR BUSINESS', 'NAME'),
    'contact': ('FOR MORE INFO', '+012 3456 789', 'your website here'),
    'year': ('20', '50'),
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
             align='left', fit=None, condense=1.0):
        """Outline `copy` at `size` design units and return the width of the line.

        `condense` narrows the letterforms horizontally (1 = Montserrat as drawn).
        `fit` then sets the width of the visible ink by tracking, and `x` refers to
        that ink: its left edge, right edge, or centre. Narrowing the glyphs first
        keeps the word spaces intact when a line must be much narrower than its
        natural width, which is how the reference's condensed setting behaves.
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
        step = track
        if fit is not None:
            step += (fit - ink - track * (len(copy) - 1)) / max(len(copy) - 1, 1)
        width = ink + step * (len(copy) - 1)
        x -= {'left': 0, 'right': width, 'center': width / 2}[align]
        x -= lsb * stretch
        with self.group(transform=f'translate({n(x)} {n(baseline)}) scale({n(stretch)} {n(-scale)})',
                        fill=fill, aria_label=copy):
            at = 0
            for char, advance, (_, d) in zip(copy, advances, shapes):
                if d:
                    self.tag('path', d=d, transform=f'translate({n(at)} 0)')
                at += advance + step / stretch
        return width

# Edges traced from the reference with scripts/trace_cover.py --emit; millimetres
# from the trim corner. Ribbon, disc and grid contours are closed; panel_top and
# band_top are open edges running left to right.
SHAPES = {
    'swoosh': [
        (106.4, 43.7), (103.4, 43.8), (94.8, 42.1), (85.4, 39.3), (74.3, 35.7),
        (60.0, 29.1), (49.0, 22.6), (41.2, 16.7), (29.9, 5.4), (27.8, 2.3),
        (27.8, 0.5), (28.9, -4.0), (32.5, -4.0), (44.5, -4.0), (48.2, -4.0),
        (50.5, 1.9), (64.3, 16.0), (71.2, 21.6), (82.5, 29.4), (97.2, 37.5),
        (105.9, 41.6), (106.8, 42.5),
    ],
    'left': [
        (1.0, 194.9), (-4.0, 194.1), (-4.0, 191.5), (-4.0, 168.6), (0.6, 164.9),
        (4.1, 159.2), (14.2, 145.9), (27.0, 131.1), (39.5, 118.8), (48.4, 111.3),
        (64.2, 99.5), (79.7, 90.6), (79.6, 91.7), (78.1, 93.6), (70.5, 99.8),
        (55.9, 114.1), (47.4, 123.7), (36.8, 137.7), (15.9, 169.4), (3.0, 192.6),
    ],
    'crescent': [
        (174.1, 184.5), (172.2, 184.8), (169.4, 184.5), (159.8, 183.7), (149.7, 180.1),
        (141.5, 176.7), (132.9, 172.1), (123.8, 166.1), (116.2, 159.9), (111.9, 155.7),
        (101.9, 143.8), (96.2, 134.6), (90.6, 123.0), (86.5, 111.0), (84.0, 100.6),
        (82.7, 92.0), (80.3, 90.0), (84.5, 88.2), (89.5, 85.5), (101.2, 82.5),
        (103.6, 81.9), (104.8, 82.3), (105.7, 84.1), (109.8, 106.0), (113.8, 118.1),
        (117.7, 127.5), (125.5, 141.3), (134.7, 153.5), (145.0, 164.0), (154.8, 171.2),
        (173.4, 182.9),
    ],
    'disc': [
        (214.0, 188.7), (206.0, 189.5), (201.1, 189.5), (188.4, 188.5), (179.7, 187.1),
        (161.3, 176.7), (147.5, 167.3), (135.2, 156.2), (125.4, 144.0), (120.6, 136.7),
        (115.1, 126.3), (112.4, 120.0), (107.4, 104.1), (105.3, 92.6), (103.4, 77.1),
        (103.3, 73.1), (104.3, 63.4), (106.1, 52.8), (110.8, 36.8), (113.8, 29.6),
        (118.3, 20.8), (124.0, 11.6), (128.7, 5.2), (132.0, -4.0), (134.4, -4.0),
        (140.2, -4.0), (204.2, -4.0), (207.7, -4.0), (214.0, 2.0), (214.0, 7.7),
        (214.0, 181.7), (214.0, 185.7),
    ],
    'grid': [
        (0.6, 161.4), (-4.0, 160.2), (-4.0, 158.7), (-4.0, 155.0), (-4.0, 5.0),
        (0.6, 2.4), (1.8, 1.0), (4.8, -4.0), (19.6, -4.0), (23.2, 0.8),
        (26.1, 2.8), (29.5, 8.0), (39.0, 16.9), (43.0, 20.2), (49.7, 23.7),
        (58.4, 29.5), (73.2, 36.0), (81.4, 39.0), (91.7, 41.8), (105.8, 44.5),
        (106.7, 46.7), (106.3, 49.4), (104.4, 59.9), (102.7, 75.5), (101.6, 78.2),
        (100.3, 79.4), (93.9, 83.0), (82.2, 87.8), (73.4, 93.5), (68.4, 95.7),
        (46.4, 111.9), (40.0, 115.8), (36.0, 120.4), (28.0, 127.4), (17.6, 140.0),
        (15.9, 141.4),
    ],
    'panel_top': [
        (0, 227.2), (2, 226.9), (4, 226.6), (6, 226.3), (8, 226.0),
        (10, 225.7), (12, 225.4), (14, 225.1), (16, 224.9), (18, 224.8),
        (20, 224.8), (22, 224.8), (24, 224.8), (26, 224.8), (28, 224.8),
        (30, 224.8), (32, 224.8), (34, 224.9), (36, 225.1), (38, 225.4),
        (40, 225.7), (42, 226.0), (44, 226.3), (46, 226.7), (48, 227.0),
        (50, 227.6), (52, 228.2), (54, 228.7), (56, 229.2), (58, 229.7),
        (60, 230.4), (62, 231.2), (64, 232.0), (66, 232.7), (68, 233.4),
        (70, 234.4), (72, 235.5), (74, 236.6), (76, 237.6), (78, 238.5),
        (80, 239.5), (82, 240.7), (84, 241.9), (86, 243.0), (88, 244.1),
        (90, 245.3), (92, 246.8), (94, 248.3), (96, 249.7), (98, 251.1),
        (100, 252.4), (102, 253.7), (104, 254.6), (106, 254.9), (108, 254.3),
        (110, 253.1), (112, 251.6), (114, 250.1), (116, 248.6), (118, 247.1),
        (120, 245.8), (122, 244.6), (124, 243.3), (126, 242.0), (128, 240.7),
        (130, 239.5), (132, 238.5), (134, 237.6), (136, 236.7), (138, 235.8),
        (140, 234.9), (142, 234.0), (144, 233.1), (146, 232.3), (148, 231.6),
        (150, 230.8), (152, 230.2), (154, 229.6), (156, 229.1), (158, 228.5),
        (160, 227.9), (162, 227.4), (164, 226.9), (166, 226.6), (168, 226.3),
        (170, 226.0), (172, 225.7), (174, 225.4), (176, 225.1), (178, 224.9),
        (180, 224.8), (182, 224.8), (184, 224.8), (186, 224.8), (188, 224.8),
        (190, 224.8), (192, 224.8), (194, 224.9), (196, 225.1), (198, 225.4),
        (200, 225.6), (202, 225.8), (204, 226.0), (206, 226.4), (208, 226.8),
        (210, 227.2),
    ],
    'band_top': [
        (108, 261.5), (110, 261.8), (112, 262.5), (114, 263.6), (116, 265.0),
        (118, 266.4), (120, 267.6), (122, 268.7), (124, 269.7), (126, 270.8),
        (128, 272.0), (130, 273.1), (132, 274.1), (134, 275.1), (136, 276.1),
        (138, 277.2), (140, 278.3), (142, 279.2), (144, 279.8), (146, 280.4),
        (148, 281.0), (150, 281.6), (152, 282.1), (154, 282.7), (156, 283.3),
        (158, 283.9), (160, 284.4), (162, 285.0), (164, 285.6), (166, 286.1),
        (168, 286.7), (170, 287.2), (172, 287.7), (174, 288.1), (176, 288.5),
        (178, 288.7), (180, 288.8), (182, 288.8), (184, 288.8), (186, 288.8),
        (188, 288.8), (190, 288.8), (192, 288.7), (194, 288.5), (196, 288.2),
        (198, 287.9), (200, 287.6), (202, 287.2), (204, 286.7), (206, 286.3),
        (208, 285.8), (210, 285.4),
    ],
}
def path_mm(points, closed=True):
    """Catmull-Rom spline through traced (x, y) millimetre points."""
    return smooth([(mm(x), mm(y)) for x, y in points], closed=closed)


def checker(a):
    """The transparency grid, filling the traced region left of the swoosh and disc."""
    a.defs.append(
        f'<pattern id="p-grid" patternUnits="userSpaceOnUse" x="{n(mm(1.8))}" y="0" '
        f'width="{n(mm(8))}" height="{n(mm(8))}">'
        f'<rect width="{n(mm(8))}" height="{n(mm(8))}" fill="#ffffff"/>'
        f'<rect width="{n(mm(4))}" height="{n(mm(4))}" fill="{CHECKER}"/>'
        f'<rect x="{n(mm(4))}" y="{n(mm(4))}" width="{n(mm(4))}" height="{n(mm(4))}" fill="{CHECKER}"/>'
        '</pattern>')
    a.path(path_mm(SHAPES['grid']), fill='url(#p-grid)')


def ribbons(a):
    """Three tapering ribbons, each with its own gradient from lime to deep green."""
    swoosh = a.gradient('g-swoosh', [(0, '#8cc642'), (.22, '#7db247'), (.43, '#689b4c'),
                                     (.62, '#558452'), (1, '#4a7754')],
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
        a.tag('rect', x=n(mm(165 - 4.7)), y=n(mm(15.8 - 4.7)), width=n(mm(9.4)), height=n(mm(9.4)),
              rx=n(mm(2.2)), fill='#e2e3e5',
              transform=f'rotate(45 {n(mm(165))} {n(mm(15.8))})')
        a.text(mm(165), mm(35.5), COPY['logo'], 28, 'bold', WHITE, align='center',
               fit=mm(29.3), condense=.68)
        a.text(mm(165.05), mm(79.5), COPY['cover'][0], 73, 'black', WHITE, align='center',
               fit=mm(58.7), condense=.87)
        a.text(mm(166), mm(102.0), COPY['cover'][1], 86, 'black', GREEN, align='center',
               fit=mm(77), condense=.87)
    rule = a.gradient('g-rule-cover', [(0, '#8fc847'), (.13, '#8cc443'), (.28, '#82b846'),
                                       (.43, '#6b9a4d'), (.59, '#4c7d55'), (.74, '#316353'),
                                       (.89, '#174c52'), (1, '#0a3c53')],
                      mm(131.7), mm(112.4), mm(197.2), mm(112.4))
    a.rect(mm(131.7), mm(110.8), mm(65.5), mm(3.2), rule)


def name_block(a):
    """The business name, its green second line, and the rule beneath."""
    soft = a.shadow('f-soft', mm(.2), mm(.6), mm(.9), '#000000', .22)
    with a.group(filter=soft):
        a.text(mm(18.3), mm(189.2), COPY['business'][0], 47.4, 'bold', INK, fit=mm(94.5),
               condense=.92)
        a.text(mm(18.3), mm(204.2), COPY['business'][1], 40, 'bold', '#9bcf4f', fit=mm(32.1),
               condense=.88)
    rule = a.gradient('g-rule-name', [(0, '#8fc545'), (.04, '#8cc345'), (.36, '#75a64e'),
                                      (.67, '#416c53'), (.88, '#1f4a52'), (.97, '#0e414c'),
                                      (1, '#0d404c')],
                      mm(16.5), mm(213.9), mm(111), mm(213.9))
    a.rect(mm(16.5), mm(212.3), mm(94.5), mm(3.2), rule)


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
        a.text(mm(18.3), mm(258.3), heading, 39, 'bold', '#eef6f4', fit=mm(63.3), condense=.76)
        a.text(mm(18.3), mm(273.4), phone, 23, 'regular', '#eef6f4', fit=mm(45.9))
        a.text(mm(18.3), mm(282.4), site, 23, 'regular', '#eef6f4', fit=mm(55))
        # "20" in lime, "50" in white, flush right with the reference's word gap.
        year, tail = COPY['year']
        a.text(mm(169.7), mm(266.4), year, 99, 'bold', GREEN, align='right', fit=mm(27.6),
               condense=.88)
        a.text(mm(199.9), mm(266.4), tail, 99, 'bold', WHITE, align='right', fit=mm(25.7),
               condense=.82)


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
