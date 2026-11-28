/**
 * Level 1 text-fit screening for briefs.
 *
 * IMPORTANT LIMITATION (stated rather than hidden): this is a *capacity
 * estimate*, not text measurement. `DESIGN_ENGINE_SPEC.md` §9.3 forbids
 * estimating text dimensions from character count alone, and
 * `DESIGN_QUALITY_METRICS.md` §5.1 says a text-fit check based only on estimated
 * metrics must be reported as `not_assessed` and must not be approved.
 *
 * So the function below does exactly one honest job: at brief time, *before* any
 * canvas geometry is planned, it flags that the supplied headline is
 * implausibly long for the canvas at a legible size. It never claims the text
 * fits. Real fitting requires the shaping/measurement service and is a later
 * phase. Callers must present `assessment: 'not_assessed'` downstream.
 */

export type FitAssessment = 'not_assessed' | 'capacity_warning';

export interface HeadlineCapacityInput {
  readonly headline: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** Canvas unit, used only for the message. */
  readonly unit: string;
  /** Share of canvas width the headline block will plausibly occupy (0–1). */
  readonly widthShare?: number;
}

export interface HeadlineCapacityResult {
  readonly assessment: FitAssessment;
  /** Estimated characters that fit on one line at the assumed minimum size. */
  readonly charactersPerLine: number;
  readonly estimatedLines: number;
  /** Estimated share of canvas height used by the headline block. */
  readonly heightShare: number;
  readonly reason?: string;
  /** Reminder text for callers that must not present estimates as measurement. */
  readonly caveat: string;
}

/**
 * Conservative heuristic constants, documented as heuristics.
 *
 * `AVERAGE_CHAR_WIDTH_RATIO` is the width of an average lowercase glyph as a
 * fraction of font size for humanist sans faces (~0.55). `HEADLINE_MIN_SIZE_SHARE`
 * is the smallest headline size treated as plausible relative to canvas width
 * (3%) — large enough to stay legible on the smallest typical poster.
 */
const AVERAGE_CHAR_WIDTH_RATIO = 0.58;
const HEADLINE_MIN_SIZE_SHARE = 0.03;
const LINE_HEIGHT_RATIO = 1.2;

/** Characters that do not consume horizontal advance meaningfully. */
const ZERO_WIDTH_LIKE = /[\u200B-\u200D\uFEFF]/;

/**
 * Estimates whether a headline is plausibly fittable. Never returns "fits".
 *
 * Deliberately returns `not_assessed` when the input lacks a usable canvas, and
 * `capacity_warning` only for a strong signal (headline would occupy more than
 * ~55% of canvas height at the minimum plausible size).
 */
export function estimateHeadlineCapacity(input: HeadlineCapacityInput): HeadlineCapacityResult {
  const caveat =
    'Estimated from character count and assumed glyph metrics; this is not text measurement. Run shaped measurement before approving any layout (DESIGN_ENGINE_SPEC.md §9.3).';

  const clean = input.headline.replace(ZERO_WIDTH_LIKE, '').trim();
  const widthShare = input.widthShare ?? 0.8;

  if (
    clean.length === 0 ||
    !Number.isFinite(input.canvasWidth) ||
    !Number.isFinite(input.canvasHeight) ||
    input.canvasWidth <= 0 ||
    input.canvasHeight <= 0
  ) {
    return {
      assessment: 'not_assessed',
      charactersPerLine: 0,
      estimatedLines: 0,
      heightShare: 0,
      reason: 'Missing usable headline or canvas geometry.',
      caveat,
    };
  }

  const availableWidth = input.canvasWidth * widthShare;
  const minFontSize = Math.max(input.canvasWidth * HEADLINE_MIN_SIZE_SHARE, 0.5);
  const averageAdvance = minFontSize * AVERAGE_CHAR_WIDTH_RATIO;
  const charactersPerLine = Math.max(1, Math.floor(availableWidth / averageAdvance));
  const estimatedLines = Math.ceil(clean.length / charactersPerLine);
  const headlineHeight = estimatedLines * minFontSize * LINE_HEIGHT_RATIO;
  const heightShare = headlineHeight / input.canvasHeight;

  if (heightShare > 0.55) {
    return {
      assessment: 'capacity_warning',
      charactersPerLine,
      estimatedLines,
      heightShare,
      reason: `At the smallest plausible headline size (~${minFontSize.toFixed(1)}${input.unit}), the headline would occupy about ${(heightShare * 100).toFixed(0)}% of the canvas height across ~${estimatedLines} lines. Shorten the headline, raise the canvas height, or confirm the reduced hierarchy.`,
      caveat,
    };
  }

  return {
    assessment: 'not_assessed',
    charactersPerLine,
    estimatedLines,
    heightShare,
    reason: 'No capacity problem detected by the character-count heuristic.',
    caveat,
  };
}
