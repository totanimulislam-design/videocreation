/**
 * Shaping: real OpenType substitution and positioning for the documented scripts.
 *
 * Assertions use glyph ids, cluster indices and glyph counts from the fixture
 * fonts, so a regression in shaping cannot pass by returning "something".
 * Reference values were taken from HarfBuzz itself (`harfbuzzjs` v1.6.4) and are
 * pinned by the fixture font digests recorded in `docs/TYPOGRAPHY.md`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TYPOGRAPHY, codes, closeTo, createTestEngine, has } from './fixtures/fonts.ts';

const engine = await createTestEngine();

function shape(text: string, typography = TYPOGRAPHY.latin, language?: string) {
  return engine.shapeText({ text, typography, ...(language === undefined ? {} : { language }) });
}

describe('Latin shaping', () => {
  it('shapes one glyph per base character', () => {
    const result = shape('Hello');
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.script, 'latin');
    assert.equal(run.direction, 'ltr');
    assert.equal(run.glyphs.length, 5);
    assert.deepEqual(run.glyphs.map((glyph) => glyph.cluster), [0, 1, 2, 3, 4]);
    assert.deepEqual(run.glyphs.map((glyph) => glyph.glyphId), [43, 72, 79, 79, 82]);
    assert.ok(run.glyphs.every((glyph) => glyph.xAdvance > 0));
  });

  it('applies the standard fi ligature and can be asked not to', () => {
    const ligature = shape('fi');
    assert.equal(ligature.runs[0]?.glyphs.length, 1);
    assert.equal(ligature.runs[0]?.glyphs[0]?.glyphId, 1654);
    assert.equal(ligature.runs[0]?.glyphs[0]?.cluster, 0);

    const disabled = engine.shapeText({ text: 'fi', typography: TYPOGRAPHY.latin, features: ['-liga'] });
    assert.equal(disabled.runs[0]?.glyphs.length, 2);
    assert.deepEqual(disabled.runs[0]?.glyphs.map((glyph) => glyph.glyphId), [73, 76]);
    assert.deepEqual(disabled.runs[0]?.glyphs.map((glyph) => glyph.cluster), [0, 1]);
  });

  it('reports the shaped width as the sum of glyph advances', () => {
    const result = shape('Shaped text');
    const run = result.runs[0];
    assert.ok(run);
    const summed = run.glyphs.reduce((total, glyph) => total + glyph.xAdvance, 0);
    assert.ok(closeTo(run.width, summed, 1e-9));
    assert.ok(closeTo(result.width, run.width, 1e-9));
  });

  it('scales advances linearly with the font size', () => {
    const small = engine.shapeText({ text: 'Hamburg', typography: { ...TYPOGRAPHY.latin, fontSize: 20 } });
    const large = engine.shapeText({ text: 'Hamburg', typography: { ...TYPOGRAPHY.latin, fontSize: 40 } });
    assert.ok(closeTo(large.width / small.width, 2, 1e-9));
    assert.deepEqual(large.runs[0]?.glyphs.map((glyph) => glyph.glyphId), small.runs[0]?.glyphs.map((glyph) => glyph.glyphId));
  });

  it('reports ascent and descent from the font metrics at the chosen size', () => {
    const result = shape('Hg', { ...TYPOGRAPHY.latin, fontSize: 40 });
    const run = result.runs[0];
    assert.ok(run);
    // Noto Sans: ascender 1069, descender -293, upem 1000 → 42.76 / -11.72 at 40.
    assert.ok(closeTo(run.ascent, 42.76, 1e-9));
    assert.ok(closeTo(run.descent, -11.72, 1e-9));
    assert.ok(closeTo(result.height, 54.48, 1e-9));
  });
});

describe('Bengali shaping', () => {
  it('forms the ক্ষ conjunct as a single glyph', () => {
    const result = shape('ক্ষ', TYPOGRAPHY.bengali, 'bn');
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.script, 'bengali');
    assert.equal(run.text.length, 3, 'three code units of input');
    assert.equal(run.glyphs.length, 1, 'one conjunct glyph');
    assert.equal(run.glyphs[0]?.glyphId, 135);
    assert.equal(run.glyphs[0]?.cluster, 0);
  });

  it('keeps kar, anusvara and base letters in shaped clusters', () => {
    const result = shape('বাংলা', TYPOGRAPHY.bengali, 'bn');
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.text.length, 5);
    assert.equal(run.glyphs.length, 5);
    assert.deepEqual(run.glyphs.map((glyph) => glyph.cluster), [0, 0, 0, 3, 3]);
  });

  it('substitutes ra-phala and positions a zero-advance mark', () => {
    const result = shape('প্রেম', TYPOGRAPHY.bengali, 'bn');
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.text.length, 5);
    assert.equal(run.glyphs.length, 4, 'reph/phala substitution reduces the glyph count');
    const marks = run.glyphs.filter((glyph) => glyph.xAdvance === 0);
    assert.ok(marks.length >= 1, 'a combining mark has zero advance');
    assert.ok(run.glyphs.some((glyph) => glyph.xOffset !== 0 || glyph.yOffset !== 0), 'mark positioning applied');
  });

  it('applies reph in রূপ', () => {
    const result = shape('রূপ', TYPOGRAPHY.bengali, 'bn');
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.glyphs.length, 3);
    assert.deepEqual(run.glyphs.map((glyph) => glyph.cluster), [0, 0, 2]);
    assert.ok(run.glyphs[0]?.glyphId !== run.glyphs[1]?.glyphId);
  });

  it('shapes Bengali numerals without fallback', () => {
    const result = shape('১২৩', TYPOGRAPHY.bengali, 'bn');
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.glyphs.length, 3);
    assert.equal(run.font.family, 'Noto Sans Bengali');
    assert.equal(run.missingGlyphs, 0);
    assert.ok(result.diagnostics.length === 0, `unexpected diagnostics: ${codes(result.diagnostics)}`);
  });

  it('uses Bengali punctuation (danda) as ordinary text', () => {
    const result = shape('বাংলা।', TYPOGRAPHY.bengali, 'bn');
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.missingGlyphs, 0);
    assert.equal(run.glyphs.length, 6);
  });
});

describe('Arabic shaping', () => {
  it('applies contextual joining and mark positioning in RTL', () => {
    const result = shape('العربية', TYPOGRAPHY.arabic, 'ar');
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.direction, 'rtl');
    assert.equal(result.direction, 'rtl');
    assert.equal(run.text.length, 7);
    assert.equal(run.glyphs.length, 10, 'contextual forms and marks add glyphs');
    // HarfBuzz returns visual order for RTL: clusters descend.
    const clusters = run.glyphs.map((glyph) => glyph.cluster);
    assert.ok(clusters[0]! > clusters[clusters.length - 1]!);
    assert.deepEqual(clusters, [...clusters].sort((a, b) => b - a));
    assert.ok(run.glyphs.some((glyph) => glyph.xAdvance === 0), 'marks carry no advance');
    assert.ok(run.glyphs.some((glyph) => glyph.yOffset !== 0), 'marks are positioned');
  });

  it('selects different contextual forms for the same base letter', () => {
    const result = shape('ببب', TYPOGRAPHY.arabic, 'ar');
    const run = result.runs[0];
    assert.ok(run);
    // Noto Sans Arabic draws the beh dot as a separate zero-advance mark glyph,
    // so three letters produce six glyphs: three bases and three dots.
    assert.equal(run.glyphs.length, 6);
    const bases = run.glyphs.filter((glyph) => glyph.xAdvance > 0).map((glyph) => glyph.glyphId);
    assert.equal(bases.length, 3);
    assert.equal(new Set(bases).size, 3, 'initial, medial and final forms are different glyphs');
    const dots = run.glyphs.filter((glyph) => glyph.xAdvance === 0);
    assert.equal(dots.length, 3);
    assert.ok(dots.every((glyph) => glyph.yOffset !== 0), 'dots are positioned by GPOS');
  });

  it('attaches diacritics to their base letter', () => {
    const result = shape('مُحَمَّد', TYPOGRAPHY.arabic, 'ar');
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.text.length, 8);
    assert.equal(run.glyphs.length, 8);
    const zeroAdvance = run.glyphs.filter((glyph) => glyph.xAdvance === 0);
    assert.ok(zeroAdvance.length >= 3, 'diacritics have zero advance');
    assert.ok(zeroAdvance.every((glyph) => glyph.yOffset !== 0), 'diacritics are positioned above/below the base');
  });

  it('shapes Arabic-Indic numerals', () => {
    const result = shape('١٢٣', TYPOGRAPHY.arabic, 'ar');
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.glyphs.length, 3);
    assert.equal(run.missingGlyphs, 0);
    assert.equal(run.direction, 'rtl');
  });
});

describe('Urdu shaping', () => {
  it('shapes Urdu with a Nastaliq face', () => {
    const result = shape('اردو', TYPOGRAPHY.urdu, 'ur');
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.script, 'urdu');
    assert.equal(run.direction, 'rtl');
    assert.equal(run.font.family, 'Noto Nastaliq Urdu');
    assert.equal(run.glyphs.length, 4);
    assert.equal(run.missingGlyphs, 0);
    assert.ok(!has(result.diagnostics, 'TEXT_URDU_NASTALIQ_UNAVAILABLE'));
  });

  it('warns when Urdu is shaped by a non-Nastaliq face', () => {
    const layout = engine.layoutText({ text: 'اردو زبان', typography: TYPOGRAPHY.arabic, language: 'ur' });
    assert.ok(has(layout.diagnostics, 'TEXT_URDU_NASTALIQ_UNAVAILABLE'));
    assert.equal(layout.runs[0]?.font.family, 'Noto Sans Arabic');
  });

  it('shapes Urdu-specific letters that a Latin face cannot map', () => {
    const result = shape('ٹھیک ہے', TYPOGRAPHY.urdu, 'ur');
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.missingGlyphs, 0);
  });
});

describe('mixed scripts and bidirectional text', () => {
  it('splits mixed Bengali/Latin text into runs with different fonts', () => {
    const result = shape('বাংলা and English', TYPOGRAPHY.bengali, 'bn');
    assert.equal(result.runs.length, 2);
    const [first, second] = result.runs;
    assert.ok(first && second);
    assert.equal(first.script, 'bengali');
    assert.equal(first.font.family, 'Noto Sans Bengali');
    assert.equal(second.script, 'latin');
    assert.equal(second.font.family, 'Noto Sans');
    // Clusters are absolute indices into the original string.
    assert.equal(first.glyphs[0]?.cluster, 0);
    assert.equal(second.glyphs[0]?.cluster, 6);
    assert.equal(first.text, 'বাংলা ');
    assert.equal(second.text, 'and English');
    assert.ok(has(result.diagnostics, 'FONT_FALLBACK_APPLIED'));
  });

  it('keeps Bengali numerals and Latin digits with the right font', () => {
    const result = shape('বাংলা ২০২৪ and 2024', TYPOGRAPHY.bengali, 'bn');
    const bengali = result.runs[0];
    const latin = result.runs[1];
    assert.ok(bengali && latin);
    assert.equal(bengali.font.family, 'Noto Sans Bengali');
    assert.equal(latin.font.family, 'Noto Sans');
    assert.equal(bengali.missingGlyphs, 0);
    assert.equal(latin.missingGlyphs, 0);
    assert.equal(bengali.text.includes('২০২৪'), true, 'Bengali digits stay with the Bengali run');
    assert.equal(latin.text.includes('2024'), true, 'ASCII digits go to the Latin run');
    assert.equal(result.runs.length, 2);
  });

  it('borrows a neighbouring Latin face for punctuation the Bengali face lacks', () => {
    const text = 'বাংলা, English! (2024)';
    const result = shape(text, TYPOGRAPHY.bengali, 'bn');
    // Noto Sans Bengali maps no comma/parenthesis, so that neutral piece is
    // shaped by the Latin face instead of an unrelated registry face.
    assert.equal(result.runs.map((run) => run.text).join(''), text);
    assert.ok(result.runs.every((run) => run.missingGlyphs === 0));
    assert.ok(
      result.runs.every((run) => run.font.family !== 'Noto Sans Arabic' && run.font.family !== 'Noto Nastaliq Urdu'),
      'punctuation is never drawn by an unrelated Arabic/Nastaliq face',
    );
    const punctuation = result.runs.find((run) => run.text.includes(','));
    assert.ok(punctuation);
    assert.equal(punctuation?.font.family, 'Noto Sans');
    assert.equal(punctuation?.resolution.status, 'fallback');
    assert.equal(punctuation?.resolution.resolved?.family, punctuation?.font.family);
    assert.equal(result.runs.at(-1)?.font.family, 'Noto Sans');
  });

  it('uses the nearest strong neighbour for punctuation between scripts', () => {
    const result = shape('বাংলা, English', TYPOGRAPHY.bengali, 'bn');
    assert.equal(result.runs.length, 3);
    assert.deepEqual(result.runs.map((run) => run.font.family), ['Noto Sans Bengali', 'Noto Sans', 'Noto Sans']);
    assert.equal(result.runs[1]?.text, ', ');
  });

  it('falls back to a Latin-capable face for ASCII digits inside Bengali text', () => {
    const result = shape('বাংলা 2024', TYPOGRAPHY.bengali, 'bn');
    assert.deepEqual(result.runs.map((run) => run.font.family), ['Noto Sans Bengali', 'Noto Sans']);
    assert.equal(result.runs[1]?.text, '2024');
    assert.equal(result.runs[1]?.missingGlyphs, 0);
  });

  it('preserves each run slice of the source string exactly', () => {
    const text = 'বাংলা and English العربية';
    const result = shape(text, TYPOGRAPHY.bengali, 'bn');
    for (const run of result.runs) {
      assert.equal(run.text, text.slice(run.startIndex, run.endIndex));
    }
    assert.deepEqual(
      result.runs.map((run) => run.script),
      ['bengali', 'latin', 'arabic'],
    );
  });

  it('detects mixed writing directions and says the bidi model is approximate', () => {
    const layout = engine.layoutText({ text: 'English العربية', typography: TYPOGRAPHY.latin, language: 'en' });
    assert.equal(layout.baseDirection, 'ltr');
    assert.deepEqual(
      layout.runs.map((run) => run.direction),
      ['ltr', 'rtl'],
    );
    assert.ok(has(layout.diagnostics, 'TEXT_BIDI_APPROXIMATED'));
  });

  it('honours an explicit RTL base direction for ordering without reversing text', () => {
    const layout = engine.layoutText({
      text: 'مرحبا Hello',
      typography: TYPOGRAPHY.arabic,
      language: 'ar',
      direction: 'rtl',
    });
    assert.equal(layout.baseDirection, 'rtl');
    const line = layout.lines[0];
    assert.ok(line);
    assert.equal(line.text, 'مرحبا Hello', 'text is never reversed');
    assert.equal(line.runs.length, 2);
    assert.deepEqual(line.visualRunOrder, [1, 0], 'runs are ordered visually for an RTL base');
  });

  it('classifies scripts outside the support matrix as `other`', () => {
    const result = layoutOf('नमस्ते');
    assert.equal(result.runs[0]?.script, 'other');
    assert.ok(has(result.diagnostics, 'SHAPING_SCRIPT_UNSUPPORTED'));
  });

  function layoutOf(text: string) {
    return engine.layoutText({ text, typography: TYPOGRAPHY.latin });
  }
});

describe('shaping robustness and provenance', () => {
  it('marks missing glyphs instead of silently dropping them', () => {
    const result = engine.layoutText({ text: 'नमस्ते', typography: TYPOGRAPHY.latin });
    const run = result.runs[0];
    assert.ok(run);
    assert.equal(run.missingGlyphs, 6);
    assert.ok(run.glyphs.every((glyph) => glyph.glyphId === 0 && glyph.missing));
    assert.equal(result.overflow.missingGlyphs, 6);
    assert.ok(has(result.diagnostics, 'GLYPH_MISSING'));
    assert.equal(result.ok, true, 'missing glyphs are a warning, not a schema error');
  });

  it('is deterministic for repeated identical shaping', () => {
    const first = shape('বাংলা ভাষা', TYPOGRAPHY.bengali, 'bn');
    const second = shape('বাংলা ভাষা', TYPOGRAPHY.bengali, 'bn');
    assert.deepEqual(
      first.runs.map((run) => run.glyphs.map((glyph) => [glyph.glyphId, glyph.cluster, glyph.xAdvance])),
      second.runs.map((run) => run.glyphs.map((glyph) => [glyph.glyphId, glyph.cluster, glyph.xAdvance])),
    );
  });

  it('records the shaping provenance on every result', () => {
    const result = shape('provenance');
    assert.equal(result.method, 'harfbuzz-shaping');
    assert.equal(result.ok, true);
    assert.equal(result.unit, 'px');
    assert.equal(result.fontSize, TYPOGRAPHY.latin.fontSize);
  });

  it('reports invalid typography without throwing', () => {
    const result = engine.shapeText({
      text: 'Hello',
      typography: { ...TYPOGRAPHY.latin, fontSize: 0 },
    });
    assert.equal(result.ok, false);
    assert.ok(has(result.diagnostics, 'FONT_SIZE_INVALID'));
    assert.deepEqual(result.runs, []);
  });

  it('carries the requested OpenType language tag into the run', () => {
    const result = shape('বাংলা', TYPOGRAPHY.bengali, 'bn');
    assert.equal(result.runs[0]?.language, 'bn');
  });

  it('reports scripts on the result', () => {
    const result = shape('বাংলা and English', TYPOGRAPHY.bengali, 'bn');
    assert.deepEqual([...result.scripts].sort(), ['bengali', 'latin']);
  });
});
