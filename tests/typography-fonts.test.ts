/**
 * Font management: registration, metadata, formats, resolution and fallback.
 *
 * These tests assert real font properties read from the fixture files (units per
 * em, ascent/descent, cap height, `cmap` coverage, OpenType script/feature tags),
 * not just that a function returned something.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTypographyEngine, detectFontFormat, decodeWoffToSfnt, toSfntBytes } from '../src/index.ts';
import {
  FONT_FILES,
  TEST_FONTS,
  codes,
  createTestEngine,
  fontBytes,
  fontSource,
  has,
  makeCompressedWoff,
  makeWoff,
} from './fixtures/fonts.ts';

const engine = await createTestEngine();
const emptyEngine = await createTypographyEngine();

describe('font registration and metadata', () => {
  it('registers every fixture font with measured metadata', () => {
    const fonts = engine.listFonts();
    assert.equal(fonts.length, TEST_FONTS.length);
    const families = fonts.map((font) => `${font.family} ${font.weight}`);
    assert.deepEqual(families, [
      'Noto Sans Bengali 400',
      'Noto Sans Bengali 700',
      'Noto Sans Arabic 400',
      'Noto Nastaliq Urdu 400',
      'Noto Sans 400',
    ]);
  });

  it('reads vertical metrics in font units from the font itself', () => {
    const [bengali] = engine.getFontMetadata('Noto Sans Bengali');
    assert.ok(bengali);
    assert.equal(bengali.metrics.unitsPerEm, 1000);
    assert.equal(bengali.metrics.ascender, 917);
    assert.equal(bengali.metrics.descender, -408);
    assert.equal(bengali.metrics.capHeight, 622);
    assert.equal(bengali.metrics.xHeight, 536);
  });

  it('distinguishes the Latin face metrics from the Bengali face', () => {
    const [latin] = engine.getFontMetadata('Noto Sans');
    assert.ok(latin);
    assert.equal(latin.metrics.ascender, 1069);
    assert.equal(latin.metrics.descender, -293);
    assert.equal(latin.metrics.unitsPerEm, 1000);
    assert.notEqual(latin.id, engine.getFontMetadata('Noto Sans Bengali')[0]?.id);
  });

  it('reads family, subfamily, full name and PostScript name from the name table', () => {
    const [font] = engine.getFontMetadata('Noto Sans Bengali');
    assert.ok(font);
    assert.equal(font.family, 'Noto Sans Bengali');
    assert.equal(font.subfamily, 'Regular');
    assert.equal(font.fullName, 'Noto Sans Bengali Regular');
    assert.equal(font.postscriptName, 'NotoSansBengali-Regular');
  });

  it('reads licence metadata embedded in the font', () => {
    const [font] = engine.getFontMetadata('Noto Sans Bengali');
    assert.ok(font);
    assert.match(font.licensing.description ?? '', /SIL Open Font License/);
    assert.match(font.licensing.url ?? '', /openfontlicense/);
    assert.match(font.licensing.copyright ?? '', /Noto Project Authors/);
  });

  it('measures cmap coverage per script instead of trusting the registration hint', () => {
    const [bengali] = engine.getFontMetadata('Noto Sans Bengali');
    assert.ok(bengali);
    assert.equal(bengali.codepointCount, 134);
    // Per-script counts cover base characters; combining marks are excluded
    // because they inherit the preceding base (see `FontMetadata.scriptCoverage`).
    assert.equal(bengali.scriptCoverage.bengali, 76);
    assert.equal(bengali.scriptCoverage.latin, undefined);
    assert.deepEqual(bengali.coveredScripts, ['bengali']);

    const digits = engine.resolveFont({ fontFamily: 'Noto Sans Bengali', text: '১২৩' });
    assert.equal(digits.resolution.coveredCodepoints, 3);
    assert.deepEqual(digits.resolution.missingCodepoints, []);
    // The Bengali face maps no ASCII digits, so another registered face must
    // cover them; the resolution says so instead of substituting silently.
    const europeanDigits = engine.resolveFont({ fontFamily: 'Noto Sans Bengali', text: '123' });
    assert.equal(europeanDigits.resolution.status, 'fallback');
    assert.equal(europeanDigits.resolution.coveredCodepoints, 3);
    assert.deepEqual(europeanDigits.resolution.missingCodepoints, []);
    assert.notEqual(europeanDigits.resolution.resolved?.family, 'Noto Sans Bengali');

    const [latin] = engine.getFontMetadata('Noto Sans');
    assert.ok(latin);
    assert.equal(latin.codepointCount, 2965);
    assert.ok((latin.scriptCoverage.latin ?? 0) > 500);
    assert.deepEqual(latin.coveredScripts, ['latin']);
    assert.equal(latin.scriptCoverage.bengali, undefined);
  });

  it('reports OpenType shaping capabilities from GSUB/GPOS', () => {
    const [bengali] = engine.getFontMetadata('Noto Sans Bengali');
    assert.ok(bengali);
    assert.ok(bengali.shaping.gsubScriptTags.includes('bng2'));
    for (const feature of ['akhn', 'half', 'rphf', 'blwf', 'pstf', 'liga'].slice(0, 5)) {
      assert.ok(bengali.shaping.gsubFeatureTags.includes(feature), `missing GSUB feature ${feature}`);
    }
    const [arabic] = engine.getFontMetadata('Noto Sans Arabic');
    assert.ok(arabic);
    assert.ok(arabic.shaping.gsubScriptTags.includes('arab'));
  });

  it('warns when a declared script is not covered', async () => {
    const local = await createTypographyEngine();
    const result = local.registerFont({
      family: 'Latin Only',
      source: fontSource('latinRegular'),
      scripts: ['bengali'],
    });
    assert.equal(result.ok, true);
    assert.ok(has(result.diagnostics, 'FONT_COVERAGE_INCOMPLETE'));
    assert.equal(result.metadata?.scriptCoverage.bengali, undefined);
  });

  it('rejects an empty family name', async () => {
    const local = await createTypographyEngine();
    const result = local.registerFont({ family: '   ', source: fontSource('latinRegular') });
    assert.equal(result.ok, false);
    assert.ok(has(result.diagnostics, 'FONT_FAMILY_EMPTY'));
  });

  it('rejects an out-of-range weight', async () => {
    const local = await createTypographyEngine();
    const result = local.registerFont({ family: 'Bad Weight', source: fontSource('latinRegular'), weight: 1200 });
    assert.equal(result.ok, false);
    assert.ok(has(result.diagnostics, 'FONT_WEIGHT_INVALID'));
  });

  it('rejects a duplicate family/weight/style registration', () => {
    const duplicate = engine.registerFont({
      family: 'Noto Sans',
      source: fontSource('latinRegular'),
      weight: 400,
    });
    assert.equal(duplicate.ok, false);
    assert.ok(has(duplicate.diagnostics, 'FONT_DUPLICATE'));
  });

  it('warns when the registration weight disagrees with the font', async () => {
    const local = await createTypographyEngine();
    const result = local.registerFont({ family: 'Mislabelled', source: fontSource('bengaliBold'), weight: 400 });
    assert.equal(result.ok, true);
    assert.ok(has(result.diagnostics, 'FONT_WEIGHT_SUBSTITUTED'));
    assert.equal(result.metadata?.weight, 400);
  });

  it('produces a deterministic content-addressed font id', async () => {
    const first = engine.getFontMetadata('Noto Sans')[0];
    const other = await createTypographyEngine({ fonts: [TEST_FONTS[4] as (typeof TEST_FONTS)[number]] });
    const second = other.getFontMetadata('Noto Sans')[0];
    assert.ok(first && second);
    assert.equal(first.id, second.id);
    assert.match(first.id, /^font-noto-sans-400-normal-[0-9a-f]{12}$/);
  });

  it('looks up metadata by id and by family', () => {
    const [font] = engine.getFontMetadata('Noto Sans Bengali');
    assert.ok(font);
    assert.deepEqual(engine.getFontMetadata(font.id).map((entry) => entry.id), [font.id]);
    assert.equal(engine.getFontMetadata('Noto Sans Bengali').length, 2);
    assert.equal(engine.getFontMetadata('Missing Family').length, 0);
    assert.equal(engine.getFont(font.id)?.family, 'Noto Sans Bengali');
    assert.equal(engine.getFont('font-nope'), undefined);
  });

  it('keeps registration inputs untouched', () => {
    const input = TEST_FONTS[0];
    assert.ok(input);
    const snapshot = JSON.stringify(input);
    engine.registerFont({ family: 'Copy Check', source: fontSource('latinRegular') });
    assert.equal(JSON.stringify(input), snapshot);
  });
});

describe('font container formats', () => {
  it('detects containers structurally', () => {
    assert.equal(detectFontFormat(fontBytes('latinRegular')), 'truetype');
    assert.equal(detectFontFormat(makeWoff(fontBytes('latinRegular'))), 'woff');
    assert.equal(detectFontFormat(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0])), 'woff2');
    assert.equal(detectFontFormat(new Uint8Array([0x74, 0x74, 0x63, 0x66, 0, 0, 0, 0])), 'collection');
    assert.equal(detectFontFormat(new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 1, 0, 0])), 'opentype');
    assert.equal(detectFontFormat(new Uint8Array([1, 2, 3])), 'unknown');
  });

  it('decodes uncompressed WOFF 1.0 to usable sfnt bytes', () => {
    const woff = makeWoff(fontBytes('latinRegular'));
    const decoded = decodeWoffToSfnt(woff);
    assert.equal(decoded.ok, true);
    assert.ok(decoded.sfnt);
    assert.equal(detectFontFormat(decoded.sfnt), 'truetype');
  });

  it('registers a WOFF font and shapes identically to its TTF source', async () => {
    const local = await createTypographyEngine();
    const ttf = local.registerFont({ family: 'Sans TTF', source: fontBytes('latinRegular') });
    const woff = local.registerFont({ family: 'Sans WOFF', source: makeWoff(fontBytes('latinRegular')) });
    assert.equal(ttf.ok, true);
    assert.equal(woff.ok, true);
    assert.equal(woff.metadata?.format, 'woff');
    assert.equal(woff.metadata?.codepointCount, ttf.metadata?.codepointCount);

    const typography = { fontFamily: 'Sans TTF', fontSize: 32, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 };
    const fromTtf = local.measureText({ text: 'Kerning fi', typography });
    const fromWoff = local.measureText({ text: 'Kerning fi', typography: { ...typography, fontFamily: 'Sans WOFF' } });
    assert.equal(fromWoff.width, fromTtf.width);
    assert.deepEqual(fromWoff.runs[0]?.glyphs.map((glyph) => glyph.glyphId), fromTtf.runs[0]?.glyphs.map((glyph) => glyph.glyphId));
  });

  it('inflates deflate-compressed WOFF tables', () => {
    const woff = makeCompressedWoff(fontBytes('bengaliRegular'));
    assert.ok(woff.byteLength < fontBytes('bengaliRegular').byteLength);
    const decoded = decodeWoffToSfnt(woff);
    assert.equal(decoded.ok, true);
  });

  it('reports WOFF2 as unsupported rather than pretending to parse it', async () => {
    const local = await createTypographyEngine();
    const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0]);
    const decoded = toSfntBytes(woff2);
    assert.equal(decoded.ok, false);
    assert.equal(decoded.issue?.code, 'FONT_FORMAT_UNSUPPORTED');
    const result = local.registerFont({ family: 'Woff2 Only', source: woff2 });
    assert.equal(result.ok, false);
    assert.ok(has(result.diagnostics, 'FONT_FORMAT_UNSUPPORTED'));
    assert.match(result.diagnostics[0]?.message ?? '', /WOFF2/);
  });

  it('rejects collections, unknown containers and truncated WOFF', async () => {
    const local = await createTypographyEngine();
    const collection = new Uint8Array([0x74, 0x74, 0x63, 0x66, 0, 1, 0, 0]);
    const collectionResult = local.registerFont({ family: 'Collection', source: collection });
    assert.equal(collectionResult.ok, false);
    assert.ok(has(collectionResult.diagnostics, 'FONT_FORMAT_UNSUPPORTED'));

    const unknown = local.registerFont({ family: 'Unknown', source: new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]) });
    assert.equal(unknown.ok, false);
    assert.ok(has(unknown.diagnostics, 'FONT_FORMAT_UNSUPPORTED'));

    const truncated = local.registerFont({ family: 'Truncated', source: new Uint8Array([0x77, 0x4f, 0x46, 0x46, 0, 0]) });
    assert.equal(truncated.ok, false);
    assert.ok(has(truncated.diagnostics, 'FONT_PARSE_FAILED') || has(truncated.diagnostics, 'FONT_FORMAT_UNSUPPORTED'));
  });

  it('reports empty and unreadable sources without throwing', async () => {
    const local = await createTypographyEngine();
    const empty = local.registerFont({ family: 'Empty', source: new Uint8Array(0) });
    assert.equal(empty.ok, false);
    assert.ok(has(empty.diagnostics, 'FONT_DATA_EMPTY'));

    const missingPath = local.registerFont({ family: 'Missing Path', source: { kind: 'path', path: '/nonexistent/font.ttf' } });
    assert.equal(missingPath.ok, false);
    assert.ok(has(missingPath.diagnostics, 'FONT_SOURCE_INVALID'));

    const badUri = local.registerFont({ family: 'Bad URI', source: { kind: 'data-uri', uri: 'not-a-data-uri' } });
    assert.equal(badUri.ok, false);
    assert.ok(has(badUri.diagnostics, 'FONT_SOURCE_INVALID'));
  });

  it('accepts a base64 data URI', async () => {
    const local = await createTypographyEngine();
    const bytes = fontBytes('bengaliRegular');
    const uri = `data:font/ttf;base64,${Buffer.from(bytes).toString('base64')}`;
    const result = local.registerFont({ family: 'Bengali Inline', source: { kind: 'data-uri', uri } });
    assert.equal(result.ok, true);
    assert.equal(result.metadata?.source, 'data-uri');
    assert.equal(result.metadata?.codepointCount, 134);
  });
});

describe('font resolution, fallback and capability reporting', () => {
  it('resolves an exact family and weight', () => {
    const result = engine.resolveFont({ fontFamily: 'Noto Sans Bengali', fontWeight: 400, text: 'বাংলা' });
    assert.equal(result.ok, true);
    assert.equal(result.resolution.status, 'resolved');
    assert.equal(result.resolution.kind, 'exact');
    assert.equal(result.resolution.resolved?.family, 'Noto Sans Bengali');
    assert.equal(result.resolution.coveredCodepoints, 5);
    assert.deepEqual(result.resolution.missingCodepoints, []);
  });

  it('applies CSS-style nearest-weight matching and says so', () => {
    for (const [requested, expected] of [
      [600, 700],
      [300, 400],
      [900, 700],
    ] as const) {
      const result = engine.resolveFont({ fontFamily: 'Noto Sans Bengali', fontWeight: requested, text: 'বাংলা' });
      assert.equal(result.resolution.resolved?.weight, expected, `weight ${requested}`);
      assert.equal(result.resolution.kind, 'weight-nearest');
      assert.ok(has(result.diagnostics, 'FONT_WEIGHT_SUBSTITUTED'));
    }
  });

  it('falls back to another registered family when the requested one cannot render the text', () => {
    const result = engine.resolveFont({ fontFamily: 'Noto Sans Bengali', text: 'Latin only' });
    assert.equal(result.resolution.status, 'fallback');
    assert.equal(result.resolution.resolved?.family, 'Noto Sans');
    assert.ok(['family-fallback', 'coverage-fallback'].includes(result.resolution.kind));
    assert.ok(has(result.diagnostics, 'FONT_FALLBACK_APPLIED'));
    const attempt = result.resolution.fallbackChain;
    assert.equal(attempt[0], 'Noto Sans Bengali');
    assert.ok(attempt.includes('Noto Sans'));
  });

  it('reports a missing font when nothing is registered', () => {
    const result = emptyEngine.resolveFont({ fontFamily: 'Inter', text: 'Hello' });
    assert.equal(result.ok, false);
    assert.equal(result.resolution.status, 'missing');
    assert.equal(result.resolution.kind, 'missing');
    assert.equal(result.resolution.resolved, undefined);
    assert.ok(has(result.diagnostics, 'FONT_NOT_FOUND'));
  });

  it('resolves generic family names through configured mappings only', async () => {
    const local = await createTypographyEngine({
      fonts: [{ family: 'Noto Sans', source: fontSource('latinRegular') }],
      genericFamilies: { 'sans-serif': ['Noto Sans'] },
    });
    const mapped = local.resolveFont({ fontFamily: 'sans-serif', text: 'Hello' });
    assert.equal(mapped.resolution.kind, 'generic-fallback');
    assert.equal(mapped.resolution.resolved?.family, 'Noto Sans');

    const unmapped = local.resolveFont({ fontFamily: 'cursive', text: 'Hello' });
    // With no mapping, the last-resort registry pass still finds a covering face,
    // and the resolution reports that it was not the requested family.
    assert.equal(unmapped.resolution.resolved?.family, 'Noto Sans');
    assert.equal(unmapped.resolution.status, 'fallback');
  });

  it('parses comma-separated font stacks in order', async () => {
    const local = await createTypographyEngine({
      fonts: [
        { family: 'Noto Sans', source: fontSource('latinRegular') },
        { family: 'Noto Sans Bengali', source: fontSource('bengaliRegular') },
      ],
    });
    const result = local.resolveFont({ fontFamily: '"Noto Sans Bengali", Noto Sans', text: 'বাংলা' });
    assert.equal(result.resolution.resolved?.family, 'Noto Sans Bengali');
    const latin = local.resolveFont({ fontFamily: '"Noto Sans Bengali", Noto Sans', text: 'Hello' });
    assert.equal(latin.resolution.resolved?.family, 'Noto Sans');
  });

  it('reports script capability from measured coverage, not from claims', () => {
    const support = engine.scriptSupport();
    const byScript = new Map(support.map((entry) => [entry.script, entry]));
    assert.equal(byScript.get('latin')?.coveredByRegisteredFont, true);
    assert.equal(byScript.get('bengali')?.coveredByRegisteredFont, true);
    assert.equal(byScript.get('arabic')?.coveredByRegisteredFont, true);
    assert.equal(byScript.get('urdu')?.coveredByRegisteredFont, true);
    // Families are listed once even when several weights are registered.
    assert.deepEqual(byScript.get('bengali')?.families, ['Noto Sans Bengali']);
    assert.match(byScript.get('urdu')?.note ?? '', /Nastaliq/);
    assert.ok(support.every((entry) => entry.shaped === true));
  });

  it('reports no coverage for a script no registered font maps', async () => {
    const local = await createTypographyEngine({ fonts: [{ family: 'Noto Sans', source: fontSource('latinRegular') }] });
    const support = local.scriptSupport();
    assert.equal(support.find((entry) => entry.script === 'bengali')?.coveredByRegisteredFont, false);
    assert.deepEqual(support.find((entry) => entry.script === 'bengali')?.families, []);
  });
});
