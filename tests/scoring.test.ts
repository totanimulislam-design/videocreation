import test from "node:test";
import assert from "node:assert/strict";
import {
  LATEST_SCORING_RULES,
  SCORING_RULES_V1,
  getScoringRules,
  registerScoringRules,
  totalPossiblePoints,
} from "../src/quality/evaluator/scoring-rules.ts";
import { qualityLevelFor } from "../src/quality/evaluator/quality-level.ts";
import { calculateScore } from "../src/quality/evaluator/score-calculator.ts";
import type { CategoryResult, CategoryId } from "../src/quality/types.ts";

test("weights match the published framework exactly", () => {
  const expected: Record<CategoryId, number> = {
    creativeDirection: 12,
    composition: 15,
    hierarchy: 12,
    typography: 14,
    color: 10,
    spacing: 8,
    imagery: 8,
    effects: 6,
    communication: 8,
    technical: 7,
  };
  for (const category of SCORING_RULES_V1.categories) {
    assert.equal(category.maxPoints, expected[category.id], category.id);
    const subTotal = category.subCriteria.reduce((sum, sub) => sum + sub.maxPoints, 0);
    assert.equal(subTotal, category.maxPoints, `${category.id} sub-criteria must sum to ${category.maxPoints}`);
  }
  assert.equal(totalPossiblePoints(SCORING_RULES_V1), 100);
  assert.deepEqual(Object.keys(expected).sort(), SCORING_RULES_V1.categories.map((c) => c.id).sort());
});

test("quality level bands follow the framework", () => {
  const cases: Array<[number, string]> = [
    [100, "Exceptional"],
    [95, "Exceptional"],
    [94, "Excellent"],
    [90, "Excellent"],
    [89, "Professional"],
    [85, "Professional"],
    [84, "Good"],
    [80, "Good"],
    [79, "Acceptable"],
    [70, "Acceptable"],
    [69, "Weak"],
    [60, "Weak"],
    [59, "Poor"],
    [40, "Poor"],
    [39, "Failed"],
    [0, "Failed"],
  ];
  for (const [score, level] of cases) {
    assert.equal(qualityLevelFor(score), level, String(score));
  }
  assert.equal(qualityLevelFor(-10), "Failed");
  assert.equal(qualityLevelFor(130), "Exceptional");
});

test("rulesets are versioned and resolvable", () => {
  assert.equal(getScoringRules("1.0.0").version, "1.0.0");
  assert.equal(LATEST_SCORING_RULES.version, "1.0.0");
  assert.throws(() => getScoringRules("0.0.0"), /Unknown scoring ruleset/);
  registerScoringRules({ ...SCORING_RULES_V1, version: "test-9" });
  assert.equal(getScoringRules("test-9").version, "test-9");
});

function syntheticCategories(points: Partial<Record<CategoryId, number>>): CategoryResult[] {
  return SCORING_RULES_V1.categories.map((definition) => {
    const awarded = points[definition.id] ?? definition.maxPoints;
    return {
      id: definition.id,
      label: definition.label,
      maxPoints: definition.maxPoints,
      points: awarded,
      assessed: true,
      coverage: 1,
      method: "measured",
      subCriteria: definition.subCriteria.map((sub) => ({
        id: sub.id,
        label: sub.label,
        maxPoints: sub.maxPoints,
        points: sub.maxPoints,
        method: "measured",
        assessed: true,
        evidence: ["synthetic"],
        deductions: [],
      })),
    };
  });
}

test("total score is the sum of weighted categories", () => {
  const summary = calculateScore(syntheticCategories({}));
  assert.equal(summary.totalScore, 100);
  assert.equal(summary.qualityLevel, "Exceptional");
  assert.equal(summary.coverage.complete, true);
  assert.equal(summary.coverage.earnedRatio, 1);

  const partial = calculateScore(syntheticCategories({ creativeDirection: 6, typography: 7 }));
  assert.equal(partial.totalScore, 87);
  assert.equal(partial.categoryScores.creativeDirection, 6);
});

test("unassessed criteria reduce coverage without inflating the score", () => {
  const categories = syntheticCategories({});
  for (const category of categories) {
    const sub = category.subCriteria[0]!;
    sub.points = null;
    sub.assessed = false;
    category.points -= sub.maxPoints;
    category.coverage = (category.maxPoints - sub.maxPoints) / category.maxPoints;
    category.assessed = false;
  }
  const summary = calculateScore(categories);
  assert.equal(summary.coverage.complete, false);
  assert.ok(summary.coverage.ratio < 1);
  assert.ok(summary.totalScore < 100);
  assert.equal(summary.coverage.earnedRatio, 1);
  assert.ok(summary.coverage.missingCriteria.length === 10);
});

test("scores are clamped to the available range", () => {
  const categories = syntheticCategories({});
  categories[0]!.points = 999;
  const summary = calculateScore(categories);
  assert.equal(summary.totalScore, 100);
  assert.equal(summary.qualityLevel, "Exceptional");
});
