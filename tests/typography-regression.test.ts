/**
 * Regression guard for TASK 04.
 *
 * The typography engine is additive: it reads the canonical `TypographyToken`,
 * exposes new functions, and must not change existing exports, schema shapes,
 * validation behaviour or diagnostic codes. These assertions exist so a future
 * refactor of the typography layer cannot quietly reach into the foundation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../src/index.ts';
import { TYPOGRAPHY, closeTo, createTestEngine } from './fixtures/fonts.ts';

const engine = await createTestEngine();

const FOUNDATION_EXPORTS = [
  'parseDesignBrief',
  'parseDesignBriefOrThrow',
  'estimateHeadlineCapacity',
  'validateDesignPlan',
  'validateDesignDocument',
  'validateDesignBriefDocument',
  'validateAiBriefProposal',
  'requestBriefProposal',
  'createTypographyToken',
  'createTypographyScale',
  'createDesignTokens',
  'createCanvas',
  'createDesignDocument',
  'slugify',
  'isValidId',
  'formatDiagnostic',
  'CODES',
  'SCHEMA_VERSION',
] as const;

const TYPOGRAPHY_EXPORTS = [
  'createTypographyEngine',
  'loadHarfBuzz',
  'layoutText',
  'measureText',
  'shapeText',
  'wrapText',
  'fitText',
  'layoutFits',
  'detectOverflow',
  'widestLine',
  'FontRegistry',
  'loadFont',
  'measureCoverage',
  'detectFontFormat',
  'decodeWoffToSfnt',
  'toSfntBytes',
  'segmentByScript',
  'breakOpportunities',
  'graphemeSegments',
] as const;

describe('public API surface', () => {
  it('keeps every foundation export', () => {
    for (const name of FOUNDATION_EXPORTS) {
      assert.ok(name in api, `missing export: ${name}`);
      assert.notEqual((api as Record<string, unknown>)[name], undefined, `undefined export: ${name}`);
    }
  });

  it('adds the typography exports', () => {
    for (const name of TYPOGRAPHY_EXPORTS) {
      assert.ok(name in api, `missing typography export: ${name}`);
      assert.notEqual((api as Record<string, unknown>)[name], undefined, `undefined typography export: ${name}`);
    }
  });

  it('does not rename or remove canonical typography token fields', () => {
    const token = api.createTypographyToken();
    assert.deepEqual(Object.keys(token).sort(), [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'letterSpacing',
      'lineHeight',
      'textAlign',
    ]);
    assert.equal(api.SCHEMA_VERSION, '1.0.0');
  });

  it('keeps the foundation diagnostics the schema and validators rely on', () => {
    for (const code of ['SCHEMA_VERSION_UNSUPPORTED', 'SCHEMA_VERSION_MISSING', 'SCHEMA_VERSION_OUTDATED', 'TYPOGRAPHY_CONFIG_INVALID'] as const) {
      assert.equal(api.CODES[code], code);
    }
  });

  it('exposes the typography diagnostic codes as stable strings', () => {
    const typographyCodes = [
      'FONT_SIZE_INVALID',
      'FONT_FAMILY_EMPTY',
      'FONT_WEIGHT_INVALID',
      'FONT_NOT_FOUND',
      'FONT_PARSE_FAILED',
      'FONT_FORMAT_UNSUPPORTED',
      'FONT_DUPLICATE',
      'FONT_DATA_EMPTY',
      'FONT_SOURCE_INVALID',
      'FONT_FALLBACK_APPLIED',
      'FONT_COVERAGE_INCOMPLETE',
      'GLYPH_MISSING',
      'SHAPING_SCRIPT_UNSUPPORTED',
      'TEXT_CONTENT_EMPTY',
      'TEXT_FIT_FAILED',
      'TEXT_FIT_REDUCED',
      'TEXT_OVERFLOW_HORIZONTAL',
      'TEXT_OVERFLOW_VERTICAL',
      'TEXT_LINE_COUNT_EXCEEDED',
      'TEXT_UNBREAKABLE_OVERFLOW',
      'TEXT_EMERGENCY_BREAK',
      'TEXT_MISSING',
      'TEXT_BIDI_APPROXIMATED',
      'TEXT_LINE_HEIGHT_BELOW_METRICS',
      'TEXT_URDU_NASTALIQ_UNAVAILABLE',
    ] as const;
    for (const code of typographyCodes) {
      assert.equal(api.CODES[code], code, `missing diagnostic code: ${code}`);
    }
  });
});

describe('existing behaviour is untouched', () => {
  it('parses briefs as before', () => {
    const parsed = api.parseDesignBrief(
      'Admission poster. Institution name: Bright Future Academy. Headline: Admission Open 2026. Size: 1080x1350 px.',
    );
    assert.equal(parsed.ok, true);
    assert.equal(parsed.brief.content.headline, 'Admission Open 2026');
    assert.equal(parsed.brief.content.cta, undefined);
    assert.ok(Array.isArray(parsed.diagnostics));
  });

  it('creates the same typography scale ratios', () => {
    const scale = api.createTypographyScale(16);
    assert.equal(scale.display.fontSize, 80);
    assert.equal(scale.heading.fontSize, 48);
    assert.equal(scale.body.fontSize, 16);
    assert.equal(scale.caption.fontSize, 12);
  });

  it('slugifies ids as before', () => {
    assert.equal(api.slugify('Hello World!'), 'hello-world');
  });
});

describe('typography engine consumes the canonical token', () => {
  it('lays out a token built by the foundation factory', () => {
    const token = api.createTypographyToken({ fontFamily: 'Noto Sans', fontSize: 24, lineHeight: 1.5 });
    const layout = engine.layoutText({ text: 'Canonical token', typography: token, constraint: { maxWidth: 400 } });
    assert.equal(layout.ok, true);
    assert.equal(layout.typography.fontFamily, 'Noto Sans');
    assert.equal(layout.typography.fontSize, 24);
    assert.equal(layout.typography.lineHeight, 36);
    assert.deepEqual(layout.constraints, { maxWidth: 400 });
  });

  it('never mutates the token or the scene node it is given', () => {
    const token = api.createTypographyToken({ fontFamily: 'Noto Sans', fontSize: 40 });
    const before = JSON.stringify(token);
    const node = {
      id: 'stable-node',
      type: 'text' as const,
      name: 'Headline',
      transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
      geometry: { width: 200, height: 80 },
      text: { content: 'Stable content', typography: token },
      visible: true,
      locked: false,
    };
    const nodeBefore = JSON.stringify(node);
    engine.layoutText({ text: 'Stable content', typography: token, constraint: { maxWidth: 200 } });
    engine.fitText({ text: 'Stable content', typography: token, minFontSize: 10, maxWidth: 200 });
    engine.layoutSceneText({ node });
    assert.equal(JSON.stringify(token), before);
    assert.equal(JSON.stringify(node), nodeBefore);
  });

  it('is cache-transparent', () => {
    const first = engine.layoutText({ text: 'Cache transparency', typography: TYPOGRAPHY.latin });
    engine.clearCaches();
    const second = engine.layoutText({ text: 'Cache transparency', typography: TYPOGRAPHY.latin });
    assert.equal(first.width, second.width);
    assert.equal(first.height, second.height);
    assert.deepEqual(
      first.lines.map((line) => [line.text, line.startIndex, line.endIndex, line.width]),
      second.lines.map((line) => [line.text, line.startIndex, line.endIndex, line.width]),
    );
    assert.ok(closeTo(first.width, second.width, 0));
  });

  it('produces the same numbers through shape, measure, wrap and layout', () => {
    const text = 'বাংলা and English 2024';
    const shaped = engine.shapeText({ text, typography: TYPOGRAPHY.bengali, language: 'bn' });
    const measured = engine.measureText({ text, typography: TYPOGRAPHY.bengali, language: 'bn' });
    const wrapped = engine.wrapText({ text, typography: TYPOGRAPHY.bengali, language: 'bn', maxWidth: 1000 });
    const laid = engine.layoutText({ text, typography: TYPOGRAPHY.bengali, language: 'bn', constraint: { maxWidth: 1000 } });
    assert.ok(closeTo(shaped.width, measured.width, 1e-9));
    assert.ok(closeTo(wrapped.width, measured.width, 1e-9));
    assert.ok(closeTo(laid.width, measured.width, 1e-9));
    assert.equal(measured.glyphCount, shaped.runs.reduce((total, run) => total + run.glyphs.length, 0));
    assert.equal(wrapped.lineCount, laid.lineCount);
  });
});
