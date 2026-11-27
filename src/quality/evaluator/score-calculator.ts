import type {
  CategoryId,
  CategoryResult,
  QualityLevel,
  SubCriterionResult,
} from "../types.ts";
import { qualityLevelFor } from "./quality-level.ts";
import {
  LATEST_SCORING_RULES,
  totalPossiblePoints,
  type ScoringRules,
} from "./scoring-rules.ts";

/**
 * Weighted score calculation (DESIGN_QUALITY_METRICS.md §2, §7).
 *
 * The total is the sum of the weighted category scores — never an independent
 * number. Points that could not be assessed are excluded and reported as
 * coverage, so a partial evaluation can never masquerade as a complete one.
 */

export interface ScoreCoverage {
  pointsAssessed: number;
  pointsTotal: number;
  ratio: number;
  /**
   * Share of the *assessed* points that were earned. Used for gating when the
   * evaluation is still provisional: a partial total must not be compared to the
   * absolute thresholds, and must never be scaled up into an invented score.
   */
  earnedRatio: number;
  complete: boolean;
  /** Criteria awaiting visual inspection, e.g. `creativeDirection.concept`. */
  missingCriteria: string[];
}

export interface ScoreSummary {
  rulesVersion: string;
  categories: CategoryResult[];
  categoryScores: Record<CategoryId, number>;
  totalScore: number;
  qualityLevel: QualityLevel;
  coverage: ScoreCoverage;
  strengths: string[];
  weaknesses: string[];
}

function missingCriteria(categories: CategoryResult[]): string[] {
  const missing: string[] = [];
  for (const category of categories) {
    for (const sub of category.subCriteria) {
      if (!sub.assessed) missing.push(`${category.id}.${sub.id}`);
    }
  }
  return missing;
}

function collectStrengths(categories: CategoryResult[]): string[] {
  const strengths: string[] = [];
  for (const category of categories) {
    for (const sub of category.subCriteria) {
      if (!sub.assessed) continue;
      const ratio = sub.maxPoints > 0 ? (sub.points ?? 0) / sub.maxPoints : 0;
      if (ratio >= 0.9 && sub.evidence.length > 0) {
        strengths.push(`${category.label} — ${sub.label}: ${sub.evidence[0]}`);
      }
    }
  }
  return strengths;
}

function collectWeaknesses(categories: CategoryResult[]): string[] {
  const weaknesses: string[] = [];
  for (const category of categories) {
    for (const sub of category.subCriteria) {
      if (!sub.assessed) continue;
      const ratio = sub.maxPoints > 0 ? (sub.points ?? 0) / sub.maxPoints : 0;
      if (ratio < 0.65) {
        const reason = sub.deductions[0] ?? `${sub.label} scored ${sub.points ?? 0}/${sub.maxPoints}.`;
        weaknesses.push(`${category.label} — ${reason}`);
      }
    }
  }
  return weaknesses;
}

export function calculateScore(
  categories: CategoryResult[],
  rules: ScoringRules = LATEST_SCORING_RULES,
): ScoreSummary {
  const pointsTotal = totalPossiblePoints(rules);
  const pointsAssessed = categories.reduce(
    (sum, category) =>
      sum +
      category.subCriteria
        .filter((sub) => sub.assessed)
        .reduce((inner, sub) => inner + sub.maxPoints, 0),
    0,
  );

  const rawTotal = categories.reduce((sum, category) => sum + category.points, 0);
  const totalScore = Math.max(0, Math.min(pointsTotal, Math.round(rawTotal)));

  const categoryScores = Object.fromEntries(
    categories.map((category) => [
      category.id,
      Math.round(category.points * 100) / 100,
    ]),
  ) as Record<CategoryId, number>;

  const missing = missingCriteria(categories);

  return {
    rulesVersion: rules.version,
    categories,
    categoryScores,
    totalScore,
    qualityLevel: qualityLevelFor(totalScore),
    coverage: {
      pointsAssessed,
      pointsTotal,
      ratio: Math.round((pointsAssessed / pointsTotal) * 1000) / 1000,
      earnedRatio: pointsAssessed > 0 ? Math.round((totalScore / pointsAssessed) * 1000) / 1000 : 0,
      complete: missing.length === 0,
      missingCriteria: missing,
    },
    strengths: collectStrengths(categories),
    weaknesses: collectWeaknesses(categories),
  };
}

/** Flattens sub-criteria for the machine-readable report. */
export function flattenSubCriteria(
  categories: CategoryResult[],
): Array<SubCriterionResult & { category: CategoryId }> {
  return categories.flatMap((category) =>
    category.subCriteria.map((sub) => ({ ...sub, category: category.id })),
  );
}

export function categoryScore(
  category: CategoryResult,
  digits = 2,
): number {
  const factor = 10 ** digits;
  return Math.round(category.points * factor) / factor;
}
