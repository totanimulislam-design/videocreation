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

        # The template copy survives as accessible labels on the outlined runs.
        labels = {group.get('aria-label') for group in self.root.iter(SVG + 'g')}
        for line in ('YOUR LOGO', 'COVER', 'DESIGN', 'YOUR BUSINESS', 'NAME',
                     'FOR MORE INFO', '+012 3456 789', 'your website here'):
            self.assertIn(line, labels)

    def test_layers_and_paint(self):
        layers = self.root.findall('./' + SVG + 'g')
        self.assertEqual([layer.get('id') for layer in layers],
                         ['stock', 'grid', 'ribbons', 'disc', 'wordmark', 'identity', 'panel'])
        defs = self.root.find('./' + SVG + 'defs')
        self.assertEqual(len(defs.findall('./' + SVG + 'linearGradient')), 4)
        self.assertEqual(len(defs.findall('./' + SVG + 'radialGradient')), 2)
        self.assertEqual(len(defs.findall('./' + SVG + 'pattern')), 1)
        self.assertEqual(len(defs.findall('./' + SVG + 'clipPath')), 1)

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

            red, green, blue = sample(165, 60)          # inside the navy disc
            self.assertLess(max(red, green, blue), 90)
            self.assertGreater(blue, red)

            red, green, blue = sample(110, 140)         # green crescent
            self.assertGreater(green, red + 30)
            self.assertGreater(green, blue + 30)

            self.assertEqual(sample(60, 170), (255, 255, 255))       # open white
            self.assertGreater(min(sample(30, 12)), 200)             # grid square
            self.assertLess(sample(10, 240)[0], 90)                  # panel ground
            self.assertGreater(sample(175, 290)[1], 150)             # green foot


if __name__ == '__main__':
    unittest.main()
