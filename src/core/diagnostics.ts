/**
 * Shared structured diagnostics.
 *
 * Both the brief parser and the design-plan validator report findings through
 * this module so that errors have one shape, one severity model and stable
 * machine-readable codes. Stable codes matter because tests, the future editor
 * and the Quality Engine must key off a code rather than an English sentence.
 *
 * Severity model (matches `DESIGN_QUALITY_METRICS.md` §5.1 language):
 * - `error` blocks progress: an invalid plan must not reach the renderer.
 * - `warning` never blocks; it records a real observation (unverified value,
 *   advisory fit, intentional-overlap notice) that a human or later stage
 *   should see. Warnings are not silent: they are returned to the caller.
 */

export type Severity = 'error' | 'warning';

/** A JSON-path-like location inside the validated value, e.g. `elements[2].text.typography.fontSize`. */
export type DiagnosticPath = string;

export interface Diagnostic {
  readonly code: string;
  readonly severity: Severity;
  /** Empty string means "the value as a whole". */
  readonly path: DiagnosticPath;
  /** Human-readable statement of what is wrong. */
  readonly message: string;
  /** Optional concrete fix or next step. */
  readonly hint?: string;
  /** Optional extra evidence (measured value, expected range, offending ID). */
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface ValidationError extends Diagnostic {
  readonly severity: 'error';
}

export interface ValidationWarning extends Diagnostic {
  readonly severity: 'warning';
}

/**
 * Stable diagnostic codes.
 *
 * Grouped by concern. Adding a code is additive; renaming one is a breaking
 * change for consumers and requires a contract version bump.
 */
export const CODES = {
  // Generic / structure
  INVALID_TYPE: 'INVALID_TYPE',
  REQUIRED: 'REQUIRED',
  UNEXPECTED_VALUE: 'UNEXPECTED_VALUE',

  // Document identity and versioning
  DOCUMENT_ID_INVALID: 'DOCUMENT_ID_INVALID',
  DOCUMENT_NAME_MISSING: 'DOCUMENT_NAME_MISSING',
  SCHEMA_VERSION_MISSING: 'SCHEMA_VERSION_MISSING',
  SCHEMA_VERSION_MALFORMED: 'SCHEMA_VERSION_MALFORMED',
  SCHEMA_VERSION_UNSUPPORTED: 'SCHEMA_VERSION_UNSUPPORTED',
  SCHEMA_VERSION_OUTDATED: 'SCHEMA_VERSION_OUTDATED',
  DOCUMENT_VERSION_INVALID: 'DOCUMENT_VERSION_INVALID',
  METADATA_CATEGORY_UNKNOWN: 'METADATA_CATEGORY_UNKNOWN',
  METADATA_TIMESTAMP_INVALID: 'METADATA_TIMESTAMP_INVALID',
  METADATA_TIMESTAMP_ORDER: 'METADATA_TIMESTAMP_ORDER',

  // Canvas
  CANVAS_DIMENSION_INVALID: 'CANVAS_DIMENSION_INVALID',
  CANVAS_DIMENSION_OUT_OF_RANGE: 'CANVAS_DIMENSION_OUT_OF_RANGE',
  CANVAS_ASPECT_UNUSUAL: 'CANVAS_ASPECT_UNUSUAL',
  UNIT_INVALID: 'UNIT_INVALID',
  DPI_INVALID: 'DPI_INVALID',
  DPI_MISSING_FOR_PRINT: 'DPI_MISSING_FOR_PRINT',
  BLEED_INVALID: 'BLEED_INVALID',
  SAFE_AREA_INVALID: 'SAFE_AREA_INVALID',
  INSETS_EXCEED_CANVAS: 'INSETS_EXCEED_CANVAS',
  CANVAS_BACKGROUND_INVALID: 'CANVAS_BACKGROUND_INVALID',
  GRADIENT_INVALID: 'GRADIENT_INVALID',
  GRADIENT_STOP_ORDER: 'GRADIENT_STOP_ORDER',
  GRADIENT_STOP_OFFSET: 'GRADIENT_STOP_OFFSET',

  // Color
  COLOR_INVALID: 'COLOR_INVALID',
  COLOR_ROLE_UNKNOWN: 'COLOR_ROLE_UNKNOWN',
  COLOR_ROLE_MISSING: 'COLOR_ROLE_MISSING',
  CONTRAST_NOT_ASSESSED: 'CONTRAST_NOT_ASSESSED',

  // Assets
  ASSET_KIND_INVALID: 'ASSET_KIND_INVALID',
  ASSET_URI_INVALID: 'ASSET_URI_INVALID',
  ASSET_URI_SCHEME_UNSUPPORTED: 'ASSET_URI_SCHEME_UNSUPPORTED',
  ASSET_MIME_MISSING: 'ASSET_MIME_MISSING',
  ASSET_DIMENSION_INVALID: 'ASSET_DIMENSION_INVALID',
  ASSET_LICENSING_MISSING: 'ASSET_LICENSING_MISSING',
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND',
  ASSET_KIND_MISMATCH: 'ASSET_KIND_MISMATCH',
  ASSET_UNUSED: 'ASSET_UNUSED',
  FONT_ASSET_MISSING: 'FONT_ASSET_MISSING',
  FONT_FAMILY_EMPTY: 'FONT_FAMILY_EMPTY',

  // Identity / uniqueness
  ID_INVALID: 'ID_INVALID',
  ID_NOT_UNIQUE: 'ID_NOT_UNIQUE',
  SHADOW_TOKEN_NOT_FOUND: 'SHADOW_TOKEN_NOT_FOUND',

  // Tokens and typography
  TYPOGRAPHY_TOKEN_MISSING: 'TYPOGRAPHY_TOKEN_MISSING',
  FONT_SIZE_INVALID: 'FONT_SIZE_INVALID',
  FONT_SIZE_IMPLAUSIBLE: 'FONT_SIZE_IMPLAUSIBLE',
  FONT_WEIGHT_INVALID: 'FONT_WEIGHT_INVALID',
  LINE_HEIGHT_INVALID: 'LINE_HEIGHT_INVALID',
  LETTER_SPACING_INVALID: 'LETTER_SPACING_INVALID',
  TEXT_ALIGN_INVALID: 'TEXT_ALIGN_INVALID',
  SPACING_TOKEN_INVALID: 'SPACING_TOKEN_INVALID',
  RADIUS_TOKEN_INVALID: 'RADIUS_TOKEN_INVALID',
  SHADOW_TOKEN_INVALID: 'SHADOW_TOKEN_INVALID',
  SHADOW_OPACITY_INVALID: 'SHADOW_OPACITY_INVALID',

  // Art direction
  ART_DIRECTION_STYLE_UNKNOWN: 'ART_DIRECTION_STYLE_UNKNOWN',
  COLOR_STRATEGY_UNKNOWN: 'COLOR_STRATEGY_UNKNOWN',
  ART_DIRECTION_FIELD_MISSING: 'ART_DIRECTION_FIELD_MISSING',
  VISUAL_DENSITY_INVALID: 'VISUAL_DENSITY_INVALID',
  COMPLEXITY_INVALID: 'COMPLEXITY_INVALID',
  MOOD_EMPTY: 'MOOD_EMPTY',

  // Composition plan
  PATTERN_ID_INVALID: 'PATTERN_ID_INVALID',
  PATTERN_UNKNOWN: 'PATTERN_UNKNOWN',
  PATTERN_DUPLICATE: 'PATTERN_DUPLICATE',
  PATTERN_CATEGORY_MISMATCH: 'PATTERN_CATEGORY_MISMATCH',
  PATTERN_COMBINATION_UNVERIFIED: 'PATTERN_COMBINATION_UNVERIFIED',
  SUPPORTING_PATTERNS_EXCESSIVE: 'SUPPORTING_PATTERNS_EXCESSIVE',
  PATTERN_GUIDANCE_INCOMPLETE: 'PATTERN_GUIDANCE_INCOMPLETE',
  READING_FLOW_INVALID: 'READING_FLOW_INVALID',
  FOCAL_POINT_INVALID: 'FOCAL_POINT_INVALID',
  FOCAL_POINT_OUTSIDE_CANVAS: 'FOCAL_POINT_OUTSIDE_CANVAS',
  FOCAL_STRENGTH_INVALID: 'FOCAL_STRENGTH_INVALID',
  HIERARCHY_EMPTY: 'HIERARCHY_EMPTY',
  HIERARCHY_RANK_INVALID: 'HIERARCHY_RANK_INVALID',
  HIERARCHY_RANK_DUPLICATE: 'HIERARCHY_RANK_DUPLICATE',
  HIERARCHY_ROLE_INVALID: 'HIERARCHY_ROLE_INVALID',
  HIERARCHY_CONTENT_UNRESOLVED: 'HIERARCHY_CONTENT_UNRESOLVED',
  HIERARCHY_CONTENT_DUPLICATE: 'HIERARCHY_CONTENT_DUPLICATE',
  HIERARCHY_ROLE_RANK_INCONSISTENT: 'HIERARCHY_ROLE_RANK_INCONSISTENT',
  ZONE_ID_INVALID: 'ZONE_ID_INVALID',
  ZONE_BOUNDS_INVALID: 'ZONE_BOUNDS_INVALID',
  ZONE_OUTSIDE_CANVAS: 'ZONE_OUTSIDE_CANVAS',
  ZONE_OVERLAP_UNSTATED: 'ZONE_OVERLAP_UNSTATED',
  ZONE_ELEMENT_NOT_FOUND: 'ZONE_ELEMENT_NOT_FOUND',
  ZONE_ELEMENT_MISSING: 'ZONE_ELEMENT_MISSING',
  GRID_TYPE_INVALID: 'GRID_TYPE_INVALID',
  GRID_COLUMNS_INVALID: 'GRID_COLUMNS_INVALID',
  GRID_ROWS_INVALID: 'GRID_ROWS_INVALID',
  GRID_GUTTER_INVALID: 'GRID_GUTTER_INVALID',
  GRID_MARGIN_INVALID: 'GRID_MARGIN_INVALID',
  GRID_BASELINE_INVALID: 'GRID_BASELINE_INVALID',
  GRID_MARGIN_EXCEEDS_CANVAS: 'GRID_MARGIN_EXCEEDS_CANVAS',
  CONSTRAINTS_INVALID: 'CONSTRAINTS_INVALID',
  OVERLAP_PAIRS_CONTRADICT: 'OVERLAP_PAIRS_CONTRADICT',
  OVERLAP_PAIR_UNUSABLE: 'OVERLAP_PAIR_UNUSABLE',
  OVERLAP_PAIR_SELF: 'OVERLAP_PAIR_SELF',
  OVERLAP_NOT_DECLARED: 'OVERLAP_NOT_DECLARED',
  PRESERVE_CONTENT_DISABLED: 'PRESERVE_CONTENT_DISABLED',

  // Scene graph
  NODE_TYPE_INVALID: 'NODE_TYPE_INVALID',
  NODE_NAME_MISSING: 'NODE_NAME_MISSING',
  TRANSFORM_INVALID: 'TRANSFORM_INVALID',
  SCALE_ZERO: 'SCALE_ZERO',
  GEOMETRY_INVALID: 'GEOMETRY_INVALID',
  GEOMETRY_MISSING: 'GEOMETRY_MISSING',
  TEXT_MISSING: 'TEXT_MISSING',
  TEXT_CONTENT_EMPTY: 'TEXT_CONTENT_EMPTY',
  TEXT_DIRECTION_INVALID: 'TEXT_DIRECTION_INVALID',
  TEXT_DIRECTION_CONFLICT: 'TEXT_DIRECTION_CONFLICT',
  IMAGE_PLACEMENT_MISSING: 'IMAGE_PLACEMENT_MISSING',
  IMAGE_CROP_INVALID: 'IMAGE_CROP_INVALID',
  PATH_DATA_INVALID: 'PATH_DATA_INVALID',
  PATH_DATA_MISSING: 'PATH_DATA_MISSING',
  CHILDREN_NOT_ALLOWED: 'CHILDREN_NOT_ALLOWED',
  GROUP_CHILDREN_MISSING: 'GROUP_CHILDREN_MISSING',
  STYLE_INVALID: 'STYLE_INVALID',
  STYLE_OPACITY_INVALID: 'STYLE_OPACITY_INVALID',
  BLEND_MODE_INVALID: 'BLEND_MODE_INVALID',
  STROKE_WIDTH_INVALID: 'STROKE_WIDTH_INVALID',

  // Geometry policy
  BOUNDS_OUTSIDE_CANVAS: 'BOUNDS_OUTSIDE_CANVAS',
  BOUNDS_OUTSIDE_SAFE_AREA: 'BOUNDS_OUTSIDE_SAFE_AREA',

  // Guides / settings
  GUIDE_INVALID: 'GUIDE_INVALID',
  SETTINGS_INVALID: 'SETTINGS_INVALID',

  // Brief consistency
  BRIEF_CANVAS_MISMATCH: 'BRIEF_CANVAS_MISMATCH',
  BRIEF_CATEGORY_MISMATCH: 'BRIEF_CATEGORY_MISMATCH',
  BRIEF_CONTENT_MISSING: 'BRIEF_CONTENT_MISSING',
  BRIEF_LANGUAGE_MISMATCH: 'BRIEF_LANGUAGE_MISMATCH',
  BRIEF_OUTPUT_UNSUPPORTED: 'BRIEF_OUTPUT_UNSUPPORTED',

  // Brief parsing
  BRIEF_CATEGORY_AMBIGUOUS: 'BRIEF_CATEGORY_AMBIGUOUS',
  BRIEF_HEADLINE_MISSING: 'BRIEF_HEADLINE_MISSING',
  BRIEF_DIMENSIONS_UNKNOWN: 'BRIEF_DIMENSIONS_UNKNOWN',
  BRIEF_DIMENSIONS_AMBIGUOUS: 'BRIEF_DIMENSIONS_AMBIGUOUS',
  BRIEF_MEDIUM_UNSPECIFIED: 'BRIEF_MEDIUM_UNSPECIFIED',
  BRIEF_LANGUAGE_UNKNOWN: 'BRIEF_LANGUAGE_UNKNOWN',
  BRIEF_SCRIPT_UNSUPPORTED: 'BRIEF_SCRIPT_UNSUPPORTED',
  BRIEF_MIXED_DIRECTION: 'BRIEF_MIXED_DIRECTION',
  BRIEF_UNSUPPORTED_CONSTRAINT: 'BRIEF_UNSUPPORTED_CONSTRAINT',
  BRIEF_INPUT_EMPTY: 'BRIEF_INPUT_EMPTY',
  BRIEF_INPUT_INVALID: 'BRIEF_INPUT_INVALID',
  BRIEF_FIELD_INVALID: 'BRIEF_FIELD_INVALID',
  BRIEF_CONTACT_UNVERIFIED: 'BRIEF_CONTACT_UNVERIFIED',
  BRIEF_ASSUMPTION_APPLIED: 'BRIEF_ASSUMPTION_APPLIED',
  BRIEF_UNKNOWN_RECORDED: 'BRIEF_UNKNOWN_RECORDED',
  BRIEF_CONFLICT: 'BRIEF_CONFLICT',
  BRIEF_PREFERENCE_UNVERIFIED: 'BRIEF_PREFERENCE_UNVERIFIED',
  BRIEF_BRAND_CLAIM_UNVERIFIED: 'BRIEF_BRAND_CLAIM_UNVERIFIED',
} as const;

export type DiagnosticCode = (typeof CODES)[keyof typeof CODES];

/** Collects diagnostics in emission order, and derives an `ok` verdict. */
export class DiagnosticBag {
  readonly #items: Diagnostic[] = [];

  /**
   * Records an error. `severity` on the argument is ignored so call sites cannot
   * accidentally downgrade an error to a warning.
   */
  error(
    code: DiagnosticCode,
    message: string,
    options: { path?: DiagnosticPath; hint?: string; context?: Record<string, unknown> } = {},
  ): void {
    this.#items.push(
      Object.freeze({
        code,
        severity: 'error' as const,
        path: options.path ?? '',
        message,
        ...(options.hint === undefined ? {} : { hint: options.hint }),
        ...(options.context === undefined ? {} : { context: options.context }),
      }),
    );
  }

  warning(
    code: DiagnosticCode,
    message: string,
    options: { path?: DiagnosticPath; hint?: string; context?: Record<string, unknown> } = {},
  ): void {
    this.#items.push(
      Object.freeze({
        code,
        severity: 'warning' as const,
        path: options.path ?? '',
        message,
        ...(options.hint === undefined ? {} : { hint: options.hint }),
        ...(options.context === undefined ? {} : { context: options.context }),
      }),
    );
  }

  /** True when an error (not merely a warning) was recorded. */
  get hasErrors(): boolean {
    return this.#items.some((item) => item.severity === 'error');
  }

  get errors(): readonly ValidationError[] {
    return this.#items.filter((item): item is ValidationError => item.severity === 'error');
  }

  get warnings(): readonly ValidationWarning[] {
    return this.#items.filter((item): item is ValidationWarning => item.severity === 'warning');
  }

  get all(): readonly Diagnostic[] {
    return Object.freeze([...this.#items]);
  }
}

/** Result envelope returned by every validation entry point. */
export interface ValidationResult<T> {
  /** `true` only when there are no errors. Warnings do not affect it. */
  readonly ok: boolean;
  /** The parsed value, present only when `ok` is `true`. */
  readonly value?: T;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
}

/** Builds the standard result envelope from a bag plus an optional value. */
export function toResult<T>(bag: DiagnosticBag, value: T | undefined): ValidationResult<T> {
  const ok = !bag.hasErrors;
  return Object.freeze({
    ok,
    ...(ok && value !== undefined ? { value } : {}),
    errors: bag.errors,
    warnings: bag.warnings,
  });
}

/** Formats one diagnostic for logs or CLI output. Never throws on odd input. */
export function formatDiagnostic(diagnostic: Diagnostic): string {
  const location = diagnostic.path === '' ? '<root>' : diagnostic.path;
  const hint = diagnostic.hint === undefined ? '' : ` — ${diagnostic.hint}`;
  return `[${diagnostic.severity}] ${diagnostic.code} at ${location}: ${diagnostic.message}${hint}`;
}

/** Formats a list of diagnostics as newline-separated lines. */
export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics.map(formatDiagnostic).join('\n');
}

/** Joins path segments; array indices render as `[n]`. */
export function path(...segments: ReadonlyArray<string | number>): DiagnosticPath {
  let out = '';
  for (const segment of segments) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else if (out === '') out = segment;
    else out += `.${segment}`;
  }
  return out;
}
