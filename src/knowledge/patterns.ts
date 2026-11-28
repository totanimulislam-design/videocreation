/**
 * Pattern registry — the queryable view over generated pattern metadata.
 *
 * This is the integration point between the canonical `CompositionPlan` and
 * `DESIGN_PATTERNS_LIBRARY.md`: a plan refers to a pattern by stable ID, and the
 * validator/selector resolve everything else (name, category, meaning,
 * implementation notes, use cases) through this module.
 *
 * The library's `DesignPattern` shape (§19) also names fields such as
 * `avoidWhen`, `commonMistakes`, `validationChecks`, `adaptationRules`,
 * `recommendedElements`, `structure.readingFlow` and `complexity`. The current
 * Markdown catalogue does not supply them for most entries, so they are
 * **not** invented here; `lookupPattern` reports what the document actually
 * provides plus a completeness flag, and §1.1's "apply the five-part contract
 * before use" rule remains the caller's responsibility.
 */

import { GENERATED_PATTERNS } from './generated/patterns.generated.ts';
import type { GeneratedPatternEntry } from './generated/patterns.generated.ts';
import { PATTERN_CATEGORY_IDS, PATTERN_CATEGORY_FIT } from './ids.ts';
import type { DesignCategoryId, PatternCategory } from './ids.ts';

export type { PatternCategory, GeneratedPatternEntry };

export interface PatternMetadataCompleteness {
  /** Structure/meaning present (all catalogue entries provide this). */
  readonly hasMeaning: boolean;
  /** Construction/implementation notes present. */
  readonly hasImplementation: boolean;
  /** "Best for" content present. */
  readonly hasUseCases: boolean;
  /**
   * Always `false` for the current library: failure-mode and validation fields
   * are not provided per-entry in Markdown, so they must be supplied by the
   * caller before a pattern is used (§1.1 pattern decision contract).
   */
  readonly hasFailureGuidance: boolean;
}

export interface PatternRecord {
  readonly id: string;
  readonly name: string;
  readonly category: PatternCategory;
  readonly meaning: string;
  readonly implementation: readonly string[];
  readonly useCases: readonly string[];
  readonly completeness: PatternMetadataCompleteness;
}

/**
 * Pattern ID grammar: `P` plus the catalogue's two- or three-digit numbering,
 * bounded to the documented range P01–P100 so `P101` is a malformed ID rather
 * than an "unknown pattern".
 */
const PATTERN_ID_PATTERN = /^P(?:0[1-9]|[1-9][0-9]|100)$/;

function isPatternCategory(value: string): value is PatternCategory {
  return (PATTERN_CATEGORY_IDS as readonly string[]).includes(value);
}

function toRecord(entry: GeneratedPatternEntry): PatternRecord {
  if (!isPatternCategory(entry.category)) {
    throw new Error(`Generated pattern ${entry.id} has unknown category "${entry.category}"`);
  }
  return Object.freeze({
    id: entry.id,
    name: entry.name,
    category: entry.category,
    meaning: entry.meaning,
    implementation: entry.implementation,
    useCases: entry.useCases,
    completeness: Object.freeze({
      hasMeaning: entry.meaning.length > 0,
      hasImplementation: entry.implementation.length > 0,
      hasUseCases: entry.useCases.length > 0,
      hasFailureGuidance: false,
    }),
  });
}

const REGISTRY: ReadonlyMap<string, PatternRecord> = new Map(GENERATED_PATTERNS.map((entry) => [entry.id, toRecord(entry)]));

/** All pattern IDs in catalogue order (`P01`…`P100`). */
export const ALL_PATTERN_IDS: readonly string[] = Object.freeze([...REGISTRY.keys()]);

/** True when `id` is syntactically a catalogue pattern ID (P01–P100). */
export function isPatternIdSyntax(id: string): boolean {
  return PATTERN_ID_PATTERN.test(id);
}

/** True when the pattern ID exists in the pattern catalogue. */
export function hasPattern(id: unknown): boolean {
  return typeof id === 'string' && REGISTRY.has(id);
}

/** Resolves a pattern ID to its metadata, or `undefined` when unknown. */
export function lookupPattern(id: string): PatternRecord | undefined {
  return REGISTRY.get(id);
}

/** Patterns documented as serving a design category. */
export function patternsForCategory(category: DesignCategoryId): PatternRecord[] {
  return [...REGISTRY.values()].filter((pattern) => PATTERN_CATEGORY_FIT[pattern.category].includes(category));
}

/** Patterns in one pattern-category family. */
export function patternsInCategory(category: PatternCategory): PatternRecord[] {
  return [...REGISTRY.values()].filter((pattern) => pattern.category === category);
}

/**
 * Advisory fit check between a pattern and a design category.
 *
 * Returns `'unknown-pattern'` rather than throwing so callers can decide whether
 * an unknown ID is an error (plan validation: yes) or a warning (brief parsing
 * suggestion: no).
 */
export function patternCategoryFitsDesignCategory(
  patternId: string,
  designCategory: DesignCategoryId,
): 'fits' | 'mismatch' | 'unknown-pattern' {
  const pattern = lookupPattern(patternId);
  if (!pattern) return 'unknown-pattern';
  return PATTERN_CATEGORY_FIT[pattern.category].includes(designCategory) ? 'fits' : 'mismatch';
}

/**
 * Recommended pattern combinations from `DESIGN_PATTERNS_LIBRARY.md` §16.1.
 *
 * §16.1 names patterns by informal shorthand ("Central Hero", "Layered Depth",
 * "Oversized Typography") rather than by the catalogue's full titles. Because a
 * fuzzy name match could silently bind the wrong pattern, every row below names
 * the catalogue ID directly and records the shorthand the document used. A row
 * whose IDs do not exist, or that pairs a pattern with itself, throws at load
 * time so the table cannot rot.
 *
 * Shorthand → catalogue binding:
 *   Central Hero                 = P01 Central Hero Composition
 *   Layered Depth                = P06 Layered Depth Composition
 *   Full-Bleed Image             = P03 Full-Bleed Image Poster
 *   Oversized Typography         = P25 Oversized Editorial Typography
 *   Product Hero                 = P11 Product Hero Layout
 *   Feature Spotlight            = P17 Feature Spotlight Layout
 *   Swiss Grid                   = P21 Swiss International Grid
 *   Pull Quote                   = P28 Pull-Quote Composition
 *   Diagonal Dynamic             = P05 Diagonal Dynamic Composition
 *   Kinetic Typography           = P31 Kinetic Typography Layout
 *   Modular Editorial            = P23 Modular Editorial Grid
 *   Image-and-Caption            = P27 Image-and-Caption Editorial Layout
 *   Portrait Hero                = P41 Portrait Hero
 *   Typographic Frame            = P33 Typographic Frame
 *   Structured Information Grid  = P61 Structured Information Grid
 *   Icon-and-Label               = P68 Icon-and-Label System
 *   Split-Half                   = P04 Split-Half Composition
 *   Comparison Advertisement     = P16 Comparison Advertisement
 *   Minimalist Identity Card     = P81 Minimalist Identity Card
 *   Premium Negative Space       = P87 Premium Negative-Space Card
 *   Timeline                     = P62 Timeline Layout
 *   Step-by-Step Process         = P63 Step-by-Step Process Layout
 *   Abstract Shape               = P53 Abstract Shape Composition
 *   Image Collage                = P43 Image Collage
 *   Documentary Editorial        = P29 Documentary Editorial Layout
 *   Perspective Product          = P50 Perspective Product Composition
 *   Carousel Continuity          = P94 Carousel Continuity Layout
 */
export interface RecommendedCombination {
  readonly primary: string;
  readonly supporting: string;
  readonly intent: string;
  /** Shorthand as written in §16.1, retained for traceability. */
  readonly documentedAs: readonly [string, string];
}

const COMBINATION_TABLE: ReadonlyArray<readonly [string, string, string, string, string]> = Object.freeze([
  ['P01', 'P06', 'Strong dimensional poster', 'Central Hero', 'Layered Depth'],
  ['P03', 'P25', 'Editorial campaign', 'Full-Bleed Image', 'Oversized Typography'],
  ['P11', 'P17', 'Product-focused advertisement', 'Product Hero', 'Feature Spotlight'],
  ['P21', 'P28', 'Editorial information design', 'Swiss Grid', 'Pull Quote'],
  ['P05', 'P31', 'Energetic promotional design', 'Diagonal Dynamic', 'Kinetic Typography'],
  ['P23', 'P27', 'Structured publication', 'Modular Editorial', 'Image-and-Caption'],
  ['P41', 'P33', 'Speaker or personality poster', 'Portrait Hero', 'Typographic Frame'],
  ['P61', 'P68', 'Educational information graphic', 'Structured Information Grid', 'Icon-and-Label'],
  ['P04', 'P16', 'Clear comparison', 'Split-Half', 'Comparison Advertisement'],
  ['P81', 'P87', 'Refined identity design', 'Minimalist Identity Card', 'Premium Negative Space'],
  ['P62', 'P63', 'Sequential information graphic', 'Timeline', 'Step-by-Step Process'],
  ['P53', 'P25', 'Contemporary creative poster', 'Abstract Shape', 'Oversized Editorial Typography'],
  ['P43', 'P29', 'Storytelling composition', 'Image Collage', 'Documentary Editorial'],
  ['P11', 'P50', 'Premium product presentation', 'Product Hero', 'Perspective Product'],
  ['P94', 'P23', 'Consistent social media series', 'Carousel Continuity', 'Modular Editorial'],
]);

export const RECOMMENDED_COMBINATIONS: readonly RecommendedCombination[] = Object.freeze(
  COMBINATION_TABLE.map(([primary, supporting, intent, primaryName, supportingName]) => {
    if (!primary || !supporting || !intent || !primaryName || !supportingName) {
      throw new Error('Pattern combination table row is incomplete');
    }
    if (!REGISTRY.has(primary) || !REGISTRY.has(supporting)) {
      throw new Error(`Pattern combination table references unknown pattern ID: ${primary} / ${supporting}`);
    }
    if (primary === supporting) {
      throw new Error(`Pattern combination for "${primaryName}" resolves to the same pattern twice`);
    }
    return Object.freeze({
      primary,
      supporting,
      intent,
      documentedAs: Object.freeze([primaryName, supportingName]) as readonly [string, string],
    });
  }),
);

/**
 * True when a primary/supporting pair is one of the library's recommended
 * combinations (§16.1). Used for advisory combination warnings (§16.2).
 */
export function isRecommendedCombination(primary: string, supporting: string): boolean {
  return RECOMMENDED_COMBINATIONS.some(
    (combination) =>
      (combination.primary === primary && combination.supporting === supporting) ||
      (combination.primary === supporting && combination.supporting === primary),
  );
}
