import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

import pymupdf

from scripts.build_flyer import export


class FlyerExports(unittest.TestCase):
    def test_a4_vectors_with_bleed_and_marks(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder)
            export(out)
            for path, width, height in (
                ('common-ground.svg', '210mm', '297mm'),
                ('common-ground-bleed.svg', '216mm', '303mm'),
            ):
                root = ET.parse(out/path).getroot()
                self.assertEqual((root.get('width'), root.get('height')), (width, height))
                self.assertFalse(root.findall('.//{*}image'))
                self.assertEqual(len(root.findall('./{*}g')), 5)

            with pymupdf.open(out/'common-ground-print.pdf') as document:
                self.assertEqual(len(document), 1)
                page = document[0]
                pt = 72/25.4
                for box, w, h in ((page.trimbox, 210, 297), (page.bleedbox, 216, 303),
                                  (page.mediabox, 224, 311)):
                    self.assertAlmostEqual(box.width/pt, w, places=3)
                    self.assertAlmostEqual(box.height/pt, h, places=3)
                self.assertEqual(page.get_image_info(), [])
                self.assertEqual(page.get_fonts(), [])
                self.assertGreater(len(page.get_drawings()), 1000)

                # Inspect printed colors at the stock, illustration and footer,
                # plus the horizontal crop mark and surrounding printer margin.
                pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
                def sample(x, y):
                    return pix.pixel(round(x*pt*2), round(y*pt*2))
                self.assertLess(min(max(sample(1, y)) for y in (6.9, 7, 7.1)), 180)
                self.assertEqual(sample(1, 8), (255, 255, 255))
                self.assertEqual(sample(110, 95), (243, 237, 223))
                self.assertLess(max(sample(24, 126)), 120)
                self.assertEqual(sample(110, 302), (255, 105, 60))

            png = pymupdf.Pixmap(out/'common-ground.png')
            self.assertAlmostEqual(png.width / png.height, 210 / 297, places=3)
            self.assertEqual(png.xres, 180)


if __name__ == '__main__':
    unittest.main()
