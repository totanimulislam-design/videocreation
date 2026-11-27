import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCritiqueJson,
  validateVisualCritique,
  type VisualCritique,
} from "../src/quality/visual/critique-schema.ts";
import { applyVisualCritique } from "../src/quality/visual/visual-critic.ts";
import { evaluateCategories } from "../src/quality/evaluator/category-evaluator.ts";
import { SCORING_RULES_V1 } from "../src/quality/evaluator/scoring-rules.ts";
import { analyzeDocument } from "../src/quality/analysis.ts";
import { runValidators } from "../src/quality/validators/index.ts";
import { generatePreview } from "../src/quality/visual/preview-generator.ts";
import { strongContext, strongCritique, strongPoster } from "./helpers.ts";

function validCritique(overrides: Partial<VisualCritique> = {}): VisualCritique {
  return { ...structuredClone(strongCritique()), ...overrides };
}

function validate(critique: VisualCritique, options: { requirePreview?: boolean } = {}) {
  const context = strongContext();
  return validateVisualCritique(critique, {
    document: context.document,
    rules: SCORING_RULES_V1,
    render: {
      preview: "<svg/>",
      format: "svg",
      width: 1080,
      height: 1350,
      fromSameDocument: true,
    },
    ...options,
  });
}

test("the stored critique is valid against the schema", () => {
  const result = validate(validCritique());
  assert.equal(result.valid, true, result.errors.join(" | "));
  assert.ok(result.scoredCriteria.length > 0);
  assert.equal(result.critique?.critic, "art-director:studio-review");
});

test("claims of inspection without a preview are rejected", () => {
  const result = validateVisualCritique(validCritique(), {
    document: strongPoster(),
    rules: SCORING_RULES_V1,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("No rendered preview")));

  const notInspected = validate(validCritique({ inspectedPreview: false }));
  assert.equal(notInspected.valid, false);
  assert.ok(notInspected.errors.some((error) => error.includes("inspectedPreview")));
});

test("critics cannot re-score deterministic measurements", () => {
  const critique = validCritique();
  critique.categories.color = {
    ...critique.categories.color,
    contrast: { points: 0.5, evidence: ["Looks weak"] },
  };
  const result = validate(critique);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("deterministic measurement is authoritative")));
});

test("scores must respect maxima and carry evidence", () => {
  const critique = validCritique();
  critique.categories.creativeDirection = {
    concept: { points: 99, evidence: ["Too many points"] },
    originality: { points: 2, evidence: [] },
  };
  const result = validate(critique);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("between 0 and 3")));
  assert.ok(result.errors.some((error) => error.includes("at least one specific observation")));
});

test("generic advice is rejected", () => {
  const critique = validCritique({
    improvementPlan: [
      {
        priority: "high",
        affectedElementIds: ["headline"],
        problem: "Make it more attractive",
        recommendedCorrection: "Improve the design",
        source: "critic",
      },
    ],
  });
  const result = validate(critique);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("generic")));
});

test("improvement actions must reference real elements", () => {
  const critique = validCritique({
    improvementPlan: [
      {
        priority: "medium",
        affectedElementIds: ["does-not-exist"],
        problem: "Headline optical margin is 4 units off the accent rule",
        recommendedCorrection: "Align the headline to x=72",
        source: "critic",
      },
    ],
  });
  const result = validate(critique);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("unknown element")));
});

test("missing visual coverage is reported as a warning, not an error", () => {
  const critique = validCritique();
  delete critique.categories.creativeDirection;
  const result = validate(critique);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((warning) => warning.includes("remain unassessed")));
});

test("parses fenced JSON and tolerates prose", () => {
  assert.deepEqual(parseCritiqueJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseCritiqueJson('Here is the review: {"a":2} — done.'), { a: 2 });
  assert.equal(parseCritiqueJson("not json"), null);
});

test("visual scores merge without overwriting measured criteria", () => {
  const context = strongContext();
  const preview = generatePreview(context.document);
  const analysis = analyzeDocument({ ...context, render: preview });
  const issues = runValidators(analysis, { ...context, render: preview }).issues;
  const categories = evaluateCategories({ analysis, issues, render: preview });
  const before = categories.find((category) => category.id === "typography")!;
  assert.equal(before.subCriteria.find((sub) => sub.id === "language")!.assessed, true);

  const { categories: merged, applied } = applyVisualCritique(categories, strongCritique());
  const typography = merged.find((category) => category.id === "typography")!;
  assert.equal(typography.assessed, true);
  assert.equal(typography.subCriteria.find((sub) => sub.id === "language")!.method, "measured");
  assert.ok(applied.includes("typography.pairing"));
  assert.equal(applied.some((entry) => entry.includes("language")), false);
});
