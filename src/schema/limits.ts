/**
 * Numeric limits for the design contract.
 *
 * Centralised so the parser, validator and future engine cannot disagree about
 * what "too large" means. Values are intentionally generous but finite: an
 * unbounded canvas or font size is an attack surface (memory, export size) as
 * well as a correctness problem.
 */

/** Canvas edge limits in canvas units. */
export const CANVAS_MIN_SIZE = 1;
/**
 * Upper bound chosen to cover large-format print at high resolution while
 * refusing absurd documents. In `px` this allows a 20000px canvas; in `mm` it
 * allows a 20-metre banner.
 */
export const CANVAS_MAX_SIZE = 20_000;

/** Ratio guard for pathological aspect ratios (e.g. 20000 x 1). */
export const CANVAS_MAX_ASPECT_RATIO = 100;

/** Font size limits in canvas units. */
export const FONT_SIZE_MIN = 0.5;
export const FONT_SIZE_MAX = 5000;

/**
 * Below this, text is treated as "unusable" for essential content
 * (`DESIGN_QUALITY_METRICS.md` §4 Layout failure: "Unusable text sizes").
 * Expressed in canvas units and additionally in millimetres where resolvable.
 */
export const MIN_LEGIBLE_MM = 1.4;

export const LINE_HEIGHT_MIN = 0.5;
export const LINE_HEIGHT_MAX = 5;
export const LETTER_SPACING_ABSOLUTE_MAX = 1000;

export const FONT_WEIGHT_MIN = 1;
export const FONT_WEIGHT_MAX = 1000;

export const OPACITY_MIN = 0;
export const OPACITY_MAX = 1;

/** Maximum number of elements accepted in one document. */
export const MAX_ELEMENTS = 10_000;

/** Maximum nesting depth for group nodes. */
export const MAX_GROUP_DEPTH = 16;

/** Maximum supporting patterns allowed by library §2.3 ("one or two"). */
export const MAX_SUPPORTING_PATTERNS = 2;
