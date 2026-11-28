/**
 * Wrapping: Unicode break opportunities over shaped glyph advances.
 *
 * These tests deliberately pin the distinction between the default (`normal`,
 * words are never split and overflow is reported) and the opt-in emergency
 * modes, and they verify that a break never lands inside a grapheme cluster or a
 * shaping cluster (a Bengali conjunct).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TYPOGRAPHY, codes, createTestEngine, has } from './fixtures/fonts.ts';

const engine = await createTestEngine();

function wrap(text: string, maxWidth: number, extra: Record<string, unknown> = {}) {
  return engine.wrapText({ text, typography: TYPOGRAPHY.latin, maxWidth, ...extra });
}

describe('word wrapping', () => {
  it('breaks at word boundaries and never inside a word by default', () => {
    const result = wrap('alpha beta', 150);
    assert.deepEqual(result.lines.map((line) => line.text), ['alpha', 'beta']);
    assert.equal(result.lineCount, 2);
    assert.equal(result.overflow.horizontal, false, 'both words fit inside 150');
    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.lines[0]?.startIndex, 0);
    assert.equal(result.lines[1]?.startIndex, 6, 'the space between words is not part of a line');
  });

  it('keeps a whole word on one overflowing line instead of splitting it', () => {
    const result = wrap('alpha beta', 100);
    assert.deepEqual(result.lines.map((line) => line.text), ['alpha', 'beta']);
    assert.equal(result.overflow.horizontal, true);
    assert.equal(result.overflow.unbreakable, true);
    assert.ok(has(result.diagnostics, 'TEXT_OVERFLOW_HORIZONTAL'));
    assert.ok(has(result.diagnostics, 'TEXT_UNBREAKABLE_OVERFLOW'));
    assert.ok(result.lines.every((line) => line.emergencyBreak === false), 'no emergency break by default');
  });

  it('keeps digits and fractions unbroken under `normal`', () => {
    const fraction = wrap('a 1/2 b', 50);
    assert.deepEqual(fraction.lines.map((line) => line.text), ['a', '1/2', 'b']);
    const digits = wrap('123456789', 200);
    assert.equal(digits.lineCount, 1);
    assert.equal(digits.lines[0]?.text, '123456789');
    assert.equal(digits.overflow.unbreakable, true);
  });

  it('breaks after a Bengali danda', () => {
    const result = engine.wrapText({
      text: 'বাংলা। আমি ভালো আছি।',
      typography: TYPOGRAPHY.bengali,
      language: 'bn',
      maxWidth: 110,
    });
    assert.deepEqual(
      result.lines.map((line) => line.text),
      ['বাংলা।', 'আমি', 'ভালো', 'আছি।'],
    );
    assert.ok(result.lines.every((line) => line.width <= 110 || line.text.length > 0));
  });

  it('honours a zero-width space as a break opportunity', () => {
    const result = wrap('alpha\u200Bbeta', 110);
    assert.equal(result.lineCount, 2);
    assert.equal(result.lines[0]?.text, 'alpha\u200B');
    assert.equal(result.lines[1]?.text, 'beta');
    assert.equal(result.diagnostics.length, 0);
  });

  it('treats explicit newlines as hard line breaks', () => {
    const result = wrap('aa bb\ncc dd', 70);
    assert.deepEqual(result.lines.map((line) => line.text), ['aa', 'bb', 'cc', 'dd']);
    assert.equal(result.lines[2]?.paragraphIndex, 1);
    assert.equal(result.height, 4 * TYPOGRAPHY.latin.lineHeight * TYPOGRAPHY.latin.fontSize);
  });

  it('wraps a long English headline without overflow at a realistic width', () => {
    const headline =
      'Design systems that survive contact with real editorial content need measured type, honest fallbacks and visible overflow';
    const result = engine.wrapText({ text: headline, typography: { ...TYPOGRAPHY.latin, fontSize: 32, lineHeight: 1.6 }, maxWidth: 640 });
    assert.ok(result.lineCount > 2);
    assert.equal(result.overflow.horizontal, false);
    assert.equal(result.overflow.unbreakable, false);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.lines.map((line) => line.text).join(' '), headline);
  });

  it('honours letterSpacing when measuring candidate lines', () => {
    const result = wrap('alpha beta', 160, { typography: { ...TYPOGRAPHY.latin, letterSpacing: 10 } });
    assert.deepEqual(result.lines.map((line) => line.text), ['alpha', 'beta']);
    assert.ok((result.lines[0]?.width ?? 0) > 150);
  });
});

describe('emergency breaks', () => {
  it('splits an unbreakable word at grapheme boundaries when asked', () => {
    const result = wrap('alpha beta gamma delta', 100, { overflowWrap: 'break-word' });
    assert.deepEqual(
      result.lines.map((line) => line.text),
      ['alph', 'a', 'beta', 'gam', 'ma', 'delta'],
    );
    assert.ok(has(result.diagnostics, 'TEXT_EMERGENCY_BREAK'));
    assert.equal(result.lines[0]?.emergencyBreak, true);
    assert.equal(result.lines[2]?.emergencyBreak, false);
    assert.equal(result.overflow.horizontal, false);
  });

  it('never splits inside a grapheme cluster or a shaped conjunct', () => {
    const result = engine.wrapText({
      text: 'ক্ষক্ষ',
      typography: TYPOGRAPHY.bengali,
      language: 'bn',
      maxWidth: 40,
      overflowWrap: 'break-word',
    });
    assert.deepEqual(result.lines.map((line) => line.text), ['ক্ষ', 'ক্ষ']);
    assert.deepEqual(result.lines.map((line) => line.startIndex), [0, 3]);
    assert.equal(result.overflow.unbreakable, false);

    const combining = wrap('a\u0301a\u0301a\u0301', 30, { overflowWrap: 'break-word' });
    for (const line of combining.lines) {
      assert.equal(line.text, 'a\u0301', 'combining mark stays with its base');
    }
  });

  it('reports a single grapheme wider than the container as unbreakable', () => {
    const result = wrap('W', 10, { overflowWrap: 'break-word' });
    assert.equal(result.lineCount, 1);
    assert.equal(result.overflow.unbreakable, true);
    assert.ok(has(result.diagnostics, 'TEXT_OVERFLOW_HORIZONTAL'));
  });

  it('behaves the same for `anywhere`, which is kept as a distinct intent', () => {
    const breakWord = wrap('123456789', 60, { overflowWrap: 'break-word' });
    const anywhere = wrap('123456789', 60, { overflowWrap: 'anywhere' });
    assert.deepEqual(anywhere.lines.map((line) => line.text), breakWord.lines.map((line) => line.text));
    assert.deepEqual(anywhere.lines.map((line) => line.width), breakWord.lines.map((line) => line.width));
  });
});

describe('RTL and mixed-script wrapping', () => {
  it('wraps Arabic into RTL lines that are slices of the source', () => {
    const text = 'العربية لغة جميلة';
    const result = engine.wrapText({ text, typography: TYPOGRAPHY.arabic, language: 'ar', maxWidth: 120 });
    assert.deepEqual(result.lines.map((line) => line.text), ['العربية', 'لغة', 'جميلة']);
    for (const line of result.lines) {
      assert.equal(line.text, text.slice(line.startIndex, line.endIndex));
      assert.deepEqual(line.visualRunOrder, [0]);
      assert.equal(line.runs.length, 1);
    }
    assert.equal(result.diagnostics.length, 0);
  });

  it('slices mixed-script runs per line and reports matching widths', () => {
    const text = 'বাংলা and English words';
    const result = engine.wrapText({ text, typography: TYPOGRAPHY.bengali, language: 'bn', maxWidth: 150 });
    assert.deepEqual(result.lines.map((line) => line.text), ['বাংলা', 'and', 'English', 'words']);
    for (const line of result.lines) {
      const summed = line.runs.reduce((total, run) => total + run.width, 0);
      assert.ok(Math.abs(summed - line.width) < 1e-9, `line ${line.index}: ${summed} vs ${line.width}`);
      assert.equal(line.text, text.slice(line.startIndex, line.endIndex));
    }
    assert.ok(result.runs.length >= 2);
  });
});

describe('constraints, diagnostics and consistency', () => {
  it('reports a line-count constraint as overflow, not as a silent clip', () => {
    const result = wrap('alpha beta gamma delta', 300, { maxLines: 1 });
    assert.equal(result.lineCount, 2);
    assert.equal(result.overflow.lineCountExceeded, true);
    assert.ok(has(result.diagnostics, 'TEXT_LINE_COUNT_EXCEEDED'));
  });

  it('agrees with layoutText for the same constraint', () => {
    const wrapped = wrap('alpha beta gamma', 150);
    const layout = engine.layoutText({
      text: 'alpha beta gamma',
      typography: TYPOGRAPHY.latin,
      constraint: { maxWidth: 150 },
    });
    assert.deepEqual(wrapped.lines.map((line) => line.text), layout.lines.map((line) => line.text));
    assert.deepEqual(codes(wrapped.diagnostics), codes(layout.diagnostics));
    assert.equal(wrapped.height, layout.height);
  });

  it('validates maxWidth without throwing', () => {
    const result = wrap('abc', 0);
    assert.equal(result.ok, false);
    assert.equal(result.lines.length, 0);
    assert.ok(has(result.diagnostics, 'TYPOGRAPHY_CONFIG_INVALID'));
    assert.equal(result.diagnostics[0]?.path, 'constraint.maxWidth');
  });

  it('returns an empty result for empty text', () => {
    const result = wrap('', 100);
    assert.equal(result.ok, true);
    assert.equal(result.lineCount, 0);
    assert.equal(result.height, 0);
    assert.ok(has(result.diagnostics, 'TEXT_CONTENT_EMPTY'));
  });

  it('is deterministic', () => {
    const first = wrap('alpha beta gamma', 140);
    const second = wrap('alpha beta gamma', 140);
    assert.deepEqual(
      first.lines.map((line) => [line.text, line.startIndex, line.endIndex, line.width]),
      second.lines.map((line) => [line.text, line.startIndex, line.endIndex, line.width]),
    );
  });
});
