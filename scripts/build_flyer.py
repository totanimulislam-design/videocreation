#!/usr/bin/env python3
"""Compose Common Ground as paths, then export SVG, an imposed PDF, and a proof."""
import argparse
from contextlib import contextmanager
from functools import lru_cache
from html import escape
from math import cos, pi, sin
from pathlib import Path
from random import Random

import pymupdf as pdf
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
W, H = 840, 1188  # A4 trim at 4 design units per mm
BLEED, MARK_SPACE = 12, 28
INK, PAPER, ORANGE, QUIET = '#191924', '#f3eddf', '#ff693c', '#514e53'
LILAC = '#c7b9ee'
FONTS = {'display': 'barlow-condensed-latin-800-normal',
         'body': 'space-grotesk-latin-400-normal',
         'bold': 'space-grotesk-latin-700-normal',
         'mono': 'ibm-plex-mono-latin-500-normal'}

# Event copy is a fictional concept. Change these values before repurposing.
EVENT = {
    'title': ('COMMON', 'GROUND'), 'edition': '01', 'year': '2027',
    'dates': '16–17 APR', 'city': 'DHAKA, BANGLADESH',
    'description': ('A forum on the', 'future of shared', 'urban space.'),
    'sessions': (
        ('01 / TALKS', 'The public city', ('Who gets to shape', 'the places we share?')),
        ('02 / WORKSHOP', 'Street-level lab', ('Map a street. Prototype', 'a better way to use it.')),
        ('03 / FIELD WALK', 'Reading Dhaka', ('Take the discussion', 'out into the city.')),
    ),
}


def n(value):
    return f'{value:.4f}'.rstrip('0').rstrip('.')


def attrs(**values):
    return ' '.join(f'{key.replace("_", "-")}="{escape(str(val), quote=True)}"'
                    for key, val in values.items() if val is not None)


@lru_cache(None)
def font(face):
    f = TTFont(ROOT / 'assets' / 'fonts' / (FONTS[face] + '.woff'))
    return f.getGlyphSet(), f.getBestCmap(), f['head'].unitsPerEm


@lru_cache(None)
def glyph(face, char):
    glyphs, cmap, _ = font(face)
    shape = glyphs[cmap[ord(char)]]
    pen = SVGPathPen(glyphs, ntos=n)
    shape.draw(pen)
    return shape.width, pen.getCommands()


class Art:
    def __init__(self):
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

    def rect(self, x, y, w, h, fill='none', **props):
        self.tag('rect', x=n(x), y=n(y), width=n(w), height=n(h), fill=fill, **props)

    def dot(self, x, y, r, fill, **props):
        self.tag('circle', cx=n(x), cy=n(y), r=n(r), fill=fill, **props)

    def path(self, d, fill='none', stroke=None, width=None, **props):
        self.tag('path', d=d, fill=fill, stroke=stroke, stroke_width=width, **props)

    def poly(self, points, fill='none', stroke=None, width=None, close=True, **props):
        d = 'M' + 'L'.join(f'{n(x)},{n(y)}' for x, y in points) + ('Z' if close else '')
        self.path(d, fill, stroke, width, **props)

    def line(self, x, y, u, v, color, width=1, **props):
        self.poly([(x, y), (u, v)], stroke=color, width=width, close=False, **props)

    def text(self, x, baseline, copy, size, face='mono', fill=INK, track=0, fit=None, align='left'):
        # Outlined glyphs avoid SVG/PDF font substitutions. The copy lives here in source.
        shapes = [glyph(face, c) for c in copy]
        scale = size / font(face)[2]
        step = track / scale
        advance = (sum(w for w, _ in shapes) + step * (len(shapes) - 1)) * scale
        sx = scale * (fit / advance) if fit else scale
        width = fit or advance
        x -= {'left': 0, 'right': width, 'center': width / 2}[align]
        with self.group(transform=f'translate({n(x)} {n(baseline)}) scale({n(sx)} {n(-scale)})',
                        fill=fill, aria_label=copy):
            at = 0
            for width, d in shapes:
                if d:
                    self.tag('path', d=d, transform=f'translate({n(at)} 0)')
                at += width + step

    def svg(self, margin=0, marks=''):
        w, h = W + 2 * margin, H + 2 * margin
        return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
                f'width="{n(w/4)}mm" height="{n(h/4)}mm" '
                f'viewBox="{n(-margin)} {n(-margin)} {w} {h}" role="img" aria-labelledby="title desc">\n'
                '<title id="title">Common Ground — Urban Futures Forum</title>\n'
                '<desc id="desc">A fictional Dhaka urban design forum. An illustrated axonometric building sits '
                'between the event headline and a three-part programme.</desc>\n' +
                '\n'.join(self.content) + marks + '\n</svg>\n')


def plus(a, x, y, r, color, width=1):
    a.line(x-r, y, x+r, y, color, width)
    a.line(x, y-r, x, y+r, color, width)


def arrow(a, x, y, length, color, width=2):
    a.path(f'M{x},{y+length}L{x+length},{y}M{x+length*0.37},{y}H{x+length}V{y+length*0.63}',
           stroke=color, width=width)


def iso(x, y, z=0):
    return 420 + (x-y)*1.04, 656 + ((x+y)*0.47 - z)*.86


def plane(a, points, fill='none', stroke=None, width=None, close=True, **kw):
    a.poly([iso(*p) for p in points], fill, stroke, width, close, **kw)


def mix(first, last, t):
    channels = [(int(first[i:i+2], 16), int(last[i:i+2], 16)) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(a + (b-a)*t):02x}' for a, b in channels)


def facade(a, upper_left, upper_right, h, bottom, fill, edge):
    corners = [(*upper_left, h), (*upper_right, h), (*upper_right, bottom), (*upper_left, bottom)]
    if isinstance(fill, tuple):
        plane(a, corners, fill[1])
        count = max(4, min(28, int((h-bottom)/3)))
        for i in range(count):
            top = h - (h-bottom)*i/count
            base = h - (h-bottom)*(i+1)/count - .08  # dodge antialiasing seams
            plane(a, [(*upper_left, top), (*upper_right, top), (*upper_right, max(base, bottom)),
                      (*upper_left, max(base, bottom))], mix(*fill, i/(count-1)))
        plane(a, corners, stroke=edge, width=.9)
    else:
        plane(a, corners, fill, edge, .9)


def block(a, x, y, u, v, h, palette, bottom=0, ribs=0, floors=0, roof_lines=0):
    top, front, side, edge = palette
    facade(a, (u,y), (u,v), h, bottom, side, edge)
    facade(a, (x,v), (u,v), h, bottom, front, edge)
    for k in range(1, floors+1):
        z = bottom + (h-bottom) * k/(floors+1)
        plane(a, [(x,v,z),(u,v,z),(u,y,z)], stroke=edge, width=.62, close=False, opacity=.6)
    for k in range(1, ribs+1):
        xx, yy = (x + (u-x)*k/(ribs+1), y + (v-y)*k/(ribs+1))
        plane(a, [(xx,v,bottom),(xx,v,h)], stroke=edge, width=.72, close=False, opacity=.8)
        plane(a, [(u,yy,bottom),(u,yy,h)], stroke=edge, width=.72, close=False, opacity=.7)
    plane(a, [(x,y,h),(u,y,h),(u,v,h),(x,v,h)], top, edge, 1.05)
    for k in range(1, roof_lines+1):
        xx = x + (u-x)*k/(roof_lines+1)
        plane(a, [(xx,y,h),(xx,v,h)], stroke=edge, width=.6, opacity=.6, close=False)


def clip_polygon(points, left, top, right, bottom):
    """Intersect a closed polygon with the plate on all four edges."""
    for axis, limit, sign in ((0, left, 1), (1, top, 1), (0, right, -1), (1, bottom, -1)):
        result = []
        for a, b in zip(points[-1:] + points[:-1], points):
            a_in = (a[axis] - limit) * sign >= 0
            b_in = (b[axis] - limit) * sign >= 0
            if a_in != b_in:
                fraction = (limit - a[axis]) / (b[axis] - a[axis])
                result.append(tuple(i + (j-i)*fraction for i, j in zip(a, b)))
            if b_in:
                result.append(b)
        points = result
    return points


def drawing(a):
    lavender = ('#ded4f5', ('#b9abde', '#776298'), ('#8271a2', '#504063'), '#342943')
    bone = ('#f2e7d4', ('#ebd7bd', '#b19792'), ('#b39786', '#6e5768'), '#614853')
    fire = ('#ff996a', ('#ff7545', '#d13e31'), ('#d95337', '#8d3046'), '#80363f')
    slab = ('#484052', '#352e44', '#272334', '#867695')
    with a.group(id='illustration-plate'):
        a.rect(46, 371, 748, 488, '#171620')
        # Tinted vector rings give the night field a pool of light, without a raster texture.
        for i in range(42):
            ring = [(520+(520-i*9)*cos(t*pi/64), 663+(334-i*6)*sin(t*pi/64))
                    for t in range(128)]
            a.poly(clip_polygon(ring, 46, 371, 794, 859), mix('#171620', '#392d48', (i+1)/42))
        rng = Random(510)
        with a.group(opacity=.31):
            for _ in range(2800):
                a.dot(rng.uniform(47, 794), rng.uniform(372, 858), rng.uniform(.18, .83),
                      rng.choice(('#b39ece', '#524061', '#f1d6be')))
        # An orbital reticle and drawn survey contours sit behind the massing model.
        a.tag('ellipse', cx=432, cy=623, rx=267, ry=175, fill='none', stroke='#877498',
              stroke_width=.65, stroke_dasharray='3 7', opacity=.78)
        for x in range(79, 769, 32):
            for y in range(420, 830, 32):
                a.dot(x, y, .81, '#a896bc', opacity=.52)
        for k in range(15):
            pts = []
            for i in range(129):
                t = 2*pi*i/128
                ripple = sin(t*3+.3)*15 + cos(t*5+.1)*8
                pts.append((425 + (221+8.8*k+ripple)*cos(t),
                            686 + (65+5.8*k+ripple*.55)*sin(t) + 13*cos(t*2+.9)))
            a.poly(pts, stroke='#a38eb6', width=.9 if k%5==0 else .52, opacity=.45)

        block(a, -187, -151, 182, 153, 0, slab, bottom=-15)
        for i in range(-175, 181, 17):
            plane(a, [(i,-151,0),(i,153,0)], stroke='#8c7d9d', width=.53, close=False, opacity=.63)
        for i in range(-143, 154, 17):
            plane(a, [(-187,i,0),(182,i,0)], stroke='#8c7d9d', width=.53, close=False, opacity=.63)
        # Back terraces, then the orange portal, then the foreground plaza.
        block(a, -115, -126, -42, -38, 70, lavender, ribs=5, floors=3, roof_lines=8)
        block(a, -90, -119, -44, -64, 104, lavender, ribs=3, floors=2, roof_lines=5)
        block(a, 30, -130, 138, -50, 97, bone, ribs=8, floors=5, roof_lines=11)
        block(a, 53, -130, 126, -65, 148, lavender, bottom=97, ribs=7, floors=3, roof_lines=9)
        block(a, 76, -120, 121, -78, 192, bone, bottom=148, ribs=5, floors=2, roof_lines=6)
        block(a, -145, -37, -77, 50, 161, fire, ribs=8, floors=8)
        block(a, 54, -37, 126, 50, 161, fire, ribs=8, floors=8)
        block(a, -145, -37, 126, 50, 208, fire, bottom=161, ribs=23, floors=3, roof_lines=28)
        # Fine rail strips and a suspended floor lend the portal a second scale.
        plane(a, [(-145,50,199),(126,50,199)], stroke='#ffd4a3', width=1.15, close=False)
        plane(a, [(-145,50,168),(126,50,168)], stroke='#ffae78', width=.8, close=False)
        block(a, -76, -33, 53, 46, 32, lavender, bottom=22, ribs=9, floors=1, roof_lines=13)
        for k in range(6):
            block(a, -104-k*7, 56+k*11, -12-k*7, 67+k*11, 34-k*5, bone, roof_lines=4)
        block(a, 4, 79, 89, 124, 10, bone, roof_lines=8)
        block(a, 111, 74, 159, 129, 16, lavender, roof_lines=7)
        for x, y in [(17,92),(32,104),(45,92),(56,107),(69,91),(126,88),(143,96),(129,115)]:
            px, py = iso(x,y, 10 if x < 90 else 16)
            a.tag('ellipse', cx=n(px+3), cy=n(py+2), rx=6, ry=2, fill='#584161', opacity=.7)
            a.line(px,py,px,py-8, '#4d334d', .7)
            a.dot(px, py-10, 3.4, '#33223e')
            a.dot(px-1, py-11, 1.6, '#d5a999')

        # Plate annotations always sit above the artwork.
        a.text(67, 405, 'FIG. 01', 12, fill=ORANGE, track=1)
        a.text(67, 424, 'A CIVIC PROTOTYPE', 10.5, fill=LILAC, track=.9)
        a.text(773, 405, 'AXONOMETRIC / NTS', 10.5, fill=LILAC, align='right', track=.85)
        a.line(67, 436, 119, 436, '#ada0bf', .6)
        a.line(725, 417, 773, 417, '#ada0bf', .6)
        for points, label, x, y, align in [
            ([(93,574),(158,574),(244,589),(293,589)], '01 / PORTAL', 93, 565, 'left'),
            ([(627,534),(665,534),(660,524),(771,524)], '02 / TERRACES', 771, 515, 'right'),
            ([(461,752),(554,752),(603,797),(769,797)], '03 / PUBLIC DECK', 769, 788, 'right'),
        ]:
            a.poly(points, stroke='#eee1f8', width=.7, close=False, opacity=.9)
            px, py = points[0] if align == 'right' else points[-1]
            a.dot(px, py, 3.1, '#ff996a', stroke=INK, stroke_width=.7)
            a.text(x, y, label, 10.5, fill='#f3e8fa', align=align, track=.9)
        a.rect(46,371,748,488, stroke='#4f425d', stroke_width=1)
        a.line(67, 820, 773, 820, '#9382a8', .65)
        a.text(67, 843, '23.81° N / 90.41° E', 10.5, fill=LILAC, track=.6)
        a.text(420, 843, 'SPECULATIVE SITE STUDY', 10.5, fill=LILAC, align='center', track=.65)
        a.text(773, 843, 'PLATE 01 / 01', 10.5, fill=LILAC, align='right', track=.65)
        for x in (67, 773):
            plus(a, x, 820, 3, '#d6c7e6', .8)


def layout():
    a = Art()
    with a.layer('stock', '01 · Stock and bleed'):
        a.rect(-BLEED, -BLEED, W+2*BLEED, H+2*BLEED, PAPER)
        a.rect(-BLEED, 1055, W+2*BLEED, H-1055+BLEED, ORANGE)
    with a.layer('masthead', '02 · Masthead and event information'):
        # A three-face brand mark repeats the drawing’s isometric language.
        a.poly([(46,56),(60,49),(74,56),(60,63)], INK)
        a.poly([(46,59),(59,66),(59,79),(46,72)], INK)
        a.poly([(61,66),(74,59),(74,72),(61,79)], ORANGE)
        a.text(87, 70, 'URBAN FUTURES FORUM', 20, 'bold', track=-.35)
        a.text(794, 68, f'EDITION {EVENT["edition"]}  /  {EVENT["year"]}', 13, align='right', track=1.25)
        a.line(46, 95, 794, 95, INK, 1.1)
        a.rect(46, 95, 53, 3, ORANGE)
        a.text(41, 223, EVENT['title'][0], 163, 'display', fit=545)
        a.text(41, 342, EVENT['title'][1], 163, 'display', fit=545)
        a.line(611, 123, 611, 336, '#9e8d82', .85)
        plus(a, 611, 123, 3.4, INK, 1.2)
        plus(a, 611, 336, 3.4, INK, 1.2)
        a.text(632, 141, 'DESIGN / CITY / PUBLIC', 10.9, track=.55, fill=QUIET)
        for index, line in enumerate(EVENT['description']):
            a.text(631, 183+25*index, line, 22, 'body', track=-.65)
        a.line(632, 261, 794, 261, '#9e8d82', .8)
        a.text(630, 304, EVENT['dates'], 42, 'display', fit=160)
        a.text(632, 330, EVENT['city'], 12.3, track=.55)
    with a.layer('hero', '03 · Axonometric study and survey labels'):
        drawing(a)
    with a.layer('programme', '04 · Programme grid'):
        a.text(46, 890, 'THE PROGRAMME', 13, fill=INK, track=1.4)
        a.text(794, 890, 'TWO DAYS / THREE FORMATS', 11.5, fill=QUIET, align='right', track=.95)
        a.line(46, 903, 794, 903, INK, 1.1)
        for i, (label, title, lines) in enumerate(EVENT['sessions']):
            x = 46 + 255*i
            a.rect(x, 923, 7, 7, ORANGE)
            a.text(x+15, 931, label, 11.5, track=.6)
            a.text(x, 969, title, 26, 'bold', track=-.75)
            for index, line in enumerate(lines):
                a.text(x, 994+19*index, line, 16, 'body', fill=QUIET, track=-.2)
            if i < 2:
                a.line(x+235, 917, x+235, 1029, '#b5a898', .8)
    with a.layer('footer', '05 · Date reminder'):
        a.line(46, 1078, 794, 1078, INK, .75)
        a.text(46, 1101, 'MARK YOUR CALENDAR', 11.5, track=1.1)
        a.text(44, 1150, 'SAVE THE DATES', 51, 'display', track=.1)
        a.line(487, 1097, 487, 1150, INK, .8)
        a.text(507, 1118, f'{EVENT["dates"]} {EVENT["year"]}', 20, 'bold', track=-.4)
        a.text(507, 1144, EVENT['city'], 11.5, track=.75)
        a.tag('circle', cx=768, cy=1123, r=25, fill='none', stroke=INK, stroke_width=.85)
        arrow(a, 759, 1114, 17, INK, 1.6)
    return a


def printer_marks():
    marks = Art()
    medium, short = MARK_SPACE-2, BLEED+3
    for x, side in ((0, -1), (W, 1)):
        for y, down in ((0, -1), (H, 1)):
            marks.line(x+side*medium, y, x+side*short, y, '#000000', .65)
            marks.line(x, y+down*medium, x, y+down*short, '#000000', .65)
    return '\n' + '\n'.join(marks.content)


def export(destination):
    destination.mkdir(parents=True, exist_ok=True)
    a = layout()
    trim_svg = a.svg()
    (destination/'common-ground.svg').write_text(trim_svg, encoding='utf-8')
    (destination/'common-ground-bleed.svg').write_text(a.svg(BLEED), encoding='utf-8')
    with pdf.open(stream=trim_svg.encode(), filetype='svg') as trim:
        trim[0].get_pixmap(dpi=180, alpha=False).save(destination/'common-ground.png')
    imposed = a.svg(MARK_SPACE, printer_marks()).encode()
    with pdf.open(stream=imposed, filetype='svg') as svg:
        with pdf.open(stream=svg.convert_to_pdf(), filetype='pdf') as document:
            page = document[0]
            unit = 72/25.4/4
            media_w, media_h = (W+2*MARK_SPACE)*unit, (H+2*MARK_SPACE)*unit
            def box(offset):
                return pdf.Rect(offset, offset, media_w-offset, media_h-offset)
            page.set_mediabox(box(0))
            page.set_trimbox(box(MARK_SPACE*unit))
            page.set_bleedbox(box((MARK_SPACE-BLEED)*unit))
            document.set_metadata({'title': 'Common Ground — Urban Futures Forum',
                                   'subject': 'Original A4 concept flyer / 3 mm bleed'})
            document.save(destination/'common-ground-print.pdf', garbage=4, deflate=True, no_new_id=True)


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--output', type=Path, default=ROOT/'flyer', help='directory for the four exports')
    export(cli.parse_args().output)
