/**
 * Pattern selection guidance — the machine-readable form of
 * `DESIGN_PATTERNS_LIBRARY.md` §1.1, §2.2, §2.3, §16.2 and §24.
 *
 * WHY THIS IS NOT PER-PATTERN `selectionGuidance`
 * §19.1 lists per-pattern fields a *complete* catalogue would carry: `avoidWhen`,
 * `commonMistakes`, `validationChecks`, `adaptationRules`, `complexity`,
 * reading direction, focal strategy. The Markdown provides none of them for
 * individual entries — every `## Pnn` section supplies only `Structure`,
 * `Construction` and `Best for`. Copying a block of generic advice onto all 100
 * patterns would fabricate per-pattern metadata and make the registry look more
 * authoritative than its source.
 *
 * What the library *does* state, once, is how to select and combine patterns.
 * That is modelled here exactly as written, with a section reference on every
 * rule, plus two *derived* attributes the library implies but does not tabulate
 * per pattern:
 *
 *   - `orientationFit`, derived from the keyword in each pattern's own name
 *     (`Landscape`, `Vertical`, `Square`). This is a documented name reading,
 *     not an inference about geometry.
 *   - `multiPage` / `multiPanel`, derived from the pattern's own name and
 *     catalogue category (e.g. "Tri-Fold", "Multi-Page", "Carousel").
 *
 * Both are marked `derived` on the record so no caller mistakes them for
 * authored metadata, and neither supplies coordinates (§19.2, §20).
 *
 * EVERYTHING HERE IS ADVISORY. Nothing in this module may reject a plan: pattern
 * *fit* is a creative judgement, and the validator already blocks unknown or
 * malformed IDs elsewhere (`src/validation/composition.ts`). `assessPatternSelection`
 * returns guidance and warnings, never errors.
 */

import { lookupPattern } from './patterns.ts';
import type { DesignCategoryId, PatternCategory } from './ids.ts';

/** How a value was established, so derived data is never mistaken for authored data. */
export type GuidanceProvenance = 'documented' | 'derived';

/** A selection or combination rule exactly as the library states it. */
export interface PatternSelectionRule {
  /** Stable rule ID, e.g. `SL-2.2.1`. */
  readonly id: string;
  /** Library section the rule comes from, e.g. `§2.2`. */
  readonly section: string;
  /** What the rule recommends or forbids. Verbatim intent from the document. */
  readonly statement: string;
  readonly provenance: GuidanceProvenance;
}

/**
 * §2.2 decision table: design requirement → recommended direction.
 *
 * Machine-readable as a category-level routing aid. It deliberately does NOT
 * pick a specific pattern ID: the document names directions, not IDs, and
 * binding one would invent an editorial decision.
 */
export interface SelectionRoutingRule {
  readonly id: string;
  readonly requirement: string;
  readonly recommendedDirection: string;
  /** Pattern categories consistent with the recommended direction. */
  readonly patternCategories: readonly PatternCategory[];
  readonly section: string;
}

/** §16.2 combination restrictions, as checkable statements. */
export type CombinationRestrictionId =
  | 'single-dominant-focus'
  | 'one-shape-language'
  | 'compatible-perspective'
  | 'no-effect-stacking'
  | 'readability-first'
  | 'supporting-subordinate';

export interface CombinationRestriction {
  readonly id: CombinationRestrictionId;
  readonly statement: string;
  readonly section: string;
}

/** Orientation a pattern's own name commits to, if any. */
export type OrientationFit = 'portrait' | 'landscape' | 'square' | 'any';

/** Derived, name-level attributes. Advisory only; never used to reject a plan. */
export interface DerivedPatternCharacteristics {
  readonly orientationFit: OrientationFit;
  readonly multiPageOrPanel: boolean;
  /** Which part of the record these came from. Always `derived`. */
  readonly provenance: 'derived';
}

// ---------------------------------------------------------------------------
// §2.2 selection routing (transcribed)
// ---------------------------------------------------------------------------

/** §2.2 rows. `patternCategories` maps the document's prose to catalogue families. */
export const SELECTION_ROUTING: readonly SelectionRoutingRule[] = Object.freeze([
  rule('SR-2.2.1', 'Strong promotional message', 'Bold advertising composition', ['advertising']),
  rule('SR-2.2.2', 'Large product photograph', 'Image-led composition', ['image-led']),
  rule('SR-2.2.3', 'Powerful headline', 'Typography-led composition', ['typography']),
  rule('SR-2.2.4', 'Multiple information sections', 'Editorial or grid composition', ['editorial', 'information']),
  rule('SR-2.2.5', 'Premium brand identity', 'Minimalist or luxury composition', ['identity']),
  rule('SR-2.2.6', 'Educational information', 'Structured information composition', ['information']),
  rule('SR-2.2.7', 'Event announcement', 'Dynamic poster composition', ['poster']),
  rule('SR-2.2.8', 'Multiple pages', 'Editorial or modular brochure system', ['brochure', 'editorial']),
  rule('SR-2.2.9', 'Limited content', 'Minimal composition', ['poster', 'identity']),
  rule('SR-2.2.10', 'Complex content', 'Hierarchical information layout', ['information', 'editorial']),
  rule('SR-2.2.11', 'Youth-oriented campaign', 'Experimental or energetic composition', ['geometric', 'typography']),
  rule('SR-2.2.12', 'Corporate communication', 'Structured and restrained composition', ['information', 'identity']),
]);

function rule(
  id: string,
  requirement: string,
  recommendedDirection: string,
  patternCategories: readonly PatternCategory[],
): SelectionRoutingRule {
  return Object.freeze({ id, requirement, recommendedDirection, patternCategories, section: '§2.2' });
}

// ---------------------------------------------------------------------------
// §1.1 / §2.3 obligations — what a selection must be able to justify
// ---------------------------------------------------------------------------

/**
 * §1.1 "Pattern decision contract": five things the Runtime AI Designer must be
 * able to state for every selected pattern. Use is refused until all five exist,
 * whether from the catalogue or supplied by the caller.
 */
export const PATTERN_DECISION_CONTRACT: readonly PatternSelectionRule[] = Object.freeze([
  freezeRule('DC-1.1.meaning', '§1.1', 'meaning — the structural idea of the pattern'),
  freezeRule('DC-1.1.use', '§1.1', 'appropriate use — purpose, audience, content and output fit'),
  freezeRule('DC-1.1.implementation', '§1.1', 'implementation — mapping to the canonical plan and the geometry computed'),
  freezeRule('DC-1.1.mistakes', '§1.1', 'common mistakes — how this pattern can fail'),
  freezeRule('DC-1.1.validation', '§1.1', 'validation — how the result is inspected'),
]);

/** §2.3 pattern selection requirements. */
export const SELECTION_REQUIREMENTS: readonly PatternSelectionRule[] = Object.freeze([
  freezeRule('SR-2.3.1', '§2.3', 'Select one primary composition pattern.'),
  freezeRule('SR-2.3.2', '§2.3', 'Optionally select one or two supporting patterns.'),
  freezeRule('SR-2.3.3', '§2.3', 'Explain why the selected structure suits the brief.'),
  freezeRule('SR-2.3.4', '§2.3', 'Adapt the pattern to the actual content; do not apply it mechanically.'),
  freezeRule('SR-2.3.5', '§2.3', 'Avoid unnecessary decorative elements.'),
  freezeRule('SR-2.3.6', '§2.3', 'Preserve readability and visual hierarchy.'),
  freezeRule('SR-2.3.7', '§2.3', 'Avoid using the same primary pattern repeatedly across consecutive designs.'),
  freezeRule('SR-2.3.8', '§2.3', 'Do not combine patterns randomly; every combination needs a compositional purpose.'),
]);

/** §16.2 combination restrictions. */
export const COMBINATION_RESTRICTIONS: readonly CombinationRestriction[] = Object.freeze([
  restriction('single-dominant-focus', 'Do not combine multiple dominant focal points without a clear hierarchy.'),
  restriction('one-shape-language', 'Do not use several unrelated shape languages.'),
  restriction('compatible-perspective', 'Do not combine incompatible perspective systems.'),
  restriction('no-effect-stacking', 'Do not use multiple decorative effects simply because they are available.'),
  restriction('readability-first', 'Do not sacrifice readability for visual complexity.'),
  restriction('supporting-subordinate', 'Do not let a supporting pattern overpower the primary composition.'),
]);

function restriction(id: CombinationRestrictionId, statement: string): CombinationRestriction {
  return Object.freeze({ id, statement, section: '§16.2' });
}

/**
 * §24 final selection checklist. These are review questions, not assertions the
 * code asserts on the caller's behalf.
 */
export const SELECTION_CHECKLIST: readonly string[] = Object.freeze([
  'The pattern matches the design objective.',
  'The pattern is appropriate for the audience.',
  'The pattern supports the content hierarchy.',
  'The focal point is clear.',
  'The reading flow is intentional.',
  'The selected pattern is not being used mechanically.',
  'Supporting patterns have a clear purpose.',
  'Typography and imagery work together.',
  'The design has sufficient negative space.',
  'The output dimensions have been considered.',
  'The design remains editable.',
  'The composition does not look like a generic template.',
]);

function freezeRule(id: string, section: string, statement: string): PatternSelectionRule {
  return Object.freeze({ id, section, statement, provenance: 'documented' as const });
}

// ---------------------------------------------------------------------------
// Derived, name-level characteristics
// ---------------------------------------------------------------------------

const LANDSCAPE_HINT = /\b(panoramic|wide|horizontal|landscape)\b/i;
const VERTICAL_HINT = /\b(vertical|portrait|story|tall)\b/i;
const SQUARE_HINT = /\bsquare\b/i;
const MULTI_PAGE_HINT = /\b(multi-page|multi-panel|tri-fold|z-fold|gate-fold|bi-fold|carousel|sequential|series|catalogue|spread)\b/i;

/**
 * Derives orientation and multi-page characteristics from a pattern's own name.
 *
 * This reads the catalogue's vocabulary; it does not measure or lay out
 * anything. A pattern with no orientation word returns `any`, which means
 * "the name does not commit", not "verified to work in every orientation".
 */
export function derivePatternCharacteristics(patternId: string): DerivedPatternCharacteristics | undefined {
  const pattern = lookupPattern(patternId);
  if (!pattern) return undefined;

  const name = `${pattern.name} ${pattern.meaning}`;
  let orientationFit: OrientationFit = 'any';
  if (SQUARE_HINT.test(name)) orientationFit = 'square';
  else if (LANDSCAPE_HINT.test(name)) orientationFit = 'landscape';
  else if (VERTICAL_HINT.test(name)) orientationFit = 'portrait';

  return Object.freeze({
    orientationFit,
    multiPageOrPanel: MULTI_PAGE_HINT.test(name),
    provenance: 'derived' as const,
  });
}

// ---------------------------------------------------------------------------
// Selection assessment (advisory)
// ---------------------------------------------------------------------------

export interface PatternSelectionAssessment {
  readonly primaryPattern: string;
  readonly supportingPatterns: readonly string[];
  readonly primaryCharacteristics: DerivedPatternCharacteristics | undefined;
  /** §2.2 directions relevant to the given design category. */
  readonly routing: readonly SelectionRoutingRule[];
  /** Non-blocking advice. Empty is a normal, successful outcome. */
  readonly notes: readonly string[];
  /** Which §1.1 contract items the catalogue cannot supply for this pattern. */
  readonly unmetDecisionContractItems: readonly string[];
}

export interface AssessSelectionOptions {
  readonly designCategory?: DesignCategoryId;
  readonly primaryPattern: string;
  readonly supportingPatterns?: readonly string[];
}

/**
 * Assesses a chosen pattern against the library's selection rules.
 *
 * Purely advisory: returns notes and gaps, never a verdict. Unknown pattern IDs
 * yield an empty assessment rather than an error, because rejecting IDs is
 * `validateDesignPlan`'s job — this function must not become a second gate.
 */
export function assessPatternSelection(options: AssessSelectionOptions): PatternSelectionAssessment {
  const notes: string[] = [];
  const supporting = options.supportingPatterns ?? [];
  const primary = lookupPattern(options.primaryPattern);

  if (!primary) {
    return Object.freeze({
      primaryPattern: options.primaryPattern,
      supportingPatterns: Object.freeze([...supporting]),
      primaryCharacteristics: undefined,
      routing: Object.freeze([]),
      notes: Object.freeze([`"${options.primaryPattern}" is not in the catalogue; no guidance is available.`]),
      unmetDecisionContractItems: Object.freeze([]),
    });
  }

  if (supporting.length > 2) {
    notes.push('§2.3 allows one primary plus one or two supporting patterns.');
  }

  const primaryCharacteristics = derivePatternCharacteristics(options.primaryPattern);
  if (
    primaryCharacteristics &&
    primaryCharacteristics.orientationFit !== 'any' &&
    primaryCharacteristics.multiPageOrPanel === false &&
    supporting.length > 0
  ) {
    for (const id of supporting) {
      const other = derivePatternCharacteristics(id);
      if (
        other &&
        other.orientationFit !== 'any' &&
        other.orientationFit !== primaryCharacteristics.orientationFit
      ) {
        notes.push(
          `Primary "${primaryCharacteristics.orientationFit}" and supporting "${other.orientationFit}" ${id} disagree on orientation; adapt §17 rather than stretching (§17, §17.1–17.3).`,
        );
      }
    }
  }

  const routing = options.designCategory
    ? SELECTION_ROUTING.filter((entry) => entry.patternCategories.includes(primary.category))
    : [];

  // The catalogue supplies meaning and use cases but no failure guidance, so the
  // §1.1 contract is never fully met from data alone. Reported, never invented.
  const unmet = [
    'appropriate use (purpose/audience fit)',
    'common mistakes',
    'validation checks',
  ];

  return Object.freeze({
    primaryPattern: options.primaryPattern,
    supportingPatterns: Object.freeze([...supporting]),
    primaryCharacteristics,
    routing: Object.freeze(routing),
    notes: Object.freeze(notes),
    unmetDecisionContractItems: Object.freeze(unmet),
  });
}

/** All guidance for one library section, for tooling and docs generation. */
export function selectionGuidanceFor(designCategory: DesignCategoryId | undefined): readonly SelectionRoutingRule[] {
  if (!designCategory) return SELECTION_ROUTING;
  return SELECTION_ROUTING;
}
