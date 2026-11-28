# Typography Measurement & Text Layout Engine (Task 04)

> **Scope.** This document describes the typography layer implemented in `src/typography/`.
> It shapes and measures text with HarfBuzz, manages fonts, wraps and fits text, and reports
> structured overflow diagnostics. It does **not** render, rasterise, edit or export anything:
> there is still no renderer, editor or scene composer in this repository. What this layer
> produces is a canonical, measured layout that a future layout/render engine can consume.

- Status: implemented and tested on Node ≥ 22.18 (verified on Node 22.22.3).
- Test count: **154 new tests** in 7 new files; suite total **442 tests / 77 suites** (288 pre-existing tests untouched).
- Runtime dependency added: `harfbuzzjs@1.6.4` (HarfBuzz compiled to WebAssembly).

---

## 1. Why HarfBuzz (and not Canvas, `measureText`, or character counts)

Text cannot be measured correctly without shaping: `ক্ষ` is three code points but one glyph,
`AVA` is three glyphs but four characters' worth of naive width, and Arabic letters change form
depending on their neighbours. `DESIGN_ENGINE_SPEC.md` §9.3 requires real metrics, and the
project rules forbid character-count or average-width formulas presented as measurement.

The engine therefore uses **HarfBuzz** — the same OpenType shaping engine browsers and operating
systems use — via `harfbuzzjs` (WASM). Consequences that matter:

| Concern | Decision |
|---|---|
| Browser Canvas `measureText` | **Not used.** It is unavailable in Node, non-deterministic across platforms, and would not provide glyph ids, clusters or mark offsets. |
| Determinism | The same font bytes + the same request produce the same glyph ids, clusters and advances (asserted in tests). The engine never depends on installed system fonts. |
| Fallback | Node-only HarfBuzz is loaded lazily (`import('harfbuzzjs')`) once per process, so importing `src/index.ts` does not instantiate WASM. |
| Units | All lengths are expressed in the caller's canvas unit (`px`, `mm`, `cm`, `in`). Font sizes and metrics are interpreted in that same unit; there is no hidden px conversion. |

Font metrics are taken from the font (`head`, `hhea`/`OS/2` via HarfBuzz `hExtents`), scaled by
`fontSize / unitsPerEm`.

---

## 2. Public API

```ts
import { createTypographyEngine, createTypographyToken } from '../src/index.ts';

const engine = await createTypographyEngine({
  fonts: [{ family: 'Noto Sans Bengali', source: { kind: 'path', path: 'tests/fixtures/fonts/NotoSansBengali-Regular.ttf' } }],
});

const typography = createTypographyToken({ fontFamily: 'Noto Sans Bengali', fontSize: 40, lineHeight: 1.5 });

engine.registerFont({ family: 'Noto Sans', source: { kind: 'path', path: '…/NotoSans-Regular.ttf' } });

engine.listFonts();                                  // metadata, measured from the bytes
engine.getFontMetadata('Noto Sans');                 // by id or family
engine.resolveFont({ fontFamily: 'Noto Sans Bengali', text: 'বাংলা' });
engine.scriptSupport();                              // measured capability matrix

engine.shapeText({ text: 'বাংলা and English', typography, language: 'bn' });
engine.measureText({ text: 'বাংলা', typography, language: 'bn' });
engine.wrapText({ text, typography, maxWidth: 200, maxLines: 3 });
engine.layoutText({ text, typography, constraint: { maxWidth: 200, maxHeight: 120 } });
engine.fitText({ text, typography, minFontSize: 12, maxWidth: 200, maxHeight: 120 });
engine.detectTextOverflow({ layout, maxWidth: 180 });
engine.layoutSceneText({ node });                    // node.geometry is the box
engine.cacheStats();
```

`shapeText`, `measureText`, `wrapText` and `layoutText` are **projections of one pipeline**:
measurement is `layoutText` without constraints, wrapping is `layoutText` with `maxWidth`, and the
shaping result is the run list of the same layout. They cannot report different numbers for the
same request (asserted by tests).

`model.typography` in every result is the resolved metric set actually used
(`fontSize`, `lineHeight` in canvas units, `letterSpacing`, `wordSpacing`, ascender/descender,
`unitsPerEm`, resolved `fontWeight`, resolved `fontFamily`).

---

## 3. Font management

### 3.1 Sources and formats

`registerFont({ family, source, weight?, style?, scripts?, licensing? })` accepts:

- raw bytes (`Uint8Array`/`ArrayBuffer`),
- a file path (`{ kind: 'path' }`),
- a `data:` URI with base64 payload.

Containers are detected **structurally** (magic numbers), not by file extension:

| Format | Support |
|---|---|
| TrueType (`0x00010000`, `true`) | full |
| OpenType/CFF (`OTTO`) | full |
| WOFF 1.0 (`wOFF`) | decoded to sfnt (zlib inflate when compressed), then loaded |
| WOFF 2.0 (`wOF2`) | **detected and rejected** with `FONT_FORMAT_UNSUPPORTED` — no half-decoder |
| TrueType Collection (`.ttc`) | **detected and rejected** with `FONT_FORMAT_UNSUPPORTED` — no face-index selection |

Registration never throws. Duplicate `(family, weight, style)` registrations are reported
(`FONT_DUPLICATE`), empty sources `FONT_DATA_EMPTY`, unreadable paths `FONT_SOURCE_INVALID`, and
corrupt bytes `FONT_PARSE_FAILED`. Files larger than `MAX_FONT_BYTES` are refused.

### 3.2 Metadata (measured, not claimed)

Each registered font reports `id`, `family`, `subfamily`, `format`, `weight`, `style`, vertical
metrics (`unitsPerEm`, ascender, descender, line gap, cap height, x-height when present), declared
scripts, **measured** `scriptCoverage`, `coveredScripts`, `codepointCount`, OpenType capability
tags (`GSUB`/`GPOS` script and feature tags), licensing and byte length.

`scriptCoverage` counts base characters per script that the `cmap` actually maps. Combining marks
are excluded (they inherit the preceding base), and a script is listed in `coveredScripts` only
above `MIN_SCRIPT_COVERAGE = 25` characters, so a stray code point cannot make a font claim a
script. Exact counts are always exposed.

### 3.3 Resolution and fallback

`resolveFont()` returns a `FontResolution` with `status` (`resolved` | `fallback` | `missing`),
`kind` (`exact` | `weight` | `style` | `family-stack` | `generic` | `registry-fallback` | `none`),
the requested family/weight/style, the resolved font, the fallback chain tried, a human-readable
`reason`, and coverage counts (`coveredCodepoints`, `missingCodepoints`).

- Family stacks are parsed in order (`"Noto Sans Bengali, Noto Sans"`).
- Generic names (`sans-serif`, `serif`, `monospace`, …) are never treated as fonts; they resolve
  only through `genericFamilies` configuration.
- A missing family is never silently substituted: it produces `FONT_FALLBACK_APPLIED` with the
  requested and applied families in `context`.
- Weight selection picks the nearest registered weight; the substitution is reported.
- Per-grapheme splitting handles mixed-script text, so `বাংলা and English` uses the Bengali font
  for the Bengali run and the Latin font for the Latin run, each with its own `FontResolution`
  (`FONT_COVERAGE_INCOMPLETE` lists up to 12 uncovered code points when nothing covers them).
- **Neutral pieces do not drag in an unrelated face.** When a grapheme with no letters (punctuation,
  ASCII digits) is not covered by the current face, the engine first borrows the font of the
  nearest strong-script neighbour that covers it, otherwise it prefers a Latin-capable face over
  whichever face happens to sit earlier in the registry. `বাংলা, English` therefore renders the
  comma with the Latin font (Noto Sans Bengali maps no comma), never with an Arabic/Nastaliq face.
  The run's `resolution` always describes the face that actually shaped it, so `run.font`,
  `run.ascent` and the coverage diagnostics agree with the glyphs.

---

## 4. Shaping

`shapeText` returns runs in logical order, each with script, direction, language, font,
resolution, glyphs and absolute cluster indices.

Every glyph carries `glyphId`, `cluster` (UTF-16 index into the original string), `xAdvance`,
`yAdvance`, `xOffset`, `yOffset`, HarfBuzz flags and a `missing` flag for `.notdef`.

Verified behaviour on the fixture fonts (asserted in `tests/typography-shaping.test.ts`):

| Case | Result |
|---|---|
| Latin `fi` | 1 glyph (id 1654); `features: ['-liga']` → 2 glyphs |
| Latin `Hello` | 5 glyphs, clusters 0…4 |
| Bengali `ক্ষ` | 3 code units → **1 glyph** (id 135) |
| Bengali `বাংলা` | 5 glyphs with clusters `[0,0,0,3,3]` |
| Bengali `প্রেম` | 5 code units → 4 glyphs, one zero-advance positioned mark |
| Bengali `রূপ` | reph substitution, 3 glyphs |
| Arabic `العربية` | 7 letters → 10 glyphs, RTL, descending clusters, zero-advance positioned marks |
| Arabic `ببب` | three different contextual forms (initial/medial/final) + positioned dots |
| Arabic `مُحَمَّد` | diacritics attached with zero advance and vertical offsets |
| Urdu `اردو` with Nastaliq | shaped by `Noto Nastaliq Urdu`, tall line box |
| Missing glyphs (e.g. Devanagari in a Latin font) | glyph id 0, `missing: true`, `GLYPH_MISSING` + `SHAPING_SCRIPT_UNSUPPORTED`, layout still returns |

Text is never reversed by this layer. HarfBuzz performs logical→visual ordering for RTL runs;
manually reversing Arabic would corrupt joining and Bengali conjuncts.

`features` accepts OpenType feature strings (`liga`, `-liga`, `ss01=2`, `kern[3:5]`); invalid
strings are reported with `TYPOGRAPHY_CONFIG_INVALID` instead of being silently dropped.

---

## 5. Measurement semantics

- `width` is the sum of shaped advances (plus spacing) of the widest line.
- `ascent`/`descent` come from the font at the requested size (`descent` is negative).
- `baseline` is `ascent + (lineBox − (ascent − descent)) / 2`. When `lineHeight` is smaller than
  the font's ascent+descent the half-leading is negative and `TEXT_LINE_HEIGHT_BELOW_METRICS`
  warns with the suggested multiple.
- `height` is `lineCount × lineHeight` (canvas units).
- `letterSpacing` is applied **per grapheme cluster**, so a base + combining mark counts once and
  a Bengali conjunct counts once. `abc` with `letterSpacing: 10` is `+30`; `বাংলা` (two graphemes)
  is `+20`.
- `wordSpacing` is supplied on the request (it is not part of the canonical `TypographyToken`),
  applies per space grapheme, and is reported back in `typography.wordSpacing`. A `wordSpacing`
  key nested inside the token is ignored **and warned about** (`TYPOGRAPHY_CONFIG_INVALID`,
  `path: 'typography.wordSpacing'`).
- Explicit `\n` starts a new line; an empty paragraph stays an empty line. `measureText('a\nb')`
  is two lines and `height = 2 × lineHeight`.
- Trailing whitespace does not contribute to a line's width (it collapses at the line end).
  Leading whitespace at the start of a paragraph **is** content and is measured; whitespace
  exposed by a soft wrap is collapsed, so a line never begins with a stray space.
- Empty text is valid: zero lines, zero width, `TEXT_CONTENT_EMPTY` warning, `ok: true`.
- An unsupported `unit` value is rejected (`TYPOGRAPHY_CONFIG_INVALID`) rather than mislabelling
  lengths.

---

## 6. Wrapping

Wrapping walks Unicode break opportunities (`src/typography/line-break.ts`) over the shaped
advances; it never splits on spaces alone.

- Grapheme boundaries come from `Intl.Segmenter`, so a base character and its combining marks
  never separate. Bengali conjuncts and ZWJ emoji are additionally protected because a break is
  never placed inside a shaping cluster.
- Legal opportunities: after spaces, zero-width spaces, hyphens and the break-after punctuation
  these scripts use (including the Bengali danda `।`); suppressed before closing punctuation,
  after opening punctuation, inside a number and between a number and its prefix/postfix
  (`$100`, `50%`), at NBSP/word joiner.
- `overflowWrap` values:
  - `normal` (**default**) — a word that does not fit stays intact and overflows; the result
    reports `TEXT_OVERFLOW_HORIZONTAL` and `TEXT_UNBREAKABLE_OVERFLOW`. Word splitting is never a
    silent default.
  - `break-word` — splits at grapheme/cluster-safe boundaries and marks every such line with
    `emergencyBreak: true` plus `TEXT_EMERGENCY_BREAK`.
  - `anywhere` — same mechanics as `break-word`, kept as a distinct intent.
- `maxLines` produces `TEXT_LINE_COUNT_EXCEEDED` and `overflow.lineCountExceeded`; lines are not
  silently dropped.
- RTL text wraps into logical slices (`line.text === text.slice(startIndex, endIndex)`), with
  `visualRunOrder` giving the visual run order for the base direction.
- Explicit `\n` is a hard break; `paragraphIndex` identifies the paragraph.

Documented limitation: this is a **subset of UAX #14**, not full conformance. There are no
language-specific hyphenation dictionaries and no Thai/Lao/Khmer dictionary breaking (scripts
outside the supported set).

---

## 7. Fitting

`fitText` searches for the **largest** font size that satisfies every constraint, by laying the
text out at each candidate size (no linear-scaling shortcut), bisecting between `minFontSize`
(inclusive) and `maxFontSize` (exclusive) to a tolerance of
`max(1e-3, (maxFontSize − minFontSize) × 1e-4)` with at most 40 attempts. The returned `layout` is
always the layout measured at `selectedFontSize`.

| Policy | Behaviour |
|---|---|
| `shrink` (default) | Largest fitting size ≥ `minFontSize`; a reduction below the requested size adds `TEXT_FIT_REDUCED` (warning). |
| `clip` | Keeps `maxFontSize` and returns its overflowing layout for the renderer to clip; `status: 'cannot-fit'`, `ok: false`, **no** `TEXT_FIT_FAILED` (the caller chose this). |
| `fail` | Keeps `maxFontSize`, returns the overflowing layout as evidence and adds `TEXT_FIT_FAILED` (error). |

If nothing fits at `minFontSize`, the result is `status: 'cannot-fit'`, `ok: false`,
`selectedFontSize === minFontSize`, with `TEXT_FIT_FAILED` (error) and the measured overflow
reasons. The engine never emits text below the configured minimum to make a box happy.

Invalid requests (`minFontSize > maxFontSize`, out-of-range sizes, non-positive width, unknown
policy) return `status: 'invalid'` with diagnostics and never throw.

---

## 8. Overflow and diagnostics

`layoutText` returns `overflow`:

```ts
{ horizontal, vertical, lineCountExceeded, unbreakable, missingGlyphs, missingFont,
  unsupportedScripts, reasons }
```

Severity model (stable, matches the foundation's conventions):

| Code | Severity | When |
|---|---|---|
| `TEXT_OVERFLOW_HORIZONTAL` | error | widest line exceeds an explicit `maxWidth` |
| `TEXT_OVERFLOW_VERTICAL` | error | block height exceeds an explicit `maxHeight` |
| `TEXT_LINE_COUNT_EXCEEDED` | error | more lines than an explicit `maxLines` |
| `TEXT_UNBREAKABLE_OVERFLOW` | warning | an unbreakable word/cluster is wider than the container (text preserved, not split) |
| `TEXT_EMERGENCY_BREAK` | warning | at least one line was split mid-word because the caller asked (`break-word`/`anywhere`) |
| `GLYPH_MISSING` | warning | `.notdef` glyphs produced by missing font coverage |
| `SHAPING_SCRIPT_UNSUPPORTED` | warning | script outside the documented matrix |
| `FONT_FALLBACK_APPLIED` | warning | requested family unavailable or incomplete; the applied font is reported |
| `FONT_COVERAGE_INCOMPLETE` | warning | some characters have no registered coverage |
| `FONT_NOT_FOUND` | error | no font could be resolved at all (`overflow.missingFont`) |
| `TEXT_BIDI_APPROXIMATED` | warning | more than one direction appears; see §9 |
| `TEXT_LINE_HEIGHT_BELOW_METRICS` | warning | `lineHeight` is smaller than the font's ascent+descent |
| `TEXT_URDU_NASTALIQ_UNAVAILABLE` | warning | Urdu text is shaped by a non-Nastaliq face |
| `TEXT_CONTENT_EMPTY` | warning | empty text; no lines produced |
| `TEXT_MISSING` | error | a required layout or scene text node is absent |
| `TEXT_FIT_FAILED` | error | no size satisfied the fit constraints, or the fit request was invalid |
| `TEXT_FIT_REDUCED` | warning | fitting selected a size below the requested one |
| `TYPOGRAPHY_CONFIG_INVALID` | error/warning | malformed token fields, unknown unit, nested `wordSpacing`, bad feature string, bad `maxWidth`/`maxLines` |

`TEXT_*`, `FONT_*`, `GLYPH_*`, `SHAPING_*` codes are additive: no existing foundation code was
renamed or removed, and `validateTypographyToken` in `src/validation/structural.ts` is unchanged.
`TEXT_MISSING` and `TEXT_CONTENT_EMPTY` already existed for scene-text validation and are reused
here with the same meaning (absent text, empty text).

---

## 9. Scripts, direction and honesty about bidi

| Script | Status | Evidence |
|---|---|---|
| Latin | supported | kerning, `fi` ligature, mark positioning, long headlines |
| Bengali | supported | conjuncts (`ক্ষ`), kar, phala, reph, Bengali digits, danda wrapping |
| Arabic | supported | contextual joining forms, diacritics, RTL, Arabic-Indic digits |
| Urdu | supported (Arabic script) | Urdu-specific letters shape correctly; Nastaliq style requires a Nastaliq font |

Urdu is written with the Arabic script. A Naskh Arabic font shapes Urdu correctly but changes its
calligraphic style, so the engine warns (`TEXT_URDU_NASTALIQ_UNAVAILABLE`) when Urdu text is laid
out with a non-Nastaliq face instead of pretending the style is equivalent.

**Bidi is a level-1 approximation.** Runs are segmented by script, each run gets the direction of
its own script, runs are ordered per the base direction (derived from the first strong script or
set explicitly), and mixed direction is reported with `TEXT_BIDI_APPROXIMATED`. Not implemented:
UAX #9 embedding levels, isolates (`LRI`/`RLI`/`FSI`/`PDI`), bracket-pair resolution and mirrored
glyph substitution. For text with heavy nesting (e.g. Arabic inside a Latin paragraph inside an
RTL block) a renderer must not assume this ordering is complete.

---

## 10. Determinism and caching

- Shaping results are memoised per (font version, run text, script, direction, language,
  features). Layout results are memoised in an LRU keyed by font version plus the full request
  (including unknown token fields, so a warning-producing request cannot collide with a clean
  one). `registerFont` bumps the font version and invalidates the layout cache.
- `cacheStats()` reports entries/hits/misses for both caches; `clearCaches()` is exposed so tests
  can prove results do not depend on cache state.
- No random ids, no timestamps in results (only `registeredAt` in font metadata), no reliance on
  installed system fonts.

---

## 11. Fixtures, licensing and reproducibility

Five Noto fonts (1.4 MB total) live in `tests/fixtures/fonts/` with the upstream `OFL.txt`:

| File | sha256 | Licence |
|---|---|---|
| `NotoSans-Regular.ttf` (621,572 B) | `478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823` | SIL OFL 1.1 |
| `NotoSansBengali-Regular.ttf` (143,072 B) | `b55c62ee531e3214da6c0701daecea89a52ba42db7d8206b92e6b51f397a3193` | SIL OFL 1.1 |
| `NotoSansBengali-Bold.ttf` (144,828 B) | `923c6a4c2eb618a57ed83f4bca855b4f5287b87906a4d9df40a2ffa8ebd8c2e8` | SIL OFL 1.1 |
| `NotoSansArabic-Regular.ttf` (234,892 B) | `bdff3e5659d67e67def05b33f749683b9376ae819d65d3dd62ac4640b3aaef48` | SIL OFL 1.1 |
| `NotoNastaliqUrdu-Regular.ttf` (253,396 B) | `4d05b6821862ca1f3c80c47c80a352b47dd349ab73814f60e377eea311e0e42c` | SIL OFL 1.1 |

Provenance: `github.com/notofonts/notofonts.github.io`, branch `main`, paths
`fonts/<Family>/hinted/ttf/<File>.ttf`; licence text from `fonts/LICENSE` (4374 B, copied verbatim
as `OFL.txt`). To re-fetch:

```bash
python3 - <<'PY'
import base64, json, urllib.request
api = 'https://api.github.com/repos/notofonts/notofonts.github.io/contents/'
for family, name in [('NotoSans', 'NotoSans-Regular.ttf'), ('NotoSansBengali', 'NotoSansBengali-Regular.ttf'),
                     ('NotoSansBengali', 'NotoSansBengali-Bold.ttf'), ('NotoSansArabic', 'NotoSansArabic-Regular.ttf'),
                     ('NotoNastaliqUrdu', 'NotoNastaliqUrdu-Regular.ttf')]:
    url = f'{api}fonts/{family}/hinted/ttf/{name}?ref=main'
    with urllib.request.urlopen(url) as response:
        payload = json.load(response)
    open(f'tests/fixtures/fonts/{name}', 'wb').write(base64.b64decode(payload['content']))
PY
sha256sum tests/fixtures/fonts/*.ttf   # compare with the table above
```

Every test reads these files through `tests/fixtures/fonts.ts`, which also builds WOFF containers
in memory (`makeWoff`) so the WOFF path is tested without committing a second copy of each font.

`harfbuzzjs@1.6.4` is MIT-licensed ("Old MIT" text, `node_modules/harfbuzzjs/LICENSE`); HarfBuzz
itself is MIT and the WASM bundle is distributed under the same terms. It is the only runtime
dependency; `typescript` and `@types/node` remain dev-only.

---

## 12. Limitations (explicit, not implied)

| Limitation | Detail |
|---|---|
| WOFF2 | detected, rejected with `FONT_FORMAT_UNSUPPORTED`; no Brotli decoder added |
| TrueType collections (`.ttc`) | rejected; no face-index selection |
| Variable fonts | loaded at their default instance; no axis/`fvar` control |
| Colour fonts (COLR/CPAL, SVG) | not interpreted; glyph outlines are not produced at all by this layer |
| Vertical text (`vert`, `vrt2`) | not laid out; `direction` only takes `ltr`/`rtl` |
| Full UAX #9 bidi | not implemented (see §9) |
| Full UAX #14 tables | subset (see §6); no hyphenation dictionaries |
| Justification, hyphenation, `text-transform` | not applied by the engine; `textTransform` is part of the token but layout does not rewrite text |
| Nastaliq quality | depends entirely on the supplied Nastaliq font; the engine does not synthesise calligraphic forms |
| Glyph outlines | not requested from HarfBuzz; a renderer will need `glyphToPath` or its own rasteriser |
| Browser/Web environments | the engine is Node-only today (`node:fs`, `node:zlib`, `node:crypto`) even though HarfBuzz itself is portable |

---

## 13. Tests

| File | Tests | Focus |
|---|---|---|
| `tests/typography-fonts.test.ts` | 31 | registration, metadata, containers (TTF/OTF/WOFF), WOFF2 rejection, resolution, fallback, generic families, stacks, `scriptSupport` |
| `tests/typography-shaping.test.ts` | 33 | Latin ligatures/kerning/scale, Bengali conjunct/kar/phala/reph/digits/danda, Arabic joining/diacritics/digits, Urdu Nastaliq warning, mixed runs, bidi ordering, missing glyphs, determinism |
| `tests/typography-measure.test.ts` | 18 | advance sums, prefix additivity, `letterSpacing` per grapheme, `wordSpacing`, ascent/descent/baseline, multi-line, units, empty input |
| `tests/typography-wrap.test.ts` | 19 | word boundaries, no word splitting by default, digits/fractions, danda, ZWSP, newlines, emergency breaks, cluster safety, RTL and mixed lines |
| `tests/typography-fit.test.ts` | 20 | fits/shrunk/cannot-fit, monotonicity, clip/fail policies, height/line constraints, Bengali/Arabic/Urdu fitting, invalid requests, determinism |
| `tests/typography-overflow.test.ts` | 21 | overflow verdicts and severities, `detectTextOverflow`, bidi ordering, scene-node entry point, capability matrix |
| `tests/typography-regression.test.ts` | 12 | public API surface, token shape, diagnostics stability, existing parser/validator behaviour, token immutability, cache transparency |
| **Total new** | **154** | |
| Pre-existing | **288** | unchanged files, unchanged expectations |
| **Suite total** | **442** | 77 suites, `node --test` |

Run:

```bash
npm run typecheck   # tsc --noEmit, strict
npm test            # node --test --experimental-strip-types tests/
```

---

## 14. Task 04 status

**Fully implemented**

- Font registration/resolution with measured metadata, fallback chains, weights/styles, family
  stacks, generic-family mapping, WOFF 1.0 decoding.
- Real HarfBuzz shaping with script/direction/language selection, OpenType features, clusters,
  per-glyph offsets and missing-glyph flags.
- Font-based measurement (advances, ascent/descent/baseline, line boxes), `letterSpacing` and
  `wordSpacing`, units, multi-paragraph text.
- Unicode-aware wrapping with grapheme/cluster safety, emergency-break opt-in, hard breaks.
- Fitting by bisection with `shrink`/`clip`/`fail`, bounded by `minFontSize`.
- Structured overflow report and stable `TEXT_*`/`FONT_*`/`GLYPH_*`/`SHAPING_*` diagnostics.
- Latin, Bengali, Arabic and Urdu coverage with mixed-script runs and RTL ordering.
- Deterministic caching that cannot change results.

**Partially implemented**

- Bidi: level-1 approximation only (no embedding levels/isolates/bracket mirrors); mixed
  direction is flagged, not fully resolved.
- Line breaking: documented UAX #14 subset, no hyphenation dictionaries.
- Urdu: shaped correctly with any Arabic-script font; Nastaliq is font-dependent and only warned
  about, never synthesised.
- Vertical metrics: ascent/descent come from HarfBuzz `hExtents`; `OS/2` typographic metrics and
  cap/x-height are reported when present but not used to choose line boxes.

**Unsupported (documented)**

- WOFF2, `.ttc`, variable-font axes, colour fonts, vertical writing modes, justification,
  hyphenation, Thai/Lao/Khmer dictionary breaking, glyph outline extraction, browser operation.

**Future work**

1. Renderer-facing glyph paths and a deterministic text-run → draw-call contract.
2. Full UAX #9 bidi (embedding levels, isolates, mirroring) if nested RTL/LTR mixing is required.
3. Complete UAX #14 tables (or a maintained dependency) plus hyphenation dictionaries.
4. Web build: abstract `node:fs`/`node:zlib` so the same engine runs on font bytes fetched in a
   browser or worker.
5. Variable-font axis selection and colour-font support if the design system needs them.

**Recommended next task:** Phase 3 continuation — the layout/geometry engine that consumes
`TextLayoutResult` (line boxes, baselines, `visualRunOrder`) and composes it with the existing
`SceneNode`/`CompositionPlan` model, including text-node constraints derived from geometry (already
wired in `layoutSceneText`) and a deterministic outline/draw-call contract for the renderer.
