import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDesign, runQualityPipeline, evaluateVariants } from "../src/quality/pipeline.ts";
import { createAssetRegistry, createFontRegistry } from "../src/quality/registries.ts";
import { strongContext, strongCritique, strongPipelineOptions, weakPoster } from "./helpers.ts";

test("deterministic evaluation cannot approve an uninspected design", async () => {
  const evaluation = await evaluateDesign(strongContext());
  assert.equal(evaluation.report.deliveryStatus, "revision_required");
  assert.equal(evaluation.report.coverage.complete, false);
  assert.ok(evaluation.report.coverage.ratio < 1);
  assert.ok(evaluation.report.coverage.earnedRatio > 0.8);
  assert.equal(evaluation.preview?.format, "svg");
  assert.equal(evaluation.report.validatorErrors.length, 0);
  assert.ok(evaluation.report.notes.some((note) => note.includes("No valid visual critique")));
});

test("a complete inspection with a valid critique approves the strong fixture", async () => {
  const evaluation = await evaluateDesign(strongPipelineOptions());
  assert.equal(evaluation.critiqueErrors.length, 0);
  assert.equal(evaluation.report.coverage.complete, true);
  assert.equal(evaluation.report.deliveryStatus, "approved");
  assert.ok(evaluation.report.totalScore >= 90);
  assert.equal(evaluation.report.criticalFailures.length, 0);
  assert.equal(evaluation.report.inspection.previewInspected, true);
  assert.ok(evaluation.visualApplied.includes("creativeDirection.concept"));
});

test("a rejected critique leaves the design uninspected instead of failing", async () => {
  const critique = structuredClone(strongCritique());
  critique.improvementPlan = [
    {
      priority: "high",
      affectedElementIds: ["headline"],
      problem: "Make it more attractive",
      recommendedCorrection: "Improve the design",
      source: "critic",
    },
  ];
  const evaluation = await evaluateDesign({ ...strongContext(), critique });
  assert.equal(evaluation.report.deliveryStatus, "revision_required");
  assert.ok(evaluation.critiqueErrors.length > 0);
  assert.equal(evaluation.report.inspection.previewInspected, false);
  assert.ok(evaluation.report.notes.some((note) => note.includes("Visual critique rejected")));
});

test("critical failures reject the design regardless of score", async () => {
  const evaluation = await evaluateDesign({
    document: weakPoster(),
    fonts: createFontRegistry(),
    assets: createAssetRegistry(),
    brief: { category: "poster", requiresCallToAction: true },
  });
  const report = evaluation.report;
  assert.equal(report.deliveryStatus, "rejected");
  assert.ok(report.criticalFailures.length > 0);
  const blockingCodes = new Set(report.issues.filter((issue) => issue.blocksDelivery).map((issue) => issue.code));
  for (const code of ["ASSET_MISSING", "FONT_UNAVAILABLE", "TEXT_COLLISION", "CONTENT_OBSCURED", "PLACEHOLDER_CONTENT"]) {
    assert.ok(blockingCodes.has(code), `expected blocking code ${code}`);
  }
  // A rejected design still produces a complete report.
  assert.ok(report.categoryScores.technical >= 0);
  assert.ok(report.decision.reasons.length > 0);
});

test("preview generation can be skipped but is then reported as uninspected", async () => {
  const evaluation = await evaluateDesign({ ...strongContext(), renderPreview: false });
  assert.equal(evaluation.preview, undefined);
  assert.equal(evaluation.report.inspection.previewGenerated, false);
  assert.equal(evaluation.report.deliveryStatus, "revision_required");
});

test("multi-format variants are evaluated independently", async () => {
  const base = strongContext();
  const wide = structuredClone(base.document);
  wide.id = "poster-wide";
  wide.canvas.width = 1350;
  wide.canvas.height = 1080;
  const evaluations = await evaluateVariants(
    [base.document, wide],
    { fonts: base.fonts, assets: base.assets, brief: base.brief, renderPreview: true },
  );
  assert.equal(evaluations.length, 2);
  assert.notEqual(evaluations[0]!.report.designId, evaluations[1]!.report.designId);
  // The wide variant re-uses the original coordinates and must therefore be re-composed.
  assert.ok(evaluations[1]!.report.issues.some((issue) => issue.code === "MARGIN_INCONSISTENT" || issue.code === "ALIGNMENT_WEAK"));
});

test("the full pipeline runs a bounded revision loop", async () => {
  const run = await runQualityPipeline({ ...strongPipelineOptions(), maxRevisionRounds: 2 });
  assert.ok(run.rounds.length <= 2);
  assert.equal(run.report.revision.maxRounds, 2);
  if (run.report.deliveryStatus === "approved") {
    assert.equal(run.stoppedBecause, "approved");
  }
});

test("schema-invalid documents are rejected without rendering", async () => {
  const broken = {
    id: "broken",
    canvas: { width: -10, height: 0, unit: "px" },
    elements: "not-an-array",
  } as unknown as ReturnType<typeof strongContext>["document"];
  const evaluation = await evaluateDesign({ document: broken });
  assert.equal(evaluation.report.deliveryStatus, "rejected");
  assert.equal(evaluation.report.totalScore, 0);
  assert.equal(evaluation.report.inspection.previewGenerated, false);
  assert.equal(evaluation.report.coverage.pointsAssessed, 0);
  assert.equal(evaluation.analysis, undefined);
  assert.ok(evaluation.report.criticalFailures.some((failure) => failure.startsWith("SCHEMA_INVALID")));
  assert.ok(evaluation.report.notes.some((note) => note.includes("Schema validation failed")));
});
