/**
 * Overflow verdicts, structured diagnostics, bidirectional ordering and the
 * canonical scene-node entry point.
 *
 * Stable diagnostic codes are the contract here: callers (and the future layout
 * engine) branch on codes, not on message text.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTypographyEngine } from '../src/index.ts';
import type { TextBoxConstraint } from '../src/index.ts';
import { TYPOGRAPHY, codes, createTestEngine, has } from './fixtures/fonts.ts';

const engine = await createTestEngine();

function layout(text: string, constraint?: TextBoxConstraint, extra: Record<string, unknown> = {}) {
  return engine.layoutText({
    text,
    typography: TYPOGRAPHY.latin,
    ...(constraint === undefined ? {} : { constraint }),
    ...extra,
  });
}

describe('overflow verdicts', () => {
  it('reports no overflow for a layout that fits', () => {
    const result = layout('alpha', { maxWidth: 300 });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'laid-out');
    assert.equal(result.overflow.horizontal, false);
    assert.deepEqual(result.diagnostics, []);
  });

  it('treats horizontal overflow of an explicit constraint as an error', () => {
    const result = layout('measurement', { maxWidth: 100 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'overflow');
    assert.equal(result.overflow.horizontal, true);
    assert.equal(result.overflow.unbreakable, true);
    assert.ok(has(result.diagnostics, 'TEXT_OVERFLOW_HORIZONTAL'));
    assert.ok(has(result.diagnostics, 'TEXT_UNBREAKABLE_OVERFLOW'));
    const code = result.diagnostics.find((diagnostic) => diagnostic.code === 'TEXT_OVERFLOW_HORIZONTAL');
    assert.equal(code?.severity, 'error');
    assert.equal(code?.path, 'width');
    assert.equal(code?.context?.availableWidth, 100);
    assert.equal(Math.round(Number(code?.context?.measuredWidth)), 264);
    assert.ok(result.overflow.reasons.length >= 1);
  });

  it('reports vertical overflow against maxHeight', () => {
    const result = layout('alpha beta', { maxWidth: 300, maxHeight: 50 });
    assert.equal(result.overflow.vertical, true);
    assert.equal(result.overflow.horizontal, false);
    assert.ok(has(result.diagnostics, 'TEXT_OVERFLOW_VERTICAL'));
    assert.ok(result.overflow.reasons.some((reason) => reason.includes('height')));
  });

  it('reports a line-count overflow against maxLines', () => {
    const result = layout('alpha beta gamma', { maxWidth: 300, maxLines: 1 });
    assert.equal(result.overflow.lineCountExceeded, true);
    assert.ok(has(result.diagnostics, 'TEXT_LINE_COUNT_EXCEEDED'));
    assert.equal(result.diagnostics.find((diagnostic) => diagnostic.code === 'TEXT_LINE_COUNT_EXCEEDED')?.path, 'lineCount');
  });

  it('reports every violated constraint together', () => {
    const result = layout('alpha beta gamma delta', { maxWidth: 100, maxHeight: 40, maxLines: 1 });
    assert.equal(result.overflow.horizontal, true);
    assert.equal(result.overflow.vertical, true);
    assert.equal(result.overflow.lineCountExceeded, true);
    assert.deepEqual(codes(result.diagnostics).sort(), [
      'TEXT_LINE_COUNT_EXCEEDED',
      'TEXT_OVERFLOW_HORIZONTAL',
      'TEXT_OVERFLOW_VERTICAL',
      'TEXT_UNBREAKABLE_OVERFLOW',
    ].sort());
  });

  it('reports missing glyphs as a warning without failing the layout', () => {
    const result = layout('नमस्ते', { maxWidth: 400 });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'laid-out');
    assert.equal(result.overflow.missingGlyphs, 6);
    assert.deepEqual(result.overflow.unsupportedScripts, ['other']);
    assert.ok(has(result.diagnostics, 'GLYPH_MISSING'));
    assert.ok(has(result.diagnostics, 'SHAPING_SCRIPT_UNSUPPORTED'));
    assert.equal(result.diagnostics.find((diagnostic) => diagnostic.code === 'GLYPH_MISSING')?.severity, 'warning');
  });

  it('reports a missing font when the registry cannot serve the text', async () => {
    const empty = await createTypographyEngine({ fonts: [] });
    const result = empty.layoutText({ text: 'alpha', typography: TYPOGRAPHY.latin });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'overflow');
    assert.equal(result.overflow.missingFont, true);
    assert.equal(result.runs.length, 0);
    assert.equal(result.width, 0);
    assert.ok(has(result.diagnostics, 'FONT_NOT_FOUND'));
  });

  it('never silently substitutes a missing family', () => {
    const result = layout('alpha', { maxWidth: 400 }, { typography: { ...TYPOGRAPHY.latin, fontFamily: 'No Such Font' } });
    const applied = result.diagnostics.find((diagnostic) => diagnostic.code === 'FONT_FALLBACK_APPLIED');
    assert.ok(applied);
    assert.equal(applied?.severity, 'warning');
    assert.deepEqual(applied?.context?.requestedFamily, 'No Such Font');
    assert.equal(result.runs[0]?.font.family, 'Noto Sans');
  });
});

describe('detectTextOverflow', () => {
  it('re-evaluates an existing layout against tighter constraints', () => {
    const relaxed = layout('alpha', { maxWidth: 300 });
    const verdict = engine.detectTextOverflow({ layout: relaxed, maxWidth: 50 });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.overflow.horizontal, true);
    assert.ok(has(verdict.diagnostics, 'TEXT_OVERFLOW_HORIZONTAL'));
  });

  it('re-uses the layout constraints when none are supplied', () => {
    const tight = layout('measurement', { maxWidth: 100 });
    const verdict = engine.detectTextOverflow({ layout: tight });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.overflow.horizontal, true);
    assert.deepEqual(codes(verdict.diagnostics), codes(tight.diagnostics));
  });

  it('evaluates a line-count limit against an existing layout', () => {
    const wrapped = layout('alpha beta gamma delta', { maxWidth: 300 });
    assert.equal(wrapped.lineCount, 2);
    const verdict = engine.detectTextOverflow({ layout: wrapped, maxLines: 1 });
    assert.equal(verdict.overflow.lineCountExceeded, true);
    assert.ok(has(verdict.diagnostics, 'TEXT_LINE_COUNT_EXCEEDED'));
  });

  it('reports a missing layout instead of throwing', () => {
    const verdict = engine.detectTextOverflow({ layout: undefined as never });
    assert.equal(verdict.ok, false);
    assert.ok(has(verdict.diagnostics, 'TEXT_MISSING'));
  });
});

describe('bidirectional ordering', () => {
  it('orders an RTL line right-to-left without reversing its text', () => {
    const result = engine.layoutText({
      text: 'مرحبا Hello',
      typography: TYPOGRAPHY.arabic,
      language: 'ar',
      direction: 'rtl',
      constraint: { maxWidth: 500 },
    });
    const line = result.lines[0];
    assert.ok(line);
    assert.equal(result.baseDirection, 'rtl');
    assert.equal(line.text, 'مرحبا Hello');
    assert.deepEqual(line.runs.map((run) => run.runIndex), [0, 1]);
    assert.deepEqual(line.visualRunOrder, [1, 0], 'the Latin run is visually leftmost');
    assert.ok(has(result.diagnostics, 'TEXT_BIDI_APPROXIMATED'));
  });

  it('keeps LTR order for an LTR base with a trailing RTL run', () => {
    const result = engine.layoutText({
      text: 'Hello مرحبا',
      typography: TYPOGRAPHY.latin,
      language: 'en',
      constraint: { maxWidth: 500 },
    });
    const line = result.lines[0];
    assert.ok(line);
    assert.equal(result.baseDirection, 'ltr');
    assert.deepEqual(line.visualRunOrder, [0, 1]);
    assert.equal(line.text, 'Hello مرحبا');
  });

  it('derives the base direction from the first strong script', () => {
    assert.equal(engine.layoutText({ text: 'بسم الله', typography: TYPOGRAPHY.arabic }).baseDirection, 'rtl');
    assert.equal(engine.layoutText({ text: 'abc', typography: TYPOGRAPHY.latin }).baseDirection, 'ltr');
  });

  it('does not warn about bidi for a single-direction text', () => {
    const result = layout('alpha', { maxWidth: 300 });
    assert.ok(!has(result.diagnostics, 'TEXT_BIDI_APPROXIMATED'));
  });
});

describe('canonical scene node entry point', () => {
  const node = (content: string, width = 300, height = 100) => ({
    id: 'node-headline',
    type: 'text' as const,
    name: 'Headline',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    geometry: { width, height },
    text: { content, typography: TYPOGRAPHY.latin },
    visible: true,
    locked: false,
  });

  it('lays out the canonical text node using its geometry as the box', () => {
    const result = engine.layoutSceneText({ node: node('measurement', 100, 60) });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'overflow');
    assert.deepEqual(result.constraints, { maxWidth: 100, maxHeight: 60 });
    assert.ok(has(result.diagnostics, 'TEXT_OVERFLOW_HORIZONTAL'));
  });

  it('matches layoutText for the same text, typography and constraint', () => {
    const scene = engine.layoutSceneText({ node: node('alpha beta gamma', 150, 200) });
    const direct = engine.layoutText({
      text: 'alpha beta gamma',
      typography: TYPOGRAPHY.latin,
      constraint: { maxWidth: 150, maxHeight: 200 },
    });
    assert.equal(scene.width, direct.width);
    assert.equal(scene.height, direct.height);
    assert.deepEqual(scene.lines.map((line) => line.text), direct.lines.map((line) => line.text));
  });

  it('lets an explicit constraint override the geometry', () => {
    const result = engine.layoutSceneText({ node: node('measurement', 100, 60), constraint: { maxWidth: 400 } });
    assert.equal(result.ok, true);
    assert.deepEqual(result.constraints, { maxWidth: 400 });
  });

  it('rejects non-text nodes without throwing', () => {
    const result = engine.layoutSceneText({ node: { ...node('x'), type: 'shape' } as never });
    assert.equal(result.ok, false);
    assert.ok(has(result.diagnostics, 'TEXT_MISSING'));
  });
});

describe('capability matrix', () => {
  it('reports measured support, not claims', () => {
    const support = engine.scriptSupport();
    const byScript = new Map(support.map((entry) => [entry.script, entry]));
    assert.deepEqual([...byScript.keys()], ['latin', 'bengali', 'arabic', 'urdu']);
    assert.deepEqual(byScript.get('latin')?.families, ['Noto Sans']);
    assert.deepEqual(byScript.get('bengali')?.families, ['Noto Sans Bengali']);
    assert.deepEqual(byScript.get('arabic')?.families, ['Noto Sans Arabic', 'Noto Nastaliq Urdu']);
    assert.equal(byScript.get('urdu')?.shaped, true);
    assert.ok(support.every((entry) => entry.coveredByRegisteredFont));
  });
});
