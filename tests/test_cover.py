import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

import pymupdf

from scripts.build_cover import export

SVG = '{http://www.w3.org/2000/svg}'
MM = 300 / 25.4  # proof pixels per millimetre


class CoverExports(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.out = Path(self.folder.name)
        export(self.out, proof=self.out / 'proof.png')
        self.root = ET.parse(self.out / 'cover.svg').getroot()
        self.bleed = ET.parse(self.out / 'cover-bleed.svg').getroot()

    def tearDown(self):
        self.folder.cleanup()

    def test_sheets_are_a4_with_bleed(self):
        self.assertEqual((self.root.get('width'), self.root.get('height')), ('210mm', '297mm'))
        self.assertEqual(self.root.get('viewBox'), '0 0 840 1188')
        self.assertEqual((self.bleed.get('width'), self.bleed.get('height')), ('216mm', '303mm'))
        self.assertEqual(self.bleed.get('viewBox'), '-12 -12 864 1212')

    def test_vector_only_and_outlined_type(self):
        for root in (self.root, self.bleed):
            self.assertEqual(root.findall('.//{*}image'), [])
            self.assertEqual(root.findall('.//{*}text'), [])
            self.assertGreater(len(root.findall('.//{*}path')), 60)
            # Every id must be unique, or url(#) references resolve to the wrong node.
            ids = [node.get('id') for node in root.iter() if node.get('id')]
            self.assertEqual(len(ids), len(set(ids)))

        # The template copy survives as accessible labels on the outlined runs.
        labels = {group.get('aria-label') for group in self.root.iter(SVG + 'g')}
        for line in ('YOUR LOGO', 'COVER', 'DESIGN', 'YOUR BUSINESS', 'NAME',
                     'FOR MORE INFO', '+012 3456 789', 'your website here', '20', '50'):
            self.assertIn(line, labels)

    def test_layers_and_paint(self):
        layers = self.root.findall('./' + SVG + 'g')
        self.assertEqual([layer.get('id') for layer in layers],
                         ['stock', 'grid', 'ribbons', 'disc', 'wordmark', 'identity', 'panel'])
        defs = self.root.find('./' + SVG + 'defs')
        # three ribbons, two rules, panel ground, foot swell
        self.assertEqual(len(defs.findall('./' + SVG + 'linearGradient')), 7)
        self.assertEqual(len(defs.findall('./' + SVG + 'pattern')), 1)
        self.assertEqual(sorted(f.get('id') for f in defs.findall('./' + SVG + 'filter')),
                         ['f-glow', 'f-soft'])

    def test_ink_lands_on_measured_boxes(self):
        """Type is fitted by ink width, so the rendered ink hits the reference boxes (mm)."""
        with pymupdf.open(self.out / 'cover.png') as document:
            pixmap = document[0].get_pixmap()

            def ink_bbox(x0, y0, x1, y1, predicate):
                """Bounding box of pixels in the mm window that satisfy `predicate`."""
                px0, py0, px1, py1 = (round(v * MM) for v in (x0, y0, x1, y1))
                xs, ys = [], []
                for py in range(py0, py1):
                    for px in range(px0, px1):
                        if predicate(pixmap.pixel(px, py)):
                            xs.append(px / MM)
                            ys.append(py / MM)
                return min(xs), min(ys), max(xs), max(ys)

            lime = lambda p: p[1] > p[0] + 35 and p[1] > 150
            white = lambda p: min(p) > 200
            dark = lambda p: max(p) < 90
            boxes = {
                'COVER': (ink_bbox(125, 60, 210, 84, white), (135.7, 66.7, 194.4, 79.5)),
                'DESIGN': (ink_bbox(120, 84, 210, 106, lime), (127.5, 86.8, 204.5, 102.4)),
                'YOUR BUSINESS': (ink_bbox(10, 176, 120, 193, dark), (18.3, 180.9, 112.8, 189.2)),
                'NAME': (ink_bbox(10, 194, 70, 209, lime), (18.3, 197.4, 50.4, 204.7)),
                '20': (ink_bbox(135, 244, 172, 271, lime), (142.1, 248.6, 169.7, 266.8)),
                '50': (ink_bbox(172, 244, 210, 271, white), (174.2, 248.6, 199.9, 266.8)),
            }
            for label, (got, want) in boxes.items():
                for g, w in zip(got, want):
                    self.assertLess(abs(g - w), 1.0, f'{label}: ink box {got} vs reference {want}')

    def test_raster_proofs(self):
        for name, dpi in (('cover.png', 300), ('proof.png', 150)):
            with pymupdf.open(self.out / name) as document:
                pixmap = document[0].get_pixmap()
                self.assertAlmostEqual(pixmap.width / pixmap.height, 210 / 297, places=3)
                self.assertAlmostEqual(pixmap.width, 210 / 25.4 * dpi, delta=1.5)

        # Sample the plate at known colours, in millimetres from the trim corner.
        with pymupdf.open(self.out / 'cover.png') as document:
            pixmap = document[0].get_pixmap()

            def sample(x, y):
                return pixmap.pixel(round(x * MM), round(y * MM))

            red, green, blue = sample(165, 60)          # flat navy disc
            self.assertLess(max(red, green, blue), 90)
            self.assertGreater(blue, red)

            red, green, blue = sample(110, 140)         # crescent
            self.assertGreater(green, red + 20)
            self.assertGreater(green, blue + 20)

            self.assertEqual(sample(60, 170), (255, 255, 255))       # open white
            self.assertGreater(min(sample(27, 9.5)), 150)             # grid cell grey
            self.assertEqual(sample(31.5, 9.5), (255, 255, 255))     # grid cell white
            self.assertLess(sample(10, 240)[0], 90)                  # panel ground
            self.assertGreater(sample(175, 290)[1], 150)             # foot swell


if __name__ == '__main__':
    unittest.main()
