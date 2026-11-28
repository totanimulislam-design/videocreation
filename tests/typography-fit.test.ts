/**
 * Fitting: a bisection search over real layouts, bounded by `minFontSize`.
 *
 * The tests check the properties that make the result trustworthy: every
 * returned size was measured by laying the text out at that size, the result is
 * monotone in the available width, and a failure is reported with evidence
 * instead of silently producing unreadable text.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TYPOGRAPHY, closeTo, codes, createTestEngine, has } from './fixtures/fonts.ts';

const engine = await createTestEngine();

const WORD = 'measurement';

function fit(width: number, extra: Record<string, unknown> = {}) {
  return engine.fitText({ text: WORD, typography: TYPOGRAPHY.latin, minFontSize: 8, maxWidth: width, ...extra });
}

describe('fitting policies', () => {
  it('keeps the requested size when the text fits', () => {
    const result = engine.fitText({ text: 'alpha', typography: TYPOGRAPHY.latin, minFontSize: 8, maxWidth: 400 });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'fits');
    assert.equal(result.selectedFontSize, 40);
    assert.equal(result.requestedFontSize, 40);
    assert.equal(result.attempts, 1, 'the first evaluation already fits');
    assert.equal(result.layout?.typography.fontSize, 40);
    assert.equal(result.diagnostics.length, 0);
  });

  it('shrinks to the largest measured size that fits', () => {
    const result = fit(260);
    assert.equal(result.ok, true);
    assert.equal(result.status, 'shrunk');
    assert.ok(result.selectedFontSize < 40);
    assert.ok(result.selectedFontSize > 8);
    assert.ok(result.width <= 260 + 1e-6, `width ${result.width} must fit 260`);
    assert.equal(result.layout?.typography.fontSize, result.selectedFontSize, 'the layout is the one measured at the returned size');
    assert.equal(result.lineCount, 1);
    assert.ok(has(result.diagnostics, 'TEXT_FIT_REDUCED'));
    assert.equal(result.diagnostics.find((diagnostic) => diagnostic.code === 'TEXT_FIT_REDUCED')?.severity, 'warning');
  });

  it('is monotone: a narrower box never selects a larger size', () => {
    const sizes = [260, 200, 160, 120].map((width) => fit(width));
    for (const result of sizes) {
      assert.equal(result.status, 'shrunk');
      assert.ok(result.width <= result.availableWidth + 1e-6);
    }
    for (let index = 1; index < sizes.length; index += 1) {
      assert.ok(
        (sizes[index]?.selectedFontSize ?? 0) < (sizes[index - 1]?.selectedFontSize ?? 0),
        `width ${sizes[index]?.availableWidth} must select a smaller size than ${sizes[index - 1]?.availableWidth}`,
      );
    }
    assert.ok(closeTo(sizes[3]?.selectedFontSize ?? 0, 18.203, 1e-3), 'bisection tolerance is far below a design unit');
  });

  it('reports cannot-fit at the minimum size with evidence', () => {
    const result = fit(20, { minFontSize: 10 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'cannot-fit');
    assert.equal(result.selectedFontSize, 10);
    assert.equal(result.overflow.horizontal, true);
    assert.equal(result.overflow.unbreakable, true);
    assert.ok(has(result.diagnostics, 'TEXT_FIT_FAILED'));
    assert.equal(result.diagnostics.find((diagnostic) => diagnostic.code === 'TEXT_FIT_FAILED')?.severity, 'error');
    assert.equal(result.layout?.typography.fontSize, 10);
    assert.ok(result.attempts <= 40);
  });

  it('clips at the requested size without pretending it fits', () => {
    const result = fit(20, { overflowPolicy: 'clip' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'cannot-fit');
    assert.equal(result.selectedFontSize, 40, 'clipping keeps the requested size');
    assert.equal(result.layout?.typography.fontSize, 40);
    assert.equal(result.attempts, 1);
    assert.equal(result.overflow.horizontal, true);
    assert.ok(!has(result.diagnostics, 'TEXT_FIT_FAILED'), 'clip is an explicit choice, not a fit failure');
  });

  it('fails at the requested size when shrinking is disabled', () => {
    const result = fit(20, { overflowPolicy: 'fail' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'cannot-fit');
    assert.equal(result.selectedFontSize, 40);
    assert.equal(result.layout?.typography.fontSize, 40);
    assert.ok(has(result.diagnostics, 'TEXT_FIT_FAILED'));
  });

  it('treats a lowered maxFontSize as an intentional cap', () => {
    const result = fit(400, { maxFontSize: 20 });
    assert.equal(result.status, 'shrunk');
    assert.equal(result.selectedFontSize, 20);
    assert.equal(result.maxFontSize, 20);
    assert.equal(result.diagnostics.length, 0, 'the cap is not a reduction warning');
  });
});

describe('height and line-count constraints', () => {
  const text = 'alpha beta gamma delta';

  it('shrinks until the block height fits', () => {
    const result = engine.fitText({ text, typography: TYPOGRAPHY.latin, minFontSize: 8, maxWidth: 300, maxHeight: 100 });
    assert.equal(result.status, 'shrunk');
    assert.equal(result.lineCount, 2);
    assert.ok(result.height <= 100 + 1e-6);
    assert.ok(closeTo(result.height, 100, 1e-2), 'the search lands on the bounded height');
  });

  it('shrinks until the line budget fits', () => {
    const result = engine.fitText({ text, typography: TYPOGRAPHY.latin, minFontSize: 8, maxWidth: 300, maxLines: 1 });
    assert.equal(result.status, 'shrunk');
    assert.equal(result.lineCount, 1);
    assert.equal(result.maxLines, 1);
    assert.ok(result.layout && !result.layout.overflow.lineCountExceeded);
  });

  it('does not shrink when the constraints are already satisfied', () => {
    const result = engine.fitText({ text, typography: TYPOGRAPHY.latin, minFontSize: 8, maxWidth: 300, maxLines: 2 });
    assert.equal(result.status, 'fits');
    assert.equal(result.selectedFontSize, 40);
    assert.equal(result.lineCount, 2);
  });
});

describe('multilingual fitting', () => {
  it('fits Bengali text using Bengali advances', () => {
    const result = engine.fitText({
      text: 'বাংলা ভাষা সুন্দর',
      typography: TYPOGRAPHY.bengali,
      language: 'bn',
      minFontSize: 12,
      maxWidth: 200,
    });
    assert.equal(result.status, 'fits');
    assert.equal(result.layout?.runs[0]?.font.family, 'Noto Sans Bengali');
    assert.ok(result.width <= 200);
  });

  it('fits RTL Arabic text without reordering it', () => {
    const result = engine.fitText({
      text: 'العربية لغة جميلة',
      typography: TYPOGRAPHY.arabic,
      language: 'ar',
      minFontSize: 12,
      maxWidth: 200,
    });
    assert.equal(result.status, 'fits');
    assert.equal(result.layout?.baseDirection, 'rtl');
    assert.ok(result.width <= 200);
    const lines = result.layout?.lines.map((line) => line.text) ?? [];
    assert.ok(lines.length >= 1);
    assert.equal(lines.join(' '), 'العربية لغة جميلة', 'lines are slices of the source, never reordered');
  });

  it('warns when Urdu is fitted with a non-Nastaliq face', () => {
    const result = engine.fitText({
      text: 'اردو زبان',
      typography: TYPOGRAPHY.arabic,
      language: 'ur',
      minFontSize: 8,
      maxWidth: 300,
    });
    assert.equal(result.ok, true);
    assert.ok(has(result.diagnostics, 'TEXT_URDU_NASTALIQ_UNAVAILABLE'));
  });
});

describe('invalid requests never throw', () => {
  it('rejects an empty size interval', () => {
    const result = fit(200, { minFontSize: 40, maxFontSize: 20 });
    assert.equal(result.status, 'invalid');
    assert.equal(result.ok, false);
    assert.equal(result.layout, undefined);
    assert.ok(has(result.diagnostics, 'TEXT_FIT_FAILED'));
  });

  it('rejects an unknown policy', () => {
    const result = fit(200, { overflowPolicy: 'squish' });
    assert.equal(result.status, 'invalid');
    assert.equal(result.attempts, 0);
    assert.ok(has(result.diagnostics, 'TEXT_FIT_FAILED'));
  });

  it('rejects a non-positive width', () => {
    const result = fit(0);
    assert.equal(result.status, 'invalid');
    assert.equal(result.ok, false);
  });

  it('rejects out-of-range minimum sizes', () => {
    const result = fit(200, { minFontSize: 0.0001 });
    assert.equal(result.status, 'invalid');
    assert.ok(has(result.diagnostics, 'TEXT_FIT_FAILED'));
  });

  it('propagates an invalid typography token', () => {
    const result = engine.fitText({
      text: 'alpha',
      typography: { ...TYPOGRAPHY.latin, fontFamily: '' },
      minFontSize: 8,
      maxWidth: 200,
    });
    assert.equal(result.status, 'invalid');
    assert.ok(has(result.diagnostics, 'FONT_FAMILY_EMPTY'));
  });
});

describe('determinism', () => {
  it('returns identical results for identical requests', () => {
    const first = fit(200);
    const second = fit(200);
    assert.equal(first.selectedFontSize, second.selectedFontSize);
    assert.equal(first.width, second.width);
    assert.equal(first.attempts, second.attempts);
    assert.deepEqual(codes(first.diagnostics), codes(second.diagnostics));
  });

  it('never mutates the requested typography token', () => {
    const typography = { ...TYPOGRAPHY.latin };
    const before = JSON.stringify(typography);
    engine.fitText({ text: WORD, typography, minFontSize: 8, maxWidth: 150 });
    assert.equal(JSON.stringify(typography), before);
  });
});
