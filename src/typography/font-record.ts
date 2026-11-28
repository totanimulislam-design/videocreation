/**
 * Loading a registered font: bytes → HarfBuzz face → measured metadata.
 *
 * Metadata is read from the font itself, never from the registration hint:
 * - family/subfamily/full/PostScript names and licence text come from the `name`
 *   table through HarfBuzz;
 * - vertical metrics and coverage come from HarfBuzz (`hExtents`, `cmap`);
 * - weight class, italic flag, cap height and x-height come from the raw `OS/2`
 *   table, which HarfBuzz exposes but does not summarise.
 *
 * A registration hint (`scripts`, `weight`, `style`, licence) is recorded as
 * *intent*; the real values are detected. When a hint overrides a detected value
 * the diagnostic trail says so, so a mismatch is visible rather than silent.
 */

import { createHash } from 'node:crypto';

import type { Blob as HarfBuzzBlob, Buffer as HarfBuzzBuffer, Face, Feature, Font } from 'harfbuzzjs';

import { CODES, DiagnosticBag, type Diagnostic } from '../core/diagnostics.ts';
import { slugify } from '../core/ids.ts';
import { detectFontFormat, loadFontSource, toSfntBytes } from './font-format.ts';
import { classifyCodePoint } from './script-runs.ts';
import type {
  FontFormat,
  FontLicensing,
  FontMetadata,
  FontStyle,
  FontVerticalMetrics,
  RegisterFontInput,
  RunScript,
  SupportedScript,
} from './types.ts';

/**
 * The subset of the `harfbuzzjs` module surface this engine uses.
 *
 * Declared structurally so the engine does not depend on the package's type
 * export layout, and so the WASM module can be loaded lazily at runtime without
 * a static import in the package entry point.
 */
export interface HarfBuzzApi {
  readonly Blob: new (data: Uint8Array) => HarfBuzzBlob;
  readonly Face: new (blob: HarfBuzzBlob, index?: number) => Face;
  readonly Font: new (face: Face) => Font;
  readonly Buffer: new () => HarfBuzzBuffer;
  readonly Direction: { readonly LTR: number; readonly RTL: number };
  readonly Feature: { fromString(value: string): Feature | undefined };
  readonly shape: (font: Font, buffer: HarfBuzzBuffer, features?: readonly Feature[]) => void;
}

/** A font that is loaded into the shaping engine. */
export interface LoadedFont {
  readonly metadata: FontMetadata;
  readonly face: Face;
  readonly font: Font;
  /** Code points the font's `cmap` maps. */
  readonly coverage: ReadonlySet<number>;
}

export interface LoadFontResult {
  readonly ok: boolean;
  readonly font?: LoadedFont;
  readonly diagnostics: readonly Diagnostic[];
}

export const DEFAULT_FONT_WEIGHT = 400;

/** Weights recognised in a subfamily name when the `OS/2` table is missing. */
const NAMED_WEIGHTS: ReadonlyArray<readonly [RegExp, number]> = Object.freeze([
  [/thin/i, 100],
  [/extra\s*light|ultra\s*light/i, 200],
  [/semi\s*light|demi\s*light/i, 350],
  [/light/i, 300],
  [/medium/i, 500],
  [/semi\s*bold|demi\s*bold/i, 600],
  [/extra\s*bold|ultra\s*bold/i, 800],
  [/black|heavy/i, 900],
  [/bold/i, 700],
]);

function weightFromName(name: string): number {
  for (const [pattern, weight] of NAMED_WEIGHTS) {
    if (pattern.test(name)) return weight;
  }
  return DEFAULT_FONT_WEIGHT;
}

/** UTF-16 code point count is not needed: coverage is a code-point set. */
function readOs2(face: Face): {
  weight?: number;
  italic?: boolean;
  typographicAscender?: number;
  typographicDescender?: number;
  typographicLineGap?: number;
  capHeight?: number;
  xHeight?: number;
} {
  const table = face.referenceTable('OS/2');
  if (!table || table.byteLength < 8) return {};
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const version = table.byteLength >= 2 ? view.getUint16(0, false) : 0;
  const weightClass = view.getUint16(4, false);
  const result: {
    weight?: number;
    italic?: boolean;
    typographicAscender?: number;
    typographicDescender?: number;
    typographicLineGap?: number;
    capHeight?: number;
    xHeight?: number;
  } = {};
  if (weightClass >= 1 && weightClass <= 1000) result.weight = weightClass;
  if (table.byteLength >= 64) {
    const fsSelection = view.getUint16(62, false);
    result.italic = (fsSelection & 0b1) !== 0;
  }
  if (table.byteLength >= 74) {
    result.typographicAscender = view.getInt16(68, false);
    result.typographicDescender = view.getInt16(70, false);
    result.typographicLineGap = view.getInt16(72, false);
  }
  if (version >= 2 && table.byteLength >= 90) {
    result.xHeight = view.getInt16(86, false);
    result.capHeight = view.getInt16(88, false);
  }
  return result;
}

/** Reads one `name` table entry, preferring English, then any language. */
function readName(face: Face, nameId: number): string | undefined {
  let entries: ReadonlyArray<{ nameId: number; language: string }>;
  try {
    entries = face.listNames() as ReadonlyArray<{ nameId: number; language: string }>;
  } catch {
    return undefined;
  }
  const candidates = entries.filter((entry) => entry.nameId === nameId);
  if (candidates.length === 0) return undefined;
  const english = candidates.find((entry) => entry.language.toLowerCase().startsWith('en')) ?? candidates[0];
  if (!english) return undefined;
  try {
    const value = face.getName(nameId, english.language);
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function readTableTags(face: Face, table: 'GSUB' | 'GPOS', kind: 'script' | 'feature'): string[] {
  try {
    const tags = kind === 'script' ? face.getTableScriptTags(table) : face.getTableFeatureTags(table);
    return [...new Set(tags)].sort();
  } catch {
    return [];
  }
}

/**
 * Minimum number of base characters before a script counts as covered.
 *
 * A handful of stray code points in a script block (a single Arabic letter in a
 * Latin font, for example) must not make a font claim a script. The threshold is
 * deliberately low but non-zero, and `scriptCoverage` always exposes the exact
 * counts so a caller can judge for itself.
 */
export const MIN_SCRIPT_COVERAGE = 25;

/** Coverage of one font, split by the scripts this platform documents. */
export function measureCoverage(coverage: ReadonlySet<number>): {
  scriptCoverage: Partial<Record<SupportedScript, number>>;
  coveredScripts: RunScript[];
} {
  const counts: Record<SupportedScript, number> = { latin: 0, bengali: 0, arabic: 0, urdu: 0 };
  for (const cp of coverage) {
    const script = classifyCodePoint(cp);
    if (script === 'latin' || script === 'bengali' || script === 'arabic') counts[script] += 1;
  }
  const scriptCoverage: Partial<Record<SupportedScript, number>> = {};
  const coveredScripts: RunScript[] = [];
  if (counts.latin > 0) {
    scriptCoverage.latin = counts.latin;
    if (counts.latin >= MIN_SCRIPT_COVERAGE) coveredScripts.push('latin');
  }
  if (counts.bengali > 0) {
    scriptCoverage.bengali = counts.bengali;
    if (counts.bengali >= MIN_SCRIPT_COVERAGE) coveredScripts.push('bengali');
  }
  if (counts.arabic > 0) {
    scriptCoverage.arabic = counts.arabic;
    // Urdu is written with the Arabic script; coverage of Arabic code points is
    // what makes it *renderable*. Nastaliq style is a separate font property.
    scriptCoverage.urdu = counts.arabic;
    if (counts.arabic >= MIN_SCRIPT_COVERAGE) coveredScripts.push('arabic', 'urdu');
  }
  return { scriptCoverage, coveredScripts };
}

/**
 * Deterministic font id.
 *
 * Content-addressed so the same bytes always produce the same id (cache keys and
 * diagnostics stay stable across processes), while a different file produces a
 * different id even when it claims the same family.
 */
export function fontIdFor(family: string, weight: number, style: FontStyle, bytes: Uint8Array): string {
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  return `font-${slugify(family)}-${weight}-${style}-${digest}`;
}

/**
 * Loads and describes a font. Never throws.
 *
 * Errors that make the font unusable (bad source, unsupported container,
 * unparsable `sfnt`) are errors. Conditions that are true but tolerable (a
 * declared script the font does not cover, a missing licence) are warnings.
 */
export function loadFont(input: RegisterFontInput, hb: HarfBuzzApi, now = Date.now()): LoadFontResult {
  const bag = new DiagnosticBag();
  const family = typeof input.family === 'string' ? input.family.trim() : '';
  if (family.length === 0) {
    bag.error(CODES.FONT_FAMILY_EMPTY, 'A font must declare a non-empty family name.', {
      path: 'family',
      hint: 'Use the family name the design tokens reference, e.g. "Noto Sans Bengali".',
    });
    return { ok: false, diagnostics: bag.all };
  }

  const weight = input.weight ?? DEFAULT_FONT_WEIGHT;
  if (!Number.isFinite(weight) || weight < 1 || weight > 1000) {
    bag.error(CODES.FONT_WEIGHT_INVALID, `Font weight ${String(input.weight)} is outside 1…1000.`, { path: 'weight' });
    return { ok: false, diagnostics: bag.all };
  }
  const requestedStyle: FontStyle = input.style ?? 'normal';
  if (requestedStyle !== 'normal' && requestedStyle !== 'italic') {
    bag.error(CODES.UNEXPECTED_VALUE, `Font style must be "normal" or "italic".`, { path: 'style' });
    return { ok: false, diagnostics: bag.all };
  }

  const loaded = loadFontSource(input.source);
  if (!loaded.ok || !loaded.bytes) {
    const issue = loaded.issue;
    bag.error(
      issue?.code === 'FONT_DATA_EMPTY' ? CODES.FONT_DATA_EMPTY : issue?.code === 'FONT_FORMAT_UNSUPPORTED' ? CODES.FONT_FORMAT_UNSUPPORTED : CODES.FONT_SOURCE_INVALID,
      issue?.message ?? 'Font source could not be loaded.',
      { path: 'source', ...(issue?.hint === undefined ? {} : { hint: issue.hint }) },
    );
    return { ok: false, diagnostics: bag.all };
  }
  const bytes = loaded.bytes;

  const decoded = toSfntBytes(bytes);
  if (!decoded.ok || !decoded.sfnt) {
    const issue = decoded.issue;
    bag.error(
      issue?.code === 'FONT_FORMAT_UNSUPPORTED' ? CODES.FONT_FORMAT_UNSUPPORTED : CODES.FONT_PARSE_FAILED,
      issue?.message ?? 'Font container could not be decoded.',
      { path: 'source', ...(issue?.hint === undefined ? {} : { hint: issue.hint }), context: { format: decoded.format } },
    );
    return { ok: false, diagnostics: bag.all };
  }

  let face: Face;
  try {
    face = new hb.Face(new hb.Blob(decoded.sfnt));
  } catch (error) {
    bag.error(CODES.FONT_PARSE_FAILED, `HarfBuzz could not open the font: ${error instanceof Error ? error.message : 'unknown failure'}.`, {
      path: 'source',
    });
    return { ok: false, diagnostics: bag.all };
  }

  const upem = face.upem;
  if (!Number.isFinite(upem) || upem <= 0) {
    bag.error(CODES.FONT_PARSE_FAILED, 'Font declares an unusable units-per-em value.', { path: 'source' });
    return { ok: false, diagnostics: bag.all };
  }

  const font = new hb.Font(face);
  font.setScale(upem, upem);
  const extents = font.hExtents();
  const os2 = readOs2(face);

  const ascender = extents.ascender > 0 ? extents.ascender : Math.round(upem * 0.8);
  const descender = extents.descender < 0 ? extents.descender : -Math.round(upem * 0.2);
  const lineGap = Number.isFinite(extents.lineGap) ? extents.lineGap : 0;

  const metrics: FontVerticalMetrics = {
    unitsPerEm: upem,
    ascender,
    descender,
    lineGap,
    ...(os2.typographicAscender === undefined ? {} : { typographicAscender: os2.typographicAscender }),
    ...(os2.typographicDescender === undefined ? {} : { typographicDescender: os2.typographicDescender }),
    ...(os2.typographicLineGap === undefined ? {} : { typographicLineGap: os2.typographicLineGap }),
    ...(os2.capHeight === undefined || os2.capHeight <= 0 ? {} : { capHeight: os2.capHeight }),
    ...(os2.xHeight === undefined || os2.xHeight <= 0 ? {} : { xHeight: os2.xHeight }),
  };

  const detectedFamily = readName(face, 16) ?? readName(face, 1);
  const subfamily = readName(face, 17) ?? readName(face, 2) ?? 'Regular';
  const fullName = readName(face, 4);
  const postscriptName = readName(face, 6);

  if (detectedFamily && detectedFamily.trim() !== family) {
    bag.warning(CODES.FONT_FALLBACK_APPLIED, `Registered as "${family}" but the font's name table declares "${detectedFamily}".`, {
      path: 'family',
      hint: 'Registration uses the family you supply so tokens resolve predictably; the embedded name is recorded in metadata.',
      context: { registeredFamily: family, embeddedFamily: detectedFamily },
    });
  }

  const detectedWeight = os2.weight ?? weightFromName(subfamily);
  if (input.weight !== undefined && input.weight !== detectedWeight) {
    bag.warning(CODES.FONT_WEIGHT_SUBSTITUTED, `Registered weight ${input.weight} differs from the font's declared weight class ${detectedWeight}.`, {
      path: 'weight',
      hint: 'The registration weight is used for matching; check that the file is the weight you expect.',
      context: { registered: input.weight, detected: detectedWeight },
    });
  }
  const detectedItalic = os2.italic === true || /italic|oblique/i.test(`${subfamily} ${postscriptName ?? ''}`);
  if (requestedStyle === 'normal' && detectedItalic) {
    bag.warning(CODES.FONT_STYLE_SUBSTITUTED, 'Font registered as upright but its style flags mark it italic.', { path: 'style' });
  }
  if (requestedStyle === 'italic' && !detectedItalic) {
    bag.warning(CODES.FONT_STYLE_SUBSTITUTED, 'Font registered as italic but its style flags mark it upright.', {
      path: 'style',
      hint: 'Italic requests are matched, never synthesised by shearing: register the real italic face.',
    });
  }

  let coverageSet: Set<number>;
  try {
    coverageSet = new Set<number>(face.collectUnicodes());
  } catch (error) {
    bag.error(CODES.FONT_PARSE_FAILED, `Font coverage could not be read: ${error instanceof Error ? error.message : 'unknown failure'}.`, {
      path: 'source',
    });
    return { ok: false, diagnostics: bag.all };
  }
  const { scriptCoverage, coveredScripts } = measureCoverage(coverageSet);

  const declaredScripts: SupportedScript[] =
    input.scripts && input.scripts.length > 0
      ? [...new Set(input.scripts)]
      : (coveredScripts.filter((script) => script !== 'common' && script !== 'other') as SupportedScript[]);

  for (const declared of declaredScripts) {
    const count = scriptCoverage[declared] ?? 0;
    if (count === 0) {
      bag.warning(CODES.FONT_COVERAGE_INCOMPLETE, `Font "${family}" was declared for ${declared} but maps no ${declared} code points.`, {
        path: 'scripts',
        hint: 'Declared scripts are intent only; resolution uses measured coverage.',
        context: { script: declared },
      });
    }
  }

  const licensing: FontLicensing = {
    ...(input.licensing?.description === undefined ? {} : { description: input.licensing.description }),
    ...(input.licensing?.url === undefined ? {} : { url: input.licensing.url }),
    ...(input.licensing?.copyright === undefined ? {} : { copyright: input.licensing.copyright }),
  };
  const embeddedLicense = readName(face, 13);
  const embeddedLicenseUrl = readName(face, 14);
  const embeddedCopyright = readName(face, 0);
  const resolvedLicensing: FontLicensing = Object.freeze({
    ...(licensing.description ?? embeddedLicense ? { description: licensing.description ?? embeddedLicense } : {}),
    ...(licensing.url ?? embeddedLicenseUrl ? { url: licensing.url ?? embeddedLicenseUrl } : {}),
    ...(licensing.copyright ?? embeddedCopyright ? { copyright: licensing.copyright ?? embeddedCopyright } : {}),
  });
  if (!resolvedLicensing.description && !resolvedLicensing.url && !resolvedLicensing.copyright) {
    bag.warning(CODES.FONT_LICENSING_MISSING, `Font "${family}" exposes no licence metadata.`, {
      path: 'licensing',
      hint: 'Record the licence at registration or in the design asset; unlicensed fonts are a delivery risk.',
    });
  }

  const detectedFormat = detectFontFormat(bytes);
  const format: FontFormat = decoded.format === 'woff' ? 'woff' : detectedFormat;

  const metadata: FontMetadata = Object.freeze({
    id: fontIdFor(family, weight, requestedStyle, bytes),
    family,
    subfamily,
    ...(fullName === undefined ? {} : { fullName }),
    ...(postscriptName === undefined ? {} : { postscriptName }),
    format,
    weight,
    style: requestedStyle,
    metrics: Object.freeze(metrics),
    declaredScripts: Object.freeze(declaredScripts),
    coveredScripts: Object.freeze(coveredScripts),
    codepointCount: coverageSet.size,
    scriptCoverage: Object.freeze(scriptCoverage),
    shaping: Object.freeze({
      gsubScriptTags: Object.freeze(readTableTags(face, 'GSUB', 'script')),
      gsubFeatureTags: Object.freeze(readTableTags(face, 'GSUB', 'feature')),
      gposScriptTags: Object.freeze(readTableTags(face, 'GPOS', 'script')),
      gposFeatureTags: Object.freeze(readTableTags(face, 'GPOS', 'feature')),
    }),
    licensing: resolvedLicensing,
    source: loaded.kind ?? 'bytes',
    byteLength: bytes.byteLength,
    registeredAt: now,
  });

  return {
    ok: true,
    font: { metadata, face, font, coverage: coverageSet },
    diagnostics: bag.all,
  };
}
