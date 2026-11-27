import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDesign } from "../src/quality/pipeline.ts";
import { determineDeliveryStatus, renderMarkdownReport } from "../src/quality/reports/report-generator.ts";
import { calculateScore } from "../src/quality/evaluator/score-calculator.ts";
import { SCORING_RULES_V1 } from "../src/quality/evaluator/scoring-rules.ts";
import { createIssue } from "../src/quality/validators/issue.ts";
import type { CategoryResult, CategoryId, QualityIssue } from "../src/quality/types.ts";
import { strongContext, strongPipelineOptions } from "./helpers.ts";

function fullCategories(points: Partial<Record<CategoryId, number>> = {}): CategoryResult[] {
  return SCORING_RULES_V1.categories.map((definition) => ({
    id: definition.id,
    label: definition.label,
    maxPoints: definition.maxPoints,
    points: points[definition.id] ?? definition.maxPoints,
    assessed: true,
    coverage: 1,
    method: "measured" as const,
    subCriteria: definition.subCriteria.map((sub) => ({
      id: sub.id,
      label: sub.label,
      maxPoints: sub.maxPoints,
      points: sub.maxPoints,
      method: "measured" as const,
      assessed: true,
      evidence: ["evidence"],
      deductions: [],
    })),
  }));
}

const criticalIssue = (): QualityIssue =>
  createIssue({
    code: "TEXT_OVERFLOW_FRAME",
    title: "Overflow",
    category: "typography",
    severity: "critical",
    message: "Headline is clipped",
    elementIds: ["headline"],
    recommendation: "Grow the frame",
    validator: "test",
  });

test("gate rejects on critical failure even with a perfect score", () => {
  const summary = calculateScore(fullCategories());
  const decision = determineDeliveryStatus({
    summary,
    issues: [criticalIssue()],
    validatorErrors: [],
    rules: SCORING_RULES_V1,
  });
  assert.equal(decision.status, "rejected");
  assert.equal(decision.approved, false);
  assert.ok(decision.blockingIssueCodes.includes("TEXT_OVERFLOW_FRAME"));
});

test("gate rejects on validator errors", () => {
  const decision = determineDeliveryStatus({
    summary: calculateScore(fullCategories()),
    issues: [],
    validatorErrors: [{ validator: "contrast-validator", message: "boom" }],
    rules: SCORING_RULES_V1,
  });
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons[0]!.includes("could not complete"));
});

test("gate requires the minimum score and complete inspection", () => {
  const low = calculateScore(fullCategories({ typography: 4, communication: 3, imagery: 3 }));
  const lowDecision = determineDeliveryStatus({
    summary: low,
    issues: [],
    validatorErrors: [],
    rules: SCORING_RULES_V1,
  });
  assert.equal(lowDecision.status, "revision_required");

  const incomplete = calculateScore(fullCategories());
  incomplete.coverage.complete = false;
  incomplete.coverage.missingCriteria = ["creativeDirection.concept"];
  const incompleteDecision = determineDeliveryStatus({
    summary: incomplete,
    issues: [],
    validatorErrors: [],
    rules: SCORING_RULES_V1,
  });
  assert.equal(incompleteDecision.status, "revision_required");
  assert.ok(incompleteDecision.reasons.some((reason) => reason.includes("incomplete")));
});

test("report matches the documented schema fields", async () => {
  const evaluation = await evaluateDesign(strongPipelineOptions());
  const report = evaluation.report;
  for (const key of [
    "designId",
    "overallScore",
    "qualityLevel",
    "categoryScores",
    "criticalFailures",
    "strengths",
    "weaknesses",
    "improvementPlan",
    "deliveryStatus",
    "rulesetVersion",
    "coverage",
    "decision",
    "inspection",
    "revision",
  ]) {
    assert.ok(key in report, `missing report field ${key}`);
  }
  assert.equal(report.overallScore, report.totalScore);
  assert.equal(Object.keys(report.categoryScores).length, 10);
  assert.equal(report.rulesetVersion, "1.0.0");
  assert.equal(report.scoring.categoryWeights.typography, 14);
  assert.deepEqual(
    Object.values(report.scoring.categoryWeights).reduce((sum, weight) => sum + weight, 0),
    100,
  );
  assert.equal(report.scoring.minimumDeliveryScore, 85);
  assert.equal(report.scoring.targetScore, 90);
  assert.equal(report.designId, "poster-typography-workshop");
  assert.ok(report.strengths.length > 0);
  assert.equal(report.inspection.critic, "art-director:studio-review");
  assert.ok(report.revision.maxRounds >= 0);
});

test("markdown report is complete and honest about provisional scores", async () => {
  const deterministic = await evaluateDesign(strongContext());
  const markdown = renderMarkdownReport(deterministic.report);
  assert.ok(markdown.includes("# Quality Report"));
  assert.ok(markdown.includes("provisional"));
  assert.ok(markdown.includes("## Category scores"));
  assert.ok(markdown.includes("## Delivery decision"));
  assert.ok(markdown.includes("points assessed"));
  assert.ok(markdown.includes("without inspecting the rendered artwork"));
});

test("reports are JSON serializable", async () => {
  const evaluation = await evaluateDesign(strongPipelineOptions());
  const json = JSON.stringify(evaluation.report);
  const parsed = JSON.parse(json) as { totalScore: number; deliveryStatus: string };
  assert.equal(parsed.totalScore, evaluation.report.totalScore);
  assert.equal(parsed.deliveryStatus, "approved");
});
