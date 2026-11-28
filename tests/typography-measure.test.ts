/**
 * Measurement: every length comes from HarfBuzz glyph advances, never from a
 * character count or an average character width.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TYPOGRAPHY, closeTo, codes, createTestEngine, has } from './fixtures/fonts.ts';

const engine = await createTestEngine();

function measure(text: string, extra: Record<string, unknown> = {}) {
  return engine.measureText({ text, typography: TYPOGRAPHY.latin, ...extra });
}

function shapedWidth(text: string, typography = TYPOGRAPHY.latin) {
  return engine.shapeText({ text, typography }).width;
}

describe('advance-based measurement', () => {
  it('reports the shaped advance, not a character count', () => {
    const result = measure('Hello world');
    assert.equal(result.ok, true);
    assert.equal(result.method, 'harfbuzz-shaping');
    assert.ok(closeTo(result.width, shapedWidth('Hello world'), 1e-9));
    // A character-count heuristic would produce a multiple of 11 here.
    assert.ok(result.width > 0);
    assert.notEqual(result.width % 11, 0);
  });

  it('is additive across a prefix of unkerned digits', () => {
    const whole = measure('123');
    const prefix = measure('12');
    const last = measure('3');
    assert.ok(closeTo(whole.width, prefix.width + last.width, 1e-9));
  });

  it('measures per script with the script font, not one global average', () => {
    const latin = measure('aaaa');
    const bengali = engine.measureText({ text: 'বাংলা', typography: TYPOGRAPHY.bengali, language: 'bn' });
    assert.equal(latin.runs[0]?.font.family, 'Noto Sans');
    assert.equal(bengali.runs[0]?.font.family, 'Noto Sans Bengali');
    assert.ok(closeTo(bengali.width, shapedWidth('বাংলা', TYPOGRAPHY.bengali), 1e-9));
  });

  it('counts glyphs after shaping, including substituted conjuncts', () => {
    const latin = measure('abc');
    assert.equal(latin.glyphCount, 3);
    const bengali = engine.measureText({ text: 'ক্ষ', typography: TYPOGRAPHY.bengali, language: 'bn' });
    assert.equal(bengali.glyphCount, 1, 'three code units shape to one glyph');
    assert.equal(bengali.width, shapedWidth('ক্ষ', TYPOGRAPHY.bengali));
  });
});

describe('spacing controls', () => {
  it('adds letterSpacing per grapheme cluster, not per code unit', () => {
    const base = measure('abc').width;
    assert.ok(closeTo(measure('abc', { typography: { ...TYPOGRAPHY.latin, letterSpacing: 10 } }).width, base + 30, 1e-9));
    assert.ok(closeTo(measure('abc', { typography: { ...TYPOGRAPHY.latin, letterSpacing: -2 } }).width, base - 6, 1e-9));
    // Two Bengali graphemes (`বাং`, `লা`), five code units.
    const bengaliBase = measure('বাংলা', { typography: TYPOGRAPHY.bengali, language: 'bn' }).width;
    const spaced = measure('বাংলা', { typography: { ...TYPOGRAPHY.bengali, letterSpacing: 10 }, language: 'bn' }).width;
    assert.ok(closeTo(spaced, bengaliBase + 20, 1e-9));
    // `a` + combining acute is one grapheme, so one extra letter-space.
    const combiningBase = measure('a\u0301b').width;
    const combiningSpaced = measure('a\u0301b', { typography: { ...TYPOGRAPHY.latin, letterSpacing: 10 } }).width;
    assert.ok(closeTo(combiningSpaced, combiningBase + 20, 1e-9));
  });

  it('adds wordSpacing per space grapheme', () => {
    const base = measure('a b c').width;
    const spaced = measure('a b c', { wordSpacing: 5 }).width;
    assert.ok(closeTo(spaced, base + 10, 1e-9));
    assert.equal(measure('abc', { wordSpacing: 5 }).width, measure('abc').width);
    assert.equal(measure('a b c', { wordSpacing: 5 }).typography.wordSpacing, 5);
  });

  it('keeps edge whitespace out of the measured line width, but leading content spaces count', () => {
    const base = measure('ab').width;
    assert.ok(closeTo(measure('ab ').width, base, 1e-9), 'trailing space collapses at the line end');
    assert.ok(measure(' ab').width > base, 'leading space is content and is measured');
  });
});

describe('vertical metrics and baselines', () => {
  it('derives ascent, descent and baseline from the font', () => {
    const result = measure('Hg');
    assert.ok(closeTo(result.ascent, 42.76, 1e-9));
    assert.ok(closeTo(result.descent, -11.72, 1e-9));
    // Centred in a 1.5em line box: (60 - (42.76 + 11.72)) / 2 + 42.76.
    assert.ok(closeTo(result.baseline, 45.52, 1e-9));
    assert.ok(closeTo(result.lines[0]?.baseline ?? -1, result.baseline, 1e-9));
  });

  it('uses the line height for box height and keeps one baseline per line', () => {
    const tight = measure('a', { typography: { ...TYPOGRAPHY.latin, lineHeight: 1.2 } });
    assert.ok(closeTo(tight.height, 48, 1e-9));
    const two = measure('a\nb', { typography: { ...TYPOGRAPHY.latin, lineHeight: 1.2 } });
    assert.ok(closeTo(two.height, 96, 1e-9));
    assert.equal(two.lineCount, 2);
    // Negative half-leading: the 48 box is smaller than ascent+descent (54.48),
    // so the baseline sits at 42.76 - 3.24.
    assert.ok(closeTo(two.lines[0]?.baseline ?? -1, 39.52, 1e-9));
    assert.ok(closeTo(two.lines[1]?.baseline ?? -1, 39.52, 1e-9));
    assert.ok(has(two.diagnostics, 'TEXT_LINE_HEIGHT_BELOW_METRICS'), 'a cramped line box is reported');
  });

  it('reports the tallest line box for a tall script', () => {
    const arabic = engine.measureText({ text: 'العربية', typography: TYPOGRAPHY.arabic, language: 'ar' });
    assert.ok(closeTo(arabic.ascent, 54.96, 1e-9));
    assert.ok(closeTo(arabic.descent, -29.52, 1e-9));
    assert.ok(closeTo(arabic.height, 88, 1e-9), '2.2 × 40');
    const nastaliq = engine.measureText({ text: 'اردو', typography: TYPOGRAPHY.urdu, language: 'ur' });
    assert.ok(nastaliq.height > nastaliq.width / 2, 'Nastaliq line boxes are tall');
  });
});

describe('multi-line measurement', () => {
  it('measures explicit newlines as separate lines', () => {
    const result = measure('Hello\nWorld!');
    assert.equal(result.lineCount, 2);
    assert.equal(result.lines[0]?.text, 'Hello');
    assert.equal(result.lines[1]?.text, 'World!');
    assert.equal(result.lines[0]?.startIndex, 0);
    assert.equal(result.lines[1]?.startIndex, 6, 'the newline is not part of either line');
    assert.ok(closeTo(result.width, Math.max(...result.lines.map((line) => line.width)), 1e-9));
    assert.ok(closeTo(result.height, 120, 1e-9));
  });

  it('keeps empty paragraphs as empty lines', () => {
    const result = measure('a\n\nb');
    assert.equal(result.lineCount, 3);
    assert.deepEqual(result.lines.map((line) => line.text), ['a', '', 'b']);
    assert.equal(result.glyphCount, 2);
  });

  it('sums glyphs across lines', () => {
    const result = measure('ab\ncde');
    assert.equal(result.glyphCount, 5);
    const perLine = result.lines.reduce((total, line) => total + line.graphemeCount, 0);
    assert.equal(perLine, 5);
  });
});

describe('units, determinism and robustness', () => {
  it('echoes the requested canvas unit', () => {
    const result = measure('abc', { unit: 'cm' });
    assert.equal(result.unit, 'cm');
    assert.ok(closeTo(result.width, measure('abc').width, 1e-9), 'units are a label; sizes are already in that unit');
  });

  it('rejects an unsupported unit instead of mislabelling lengths', () => {
    const result = measure('abc', { unit: '%' });
    assert.equal(result.ok, false);
    assert.ok(has(result.diagnostics, 'TYPOGRAPHY_CONFIG_INVALID'));
  });

  it('is deterministic and driven by the shaping cache', () => {
    const first = measure('Deterministic measurement');
    const second = measure('Deterministic measurement');
    assert.equal(first.width, second.width);
    assert.equal(first.lineCount, second.lineCount);
    assert.deepEqual(
      first.lines.map((line) => [line.width, line.baseline]),
      second.lines.map((line) => [line.width, line.baseline]),
    );
    assert.ok(engine.cacheStats().shapingHits > 0);
  });

  it('never throws on empty, whitespace-only or invalid input', () => {
    const empty = measure('');
    assert.equal(empty.ok, true);
    assert.equal(empty.width, 0);
    assert.equal(empty.lineCount, 0);
    assert.ok(has(empty.diagnostics, 'TEXT_CONTENT_EMPTY'));

    const spaces = measure('   ');
    assert.equal(spaces.ok, true);
    assert.equal(spaces.width, 0, 'whitespace-only lines have no visible width');
    assert.equal(spaces.lineCount, 1);
    assert.equal(spaces.lines[0]?.text, '');
    assert.equal(spaces.lines[0]?.graphemeCount, 0);

    const invalid = measure('abc', { typography: { ...TYPOGRAPHY.latin, fontSize: -4 } });
    assert.equal(invalid.ok, false);
    assert.ok(has(invalid.diagnostics, 'FONT_SIZE_INVALID'));
    assert.deepEqual(invalid.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').map((diagnostic) => diagnostic.code), ['FONT_SIZE_INVALID']);
  });

  it('reports consistent totals with the layout engine', () => {
    const text = 'বাংলা and English 2024';
    const layout = engine.layoutText({ text, typography: TYPOGRAPHY.bengali, language: 'bn' });
    const measured = engine.measureText({ text, typography: TYPOGRAPHY.bengali, language: 'bn' });
    assert.equal(measured.width, layout.width);
    assert.equal(measured.height, layout.height);
    assert.equal(measured.lineCount, layout.lineCount);
    assert.equal(measured.baseline, layout.lines[0]?.baseline);
    assert.equal(measured.glyphCount, layout.runs.reduce((total, run) => total + run.glyphs.length, 0));
    assert.deepEqual(codes(measured.diagnostics), codes(layout.diagnostics));
  });
});
