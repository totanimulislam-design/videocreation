/**
 * Brief-parsing result types.
 *
 * The canonical `DesignBrief` (spec §4.2) holds field-level facts only. Parsing
 * also produces *epistemic* information — what was inferred, what is unknown,
 * what was assumed — and that must be visible to a human and to downstream
 * stages without polluting the contract. It therefore lives here, alongside the
 * brief, in an analysis envelope.
 */

import type { DesignBrief, LanguageTag, Medium, OutputFormat, Unit } from '../schema/types.ts';
import type { Diagnostic } from '../core/diagnostics.ts';

/** How a brief field was established. Ordered from strongest to weakest evidence. */
export type EvidenceKind =
  /** Present verbatim in the user's text. */
  | 'explicit'
  /** Stated by the caller in structured hints (not natural language). */
  | 'caller-supplied'
  /** Derived deterministically from documented rules (e.g. category → medium). */
  | 'derived'
  /** Chosen by the parser because the brief omitted it. Reversible. */
  | 'assumed'
  /** Not established; a safe placeholder is in place. */
  | 'unknown';

export interface FieldEvidence {
  readonly field: string;
  readonly kind: EvidenceKind;
  /** Short quote or rule that justifies the value. */
  readonly basis: string;
  /** 0–1. `unknown` and `assumed` values are always below 1. */
  readonly confidence: number;
}

/** An assumption the parser made, recorded so it can be surfaced and reversed. */
export interface RecordedAssumption {
  readonly field: string;
  readonly value: string;
  readonly reason: string;
  /** What to ask the user to resolve it. */
  readonly question?: string;
}

/** An open question the brief does not answer. Never silently filled with invented data. */
export interface OpenQuestion {
  readonly field: string;
  readonly question: string;
  readonly blocking: boolean;
}

/** A place where the user's own text is contradictory or unsatisfiable. */
export interface BriefConflict {
  readonly field: string;
  readonly description: string;
  /** Which value the parser kept, and why. */
  readonly resolution: string;
}

/** Reference to an asset the brief says is required but which was not supplied. */
export interface RequiredAssetRequest {
  readonly id: string;
  readonly kind: 'image' | 'font' | 'vector';
  /** What the brief appears to need it for, quoted from user text when possible. */
  readonly purpose: string;
  readonly supplied: boolean;
}

/**
 * A constraint the brief states, in its own terms.
 *
 * The canonical `DesignBrief` (spec §4.2) has no constraints block, and adding
 * one would fork the contract. Stated constraints are therefore recorded here,
 * next to the brief they constrain, and carried into the plan's
 * `DesignConstraints`/canvas fields by the caller.
 */
export interface BriefConstraint {
  readonly kind:
    | 'bleed'
    | 'safe-area'
    | 'no-images'
    | 'text-only'
    | 'monochrome'
    | 'minimal-text'
    | 'large-text'
    | 'accessibility'
    | 'legal'
    | 'brand-guideline'
    | 'output-format'
    | 'other';
  /** The user's words that triggered the constraint. */
  readonly quote: string;
  /** Specific value if one was stated (e.g. `3mm`); otherwise omitted. */
  readonly value?: string;
}

/** Language/script analysis used later for typography decisions. */
export interface ScriptAnalysis {
  readonly languages: readonly LanguageTag[];
  readonly scripts: readonly string[];
  readonly dominantDirection: 'ltr' | 'rtl' | 'mixed' | 'unknown';
  readonly mixedDirection: boolean;
  readonly unsupportedLanguages: readonly string[];
}

/**
 * Full parser output.
 *
 * `brief` is the contract value and is safe to pass to later stages.
 * `analysis` never changes `brief`; it explains it.
 */
export interface BriefParseResult {
  readonly brief: DesignBrief;
  readonly analysis: BriefAnalysis;
  readonly diagnostics: readonly Diagnostic[];
  /** `false` when at least one error-severity diagnostic was recorded. */
  readonly ok: boolean;
}

export interface BriefAnalysis {
  readonly evidence: readonly FieldEvidence[];
  readonly assumptions: readonly RecordedAssumption[];
  readonly openQuestions: readonly OpenQuestion[];
  readonly conflicts: readonly BriefConflict[];
  readonly requiredAssets: readonly RequiredAssetRequest[];
  readonly script: ScriptAnalysis;
  /**
   * Content the parser recognised as factual but could not safely assign to a
   * slot (e.g. an unlabelled phone number). Preserved for human review instead
   * of being dropped or reshaped.
   */
  readonly unassignedContent: readonly string[];
  /** Constraints the brief states, in the user's own terms. */
  readonly constraints: readonly BriefConstraint[];
  /** Content categories detected, per `DESIGN_ENGINE_SPEC.md` §4.3. */
  readonly contentClasses: readonly ContentClass[];
  readonly confidence: number;
}

/** Content classifications from spec §4.3, plus their default importance (§4.4). */
export type ContentClass =
  | 'primary-headline'
  | 'secondary-headline'
  | 'supporting-statement'
  | 'main-body'
  | 'important-information'
  | 'date-time'
  | 'location'
  | 'price'
  | 'cta'
  | 'brand-information'
  | 'contact-information'
  | 'legal-information';

/** Starts `unknown`/`assumed`; every field the parser cannot prove stays below 1. */
export const CONFIDENCE = Object.freeze({
  explicit: 1,
  callerSupplied: 0.98,
  derivedHigh: 0.85,
  derivedMedium: 0.6,
  assumed: 0.4,
  unknown: 0,
});

/** Structured hints a caller may supply when it already knows a fact (form input, API caller). */
export interface BriefHints {
  readonly category?: string;
  readonly width?: number;
  readonly height?: number;
  readonly unit?: Unit;
  readonly medium?: Medium;
  readonly languages?: readonly string[];
  readonly outputFormats?: readonly OutputFormat[];
  /** Category label from a UI; mapped to a canonical category ID. */
  readonly categoryLabel?: string;
}

export interface ParseBriefOptions {
  /**
   * Treat missing dimensions as an error rather than an assumption.
   *
   * Default `false`: the parser records the usual print handbill size as an
   * explicit assumption (with a question for the user). Set to `true` in
   * strict/production flows where a guessed canvas is unacceptable.
   */
  readonly requireDimensions?: boolean;
  /** Continue past missing essential content and report problems as warnings. */
  readonly lenient?: boolean;
}
