/**
 * Canonical schema primitives: versioning, units, colours, IDs, factories.
 *
 * These are the foundations the parser and validator rely on, so they are tested
 * directly rather than only through end-to-end cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  compareSchemaVersions,
  isSupportedSchemaVersion,
  latestSupportedSchemaVersion,
  parseSchemaVersion,
} from '../src/schema/version.ts';
import {
  DEFAULT_DPI,
  UNITS,
  canvasMillimetres,
  convertPhysical,
  fromMillimetres,
  isUnit,
  toMillimetres,
} from '../src/schema/units.ts';
import { contrastRatio, isHexColor, normalizeHexColor, parseHexColor, relativeLuminance, compositeOver } from '../src/core/color.ts';
import { createIdFactory, findDuplicateIds, isValidId, randomId, slugify } from '../src/core/ids.ts';
import { detectScripts, dominantDirection, isSupportedLanguage, normalizeLanguageTag, scriptForLanguage } from '../src/core/script.ts';
import { createCanvas, createDesignDocument, createDesignTokens, createTypographyScale } from '../src/schema/factories.ts';

describe('schema versioning', () => {
  it('declares a semantic current version', () => {
    assert.match(SCHEMA_VERSION, /^\d+\.\d+\.\d+$/);
    assert.ok(SUPPORTED_SCHEMA_VERSIONS.includes(SCHEMA_VERSION));
  });

  it('parses and rejects versions', () => {
    assert.deepEqual(parseSchemaVersion('1.2.3'), { major: 1, minor: 2, patch: 3 });
    assert.equal(parseSchemaVersion('1.2'), undefined);
    assert.equal(parseSchemaVersion('v1.2.3'), undefined);
    assert.equal(parseSchemaVersion('1.2.3-beta'), undefined);
  });

  it('compares versions numerically, not lexically', () => {
    assert.ok(compareSchemaVersions('1.10.0', '1.9.0') > 0);
    assert.ok(compareSchemaVersions('1.0.0', '1.0.0') === 0);
    assert.ok(compareSchemaVersions('0.9.0', '1.0.0') < 0);
  });

  it('refuses versions it cannot validate', () => {
    assert.equal(isSupportedSchemaVersion(SCHEMA_VERSION), true);
    assert.equal(isSupportedSchemaVersion('2.0.0'), false);
    assert.equal(isSupportedSchemaVersion(undefined), false);
  });

  it('reports the latest supported version', () => {
    assert.equal(latestSupportedSchemaVersion(), SCHEMA_VERSION);
  });
});

describe('units', () => {
  it('lists exactly the documented units', () => {
    assert.deepEqual([...UNITS], ['px', 'mm', 'cm', 'in']);
    assert.ok(isUnit('mm'));
    assert.ok(!isUnit('pt'));
  });

  it('converts physical units exactly', () => {
    assert.equal(convertPhysical(1, 'in', 'mm'), 25.4);
    assert.equal(convertPhysical(10, 'mm', 'cm'), 1);
    assert.equal(convertPhysical(2.54, 'cm', 'in'), 1);
  });

  it('refuses to convert pixels without a DPI', () => {
    assert.equal(toMillimetres(100, 'px'), undefined);
    assert.equal(fromMillimetres(25.4, 'px'), undefined);
    assert.ok(Math.abs((toMillimetres(300, 'px', 300) ?? 0) - 25.4) < 1e-9);
  });

  it('resolves canvas millimetres only when the unit is physical or DPI is known', () => {
    assert.deepEqual(canvasMillimetres({ width: 148, height: 210, unit: 'mm' }), { width: 148, height: 210 });
    assert.equal(canvasMillimetres({ width: 1080, height: 1080, unit: 'px' }), undefined);
    const withDpi = canvasMillimetres({ width: 1080, height: 1080, unit: 'px', dpi: DEFAULT_DPI });
    assert.ok(withDpi);
    assert.ok(Math.abs(withDpi.width - 91.44) < 1e-6);
  });
});

describe('colour primitives', () => {
  it('parses all supported hex forms', () => {
    assert.deepEqual(parseHexColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(parseHexColor('#ff0000'), { r: 255, g: 0, b: 0, a: 1 });
    assert.equal(parseHexColor('#ff000080')?.a.toFixed(3), (128 / 255).toFixed(3));
    assert.equal(parseHexColor('red'), undefined);
    assert.equal(parseHexColor('#gggggg'), undefined);
    assert.equal(isHexColor('#123456'), true);
    assert.equal(isHexColor('rgb(1,2,3)'), false);
  });

  it('normalises colours', () => {
    assert.equal(normalizeHexColor('#ABC'), '#aabbcc');
    assert.equal(normalizeHexColor('nope'), undefined);
  });

  it('computes WCAG luminance and contrast ratios', () => {
    const white = parseHexColor('#ffffff');
    const black = parseHexColor('#000000');
    assert.ok(white && black);
    assert.equal(relativeLuminance(white), 1);
    assert.equal(relativeLuminance(black), 0);
    assert.equal(contrastRatio(white, black), 21);
    assert.ok((contrastRatio(white, white) ?? 0) === 1);
  });

  it('refuses a contrast ratio for translucent colours', () => {
    const translucent = parseHexColor('#ffffff80');
    const black = parseHexColor('#000000');
    assert.ok(translucent && black);
    assert.equal(contrastRatio(translucent, black), undefined);
  });

  it('composites transparency against a background', () => {
    const half = parseHexColor('#00000080');
    const white = parseHexColor('#ffffff');
    assert.ok(half && white);
    const composited = compositeOver(half, white);
    assert.ok(composited.r > 100 && composited.r < 160, 'mid-grey blend expected');
    assert.equal(composited.a, 1);
  });
});

describe('identifier primitives', () => {
  it('accepts only well-formed stable IDs', () => {
    assert.ok(isValidId('el-headline'));
    assert.ok(isValidId('asset:image/hero-01'));
    assert.ok(isValidId('A1'));
    assert.equal(isValidId(''), false);
    assert.equal(isValidId('-leading-dash'), false);
    assert.equal(isValidId('has space'), false);
    assert.equal(isValidId('x'.repeat(200)), false);
    assert.equal(isValidId(42), false);
  });

  it('slugifies arbitrary text without producing empty IDs', () => {
    assert.equal(slugify('Admission Open 2026!'), 'admission-open-2026');
    assert.equal(slugify('ভর্তি চলছে'), 'item');
    assert.equal(slugify(''), 'item');
  });

  it('produces deterministic IDs from a factory', () => {
    const factory = createIdFactory('el');
    assert.equal(factory('Headline'), 'el-headline');
    assert.equal(factory('Headline'), 'el-headline-1');
    assert.equal(factory('body copy'), 'el-body-copy');
  });

  it('produces distinct random IDs', () => {
    const a = randomId('design');
    const b = randomId('design');
    assert.notEqual(a, b);
    assert.ok(isValidId(a));
  });

  it('detects duplicate IDs with indices', () => {
    const duplicates = findDuplicateIds(['a', 'b', 'a', 'a']);
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0]?.id, 'a');
    assert.deepEqual(duplicates[0]?.indices, [0, 2, 3]);
  });
});

describe('script detection', () => {
  it('detects supported scripts', () => {
    assert.deepEqual(detectScripts('Admission Open'), ['latin']);
    assert.deepEqual(detectScripts('ভর্তি চলছে'), ['bengali']);
    assert.deepEqual(detectScripts('التسجيل مفتوح'), ['arabic']);
    assert.deepEqual(detectScripts('12345'), ['unknown']);
  });

  it('handles numeric separators without a false Latin detection', () => {
    assert.deepEqual(detectScripts('৮x১০'), ['bengali']);
  });

  it('maps languages to script and direction', () => {
    assert.deepEqual(scriptForLanguage('en-GB'), { script: 'latin', direction: 'ltr' });
    assert.deepEqual(scriptForLanguage('bn'), { script: 'bengali', direction: 'ltr' });
    assert.deepEqual(scriptForLanguage('ar-EG'), { script: 'arabic', direction: 'rtl' });
    assert.deepEqual(scriptForLanguage('ur'), { script: 'urdu', direction: 'rtl' });
    assert.equal(scriptForLanguage('hi'), undefined);
    assert.equal(isSupportedLanguage('bn'), true);
    assert.equal(isSupportedLanguage('ja'), false);
  });

  it('computes dominant direction including mixed', () => {
    assert.equal(dominantDirection(['en', 'bn']), 'ltr');
    assert.equal(dominantDirection(['ar', 'ur']), 'rtl');
    assert.equal(dominantDirection(['en', 'ar']), 'mixed');
    assert.equal(dominantDirection([]), 'unknown');
  });

  it('normalises language tags', () => {
    assert.equal(normalizeLanguageTag('BN-bd'), 'bn-BD');
    assert.equal(normalizeLanguageTag(' en '), 'en');
    assert.equal(normalizeLanguageTag(''), '');
  });
});

describe('factories', () => {
  it('creates a canvas with no implicit px-to-mm conversion', () => {
    const canvas = createCanvas({ width: 148, height: 210, unit: 'mm', bleedMm: 3 });
    assert.deepEqual(canvas.bleed, { top: 3, right: 3, bottom: 3, left: 3 });
    assert.equal(canvas.safeArea, undefined);
  });

  it('converts bleed using explicit DPI for pixel canvases', () => {
    const canvas = createCanvas({ width: 1080, height: 1080, unit: 'px', dpi: 300, bleedMm: 3 });
    assert.ok(canvas.bleed);
    assert.ok(Math.abs((canvas.bleed?.top ?? 0) - (3 * 300) / 25.4) < 1e-9);
  });

  it('creates a typography scale with all five roles and increasing sizes', () => {
    const scale = createTypographyScale(16);
    assert.deepEqual(Object.keys(scale), ['display', 'heading', 'subheading', 'body', 'caption']);
    assert.ok(scale.display.fontSize > scale.heading.fontSize);
    assert.ok(scale.heading.fontSize > scale.body.fontSize);
    assert.ok(scale.body.fontSize > scale.caption.fontSize);
  });

  it('creates empty colour roles rather than inventing a palette', () => {
    const tokens = createDesignTokens();
    assert.deepEqual(tokens.colors, {});
    assert.deepEqual(tokens.shadows, {});
    assert.ok(Object.keys(tokens.spacing).length > 0);
  });

  it('creates a reproducible document when given a timestamp', () => {
    const make = (): unknown =>
      createDesignDocument({
        name: 'Test',
        category: 'poster',
        canvas: createCanvas({ width: 100, height: 100, unit: 'mm' }),
        artDirection: {
          style: 'minimalist',
          mood: ['calm'],
          colorStrategy: 'monochromatic',
          typographyStrategy: 'single family',
          imageStrategy: 'none',
          shapeLanguage: 'rectilinear',
          visualDensity: 'minimal',
          complexity: 'low',
        },
        composition: {
          primaryPattern: 'P01',
          supportingPatterns: [],
          focalPoint: { x: 50, y: 50, strength: 0.5 },
          readingFlow: 'ltr',
          hierarchy: [{ contentId: 'headline', rank: 1, role: 'primary' }],
          zones: [],
          grid: { type: 'column', columns: 12, gutter: 4, margin: { top: 8, right: 8, bottom: 8, left: 8 }, enabled: true },
          constraints: { preserveContent: true, allowOverlap: false, allowedOverlapPairs: [] },
        },
        now: '2026-01-01T00:00:00Z',
        id: 'design-test',
      });
    assert.deepEqual(make(), make());
  });
});
