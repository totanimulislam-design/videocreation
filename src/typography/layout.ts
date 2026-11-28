/**
 * Text layout orchestration.
 *
 * The pipeline is the one `DESIGN_ENGINE_SPEC.md` §9.1 prescribes, and every step
 * is a real computation:
 *
 *   text → script segmentation → font resolution (with coverage) → HarfBuzz
 *   shaping → glyph measurement → Unicode line breaking → line boxes
 *   → overflow verdict
 *
 * Output is a `TextLayoutResult` carrying shaped glyphs, per-line measurements,
 * baselines and diagnostics — enough for the future deterministic layout and
 * rendering engines to place text without re-measuring it.
 *
 * What this module deliberately does not do: choose a composition, place the
 * block, render glyphs, or certify quality. Those belong to later stages.
 */

import { CODES, DiagnosticBag, type Diagnostic } from '../core/diagnostics.ts';
import { FONT_SIZE_MAX, FONT_SIZE_MIN, LETTER_SPACING_ABSOLUTE_MAX, LINE_HEIGHT_MAX, LINE_HEIGHT_MIN } from '../schema/limits.ts';
import type { TypographyToken } from '../schema/types.ts';
import { UNITS, isUnit } from '../schema/units.ts';
import type { Unit } from '../schema/units.ts';

import type { FontRegistry } from './font-registry.ts';
import { coverageCodepoints } from './font-registry.ts';
import type { HarfBuzzApi, LoadedFont } from './font-record.ts';
import { graphemeSegments } from './line-break.ts';
import { buildRunMeasure, buildShapedRun } from './measure.ts';
import type { RunMeasure } from './measure.ts';
import { detectOverflow } from './overflow.ts';
import { classifyCodePoint, resolveBaseDirection, scriptDirection, segmentByScript } from './script-runs.ts';
import type { ScriptSegment } from './script-runs.ts';
import { shapeRun } from './shaper.ts';
import type { ShapingContext } from './shaper.ts';
import type {
  FontResolution,
  LayoutTextRequest,
  MeasureTextResult,
  OverflowReport,
  OverflowWrap,
  ResolvedFontInfo,
  ResolvedTypographyMetrics,
  RunScript,
  ShapedText,
  ShapedTextRun,
  TextLayoutResult,
  TextLine,
  TextLineRun,
  TextBoxConstraint,
  TextRequest,
  WrapTextRequest,
  WrapTextResult,
} from './types.ts';
import { wrapParagraph } from './wrap.ts';
import type { WrappedLine } from './wrap.ts';

export interface LayoutContext {
  readonly hb: HarfBuzzApi;
  readonly registry: FontRegistry;
  readonly shaping: ShapingContext;
  readonly segmentationLocale: string;
}

/** Word spacing has no canonical token field; its default is zero. */
const DEFAULT_WORD_SPACING = 0;

/** Explicit line terminators, following UAX #14 class BK. */
const LINE_TERMINATORS = new Set<string>(['\r', '\n', '\u2028', '\u2029', '\u000B', '\u000C', '\u0085']);

interface ConstraintSummary {
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxLines?: number;
}

function summarizeConstraint(constraint: { maxWidth?: number; maxHeight?: number; maxLines?: number } | undefined): ConstraintSummary {
  if (!constraint) return {};
  return {
    ...(constraint.maxWidth === undefined ? {} : { maxWidth: constraint.maxWidth }),
    ...(constraint.maxHeight === undefined ? {} : { maxHeight: constraint.maxHeight }),
    ...(constraint.maxLines === undefined ? {} : { maxLines: constraint.maxLines }),
  };
}

export interface ParagraphRange {
  readonly start: number;
  readonly end: number;
}

/** Splits text at mandatory terminators, preserving empty paragraphs. */
export function splitParagraphs(text: string): ParagraphRange[] {
  const out: ParagraphRange[] = [];
  let start = 0;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char !== undefined && LINE_TERMINATORS.has(char)) {
      out.push({ start, end: index });
      if (char === '\r' && text[index + 1] === '\n') index += 2;
      else index += 1;
      start = index;
      continue;
    }
    index += 1;
  }
  out.push({ start, end: text.length });
  return out;
}

interface ValidationOutcome {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly weight: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxLines?: number;
  readonly overflowWrap: OverflowWrap;
  readonly unit: Unit;
}

const NAMED_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  thin: 100,
  extralight: 200,
  'extra-light': 200,
  light: 300,
  normal: 400,
  regular: 400,
  medium: 500,
  semibold: 600,
  'semi-bold': 600,
  bold: 700,
  extrabold: 800,
  'extra-bold': 800,
  black: 900,
  heavy: 900,
});

/** Normalises the canonical token's `number | string` weight. */
export function resolveFontWeight(weight: number | string | undefined): number | undefined {
  if (weight === undefined) return 400;
  if (typeof weight === 'number') {
    return Number.isFinite(weight) && weight >= 1 && weight <= 1000 ? weight : undefined;
  }
  const key = weight.trim().toLowerCase();
  if (key in NAMED_WEIGHTS) return NAMED_WEIGHTS[key];
  const numeric = Number(key);
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 1000 ? numeric : undefined;
}

const FEATURE_PATTERN = /^[-+]?[A-Za-z0-9]{1,4}(\[[0-9:]+\])?(=[0-9]+)?$/;

function validateTypography(
  typography: TypographyToken | undefined,
  constraints: { maxWidth?: number; maxHeight?: number; maxLines?: number },
  overflowWrap: OverflowWrap | undefined,
  unit: Unit,
  wordSpacing: number | undefined,
  features: readonly string[] | undefined,
): ValidationOutcome {
  const bag = new DiagnosticBag();
  const token = typography;
  // `normal` is the default: a word is never split unless the caller explicitly
  // opts into `break-word`/`anywhere`. Silent word-splitting would hide overflow
  // instead of reporting it.
  const fallbackWrap: OverflowWrap = overflowWrap === 'break-word' || overflowWrap === 'anywhere' ? overflowWrap : 'normal';

  if (!isUnit(unit)) {
    bag.error(
      CODES.TYPOGRAPHY_CONFIG_INVALID,
      `Unit ${String(unit)} is not supported by the typography engine.`,
      { path: 'unit', hint: `Use one of: ${UNITS.join(', ')}.` },
    );
  }

  if (!token || typeof token !== 'object') {
    bag.error(CODES.TYPOGRAPHY_CONFIG_INVALID, 'A typography token is required to lay out text.', {
      path: 'typography',
      hint: 'Pass the canonical `TypographyToken` (fontFamily, fontSize, fontWeight, lineHeight, letterSpacing).',
    });
    return { ok: false, diagnostics: bag.all, weight: 400, overflowWrap: fallbackWrap, unit };
  }

  const fontSize = token.fontSize;
  if (typeof fontSize !== 'number' || !Number.isFinite(fontSize) || fontSize < FONT_SIZE_MIN || fontSize > FONT_SIZE_MAX) {
    bag.error(CODES.FONT_SIZE_INVALID, `Font size ${String(fontSize)} is outside ${FONT_SIZE_MIN}…${FONT_SIZE_MAX} ${unit}.`, {
      path: 'typography.fontSize',
      hint: 'Font size is expressed in the canvas unit.',
    });
  }
  const lineHeight = token.lineHeight;
  if (typeof lineHeight !== 'number' || !Number.isFinite(lineHeight) || lineHeight < LINE_HEIGHT_MIN || lineHeight > LINE_HEIGHT_MAX) {
    bag.error(CODES.LINE_HEIGHT_INVALID, `Line height ${String(lineHeight)} is outside ${LINE_HEIGHT_MIN}…${LINE_HEIGHT_MAX}.`, {
      path: 'typography.lineHeight',
      hint: '`lineHeight` is a multiple of `fontSize`, not a length.',
    });
  }
  const letterSpacing = token.letterSpacing;
  if (
    typeof letterSpacing !== 'number' ||
    !Number.isFinite(letterSpacing) ||
    Math.abs(letterSpacing) > LETTER_SPACING_ABSOLUTE_MAX
  ) {
    bag.error(
      CODES.LETTER_SPACING_INVALID,
      `Letter spacing ${String(letterSpacing)} is not a finite value within ±${LETTER_SPACING_ABSOLUTE_MAX}.`,
      { path: 'typography.letterSpacing' },
    );
  }
  if (wordSpacing !== undefined && (!Number.isFinite(wordSpacing) || Math.abs(wordSpacing) > LETTER_SPACING_ABSOLUTE_MAX)) {
    bag.error(CODES.LETTER_SPACING_INVALID, `Word spacing ${String(wordSpacing)} is not a finite value within ±${LETTER_SPACING_ABSOLUTE_MAX}.`, {
      path: 'wordSpacing',
    });
  }
  const weight = resolveFontWeight(token.fontWeight);
  if (weight === undefined) {
    bag.error(CODES.FONT_WEIGHT_INVALID, `Font weight ${String(token.fontWeight)} is not a valid OpenType weight.`, {
      path: 'typography.fontWeight',
      hint: 'Use a numeric weight in 1…1000 or a keyword such as "bold".',
    });
  }
  if (typeof token.fontFamily !== 'string' || token.fontFamily.trim().length === 0) {
    bag.error(CODES.FONT_FAMILY_EMPTY, 'Typography must declare a font family.', { path: 'typography.fontFamily' });
  }
  if (token.textAlign !== undefined && !['left', 'center', 'right', 'justify'].includes(token.textAlign)) {
    bag.error(CODES.TEXT_ALIGN_INVALID, `Text alignment "${String(token.textAlign)}" is not supported.`, { path: 'typography.textAlign' });
  }
  if (constraints.maxWidth !== undefined && (!Number.isFinite(constraints.maxWidth) || constraints.maxWidth <= 0)) {
    bag.error(CODES.TYPOGRAPHY_CONFIG_INVALID, `maxWidth ${String(constraints.maxWidth)} must be a positive finite length.`, {
      path: 'constraint.maxWidth',
    });
  }
  if (constraints.maxHeight !== undefined && (!Number.isFinite(constraints.maxHeight) || constraints.maxHeight < 0)) {
    bag.error(CODES.TYPOGRAPHY_CONFIG_INVALID, `maxHeight ${String(constraints.maxHeight)} must be a finite length.`, {
      path: 'constraint.maxHeight',
    });
  }
  if (constraints.maxLines !== undefined && (!Number.isInteger(constraints.maxLines) || constraints.maxLines < 1)) {
    bag.error(CODES.TYPOGRAPHY_CONFIG_INVALID, `maxLines ${String(constraints.maxLines)} must be a positive integer.`, {
      path: 'constraint.maxLines',
    });
  }
  if (overflowWrap !== undefined && overflowWrap !== 'normal' && overflowWrap !== 'break-word' && overflowWrap !== 'anywhere') {
    bag.error(CODES.TYPOGRAPHY_CONFIG_INVALID, `overflowWrap "${String(overflowWrap)}" is not supported.`, { path: 'overflowWrap' });
  }
  if ('wordSpacing' in (token as unknown as Record<string, unknown>)) {
    bag.warning(
      CODES.TYPOGRAPHY_CONFIG_INVALID,
      '`wordSpacing` is not part of the canonical `TypographyToken` and was ignored there.',
      {
        path: 'typography.wordSpacing',
        hint: 'Pass `wordSpacing` on the layout/measure request, next to `typography`.',
      },
    );
  }
  if (features) {
    for (const feature of features) {
      if (!FEATURE_PATTERN.test(feature)) {
        bag.warning(CODES.TYPOGRAPHY_CONFIG_INVALID, `OpenType feature "${feature}" is not a recognisable feature string and was ignored.`, {
          path: 'features',
          hint: 'Use tags such as "liga", "-liga", "ss01=2" or "kern[3:5]".',
        });
      }
    }
  }

  return {
    ok: !bag.hasErrors,
    diagnostics: bag.all,
    weight: weight ?? 400,
    ...(constraints.maxWidth === undefined ? {} : { maxWidth: constraints.maxWidth }),
    ...(constraints.maxHeight === undefined ? {} : { maxHeight: constraints.maxHeight }),
    ...(constraints.maxLines === undefined ? {} : { maxLines: constraints.maxLines }),
    overflowWrap: fallbackWrap,
    unit,
  };
}

/** Collects diagnostics while suppressing duplicated codes/messages. */
class DiagnosticAccumulator {
  readonly #items: Diagnostic[] = [];
  readonly #seen = new Set<string>();

  add(diagnostics: readonly Diagnostic[]): void {
    for (const diagnostic of diagnostics) {
      const key = `${diagnostic.code}|${diagnostic.message}`;
      if (this.#seen.has(key)) continue;
      this.#seen.add(key);
      this.#items.push(diagnostic);
    }
  }

  get all(): readonly Diagnostic[] {
    return Object.freeze([...this.#items]);
  }
}

function isNastaliqFont(loaded: LoadedFont): boolean {
  const metadata = loaded.metadata;
  const haystack = `${metadata.family} ${metadata.subfamily} ${metadata.fullName ?? ''} ${metadata.postscriptName ?? ''}`;
  return /nastaliq|nastaleeq/i.test(haystack);
}

interface BuiltRuns {
  readonly runs: ShapedTextRun[];
  readonly measures: RunMeasure[];
  readonly baseFont: LoadedFont | undefined;
  readonly missingFont: boolean;
  readonly missingGlyphs: number;
  readonly unsupportedScripts: string[];
  readonly nastaliqMissing: boolean;
}

function coversAll(font: LoadedFont, codepoints: readonly number[]): boolean {
  return codepoints.every((cp) => font.coverage.has(cp));
}

/**
 * True when a grapheme carries no letters of any script — punctuation, digits,
 * spaces or combining marks only. Such text does not identify a font, so it
 * should borrow the font of a neighbouring strong run (or a Latin-capable face)
 * instead of dragging in whatever face happens to sit earlier in the registry.
 */
function isNeutralText(text: string, locale: string): boolean {
  const graphemes = graphemeSegments(text, locale);
  for (const grapheme of graphemes) {
    for (const char of grapheme.text) {
      const script = classifyCodePoint(char.codePointAt(0) ?? 0);
      if (script !== 'common' && script !== 'inherit') return false;
    }
  }
  return true;
}

/** Describes a face chosen because it covers text the requested family cannot. */
function faceResolution(
  font: LoadedFont,
  codepoints: readonly number[],
  requestedFamily: string,
  weight: number,
  reason: string,
): FontResolution {
  const missing = codepoints.filter((cp) => !font.coverage.has(cp));
  const resolved: ResolvedFontInfo = {
    id: font.metadata.id,
    family: font.metadata.family,
    weight: font.metadata.weight,
    style: font.metadata.style,
    format: font.metadata.format,
  };
  return {
    status: 'fallback',
    kind: 'coverage-fallback',
    requestedFamily,
    requestedWeight: weight,
    requestedStyle: 'normal',
    resolved,
    fallbackChain: [requestedFamily, font.metadata.family],
    reason,
    coveredCodepoints: codepoints.length - missing.length,
    missingCodepoints: missing,
  };
}

/** Builds the resolution for the face that will actually shape one run. */
function resolutionFor(
  registry: FontRegistry,
  font: LoadedFont,
  codepoints: readonly number[],
  requestedFamily: string,
  weight: number,
): FontResolution {
  const resolved = registry.resolveCodepoints(codepoints, requestedFamily, { weight, style: 'normal' });
  if (resolved.resolved?.id === font.metadata.id) return resolved;
  return faceResolution(
    font,
    codepoints,
    resolved.requestedFamily,
    weight,
    `"${resolved.requestedFamily}" cannot map this part of the run; "${font.metadata.family}" was used so no character renders as .notdef.`,
  );
}

/**
 * Shapes one paragraph into runs.
 *
 * Script segmentation gives runs; each run's font is resolved with coverage taken
 * into account; a run is then split further when a different registered font can
 * map characters the chosen face cannot (for example Latin digits inside Bengali
 * copy with a Bengali-only family). Splits happen only at grapheme boundaries, so
 * a conjunct or a joined Arabic cluster is never divided between fonts.
 */
function buildParagraphRuns(
  text: string,
  paragraph: ParagraphRange,
  typography: TypographyToken,
  weight: number,
  language: string | undefined,
  features: readonly string[] | undefined,
  context: LayoutContext,
  accumulator: DiagnosticAccumulator,
  firstRunIndex: number,
): BuiltRuns {
  const runs: ShapedTextRun[] = [];
  let missingGlyphs = 0;
  let missingFont = false;
  let nastaliqMissing = false;
  const unsupported = new Set<string>();
  let baseFont: LoadedFont | undefined;

  const paragraphText = text.slice(paragraph.start, paragraph.end);
  const segments = segmentByScript(paragraphText, language);

  const pushRun = (segment: ScriptSegment, font: LoadedFont, localStart: number, localEnd: number): void => {
    const runText = segment.text.slice(localStart, localEnd);
    if (runText.length === 0) return;
    const script = segment.script;
    // The resolution must describe the face that actually shaped this run, not
    // the face that was chosen for the whole segment: `run.font`, `run.ascent`
    // and the coverage diagnostics have to agree with the glyphs.
    const resolution = resolutionFor(context.registry, font, coverageCodepoints(runText), typography.fontFamily, weight);
    const direction = scriptDirection(script);
    const raw = shapeRun(context.shaping, font, runText, {
      script,
      direction,
      ...(language === undefined ? {} : { language }),
      ...(features === undefined ? {} : { features }),
    });
    const run = buildShapedRun({
      index: firstRunIndex + runs.length,
      startIndex: paragraph.start + segment.start + localStart,
      text: runText,
      script,
      direction,
      ...(language === undefined ? {} : { language }),
      font,
      resolution,
      raw,
      fontSize: typography.fontSize,
    });
    missingGlyphs += run.missingGlyphs;
    if (script === 'other') unsupported.add('other');
    if (script === 'urdu' && !isNastaliqFont(font)) nastaliqMissing = true;
    if (!baseFont) baseFont = font;
    runs.push(run);
  };

  // Resolve every segment's primary face first, so a punctuation-only split can
  // borrow the font of the nearest strong neighbour instead of falling through to
  // an arbitrary registry face.
  const plans: Array<{ segment: ScriptSegment; primary: LoadedFont }> = [];
  for (const segment of segments) {
    const codepoints = coverageCodepoints(segment.text);
    const resolution = context.registry.resolveCodepoints(codepoints, typography.fontFamily, { weight, style: 'normal' });
    if (resolution.status === 'missing' || !resolution.resolved) {
      missingFont = true;
      const bag = new DiagnosticBag();
      bag.error(CODES.FONT_NOT_FOUND, `No registered font can shape "${segment.text.slice(0, 32)}".`, {
        path: 'typography.fontFamily',
        hint: 'Register the font, or provide `fallbackFamilies` that cover this script.',
        context: { requestedFamily: typography.fontFamily, script: segment.script },
      });
      accumulator.add(bag.all);
      continue;
    }
    const primary = context.registry.getById(resolution.resolved.id);
    if (!primary) {
      missingFont = true;
      continue;
    }
    plans.push({ segment, primary });
  }

  const alternatives = context.registry.candidates(typography.fontFamily, { weight, style: 'normal' });
  const strongScript = (script: RunScript): boolean => script === 'latin' || script === 'bengali' || script === 'arabic' || script === 'urdu';

  /** Font of the nearest strong-script plan in one direction, if it covers `cps`. */
  const neighbourFont = (planIndex: number, step: 1 | -1, cps: readonly number[]): LoadedFont | undefined => {
    for (let k = planIndex + step; k >= 0 && k < plans.length; k += step) {
      const plan = plans[k];
      if (!plan || !strongScript(plan.segment.script)) continue;
      return coversAll(plan.primary, cps) ? plan.primary : undefined;
    }
    return undefined;
  };

  for (let planIndex = 0; planIndex < plans.length; planIndex += 1) {
    const plan = plans[planIndex];
    if (!plan) continue;
    const { segment, primary } = plan;
    if (!baseFont) baseFont = primary;

    const segmentGraphemes = graphemeSegments(segment.text, context.segmentationLocale);
    let pieceFont = primary;
    let pieceStart = 0;

    for (const grapheme of segmentGraphemes) {
      const cps = coverageCodepoints(grapheme.text);
      if (cps.length === 0 || coversAll(pieceFont, cps)) continue;
      const neutral = isNeutralText(grapheme.text, context.segmentationLocale);
      const borrowed = neutral ? neighbourFont(planIndex, 1, cps) ?? neighbourFont(planIndex, -1, cps) : undefined;
      const covering = alternatives.filter((candidate) => coversAll(candidate.font, cps));
      // Neutral text (punctuation, digits) prefers a Latin-capable face over
      // whichever face merely appears first in the registry.
      const latinCapable = neutral ? covering.find((candidate) => candidate.font.metadata.coveredScripts.includes('latin')) : undefined;
      const target = borrowed ?? (coversAll(primary, cps) ? primary : latinCapable?.font ?? covering[0]?.font);
      if (!target || target.metadata.id === pieceFont.metadata.id) continue;
      if (grapheme.start > pieceStart) pushRun(segment, pieceFont, pieceStart, grapheme.start);
      pieceFont = target;
      pieceStart = grapheme.start;
    }
    pushRun(segment, pieceFont, pieceStart, segment.text.length);
  }

  const baseResolution = context.registry.resolveCodepoints([], typography.fontFamily, { weight, style: 'normal' });
  const resolvedBase =
    baseFont ??
    (baseResolution.resolved === undefined ? undefined : context.registry.getById(baseResolution.resolved.id));

  return {
    runs,
    measures: runs.map((run) => buildRunMeasure(run)),
    baseFont: resolvedBase,
    missingFont,
    missingGlyphs,
    unsupportedScripts: [...unsupported],
    nastaliqMissing,
  };
}

/**
 * Diagnostics for one shaped run's font resolution.
 *
 * Resolution is always visible on the run itself (`run.resolution`), and is also
 * surfaced as diagnostics so a caller that only reads `diagnostics` cannot miss a
 * substitution or a coverage gap.
 */
function resolutionDiagnostics(run: ShapedTextRun): readonly Diagnostic[] {
  const bag = new DiagnosticBag();
  const resolution = run.resolution;
  if (resolution.status === 'fallback') {
    bag.warning(CODES.FONT_FALLBACK_APPLIED, resolution.reason, {
      path: 'typography.fontFamily',
      hint: 'Font substitution is reported, never silent.',
      context: {
        requestedFamily: resolution.requestedFamily,
        resolvedFamily: run.font.family,
        script: run.script,
        text: run.text.slice(0, 24),
        kind: resolution.kind,
      },
    });
  }
  if (resolution.missingCodepoints.length > 0) {
    bag.warning(
      CODES.FONT_COVERAGE_INCOMPLETE,
      `"${run.font.family}" does not map ${resolution.missingCodepoints.length} character(s) in "${run.text.slice(0, 24)}".`,
      {
        path: 'typography.fontFamily',
        hint: 'Register a font covering these characters; missing characters render as .notdef.',
        context: {
          missing: resolution.missingCodepoints
            .slice(0, 12)
            .map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`),
          script: run.script,
        },
      },
    );
  }
  return bag.all;
}

function sliceLineRuns(runs: readonly ShapedTextRun[], start: number, end: number): TextLineRun[] {
  const out: TextLineRun[] = [];
  for (const run of runs) {
    if (run.endIndex <= start || run.startIndex >= end) continue;
    let first = -1;
    let last = -1;
    let width = 0;
    for (let i = 0; i < run.glyphs.length; i += 1) {
      const glyph = run.glyphs[i];
      if (!glyph || glyph.cluster < start || glyph.cluster >= end) continue;
      if (first === -1) first = i;
      last = i;
      width += glyph.xAdvance;
    }
    if (first === -1) continue;
    out.push({ runIndex: run.index, glyphStart: first, glyphEnd: last + 1, width });
  }
  return out;
}

function uniqueFonts(runs: readonly ShapedTextRun[]): readonly ResolvedFontInfo[] {
  const seen = new Set<string>();
  const out: ResolvedFontInfo[] = [];
  for (const run of runs) {
    if (seen.has(run.font.id)) continue;
    seen.add(run.font.id);
    out.push(run.font);
  }
  return Object.freeze(out);
}

function buildResolvedTypography(
  font: LoadedFont | undefined,
  typography: TypographyToken,
  weight: number,
  fontSize: number,
  lineHeightPx: number,
  wordSpacing: number,
): ResolvedTypographyMetrics {
  const metrics = font?.metadata.metrics;
  const scale = metrics ? fontSize / (metrics.unitsPerEm || 1000) : 0;
  return Object.freeze({
    fontSize,
    lineHeight: lineHeightPx,
    letterSpacing: typography.letterSpacing,
    wordSpacing,
    ascender: metrics ? metrics.ascender * scale : 0,
    descender: metrics ? metrics.descender * scale : 0,
    lineGap: metrics?.lineGap ? metrics.lineGap * scale : 0,
    unitsPerEm: metrics?.unitsPerEm ?? 1000,
    fontWeight: font?.metadata.weight ?? weight,
    fontFamily: font?.metadata.family ?? typography.fontFamily,
  });
}

const EMPTY_OVERFLOW: OverflowReport = Object.freeze({
  horizontal: false,
  vertical: false,
  lineCountExceeded: false,
  unbreakable: false,
  missingGlyphs: 0,
  missingFont: false,
  unsupportedScripts: Object.freeze([]),
  reasons: Object.freeze([]),
});

/** Builds the public layout result. Never throws. */
export function layoutText(request: LayoutTextRequest, context: LayoutContext): TextLayoutResult {
  const unit: Unit = request.unit ?? 'px';
  const typography = request.typography;
  const constraints: Partial<TextBoxConstraint> = request.constraint ?? {};
  const validation = validateTypography(typography, constraints, request.overflowWrap, unit, request.wordSpacing, request.features);
  const accumulator = new DiagnosticAccumulator();
  accumulator.add(validation.diagnostics);
  if (!validation.ok) return invalidResult(request, unit, validation, accumulator.all);

  const text = typeof request.text === 'string' ? request.text : '';
  const wordSpacing = request.wordSpacing ?? DEFAULT_WORD_SPACING;
  const fontSize = typography.fontSize;
  const lineHeightPx = fontSize * typography.lineHeight;

  if (text.length === 0) {
    accumulator.add([
      Object.freeze({
        code: CODES.TEXT_CONTENT_EMPTY,
        severity: 'warning' as const,
        path: 'text',
        message: 'Text content is empty; nothing was measured.',
        hint: 'Empty text is valid but produces no lines; callers should not treat a zero-size block as a layout result.',
      }),
    ]);
    return emptyLayout(request, unit, validation, accumulator.all);
  }

  const language = request.language;
  const baseDirection = resolveBaseDirection(text, request.direction, language);
  const paragraphs = splitParagraphs(text);

  const allRuns: ShapedTextRun[] = [];
  const lines: TextLine[] = [];
  let missingGlyphs = 0;
  let missingFont = false;
  let unbreakable = false;
  const unsupportedScripts = new Set<string>();
  let nastaliqMissing = false;
  let lineHeightWarned = false;
  let dominantFont: LoadedFont | undefined;
  let anyEmergency = false;
  const scripts = new Set<RunScript>();
  const maxWidth = constraints.maxWidth ?? Number.POSITIVE_INFINITY;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const built = buildParagraphRuns(
      text,
      paragraph,
      typography,
      validation.weight,
      language,
      request.features,
      context,
      accumulator,
      allRuns.length,
    );
    missingGlyphs += built.missingGlyphs;
    missingFont = missingFont || built.missingFont;
    if (built.nastaliqMissing) nastaliqMissing = true;
    for (const script of built.unsupportedScripts) unsupportedScripts.add(script);
    if (!dominantFont && built.baseFont) dominantFont = built.baseFont;
    for (const run of built.runs) {
      scripts.add(run.script);
      accumulator.add(resolutionDiagnostics(run));
    }

    allRuns.push(...built.runs);

    const wrapped =
      paragraph.end > paragraph.start
        ? wrapParagraph({
            text,
            start: paragraph.start,
            end: paragraph.end,
            runs: built.runs,
            measures: built.measures,
            maxWidth,
            letterSpacing: typography.letterSpacing,
            wordSpacing,
            overflowWrap: validation.overflowWrap,
            locale: context.segmentationLocale,
          })
        : { lines: [] as WrappedLine[], unbreakable: false, emergencyBreaks: 0 };

    if (wrapped.unbreakable) unbreakable = true;
    if (wrapped.emergencyBreaks > 0) anyEmergency = true;

    const scale = built.baseFont ? fontSize / (built.baseFont.metadata.metrics.unitsPerEm || 1000) : 0;
    const fallbackMetrics = built.baseFont
      ? { ascent: built.baseFont.metadata.metrics.ascender * scale, descent: built.baseFont.metadata.metrics.descender * scale }
      : { ascent: 0, descent: 0 };

    const paragraphLines: WrappedLine[] =
      wrapped.lines.length > 0
        ? [...wrapped.lines]
        : [
            {
              startIndex: paragraph.start,
              endIndex: paragraph.start,
              text: '',
              width: 0,
              graphemeCount: 0,
              spaceCount: 0,
              emergencyBreak: false,
            },
          ];

    for (const wrappedLine of paragraphLines) {
      const lineRuns = sliceLineRuns(built.runs, wrappedLine.startIndex, wrappedLine.endIndex);
      const firstRunIndex = lineRuns[0]?.runIndex;
      const firstRun = firstRunIndex === undefined ? undefined : built.runs.find((run) => run.index === firstRunIndex);
      const metrics = firstRun ? { ascent: firstRun.ascent, descent: firstRun.descent } : fallbackMetrics;
      const contentHeight = metrics.ascent - metrics.descent;
      if (!lineHeightWarned && contentHeight > lineHeightPx + 1e-9) {
        lineHeightWarned = true;
        const suggested = Math.ceil((contentHeight / fontSize) * 100) / 100;
        const bag = new DiagnosticBag();
        bag.warning(
          CODES.TEXT_LINE_HEIGHT_BELOW_METRICS,
          `Line height ${lineHeightPx.toFixed(2)} ${unit} is smaller than the font's ascent+descent (${contentHeight.toFixed(2)} ${unit}).`,
          {
            path: 'typography.lineHeight',
            hint: `Use a line-height multiple of at least ${suggested} so consecutive lines do not overlap.`,
            context: { lineHeightMultiple: typography.lineHeight, suggestedMultiple: suggested },
          },
        );
        accumulator.add(bag.all);
      }
      const baseline = (lineHeightPx - contentHeight) / 2 + metrics.ascent;
      const visualRunOrder =
        baseDirection === 'rtl'
          ? lineRuns.map((_, index) => lineRuns.length - 1 - index)
          : lineRuns.map((_, index) => index);
      lines.push(
        Object.freeze({
          index: lines.length,
          paragraphIndex,
          text: wrappedLine.text,
          width: wrappedLine.width,
          height: lineHeightPx,
          baseline,
          ascent: metrics.ascent,
          descent: metrics.descent,
          startIndex: wrappedLine.startIndex,
          endIndex: wrappedLine.endIndex,
          graphemeCount: wrappedLine.graphemeCount,
          runs: Object.freeze(lineRuns),
          visualRunOrder: Object.freeze(visualRunOrder),
          emergencyBreak: wrappedLine.emergencyBreak,
        }),
      );
    }
  });

  const width = lines.reduce((widest, line) => Math.max(widest, line.width), 0);
  const height = lines.reduce((total, line) => total + line.height, 0);

  const directions = new Set(allRuns.map((run) => run.direction));
  if (directions.size > 1) {
    const bag = new DiagnosticBag();
    bag.warning(CODES.TEXT_BIDI_APPROXIMATED, 'Text mixes writing directions; run order uses a level-1 bidirectional approximation.', {
      path: 'text',
      hint: 'Full UAX #9 (embedding levels, isolates, neutral resolution) is not implemented. Glyphs inside each run are shaped correctly for that run\'s own direction.',
      context: { baseDirection, directions: [...directions] },
    });
    accumulator.add(bag.all);
  }

  if (nastaliqMissing) {
    const bag = new DiagnosticBag();
    bag.warning(CODES.TEXT_URDU_NASTALIQ_UNAVAILABLE, 'Urdu text was shaped with a font that is not a Nastaliq face.', {
      path: 'typography.fontFamily',
      hint: 'Register a Nastaliq font (e.g. Noto Nastaliq Urdu) for Urdu\'s calligraphic style; a Naskh font shapes Urdu correctly but looks different.',
    });
    accumulator.add(bag.all);
  }

  if (anyEmergency) {
    const bag = new DiagnosticBag();
    bag.warning(CODES.TEXT_EMERGENCY_BREAK, 'At least one line was broken mid-word because no legal break opportunity fit.', {
      path: 'lines',
      hint: 'Shorten the copy, widen the container, or accept the break. Grapheme clusters and shaping clusters were preserved.',
    });
    accumulator.add(bag.all);
  }

  const overflowResult = detectOverflow({
    lines,
    height,
    ...(constraints.maxWidth === undefined ? {} : { maxWidth: constraints.maxWidth }),
    ...(constraints.maxHeight === undefined ? {} : { maxHeight: constraints.maxHeight }),
    ...(constraints.maxLines === undefined ? {} : { maxLines: constraints.maxLines }),
    missingGlyphs,
    missingFont,
    unsupportedScripts: [...unsupportedScripts],
    unbreakable,
  });
  accumulator.add(overflowResult.diagnostics);

  const ok = !accumulator.all.some((diagnostic) => diagnostic.severity === 'error') && !overflowResult.hasOverflow;

  return Object.freeze({
    ok,
    status: overflowResult.hasOverflow ? ('overflow' as const) : ('laid-out' as const),
    method: 'harfbuzz-shaping' as const,
    unit,
    text,
    typography: buildResolvedTypography(dominantFont, typography, validation.weight, fontSize, lineHeightPx, wordSpacing),
    baseDirection,
    scripts: Object.freeze([...scripts]),
    runs: Object.freeze(allRuns),
    fonts: uniqueFonts(allRuns),
    lines: Object.freeze(lines),
    width,
    height,
    lineCount: lines.length,
    overflow: overflowResult.report,
    constraints: Object.freeze(summarizeConstraint(constraints)),
    diagnostics: accumulator.all,
  });
}

function emptyLayout(
  request: LayoutTextRequest,
  unit: Unit,
  validation: ValidationOutcome,
  diagnostics: readonly Diagnostic[],
): TextLayoutResult {
  const typography = request.typography;
  return Object.freeze({
    ok: true,
    status: 'laid-out' as const,
    method: 'harfbuzz-shaping' as const,
    unit,
    text: request.text ?? '',
    typography: buildResolvedTypography(
      undefined,
      typography,
      validation.weight,
      typography.fontSize,
      typography.fontSize * typography.lineHeight,
      request.wordSpacing ?? 0,
    ),
    baseDirection: request.direction === 'rtl' ? 'rtl' : 'ltr',
    scripts: Object.freeze([]),
    runs: Object.freeze([]),
    fonts: Object.freeze([]),
    lines: Object.freeze([]),
    width: 0,
    height: 0,
    lineCount: 0,
    overflow: EMPTY_OVERFLOW,
    constraints: Object.freeze(summarizeConstraint(request.constraint)),
    diagnostics,
  });
}

function invalidResult(
  request: LayoutTextRequest,
  unit: Unit,
  validation: ValidationOutcome,
  diagnostics: readonly Diagnostic[],
): TextLayoutResult {
  const typography = request.typography;
  const safeToken: TypographyToken =
    typography && typeof typography === 'object'
      ? typography
      : { fontFamily: '', fontSize: 0, fontWeight: 400, lineHeight: 1, letterSpacing: 0 };
  return Object.freeze({
    ok: false,
    status: 'invalid' as const,
    method: 'harfbuzz-shaping' as const,
    unit,
    text: typeof request.text === 'string' ? request.text : '',
    typography: buildResolvedTypography(
      undefined,
      safeToken,
      validation.weight,
      safeToken.fontSize,
      safeToken.fontSize * safeToken.lineHeight,
      request.wordSpacing ?? 0,
    ),
    baseDirection: request.direction === 'rtl' ? 'rtl' : 'ltr',
    scripts: Object.freeze([]),
    runs: Object.freeze([]),
    fonts: Object.freeze([]),
    lines: Object.freeze([]),
    width: 0,
    height: 0,
    lineCount: 0,
    overflow: EMPTY_OVERFLOW,
    constraints: Object.freeze({}),
    diagnostics,
  });
}

/** Builds an invalid layout result for callers that reject a request before measuring. */
export function invalidLayout(request: TextRequest, unit: Unit, diagnostics: readonly Diagnostic[]): TextLayoutResult {
  const validation = validateTypography(request.typography, {}, undefined, unit, request.wordSpacing, request.features);
  return invalidResult(request, unit, validation, diagnostics);
}

/**
 * Shapes text without wrapping it, for callers that need glyph output only.
 *
 * Script segmentation, font resolution and coverage splitting behave exactly as
 * in `layoutText`, so a shaping result and a layout result can never disagree
 * about which font renders which characters.
 */
export function shapeText(request: TextRequest, context: LayoutContext): ShapedText {
  const unit: Unit = request.unit ?? 'px';
  const typography = request.typography;
  const validation = validateTypography(typography, {}, undefined, unit, request.wordSpacing, request.features);
  const accumulator = new DiagnosticAccumulator();
  accumulator.add(validation.diagnostics);
  if (!validation.ok) {
    return Object.freeze({
      ok: false,
      method: 'harfbuzz-shaping' as const,
      unit,
      text: typeof request.text === 'string' ? request.text : '',
      fontSize: typography?.fontSize ?? 0,
      direction: 'ltr',
      scripts: Object.freeze([]),
      runs: Object.freeze([]),
      fonts: Object.freeze([]),
      width: 0,
      height: 0,
      diagnostics: accumulator.all,
    });
  }

  const text = request.text;
  const baseDirection = resolveBaseDirection(text, request.direction, request.language);
  const runs: ShapedTextRun[] = [];
  for (const paragraph of splitParagraphs(text)) {
    const built = buildParagraphRuns(
      text,
      paragraph,
      typography,
      validation.weight,
      request.language,
      request.features,
      context,
      accumulator,
      runs.length,
    );
    runs.push(...built.runs);
  }
  for (const run of runs) accumulator.add(resolutionDiagnostics(run));
  const width = runs.reduce((total, run) => total + run.width, 0);
  const height = runs.reduce((tallest, run) => Math.max(tallest, run.ascent - run.descent), 0);
  return Object.freeze({
    ok: !accumulator.all.some((diagnostic) => diagnostic.severity === 'error'),
    method: 'harfbuzz-shaping' as const,
    unit,
    text,
    fontSize: typography.fontSize,
    direction: baseDirection,
    scripts: Object.freeze([...new Set(runs.map((run) => run.script))]),
    runs: Object.freeze(runs),
    fonts: uniqueFonts(runs),
    width,
    height,
    diagnostics: accumulator.all,
  });
}

/**
 * Projects a layout into the wrapping view.
 *
 * Kept as a projection rather than a second measurement path so the engine can
 * serve both calls from one cached layout: the numbers cannot diverge.
 */
export function wrapResultFrom(layout: TextLayoutResult): WrapTextResult {
  return {
    ok: layout.ok,
    unit: layout.unit,
    lines: layout.lines,
    runs: layout.runs,
    width: layout.width,
    height: layout.height,
    lineCount: layout.lineCount,
    overflow: layout.overflow,
    diagnostics: layout.diagnostics,
  };
}

/** Builds the layout request for a wrapping call. */
export function layoutRequestFromWrap(request: WrapTextRequest): LayoutTextRequest {
  return {
    text: request.text,
    typography: request.typography,
    ...(request.language === undefined ? {} : { language: request.language }),
    ...(request.direction === undefined ? {} : { direction: request.direction }),
    ...(request.wordSpacing === undefined ? {} : { wordSpacing: request.wordSpacing }),
    ...(request.features === undefined ? {} : { features: request.features }),
    ...(request.unit === undefined ? {} : { unit: request.unit }),
    constraint: {
      maxWidth: request.maxWidth,
      ...(request.maxLines === undefined ? {} : { maxLines: request.maxLines }),
    },
    ...(request.overflowWrap === undefined ? {} : { overflowWrap: request.overflowWrap }),
  };
}

/** Wrapping entry point for direct use outside the engine facade. */
export function wrapText(request: WrapTextRequest, context: LayoutContext): WrapTextResult {
  return wrapResultFrom(layoutText(layoutRequestFromWrap(request), context));
}

/** Projects a layout into the measurement view. */
export function measureResultFrom(layout: TextLayoutResult): MeasureTextResult {
  const firstLine = layout.lines[0];
  return {
    ok: layout.ok,
    method: 'harfbuzz-shaping' as const,
    unit: layout.unit,
    text: layout.text,
    width: layout.width,
    height: layout.height,
    lineCount: layout.lineCount,
    lines: layout.lines,
    runs: layout.runs,
    fonts: layout.fonts,
    typography: layout.typography,
    direction: layout.baseDirection,
    glyphCount: layout.runs.reduce((total, run) => total + run.glyphs.length, 0),
    ascent: firstLine?.ascent ?? 0,
    descent: firstLine?.descent ?? 0,
    baseline: firstLine?.baseline ?? 0,
    diagnostics: layout.diagnostics,
  };
}

/** Measurement entry point: the text laid out without a width constraint. */
export function measureText(request: TextRequest, context: LayoutContext): MeasureTextResult {
  return measureResultFrom(layoutText(request, context));
}
