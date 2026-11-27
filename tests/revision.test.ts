import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDocument } from "../src/quality/analysis.ts";
import { runValidators, createIssue } from "../src/quality/index.ts";
import { planRevisions } from "../src/quality/revision/revision-planner.ts";
import { prioritizeIssues, issuePriority, summarizeIssues } from "../src/quality/revision/issue-prioritizer.ts";
import { applyMechanicalRevisions } from "../src/quality/revision/mechanical-executor.ts";
import { runRevisionLoop } from "../src/quality/revision/revision-controller.ts";
import { evaluateDesign } from "../src/quality/pipeline.ts";
import { createAssetRegistry, createFontRegistry, availableAsset } from "../src/quality/registries.ts";
import { document as doc, image, text } from "../src/core/design-document/factory.ts";
import { miniDocument } from "./helpers.ts";
import type { QualityIssue } from "../src/quality/types.ts";

function issue(overrides: Partial<QualityIssue> & { code: string }): QualityIssue {
  return createIssue({
    code: overrides.code,
    title: overrides.title ?? overrides.code,
    category: overrides.category ?? "typography",
    severity: overrides.severity ?? "high",
    message: overrides.message ?? `${overrides.code} happened`,
    elementIds: overrides.elementIds ?? [],
    recommendation: overrides.recommendation ?? "Fix it specifically",
    validator: overrides.validator ?? "test",
    ...(overrides.revision ? { revision: overrides.revision } : {}),
    ...(overrides.measured ? { measured: overrides.measured } : {}),
    ...(overrides.blocksDelivery !== undefined ? { blocksDelivery: overrides.blocksDelivery } : {}),
  });
}

test("priorities map from severity and blocking status", () => {
  assert.equal(issuePriority(issue({ code: "A", severity: "high" })), "high");
  assert.equal(issuePriority(issue({ code: "B", severity: "high", blocksDelivery: true })), "critical");
  const ordered = prioritizeIssues([
    issue({ code: "low", severity: "low" }),
    issue({ code: "critical", severity: "high", blocksDelivery: true }),
    issue({ code: "medium", severity: "medium" }),
  ]);
  assert.deepEqual(ordered.map((entry) => entry.code), ["critical", "medium", "low"]);
  const summary = summarizeIssues(ordered);
  assert.equal(summary.total, 3);
  assert.equal(summary.blocking, 1);
});

test("planner groups identical mechanical corrections and skips low-severity polish", () => {
  const issues = [
    issue({ code: "ELEMENT_PARTIALLY_OUTSIDE", elementIds: ["a"], revision: { action: "nudge_into_bounds", elementIds: ["a"] } }),
    issue({ code: "ELEMENT_OUTSIDE_CANVAS", elementIds: ["a"], revision: { action: "nudge_into_bounds", elementIds: ["a"] }, severity: "critical" }),
    issue({ code: "ASSET_MISSING", elementIds: ["b"], category: "asset", revision: { action: "provide_asset", elementIds: ["b"] }, severity: "critical" }),
    issue({ code: "IMG_ALT", elementIds: ["b"], category: "asset", severity: "low" }),
  ];
  const plan = planRevisions(issues);
  assert.equal(plan.autoFixable.length, 1);
  assert.deepEqual(plan.autoFixable[0]!.issueCodes.sort(), ["ELEMENT_OUTSIDE_CANVAS", "ELEMENT_PARTIALLY_OUTSIDE"]);
  assert.equal(plan.manualActions.length, 1);
  assert.equal(plan.manualActions[0]!.mechanical, false);
  assert.equal(plan.blocking.length, 2);
});

test("mechanical executor grows text frames and raises type size", () => {
  const document = doc({
    id: "fix",
    canvas: { width: 400, height: 400, background: "#ffffff" },
    elements: [
      text({
        id: "headline",
        x: 20,
        y: 20,
        width: 100,
        height: 20,
        role: "headline",
        text: "A headline that is far too long for this frame",
        typography: { fontFamily: "Inter", fontSize: 30, lineHeight: 1.2, wrap: true },
      }),
    ],
  });
  const context = { document, fonts: createFontRegistry(), assets: createAssetRegistry() };
  const analysis = analyzeDocument(context);
  const issues = runValidators(analysis, context).issues;
  const plan = planRevisions(issues);
  assert.ok(plan.autoFixable.length > 0);

  const result = applyMechanicalRevisions(document, plan, { analysis, context });
  assert.ok(result.applied.length > 0);
  const fixed = result.document.elements[0]!;
  assert.ok(fixed.transform.height > 20 || (fixed.type === "text" && fixed.typography.fontSize > 30));

  const reanalysis = analyzeDocument({ document: result.document, fonts: context.fonts, assets: context.assets });
  const remaining = runValidators(reanalysis, context).issues;
  assert.equal(remaining.some((entry) => entry.code === "TEXT_OVERFLOW_FRAME"), false);
});

test("mechanical executor moves elements inside the canvas and safe area", () => {
  const document = doc({
    id: "move",
    canvas: { width: 300, height: 300, safeMargin: 20 },
    elements: [
      text({
        id: "off",
        x: 260,
        y: -10,
        width: 120,
        height: 40,
        role: "body",
        text: "Move me",
        typography: { fontFamily: "Inter", fontSize: 16, lineHeight: 1.4 },
      }),
    ],
  });
  const context = { document, fonts: createFontRegistry(), assets: createAssetRegistry() };
  const analysis = analyzeDocument(context);
  const issues = runValidators(analysis, context).issues;
  const plan = planRevisions(issues);
  const result = applyMechanicalRevisions(document, plan, { analysis, context });
  const moved = result.document.elements[0]!;
  assert.ok(moved.transform.x + moved.transform.width <= 300);
  assert.ok(moved.transform.y >= 0);
});

test("mechanical executor picks an accessible text colour", () => {
  const document = doc({
    id: "contrast-fix",
    canvas: { width: 400, height: 200, background: "#111111" },
    elements: [
      text({
        id: "dark-text",
        x: 20,
        y: 20,
        width: 300,
        height: 40,
        role: "body",
        text: "Hard to read",
        style: { fill: "#1a1a1a" },
        typography: { fontFamily: "Inter", fontSize: 20, lineHeight: 1.4 },
      }),
    ],
  });
  const context = { document, fonts: createFontRegistry(), assets: createAssetRegistry() };
  const analysis = analyzeDocument(context);
  const issues = runValidators(analysis, context).issues;
  const plan = planRevisions(issues);
  const result = applyMechanicalRevisions(document, plan, { analysis, context });
  const fixed = result.document.elements[0]!;
  assert.notEqual(fixed.style.fill, "#1a1a1a");
  assert.ok(result.applied.some((entry) => entry.action === "replace_text_color"));
});

test("missing assets cannot be fixed mechanically and stay unresolved", () => {
  const document = doc({
    id: "asset-fix",
    canvas: { width: 400, height: 400 },
    assets: [{ id: "missing" }],
    elements: [image({ id: "img", x: 0, y: 0, width: 400, height: 400, assetId: "missing" })],
  });
  const context = { document, fonts: createFontRegistry(), assets: createAssetRegistry() };
  const analysis = analyzeDocument(context);
  const plan = planRevisions(runValidators(analysis, context).issues);
  const result = applyMechanicalRevisions(document, plan, { analysis, context });
  assert.equal(result.applied.length, 0);
  assert.ok(result.unresolved.some((entry) => entry.action === "provide_asset"));
});

test("revision loop stops at the configured budget and keeps history", async () => {
  const document = miniDocument({}, [
    text({
      id: "headline",
      x: -40,
      y: 10,
      width: 100,
      height: 20,
      role: "headline",
      text: "Off-canvas killer headline",
      typography: { fontFamily: "Inter", fontSize: 30, lineHeight: 1.2 },
    }),
  ]);
  const options = {
    document,
    fonts: createFontRegistry(),
    assets: createAssetRegistry(),
    brief: {},
  };

  const loop = await runRevisionLoop({
    document,
    maxRounds: 2,
    evaluate: async (doc) => (await evaluateDesign({ ...options, document: doc })).report,
    revise: (doc, plan) => {
      const context = { document: doc, fonts: createFontRegistry(), assets: createAssetRegistry() };
      return applyMechanicalRevisions(doc, plan, { analysis: analyzeDocument(context), context });
    },
  });

  assert.ok(loop.rounds.length <= 2);
  assert.ok(loop.history.length >= 1);
  assert.equal(loop.report.revision.maxRounds, 2);
  assert.equal(loop.rounds.length, loop.report.revision.roundsUsed);
});

test("available assets are not flagged as missing", () => {
  const document = doc({
    id: "asset-ok",
    canvas: { width: 400, height: 400 },
    assets: [{ id: "photo", width: 1200, height: 1200 }],
    elements: [image({ id: "img", x: 0, y: 0, width: 400, height: 400, assetId: "photo", alt: "A photo" })],
  });
  const context = {
    document,
    fonts: createFontRegistry(),
    assets: createAssetRegistry([availableAsset("photo", 1200, 1200)]),
  };
  const analysis = analyzeDocument(context);
  const issues = runValidators(analysis, context).issues;
  assert.equal(issues.some((entry) => entry.code === "ASSET_MISSING"), false);
});
