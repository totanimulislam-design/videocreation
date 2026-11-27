import type { AssessmentMethod, CategoryId } from "../types.ts";

/**
 * Versioned scoring rules (DESIGN_QUALITY_METRICS.md §2, §14).
 *
 * Reports embed the ruleset version so a historical score can always be
 * interpreted against the rules that produced it. Weights must sum to 100;
 * this is asserted by the test suite.
 */

export interface SubCriterionDefinition {
  id: string;
  label: string;
  maxPoints: number;
  /**
   * Which part of the criterion the deterministic engine can assess.
   * `null` means the criterion needs visual inspection (AI critic or human).
   */
  deterministic: Exclude<AssessmentMethod, "visual"> | null;
}

export interface CategoryDefinition {
  id: CategoryId;
  label: string;
  maxPoints: number;
  subCriteria: SubCriterionDefinition[];
}

export interface ScoringRules {
  version: string;
  /** Target quality score for a finished professional design. */
  targetScore: number;
  /** Lowest score that may be delivered at all. */
  minimumDeliveryScore: number;
  /** Below this, the design is rejected and a redesign is recommended. */
  majorRedesignScore: number;
  categories: CategoryDefinition[];
}

export const SCORING_RULES_V1: ScoringRules = {
  version: "1.0.0",
  targetScore: 90,
  minimumDeliveryScore: 85,
  majorRedesignScore: 70,
  categories: [
    {
      id: "creativeDirection",
      label: "Creative Direction & Originality",
      maxPoints: 12,
      subCriteria: [
        { id: "concept", label: "Clear creative concept", maxPoints: 3, deterministic: null },
        { id: "direction", label: "Appropriate artistic direction", maxPoints: 2, deterministic: null },
        { id: "originality", label: "Original composition approach", maxPoints: 3, deterministic: null },
        { id: "consistency", label: "Consistent visual language", maxPoints: 2, deterministic: null },
        { id: "personality", label: "Appropriate visual personality", maxPoints: 2, deterministic: null },
      ],
    },
    {
      id: "composition",
      label: "Composition & Visual Balance",
      maxPoints: 15,
      subCriteria: [
        { id: "overall", label: "Overall composition", maxPoints: 4, deterministic: null },
        { id: "balance", label: "Visual balance", maxPoints: 3, deterministic: "measured" },
        { id: "focalPoint", label: "Focal point placement", maxPoints: 3, deterministic: "heuristic" },
        { id: "flow", label: "Visual flow", maxPoints: 2, deterministic: null },
        { id: "negativeSpace", label: "Negative space", maxPoints: 2, deterministic: "measured" },
        { id: "spatial", label: "Spatial relationships", maxPoints: 1, deterministic: "measured" },
      ],
    },
    {
      id: "hierarchy",
      label: "Visual Hierarchy",
      maxPoints: 12,
      subCriteria: [
        { id: "primaryFocalPoint", label: "Primary focal point", maxPoints: 3, deterministic: "heuristic" },
        { id: "headline", label: "Headline prominence", maxPoints: 3, deterministic: "measured" },
        { id: "secondary", label: "Secondary information hierarchy", maxPoints: 2, deterministic: "measured" },
        { id: "contrastLevels", label: "Contrast between information levels", maxPoints: 2, deterministic: "measured" },
        { id: "flow", label: "Overall information flow", maxPoints: 2, deterministic: null },
      ],
    },
    {
      id: "typography",
      label: "Typography",
      maxPoints: 14,
      subCriteria: [
        { id: "typefaceSelection", label: "Typeface selection", maxPoints: 2, deterministic: null },
        { id: "pairing", label: "Font pairing", maxPoints: 2, deterministic: null },
        { id: "hierarchy", label: "Typographic hierarchy", maxPoints: 3, deterministic: "measured" },
        { id: "spacing", label: "Spacing and line height", maxPoints: 2, deterministic: "measured" },
        { id: "readability", label: "Readability", maxPoints: 2, deterministic: "measured" },
        { id: "composition", label: "Typography composition", maxPoints: 2, deterministic: null },
        { id: "language", label: "Language rendering", maxPoints: 1, deterministic: "measured" },
      ],
    },
    {
      id: "color",
      label: "Color Theory & Harmony",
      maxPoints: 10,
      subCriteria: [
        { id: "paletteSelection", label: "Palette selection", maxPoints: 3, deterministic: null },
        { id: "harmony", label: "Color harmony", maxPoints: 2, deterministic: "heuristic" },
        { id: "contrast", label: "Contrast", maxPoints: 2, deterministic: "measured" },
        { id: "accent", label: "Accent color distribution", maxPoints: 1, deterministic: "heuristic" },
        { id: "backgroundForeground", label: "Background and foreground relationships", maxPoints: 2, deterministic: "measured" },
      ],
    },
    {
      id: "spacing",
      label: "Spacing & Alignment",
      maxPoints: 8,
      subCriteria: [
        { id: "margins", label: "Margin consistency", maxPoints: 2, deterministic: "measured" },
        { id: "alignment", label: "Element alignment", maxPoints: 2, deterministic: "measured" },
        { id: "relationships", label: "Spacing relationships", maxPoints: 2, deterministic: "measured" },
        { id: "padding", label: "Padding and grouping", maxPoints: 1, deterministic: "measured" },
        { id: "optical", label: "Optical alignment", maxPoints: 1, deterministic: null },
      ],
    },
    {
      id: "imagery",
      label: "Imagery & Graphic Elements",
      maxPoints: 8,
      subCriteria: [
        { id: "relevance", label: "Image relevance", maxPoints: 2, deterministic: null },
        { id: "quality", label: "Image quality", maxPoints: 1, deterministic: "measured" },
        { id: "placement", label: "Image placement and cropping", maxPoints: 2, deterministic: "measured" },
        { id: "illustrationConsistency", label: "Illustration consistency", maxPoints: 1, deterministic: "heuristic" },
        { id: "shapeIntegration", label: "Shape and graphic integration", maxPoints: 2, deterministic: "heuristic" },
      ],
    },
    {
      id: "effects",
      label: "Depth, Effects & Visual Refinement",
      maxPoints: 6,
      subCriteria: [
        { id: "layering", label: "Layering", maxPoints: 2, deterministic: "measured" },
        { id: "discipline", label: "Effects discipline", maxPoints: 1, deterministic: "measured" },
        { id: "depth", label: "Visual depth", maxPoints: 1, deterministic: null },
        { id: "surface", label: "Surface refinement", maxPoints: 1, deterministic: null },
        { id: "finish", label: "Overall finish", maxPoints: 1, deterministic: null },
      ],
    },
    {
      id: "communication",
      label: "Communication & Readability",
      maxPoints: 8,
      subCriteria: [
        { id: "clarity", label: "Message clarity", maxPoints: 3, deterministic: null },
        { id: "accuracy", label: "Information accuracy", maxPoints: 2, deterministic: "measured" },
        { id: "audience", label: "Audience suitability", maxPoints: 1, deterministic: null },
        { id: "comfort", label: "Reading comfort", maxPoints: 1, deterministic: "measured" },
        { id: "cta", label: "Call-to-action effectiveness", maxPoints: 1, deterministic: "heuristic" },
      ],
    },
    {
      id: "technical",
      label: "Technical & Production Quality",
      maxPoints: 7,
      subCriteria: [
        { id: "dimensions", label: "Document dimensions", maxPoints: 1, deterministic: "measured" },
        { id: "structure", label: "Structural validity", maxPoints: 1, deterministic: "measured" },
        { id: "editability", label: "Element editability", maxPoints: 1, deterministic: "measured" },
        { id: "resources", label: "Asset and font availability", maxPoints: 1, deterministic: "measured" },
        { id: "rendering", label: "Rendering consistency", maxPoints: 1, deterministic: "measured" },
        { id: "export", label: "Export quality", maxPoints: 1, deterministic: "measured" },
        { id: "print", label: "Print/digital specifications", maxPoints: 1, deterministic: "measured" },
      ],
    },
  ],
};

export const LATEST_SCORING_RULES = SCORING_RULES_V1;

const RULESETS = new Map<string, ScoringRules>([[SCORING_RULES_V1.version, SCORING_RULES_V1]]);

export function registerScoringRules(rules: ScoringRules): void {
  RULESETS.set(rules.version, rules);
}

export function getScoringRules(version: string = LATEST_SCORING_RULES["version"]): ScoringRules {
  const rules = RULESETS.get(version);
  if (!rules) {
    throw new Error(
      `Unknown scoring ruleset "${version}". Known versions: ${[...RULESETS.keys()].join(", ")}.`,
    );
  }
  return rules;
}

export function totalPossiblePoints(rules: ScoringRules = LATEST_SCORING_RULES): number {
  return rules.categories.reduce((sum, category) => sum + category.maxPoints, 0);
}

export function findCategoryDefinition(rules: ScoringRules, id: CategoryId): CategoryDefinition {
  const category = rules.categories.find((candidate) => candidate.id === id);
  if (!category) throw new Error(`Scoring ruleset "${rules.version}" has no category "${id}".`);
  return category;
}
