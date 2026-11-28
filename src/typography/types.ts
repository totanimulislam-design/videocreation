/**
 * Typography engine — public data contract.
 *
 * AUTHORITY for typography *document* data stays `src/schema/types.ts`
 * (`TypographyToken`, `SceneText`, §9.2 of `DESIGN_ENGINE_SPEC.md`). This module
 * declares only the **computed** artifacts of the typography engine: measured
 * layout, shaped runs, font metadata and diagnostics-bearing results. Nothing
 * here is a second wire schema for a design document, and nothing here is
 * persisted inside a `DesignDocument`.
 *
 * Unit policy (inherits `src/schema/units.ts` and spec §3.3):
 * - Every length in a result is in the **canvas unit** declared by the caller
 *   (`unit` on the result), including width, height, ascender, descender,
 *   baseline and letter/word spacing.
 * - `TypographyToken.lineHeight` remains a **multiple of `fontSize`**, exactly as
 *   the canonical contract defines it. Layout exposes the resolved line box
 *   (`lineHeight` in canvas units) separately so the two are never confused.
 * - Font metadata reports metrics in **font units** together with `unitsPerEm`,
 *   because a font has no canvas. A result that mixes the two would be a bug;
 *   each metric states its space in its field documentation.
 */

import type { Diagnostic } from '../core/diagnostics.ts';
import type { Unit } from '../schema/units.ts';
import type { SceneNode, TextDirection, TypographyToken } from '../schema/types.ts';

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

/**
 * Container formats the loader can actually decode.
 *
 * `woff2` is *detected* so callers get an explicit diagnostic instead of a
 * generic parse failure, but it is **not decoded**: the WOFF2 glyf/loca table
 * transform is not implemented here (see `docs/TYPOGRAPHY.md`).
 */
export type FontFormat = 'truetype' | 'opentype' | 'woff' | 'woff2' | 'collection' | 'unknown';

export type FontStyle = 'normal' | 'italic';

/** How a font was supplied. Recorded so diagnostics can name the source. */
export type FontSourceKind = 'bytes' | 'path' | 'data-uri';

/** Raw font input. `bytes` keeps the engine usable outside Node. */
export type FontSource =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'data-uri'; readonly uri: string };

/**
 * Licensing metadata.
 *
 * Values are read from the font's `name` table (IDs 13/14/0) when present, or
 * supplied at registration. The engine never invents a licence: an absent
 * licence is reported as absent (`ASSET_LICENSING_MISSING`), because shipping a
 * design with an unlicensed face is a legal risk, not a cosmetic warning.
 */
export interface FontLicensing {
  readonly description?: string;
  readonly url?: string;
  readonly copyright?: string;
}

/** Horizontal metrics in **font units** (see `unitsPerEm`). */
export interface FontVerticalMetrics {
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  readonly lineGap: number;
  /** OS/2 `sTypoAscender` when the table is present. */
  readonly typographicAscender?: number;
  readonly typographicDescender?: number;
  readonly typographicLineGap?: number;
  /** OS/2 v2+ `sCapHeight`, font units. */
  readonly capHeight?: number;
  /** OS/2 v2+ `sxHeight`, font units. */
  readonly xHeight?: number;
}

/** Scripts the engine documents as supported for shaping. */
export type SupportedScript = 'latin' | 'bengali' | 'arabic' | 'urdu';

/**
 * Script bucket used for a shaped run.
 *
 * `common` covers whitespace/punctuation that does not commit to a script;
 * `other` is a script outside the documented support matrix (reported, never
 * silently treated as supported).
 */
export type RunScript = SupportedScript | 'common' | 'other';

/** Shaping capability summary read from the font's OpenType tables. */
export interface FontShapingCapabilities {
  /** Script tags enumerated in GSUB (e.g. `bng2`, `arab`, `latn`, `DFLT`). */
  readonly gsubScriptTags: readonly string[];
  /** Feature tags enumerated in GSUB (e.g. `akhn`, `half`, `liga`, `calt`). */
  readonly gsubFeatureTags: readonly string[];
  /** Script tags enumerated in GPOS, when the table is present. */
  readonly gposScriptTags: readonly string[];
  /** Feature tags enumerated in GPOS, when the table is present. */
  readonly gposFeatureTags: readonly string[];
}

/**
 * Parsed font metadata.
 *
 * `id` is deterministic for the same family/weight/style/content, so caching and
 * diagnostics can refer to a font without holding its bytes.
 */
export interface FontMetadata {
  readonly id: string;
  readonly family: string;
  readonly subfamily: string;
  readonly fullName?: string;
  readonly postscriptName?: string;
  readonly format: FontFormat;
  readonly weight: number;
  readonly style: FontStyle;
  readonly metrics: FontVerticalMetrics;
  /** Scripts declared at registration (intent), validated by coverage below. */
  readonly declaredScripts: readonly SupportedScript[];
  /**
   * Scripts actually covered by the font's `cmap`.
   *
   * A script is listed only when the font maps at least
   * `MIN_SCRIPT_COVERAGE` base characters of it, so a stray code point cannot
   * make a font claim a script. Exact counts live in `scriptCoverage`.
   */
  readonly coveredScripts: readonly RunScript[];
  /** Number of code points the font maps. */
  readonly codepointCount: number;
  /**
   * Per-script mapped **base-character** counts, derived from `cmap` coverage.
   *
   * Combining marks are excluded because they inherit the preceding base (a
   * Bengali vowel sign or an Arabic diacritic belongs to whatever precedes it),
   * and shared punctuation/digits are excluded because they are not
   * script-identifying. The counts therefore prove a claim such as "this font
   * supports Bengali" without inflating it with marks. `codepointCount` is the
   * exact `cmap` size.
   */
  readonly scriptCoverage: Readonly<Partial<Record<SupportedScript, number>>>;
  readonly shaping: FontShapingCapabilities;
  readonly licensing: FontLicensing;
  readonly source: FontSourceKind;
  readonly byteLength: number;
  readonly registeredAt: number;
}

/** Registration input. `scripts` is a declared *intent*, verified by coverage. */
export interface RegisterFontInput {
  readonly family: string;
  readonly source: FontSource | Uint8Array | ArrayBuffer;
  readonly weight?: number;
  readonly style?: FontStyle;
  readonly scripts?: readonly SupportedScript[];
  readonly licensing?: FontLicensing;
}

export interface FontRegistrationResult {
  readonly ok: boolean;
  readonly metadata?: FontMetadata;
  readonly diagnostics: readonly Diagnostic[];
}

/** Compact description of a font that a layout actually used. */
export interface ResolvedFontInfo {
  readonly id: string;
  readonly family: string;
  readonly weight: number;
  readonly style: FontStyle;
  readonly format: FontFormat;
}

/** Why the resolver returned the font it did. Never silent. */
export type FontResolutionKind =
  | 'exact'
  | 'weight-nearest'
  | 'style-substituted'
  | 'family-fallback'
  | 'generic-fallback'
  | 'coverage-fallback'
  | 'missing';

export type FontResolutionStatus = 'resolved' | 'fallback' | 'missing';

export interface FontResolution {
  readonly status: FontResolutionStatus;
  readonly kind: FontResolutionKind;
  readonly requestedFamily: string;
  readonly requestedWeight?: number;
  readonly requestedStyle?: FontStyle;
  readonly resolved?: ResolvedFontInfo;
  /** Families tried, in order, before settling on `resolved`. */
  readonly fallbackChain: readonly string[];
  readonly reason: string;
  /** Code points of the requested text the resolved font maps. */
  readonly coveredCodepoints: number;
  /** Code points the resolved font cannot map (rendered as `.notdef`). */
  readonly missingCodepoints: readonly number[];
}

export interface FontRequest {
  readonly fontFamily: string;
  readonly fontWeight?: number | string;
  readonly fontStyle?: FontStyle;
  /** When supplied, coverage is taken into account and reported. */
  readonly text?: string;
  readonly language?: string;
}

/** Result of resolving a family/weight/style/coverage request. */
export interface FontResolveResult {
  readonly ok: boolean;
  readonly resolution: FontResolution;
  readonly diagnostics: readonly Diagnostic[];
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

/** One positioned glyph produced by HarfBuzz. */
export interface ShapedGlyph {
  readonly glyphId: number;
  /** UTF-16 index into the original `text` (HarfBuzz cluster). */
  readonly cluster: number;
  /** Horizontal advance in canvas units at the layout font size. */
  readonly xAdvance: number;
  readonly yAdvance: number;
  readonly xOffset: number;
  readonly yOffset: number;
  /** Raw HarfBuzz glyph flags. */
  readonly flags: number;
  /** True when the font has no glyph for this cluster (glyph id 0). */
  readonly missing: boolean;
}

/** A contiguous run of text shaped with one font, script and direction. */
export interface ShapedTextRun {
  readonly index: number;
  readonly text: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly script: RunScript;
  readonly direction: 'ltr' | 'rtl';
  readonly language?: string;
  readonly font: ResolvedFontInfo;
  readonly resolution: FontResolution;
  readonly glyphs: readonly ShapedGlyph[];
  /** Sum of glyph advances, canvas units. */
  readonly width: number;
  /** Ascender of the run's font at the layout size, canvas units. */
  readonly ascent: number;
  /** Descender (negative), canvas units. */
  readonly descent: number;
  readonly missingGlyphs: number;
}

export interface ShapedText {
  readonly ok: boolean;
  readonly method: 'harfbuzz-shaping';
  readonly unit: Unit;
  readonly text: string;
  readonly fontSize: number;
  readonly direction: 'ltr' | 'rtl';
  readonly scripts: readonly RunScript[];
  readonly runs: readonly ShapedTextRun[];
  readonly fonts: readonly ResolvedFontInfo[];
  readonly width: number;
  /** Sum of the tallest run's ascent+descent, canvas units (no line box). */
  readonly height: number;
  readonly diagnostics: readonly Diagnostic[];
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Horizontal/vertical room available to a text block. */
export interface TextBoxConstraint {
  readonly maxWidth: number;
  readonly maxHeight?: number;
  readonly maxLines?: number;
}

/**
 * Emergency breaking policy for text that cannot fit its container.
 *
 * `normal` (the default) never splits a word: text that does not fit overflows
 * and is reported. `break-word` splits at grapheme boundaries that never fall
 * inside a shaping cluster (a Bengali conjunct stays intact) and marks the line
 * as an emergency break. `anywhere` uses the same mechanics and is kept as a
 * distinct value so callers can express intent.
 */
export type OverflowWrap = 'normal' | 'break-word' | 'anywhere';

/**
 * What the fitting engine may do when text does not fit.
 *
 * - `shrink` (default) — bisect for the largest size between `minFontSize` and
 *   `maxFontSize` that fits every constraint;
 * - `clip` — keep `maxFontSize` and return its overflowing layout, so the
 *   renderer can clip it; the result reports `cannot-fit` and the overflow, but
 *   no `TEXT_FIT_FAILED` error (the caller asked for this);
 * - `fail` — keep `maxFontSize`, return the overflowing layout as evidence, and
 *   add a `TEXT_FIT_FAILED` error.
 */
export type OverflowPolicy = 'shrink' | 'clip' | 'fail';

/** A glyph slice of one run inside one line. */
export interface TextLineRun {
  /** Index into `TextLayoutResult.runs`. */
  readonly runIndex: number;
  readonly glyphStart: number;
  readonly glyphEnd: number;
  readonly width: number;
}

/** One laid-out line with its measurements in canvas units. */
export interface TextLine {
  /** 0-based line index across the whole laid-out text. */
  readonly index: number;
  /** 0-based index of the explicit paragraph this line belongs to. */
  readonly paragraphIndex: number;
  readonly text: string;
  readonly width: number;
  /** Line box height (`fontSize * lineHeight`), canvas units. */
  readonly height: number;
  /** Distance from the top of the line box to the baseline, canvas units. */
  readonly baseline: number;
  /** Font ascender for this line, canvas units. */
  readonly ascent: number;
  /** Font descender (negative), canvas units. */
  readonly descent: number;
  /** Start index in the original text. */
  readonly startIndex: number;
  /** End index (exclusive) in the original text, trailing spaces excluded. */
  readonly endIndex: number;
  readonly graphemeCount: number;
  readonly runs: readonly TextLineRun[];
  /**
   * Run indices in approximate visual order (level-1 bidirectional model: runs
   * are ordered logically for `ltr` bases and reversed for `rtl` bases).
   */
  readonly visualRunOrder: readonly number[];
  /** True when a word had to be split because no legal break existed. */
  readonly emergencyBreak: boolean;
}

/** Structured overflow verdict, independent of the diagnostics list. */
export interface OverflowReport {
  readonly horizontal: boolean;
  readonly vertical: boolean;
  readonly lineCountExceeded: boolean;
  /** At least one unbreakable word/segment is wider than the container. */
  readonly unbreakable: boolean;
  readonly missingGlyphs: number;
  readonly missingFont: boolean;
  readonly unsupportedScripts: readonly string[];
  /** Human-readable reasons, one per detected problem. */
  readonly reasons: readonly string[];
}

/** Intrinsic metrics of the typography actually used by a layout. */
export interface ResolvedTypographyMetrics {
  readonly fontSize: number;
  /** `fontSize * lineHeight`, canvas units. */
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly wordSpacing: number;
  readonly ascender: number;
  readonly descender: number;
  readonly lineGap: number;
  readonly unitsPerEm: number;
  readonly fontWeight: number;
  readonly fontFamily: string;
}

export interface TextLayoutResult {
  readonly ok: boolean;
  readonly status: 'laid-out' | 'overflow' | 'invalid';
  /** Provenance: every measurement came from HarfBuzz glyph advances. */
  readonly method: 'harfbuzz-shaping';
  readonly unit: Unit;
  readonly text: string;
  readonly typography: ResolvedTypographyMetrics;
  readonly baseDirection: 'ltr' | 'rtl';
  readonly scripts: readonly RunScript[];
  readonly runs: readonly ShapedTextRun[];
  readonly fonts: readonly ResolvedFontInfo[];
  readonly lines: readonly TextLine[];
  readonly width: number;
  readonly height: number;
  readonly lineCount: number;
  readonly overflow: OverflowReport;
  readonly constraints: {
    readonly maxWidth?: number;
    readonly maxHeight?: number;
    readonly maxLines?: number;
  };
  readonly diagnostics: readonly Diagnostic[];
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/**
 * Common text request.
 *
 * `typography` is the canonical `TypographyToken` — this engine does not define
 * a second typography shape. `wordSpacing` has no canonical token field (the
 * spec's §9.2 token does not include it), so it is supplied here and reported
 * back on every result.
 */
export interface TextRequest {
  readonly text: string;
  readonly typography: TypographyToken;
  /** BCP-47 tag for this run; used for OpenType language-system selection. */
  readonly language?: string;
  /** `auto` (default) derives the base direction from the detected scripts. */
  readonly direction?: TextDirection;
  readonly wordSpacing?: number;
  /** Extra OpenType feature tags (e.g. `"ss01"`, `"-liga"`). */
  readonly features?: readonly string[];
  /** Canvas unit every length in the result is expressed in. Defaults to `px`. */
  readonly unit?: Unit;
}

export interface MeasureTextResult {
  readonly ok: boolean;
  readonly method: 'harfbuzz-shaping';
  readonly unit: Unit;
  readonly text: string;
  readonly width: number;
  readonly height: number;
  readonly lineCount: number;
  readonly lines: readonly TextLine[];
  readonly runs: readonly ShapedTextRun[];
  readonly fonts: readonly ResolvedFontInfo[];
  readonly typography: ResolvedTypographyMetrics;
  readonly direction: 'ltr' | 'rtl';
  readonly glyphCount: number;
  /** Ascender of the first line, canvas units. */
  readonly ascent: number;
  /** Descender of the first line (negative), canvas units. */
  readonly descent: number;
  /** Baseline offset from the first line's top, canvas units. */
  readonly baseline: number;
  readonly diagnostics: readonly Diagnostic[];
}

export interface WrapTextRequest extends TextRequest {
  readonly maxWidth: number;
  readonly maxLines?: number;
  readonly overflowWrap?: OverflowWrap;
}

export interface WrapTextResult {
  readonly ok: boolean;
  readonly unit: Unit;
  readonly lines: readonly TextLine[];
  readonly runs: readonly ShapedTextRun[];
  readonly width: number;
  readonly height: number;
  readonly lineCount: number;
  readonly overflow: OverflowReport;
  readonly diagnostics: readonly Diagnostic[];
}

export interface TextOverflowRequest {
  readonly layout: TextLayoutResult;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxLines?: number;
}

export interface TextOverflowResult {
  readonly ok: boolean;
  readonly overflow: OverflowReport;
  readonly diagnostics: readonly Diagnostic[];
}

export interface FitTextRequest extends TextRequest {
  readonly minFontSize: number;
  /** Defaults to `typography.fontSize`. */
  readonly maxFontSize?: number;
  readonly maxWidth: number;
  readonly maxHeight?: number;
  readonly maxLines?: number;
  readonly overflowWrap?: OverflowWrap;
  readonly overflowPolicy?: OverflowPolicy;
}

/**
 * `fits` — the requested size fits; `shrunk` — a smaller size (≥ `minFontSize`)
 * was selected; `cannot-fit` — no size satisfied the constraints, or the caller
 * asked to clip; `invalid` — the request itself was rejected.
 */
export type FitStatus = 'fits' | 'shrunk' | 'cannot-fit' | 'invalid';

export interface TextFitResult {
  readonly ok: boolean;
  readonly status: FitStatus;
  readonly unit: Unit;
  readonly requestedFontSize: number;
  readonly selectedFontSize: number;
  readonly minFontSize: number;
  readonly maxFontSize: number;
  readonly lineCount: number;
  readonly width: number;
  readonly height: number;
  readonly availableWidth: number;
  readonly availableHeight?: number;
  readonly maxLines?: number;
  readonly overflow: OverflowReport;
  /**
   * The layout at `selectedFontSize`. Present for `fits`, `shrunk`, `clip` and
   * `fail` (where it is the evidence of the overflow); absent only when the
   * request itself is invalid.
   */
  readonly layout?: TextLayoutResult;
  readonly attempts: number;
  readonly diagnostics: readonly Diagnostic[];
}

export interface LayoutTextRequest extends TextRequest {
  readonly constraint?: TextBoxConstraint;
  readonly overflowWrap?: OverflowWrap;
}

/**
 * Request for laying out the canonical text node shape directly, so the future
 * scene builder cannot hand the engine a divergent typography object.
 */
export interface LayoutSceneTextRequest {
  readonly node: SceneNode;
  readonly constraint?: TextBoxConstraint;
  readonly overflowWrap?: OverflowWrap;
  /** Canvas unit every length in the result is expressed in. Defaults to `px`. */
  readonly unit?: Unit;
}

// ---------------------------------------------------------------------------
// Engine configuration
// ---------------------------------------------------------------------------

export interface TypographyEngineOptions {
  /** Fonts to register during construction. */
  readonly fonts?: readonly RegisterFontInput[];
  /**
   * Families tried when the requested family is missing or cannot cover the
   * text, in order. Defaults to every registered family in registration order.
   */
  readonly fallbackFamilies?: readonly string[];
  /**
   * Mapping from generic CSS family names to registered families, e.g.
   * `{ 'sans-serif': ['Noto Sans'] }`. Generic names are never treated as fonts.
   */
  readonly genericFamilies?: Readonly<Record<string, readonly string[]>>;
  /** Maximum cached shaping entries (default 512). */
  readonly shapingCacheSize?: number;
  /** Maximum cached layout entries (default 128). */
  readonly layoutCacheSize?: number;
  /** Locale used for grapheme/word segmentation (default `'und'`). */
  readonly segmentationLocale?: string;
}

export interface TypographyCacheStats {
  readonly shapingEntries: number;
  readonly shapingHits: number;
  readonly shapingMisses: number;
  readonly layoutEntries: number;
  readonly layoutHits: number;
  readonly layoutMisses: number;
}

/** Script support matrix reported by the engine, not assumed by callers. */
export interface ScriptSupportReport {
  readonly script: SupportedScript;
  readonly shaped: boolean;
  /** True when at least one registered font maps characters of the script. */
  readonly coveredByRegisteredFont: boolean;
  /** Font families whose coverage includes the script. */
  readonly families: readonly string[];
  /** Script-specific requirement that a font may fail to satisfy. */
  readonly note?: string;
}
