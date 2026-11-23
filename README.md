# Code-Based Vector Poster Design

A guide to designing posters, flyers, and banners programmatically — from print-ready
commercial layouts to generative, algorithmic vector art. Everything below produces
true vector output (`.svg`, `.pdf`, `.eps`), so your designs stay sharp at any size and
remain editable in tools like Adobe Illustrator, Inkscape, or Affinity Designer.

There are two broad workflows:

1. **Print & Publishing** — structured typography, grids, and print-ready PDFs.
2. **Generative & Algorithmic** — patterns, organic shapes, and path math.

---

## Project: Common Ground — Urban Futures Forum

**Common Ground** is an original A4 flyer for a fictional urban-design forum in
Dhaka. The design pairs a two-line masthead and date rail with an illustrated
architectural study, a three-column programme, and a full-bleed date reminder.
The civic model is generated from projected coordinates: every roof, terrace,
façade, contour and stipple dot is vector geometry.

### Build, check, and edit

Use Python 3.11 or newer. Fonts and their OFL licenses are bundled under
[`assets/fonts/`](assets/fonts/); building does not download fonts or artwork.

```sh
python -m venv .venv
source .venv/bin/activate  # Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python scripts/build_flyer.py
python -m unittest discover -s tests -v
```

The build writes to `flyer/` by default (override with `--output PATH`). The
180 dpi PNG proof is also checked in at [`assets/common-ground.png`](assets/common-ground.png)
for direct viewing; the SVG and print PDF exports are generated on demand. A
[GitHub Actions workflow](.github/workflows/flyer.yml) runs the same checks and
uploads all four generated files as the `common-ground-flyer` artifact. Generated
exports are otherwise ignored by Git; the generator, font files, and tests are the
source of truth.

| Export | Use |
| --- | --- |
| `common-ground.svg` | Layered artwork at A4 trim (210 × 297 mm). |
| `common-ground-bleed.svg` | Layered artwork at 216 × 303 mm, including 3 mm bleed on every side. |
| `common-ground-print.pdf` | Vector print production file: A4 TrimBox, 3 mm BleedBox, and crop marks outside the bleed. |
| `common-ground.png` | 180 dpi, A4-trim raster proof for quick viewing and sharing. |

Edit `EVENT` and `layout()` in [`scripts/build_flyer.py`](scripts/build_flyer.py)
to update the copy and typography; edit `drawing()` to change the illustration.
Check the proof after changing copy lengths. The SVGs have named Inkscape layers
for stock, masthead, illustration, programme, and footer. Text is outlined in the
exports, so edit the copy in Python rather than treating the outlines as text boxes.
The print PDF uses untagged RGB from sRGB hex values; it is not CMYK or certified
PDF/X. Ask your printer for their ICC/output requirements before production.

### Reference study

The [Magnific professional flyer collection](https://www.magnific.com/psd/professional-flyer)
provided the reference for hierarchy, segmented layouts, and high-contrast date or
call-to-action blocks. The catalogue listings and a sample of available thumbnails
were reviewed; the live catalogue was not exhaustively visually inspected. No stock
PSD, photographs, or layouts were imported. The event details are sample copy, not a
real announcement.

---

## 1. The Print & Publishing Approach (Python + ReportLab / WeasyPrint)

If your goal is traditional commercial flyers, posters, and banners with complex
typography, grids, bleed margins, and print-ready PDFs, Python combined with layout
engines is the industry standard.

### WeasyPrint (HTML/CSS to Vector PDF)

Design the poster using standard **HTML, CSS Grid, Flexbox, and embedded SVGs**, and
WeasyPrint compiles it into a high-resolution vector PDF. Because CSS supports `@page`
rules, millimeter/inch units (`mm`, `in`, `pt`), custom fonts, and CMYK color profiles,
you can build complex magazine-style layouts rapidly.

- Best for: grid-based editorial layouts, typography-heavy flyers, print-ready PDFs.
- Workflow: write HTML + CSS → `weasyprint input.html output.pdf`.

### ReportLab / PyMuPDF

Low-level Python libraries that draw vector paths, Bézier curves, text frames, and
barcodes directly onto a PDF canvas. Ideal for automated batch generation — for example,
generating 500 personalized event posters from a CSV.

- Best for: pixel-precise placement, data-driven batch output, barcodes and forms.
- Workflow: Python script → PDF canvas (no HTML/CSS involved).

---

## 2. The Generative & Algorithmic Vector Approach (Paper.js / p5.js-svg)

If by "complex design" you mean intricate geometric patterns, fluid organic shapes,
custom path boolean operations (like Illustrator's Pathfinder), or generative art:

### Paper.js (JavaScript)

Often described as the "Swiss Army Knife of Vector Graphics Scripting." It features a
full Document Object Model for vector graphics, native cubic Bézier curve math, path
intersections/unions/subtractions, and exports cleanly to **SVG** — which opens directly
in Adobe Illustrator with all layers and anchor points intact.

### DrawBot (Python)

Originally built for macOS type designers, DrawBot lets you write Python scripts to
manipulate OpenType font features, complex shapes, and multi-page vector PDFs with
immediate visual feedback.

### vpype / Shapely (Python)

Used heavily by pen-plotter artists to generate, optimize, and manipulate millions of
complex vector paths before exporting to SVG.

---

## 3. Best Code-Based Tools for Vector Poster Design

Depending on your preferred language and whether you want pure generative art or
structured poster typography, choose one of these workflows:

| Tool / Library            | Language       | Best For                                                                                          | Direct Vector Export      |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------------- | ------------------------- |
| **Matplotlib + NumPy**    | Python         | Parametric equations, polar plots, wave interference, and mathematical curves.                    | `.svg`, `.pdf`, `.eps`    |
| **PyCairo / svgwrite**    | Python         | Low-level geometric precision, custom paths, Bézier curves, and clean SVG layers.                 | `.svg`, `.pdf`, `.eps`    |
| **p5.js + p5.js-svg**     | JavaScript     | Creative coding, flow fields, noise-based patterns, and live browser previews.                    | `.svg`                    |
| **Processing (PGraphicsSVG)** | Java / Python | High-speed generative geometry, recursive structures, and print-ready vector frames.          | `.svg`, `.pdf`            |
| **TikZ / PGFPlots**       | LaTeX          | Ultra-precise mathematical diagrams, typography, and publication-grade vector posters.            | `.pdf` (convertible to `.eps`) |

---

## 4. Choosing a Workflow

| If you need…                                     | Start with…                       |
| ------------------------------------------------ | --------------------------------- |
| A print-ready flyer with grids, bleed, and CMYK  | **WeasyPrint** (HTML/CSS)         |
| Hundreds of data-driven personalized posters     | **ReportLab / PyMuPDF**           |
| Complex path boolean ops, editable Illustrator SVG | **Paper.js**                    |
| Type design and OpenType feature experimentation | **DrawBot**                      |
| Pen-plotter art with optimized paths             | **vpype / Shapely**               |
| Mathematical or parametric posters               | **Matplotlib + NumPy** or **TikZ** |
| Live, interactive generative sketches            | **p5.js + p5.js-svg**             |

---

## 5. Print-Ready Export Checklist

Whatever the workflow, a print-ready vector poster usually needs:

- **Correct page size and bleed** — e.g. 3 mm bleed on all sides (`@page` in CSS,
  page boxes in ReportLab, or a scaled artboard in SVG).
- **CMYK or documented RGB profile** — WeasyPrint supports CMYK color profiles;
  vector formats preserve spot colors.
- **Outlined or embedded fonts** — or export text as paths for maximum portability.
- **Vector-only output** — avoid rasterized images for logos, icons, and type.
- **Crop marks and margins** — set via page rules or canvas metadata.
