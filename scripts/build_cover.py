#!/usr/bin/env python3
"""Compose a print-ready A4 cover as vector paths, then export SVG and a PNG proof.

The artwork reinterprets a stock "cover design" template: a transparency-grid panel,
green ribbons, a navy disc carrying the wordmark, a business name block, and a waving
contact panel. Everything is drawn in design units of 4 per millimetre and typeset
from the bundled Montserrat cuts, so the SVG has no live text and no raster.
"""
import argparse
from contextlib import contextmanager
from functools import lru_cache
from html import escape
from pathlib import Path

import resvg_py
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
MM = 4                        # design units per millimetre
W, H = 210 * MM, 297 * MM     # A4 trim
BLEED = 3 * MM                # 3 mm bleed on every side

INK = '#16283a'               # near-black navy used for the name block
GREEN = '#8dc63f'
WHITE = '#ffffff'

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


class Art:
    """A tiny SVG writer: every mark is a path, text is outlined from the fonts."""

    def __init__(self):
        self.defs = []
        self.content = []

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
        """A linear gradient in design units; stops are (offset, colour)."""
        body = ''.join(f'<stop offset="{n(offset)}" stop-color="{colour}"/>'
                       for offset, colour in stops)
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
        `fit` then sets the line width by tracking. Narrowing the glyphs first keeps
        the word spaces intact when a line must be much narrower than its natural
        width, which is how the reference's condensed setting behaves.
        """
        shapes = [glyph(face, char) for char in copy]
        pairs = kerning(face)
        advances = [width for width, _ in shapes]
        for index in range(len(copy) - 1):
            advances[index] += pairs.get((copy[index], copy[index + 1]), 0)
        scale = size / font(face)[2]
        natural = sum(advances) * scale * condense + track * (len(copy) - 1)
        step = track
        if fit is not None:
            step += (fit - natural) / max(len(copy) - 1, 1)
        width = natural if fit is None else fit
        x -= {'left': 0, 'right': width, 'center': width / 2}[align]
        stretch = scale * condense
        with self.group(transform=f'translate({n(x)} {n(baseline)}) scale({n(stretch)} {n(-scale)})',
                        fill=fill, aria_label=copy):
            at = 0
            for char, (advance, d) in zip(copy, shapes):
                if d:
                    self.tag('path', d=d, transform=f'translate({n(at)} 0)')
                at += advance + step / stretch
        return width


def checker(a):
    """A transparency-grid panel clipped by the ribbon, the disc, and the trim."""
    clip = (f'M{n(-BLEED)},{n(-BLEED)} L{n(-BLEED)},{n(mm(166))} L{n(mm(2))},{n(mm(164))} '
            + smooth([(mm(2), mm(164)), (mm(14), mm(146)), (mm(30), mm(122)),
                      (mm(46), mm(108)), (mm(60), mm(100)), (mm(72), mm(95.5))])[1:]
            + f' L{n(mm(99))},{n(mm(83))} L{n(mm(150.5))},{n(-BLEED)} Z')
    a.defs.append(
        f'<pattern id="p-grid" patternUnits="userSpaceOnUse" x="0" y="0" '
        f'width="{n(mm(16))}" height="{n(mm(16))}">'
        f'<rect width="{n(mm(16))}" height="{n(mm(16))}" fill="#ffffff"/>'
        f'<rect width="{n(mm(8))}" height="{n(mm(8))}" fill="#dcdcdc"/>'
        f'<rect x="{n(mm(8))}" y="{n(mm(8))}" width="{n(mm(8))}" height="{n(mm(8))}" fill="#dcdcdc"/>'
        '</pattern>')
    a.tag('rect', x=n(-BLEED), y=n(-BLEED), width=n(W + 2 * BLEED), height=n(H + 2 * BLEED),
          fill='url(#p-grid)', clip_path=a.clip('c-grid-clip', clip))


def ribbons(a):
    """The green sweep behind the disc: a top wedge, a left ribbon, and a crescent."""
    top = smooth([
        (mm(27.5), -BLEED), (mm(50), -BLEED), (mm(55), mm(6)), (mm(60), mm(14.6)),
        (mm(66), mm(20)), (mm(71.5), mm(24.6)), (mm(77), mm(28.2)), (mm(82.5), mm(31.9)),
        (mm(88), mm(35.5)), (mm(93.5), mm(38.2)), (mm(99), mm(41.9)), (mm(104.5), mm(44.5)),
        (mm(99), mm(43.7)), (mm(93.5), mm(42.8)), (mm(88), mm(40.9)), (mm(82.5), mm(39.2)),
        (mm(77), mm(37.4)), (mm(71.5), mm(35.5)), (mm(66), mm(33.7)), (mm(60), mm(30.9)),
        (mm(55), mm(27.3)), (mm(49.5), mm(23)), (mm(44), mm(18)), (mm(38.5), mm(13.5)),
        (mm(33), mm(8.5)), (mm(27.5), mm(2.6)),
    ], closed=True)
    left = smooth([
        (-BLEED, mm(166)), (-mm(2), mm(165)), (mm(8), mm(156)), (mm(20), mm(140)),
        (mm(34), mm(122)), (mm(48), mm(109)), (mm(60), mm(101)), (mm(68), mm(97.5)),
        (mm(72), mm(96)), (mm(70), mm(100)), (mm(62), mm(107)), (mm(50), mm(119)),
        (mm(38), mm(133)), (mm(26), mm(149)), (mm(14), mm(167)), (mm(4), mm(183)),
        (-BLEED, mm(197)),
    ], closed=True)
    crescent = smooth([
        (mm(72), mm(96)), (mm(78), mm(92)), (mm(85), mm(89)), (mm(93), mm(86)),
        (mm(99), mm(83.6)),
        (mm(101), mm(85.6)), (mm(103), mm(89.5)), (mm(104.5), mm(94.5)), (mm(110), mm(117.2)),
        (mm(115.5), mm(131)), (mm(121), mm(140.9)), (mm(126.5), mm(148.1)),
        (mm(132), mm(155.4)), (mm(137.5), mm(160.9)), (mm(143), mm(167.2)),
        (mm(148.5), mm(170.9)), (mm(154), mm(175.4)), (mm(159.5), mm(181.8)),
        (mm(154), mm(180.9)), (mm(148.5), mm(179.1)), (mm(143), mm(177.3)),
        (mm(137.5), mm(174.5)), (mm(132), mm(171.8)), (mm(126.5), mm(168.2)),
        (mm(121), mm(164.5)), (mm(115.5), mm(160)), (mm(110), mm(153.6)),
        (mm(104.5), mm(147.2)), (mm(99), mm(140)), (mm(93.5), mm(130.1)),
        (mm(88.5), mm(117.2)), (mm(86), mm(110)), (mm(84), mm(103)), (mm(82), mm(98)),
        (mm(76), mm(96.5)),
    ], closed=True)
    paint = a.gradient('g-ribbon', [(0, '#a9d64c'), (.45, '#7cb644'), (1, '#2f5a3c')],
                       mm(-10), mm(150), mm(165), mm(195))
    for d in (top, left, crescent):
        a.path(d, paint)


def disc(a):
    """The navy disc, bleeding off the top and right trim edges."""
    paint = a.radial('g-disc', [(0, '#2b455c'), (.55, '#1a3044'), (1, '#0d1b28')],
                     mm(150), mm(10), mm(340))
    a.circle(mm(219.5), mm(76.6), mm(115.3), paint)  # least-squares fit of the reference


def wordmark(a):
    """Logo diamond, logo line, the two-line wordmark, and its gradient rule."""
    a.tag('rect', x=n(mm(159.8)), y=n(mm(11.8)), width=n(mm(10.4)), height=n(mm(10.4)),
          rx=n(mm(2)), fill='#e9edf0',
          transform=f'rotate(45 {n(mm(165))} {n(mm(17))})')
    a.text(mm(165), mm(35.5), COPY['logo'], 28, 'bold', WHITE, align='center',
           fit=mm(29.3), condense=.68)
    a.text(mm(165.05), mm(79.5), COPY['cover'][0], 73, 'black', WHITE, align='center',
           fit=mm(58.7), condense=.87)
    a.text(mm(166), mm(101.5), COPY['cover'][1], 77, 'black', GREEN, align='center',
           fit=mm(77), condense=.98)
    rule = a.gradient('g-rule-cover', [(0, GREEN), (.55, '#3f7a4a'), (1, '#123040')],
                      mm(131.7), mm(111), mm(197.2), mm(111))
    a.rect(mm(131.7), mm(110), mm(65.5), mm(2.3), rule)


def name_block(a):
    """The business name, its green second line, and the rule beneath."""
    a.text(mm(18.3), mm(189.2), COPY['business'][0], 47.4, 'bold', INK, fit=mm(93.6),
           condense=.92)
    a.text(mm(18.3), mm(205.6), COPY['business'][1], 47, 'bold', GREEN, fit=mm(33.1),
           condense=.88)
    rule = a.gradient('g-rule-name', [(0, '#a9d64c'), (.5, '#4f8f45'), (1, '#123040')],
                      mm(16.5), mm(213.4), mm(111), mm(213.4))
    a.rect(mm(16.5), mm(212.2), mm(94.5), mm(2.6), rule)


def panel(a):
    """The waving contact panel: navy ground, a green shoulder, and the copy."""
    ground = smooth([
        (-BLEED, mm(227)), (-mm(2), mm(226.5)), (mm(10), mm(225)), (mm(30), mm(225)),
        (mm(50), mm(228)), (mm(68), mm(234)), (mm(84), mm(241)), (mm(98), mm(245)),
        (mm(112), mm(247)), (mm(126), mm(246)), (mm(140), mm(240)), (mm(154), mm(232)),
        (mm(170), mm(227)), (mm(188), mm(225)), (mm(205), mm(226)),
        (mm(210 + BLEED / MM), mm(227)), (mm(210 + BLEED / MM), mm(300)), (-BLEED, mm(300)),
    ], closed=True)
    a.path(ground, a.radial('g-panel', [(0, '#55785b'), (.4, '#2f5a4a'), (.72, '#17414a'),
                                        (1, '#0f3a4c')], mm(100), mm(262), mm(150)))

    # A green band runs along the foot of the panel, in front of the navy.
    foot = smooth([
        (mm(112), mm(272)), (mm(128), mm(275)), (mm(146), mm(281)), (mm(164), mm(286)),
        (mm(182), mm(289)), (mm(198), mm(289)), (mm(210 + BLEED / MM), mm(287)),
        (mm(210 + BLEED / MM), mm(300)), (mm(112), mm(300)),
    ], closed=True)
    a.path(foot, a.gradient('g-foot', [(0, '#6aa93c'), (.5, '#8dc63f'), (1, '#a9d64c')],
                            mm(130), mm(288), mm(210), mm(296)))

    heading, phone, site = COPY['contact']
    a.text(mm(18.3), mm(258.3), heading, 39, 'bold', WHITE, fit=mm(63.5), condense=.76)
    a.text(mm(18.3), mm(274.2), phone, 23.5, 'regular', WHITE, fit=mm(45.9))
    a.text(mm(18.3), mm(282.4), site, 23.5, 'regular', WHITE, fit=mm(55))
    # "20" in green, "50" in white, flush right with the reference's word gap.
    year, tail = COPY['year']
    a.text(mm(170.6), mm(267.6), year, 100, 'bold', GREEN, align='right', fit=mm(28.5),
           condense=.9)
    a.text(mm(200.8), mm(267.6), tail, 100, 'bold', WHITE, align='right', fit=mm(26.6),
           condense=.84)


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
