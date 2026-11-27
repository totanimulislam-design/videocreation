import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDocument } from "../src/quality/analysis.ts";
import { runValidators } from "../src/quality/validators/index.ts";
import { createAssetRegistry, createFontRegistry, availableAsset } from "../src/quality/registries.ts";
import { document as doc, image, shape, text } from "../src/core/design-document/factory.ts";
import type { DesignDocument } from "../src/core/design-document/types.ts";
import type { QualityContext, QualityIssue } from "../src/quality/types.ts";
import { miniDocument, strongContext, strongPoster } from "./helpers.ts";

function evaluate(document: DesignDocument, overrides: Partial<QualityContext> = {}) {
  const context: QualityContext = {
    document,
    fonts: createFontRegistry(),
    assets: createAssetRegistry(),
    ...overrides,
  };
  const analysis = analyzeDocument(context);
  const result = runValidators(analysis, context);
  return { analysis, issues: result.issues, result };
}

const codes = (issues: QualityIssue[]) => new Set(issues.map((issue) => issue.code));

test("the strong fixture has no critical failures", () => {
  const { issues, result } = evaluate(strongContext().document, strongContext());
  assert.deepEqual(result.validatorErrors, []);
  const critical = issues.filter((issue) => issue.blocksDelivery);
  assert.deepEqual(critical.map((issue) => issue.code), []);
  assert.equal(codes(issues).has("CONTRAST_INSUFFICIENT"), false);
});

test("text overflow is measured and blocked when substantial", () => {
  const document = miniDocument({}, [
    text({
      id: "headline",
      x: 0,
      y: 0,
      width: 60,
      height: 24,
      role: "headline",
      text: "A headline that cannot possibly fit inside this tiny frame",
      typography: { fontFamily: "Inter", fontSize: 24, lineHeight: 1.2, wrap: true, fontWeight: 700 },
    }),
  ]);
  const { issues } = evaluate(document);
  const overflow = issues.find((issue) => issue.code === "TEXT_OVERFLOW_FRAME");
  assert.ok(overflow);
  assert.equal(overflow?.severity, "critical");
  assert.equal(overflow?.measured?.approximate, true);
});

test("contrast is computed against the composited paint stack", () => {
  const document = doc({
    id: "contrast",
    canvas: { width: 400, height: 200, background: "#ffffff" },
    elements: [
      shape({ id: "plate", x: 0, y: 0, width: 400, height: 200, zIndex: 1, style: { fill: "#111111" } }),
      text({
        id: "light",
        x: 20,
        y: 20,
        width: 300,
        height: 40,
        zIndex: 2,
        role: "body",
        text: "Readable on dark",
        style: { fill: "#f5f5f5" },
        typography: { fontFamily: "Inter", fontSize: 20, lineHeight: 1.4 },
      }),
      text({
        id: "too-close",
        x: 20,
        y: 100,
        width: 300,
        height: 40,
        zIndex: 3,
        role: "body",
        text: "Barely readable",
        style: { fill: "#333333" },
        typography: { fontFamily: "Inter", fontSize: 20, lineHeight: 1.4 },
      }),
    ],
  });
  const { issues, analysis } = evaluate(document);
  const sample = analysis.contrastSamples.find((entry) => entry.elementId === "too-close");
  assert.ok(sample && sample.ratio !== null && sample.ratio < 4.5);
  const contrast = issues.find((issue) => issue.code === "CONTRAST_INSUFFICIENT" && issue.elementIds.includes("too-close"));
  assert.ok(contrast);
  assert.ok(contrast?.recommendation.includes("4.5"));
});

test("missing fonts and unsupported scripts are critical", () => {
  const document = miniDocument({}, [
    text({
      id: "unknown-font",
      x: 0,
      y: 0,
      width: 200,
      height: 40,
      role: "body",
      text: "Hello",
      typography: { fontFamily: "Imaginary Display", fontSize: 18, lineHeight: 1.4 },
    }),
    text({
      id: "bengali",
      x: 0,
      y: 60,
      width: 200,
      height: 40,
      role: "body",
      text: "টাইপোগ্রাফি কর্মশালা",
      typography: { fontFamily: "Inter", fontSize: 18, lineHeight: 1.4 },
    }),
  ]);
  const { issues } = evaluate(document);
  assert.ok(issues.some((issue) => issue.code === "FONT_UNAVAILABLE" && issue.blocksDelivery));
  const glyph = issues.find((issue) => issue.code === "GLYPH_UNSUPPORTED");
  assert.ok(glyph);
  assert.equal(glyph?.blocksDelivery, true);
});

test("missing assets and distortion are reported", () => {
  const document = doc({
    id: "assets",
    canvas: { width: 600, height: 400 },
    assets: [{ id: "hero", width: 100, height: 100 }],
    elements: [
      image({ id: "hero-el", x: 0, y: 0, width: 600, height: 200, assetId: "hero", fit: "fill" }),
      image({ id: "ghost", x: 0, y: 250, width: 100, height: 100, assetId: "ghost" }),
    ],
  });
  const { issues } = evaluate(document, { assets: createAssetRegistry([availableAsset("hero", 100, 100)]) });
  assert.ok(issues.some((issue) => issue.code === "ASSET_MISSING" && issue.blocksDelivery));
  assert.ok(issues.some((issue) => issue.code === "IMAGE_DISTORTED"));
  assert.ok(issues.some((issue) => issue.code === "ASSET_LOW_RESOLUTION"));
});

test("bounds validator flags off-canvas, safe-area and zero size", () => {
  const document = doc({
    id: "bounds",
    canvas: { width: 300, height: 300, safeMargin: 20 },
    elements: [
      text({ id: "outside", x: -200, y: 0, width: 100, height: 40, role: "body", text: "Gone", typography: { fontFamily: "Inter", fontSize: 14, lineHeight: 1.4 } }),
      shape({ id: "zero", x: 10, y: 10, width: 0, height: 0 }),
      shape({ id: "edge", x: 0, y: 0, width: 300, height: 40 }),
    ],
  });
  const { issues } = evaluate(document);
  assert.ok(issues.some((issue) => issue.code === "ELEMENT_OUTSIDE_CANVAS"));
  assert.ok(issues.some((issue) => issue.code === "ELEMENT_ZERO_SIZE"));
  assert.ok(issues.some((issue) => issue.code === "SAFE_AREA_VIOLATION"));
});

test("intentional overlap is respected, accidental collision is not", () => {
  const base = [
    text({ id: "a", x: 10, y: 10, width: 200, height: 40, role: "body", text: "First line", typography: { fontFamily: "Inter", fontSize: 16, lineHeight: 1.4 } }),
    text({ id: "b", x: 20, y: 20, width: 200, height: 40, role: "body", text: "Second line", typography: { fontFamily: "Inter", fontSize: 16, lineHeight: 1.4 } }),
  ];
  const accidental = evaluate(miniDocument({}, base)).issues;
  assert.ok(accidental.some((issue) => issue.code === "TEXT_COLLISION"));

  const intentional = structuredClone(base);
  intentional[0]!.meta = { intentionalOverlap: true };
  const declared = evaluate(miniDocument({}, intentional)).issues;
  assert.equal(declared.some((issue) => issue.code === "TEXT_COLLISION"), false);
});

test("content requirements must be preserved verbatim", () => {
  const document = miniDocument({}, [
    text({ id: "title", x: 0, y: 0, width: 300, height: 40, role: "headline", text: "Design Week", typography: { fontFamily: "Inter", fontSize: 24, lineHeight: 1.2 } }),
  ]);
  const { issues } = evaluate(document, {
    brief: {
      contentRequirements: [
        { id: "phone", label: "Phone", value: "+880 1700 000000", kind: "contact" },
        { id: "title", label: "Title", value: "Design Week" },
      ],
    },
  });
  assert.ok(issues.some((issue) => issue.code === "CONTENT_MISSING" && issue.blocksDelivery));
  assert.equal(issues.filter((issue) => issue.code === "CONTENT_MISSING").length, 1);
});

test("placeholder copy is a critical content failure", () => {
  const document = miniDocument({}, [
    text({ id: "body", x: 0, y: 0, width: 300, height: 40, role: "body", text: "Lorem ipsum dolor sit amet", typography: { fontFamily: "Inter", fontSize: 16, lineHeight: 1.4 } }),
  ]);
  const { issues } = evaluate(document);
  assert.ok(issues.some((issue) => issue.code === "PLACEHOLDER_CONTENT" && issue.blocksDelivery));
});

test("export validation checks dimensions, DPI and signatures", () => {
  const document = miniDocument({ canvas: { width: 400, height: 500, unit: "mm", dpi: 300, bleed: 3 } }, [
    shape({ id: "bg", x: 0, y: 0, width: 400, height: 500, zIndex: 0 }),
  ]);
  const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  const { issues } = evaluate(document, {
    exportSpecs: [
      { format: "png", width: 400, height: 500, dpi: 72, artifact: { byteLength: 10, signature: pngSignature, width: 400, height: 500 } },
      { format: "jpeg", transparency: true, width: 400, height: 400, artifact: { byteLength: 5, signature: new Uint8Array([0x00]) } },
    ],
  });
  assert.ok(issues.some((issue) => issue.code === "EXPORT_DPI_LOW"));
  assert.ok(issues.some((issue) => issue.code === "EXPORT_ASPECT_MISMATCH"));
  assert.ok(issues.some((issue) => issue.code === "EXPORT_TRANSPARENCY_UNSUPPORTED"));
  assert.ok(issues.some((issue) => issue.code === "EXPORT_CORRUPT" && issue.blocksDelivery));
  assert.ok(issues.some((issue) => issue.code === "EXPORT_BLEED_DISABLED"));
});

test("validators disagree with a document that is a flattened image", () => {
  const document = doc({
    id: "flat",
    canvas: { width: 500, height: 500 },
    assets: [{ id: "art", width: 500, height: 500 }],
    elements: [image({ id: "art-el", x: 0, y: 0, width: 500, height: 500, assetId: "art" })],
  });
  const { issues } = evaluate(document, {
    assets: createAssetRegistry([availableAsset("art", 500, 500)]),
  });
  assert.ok(issues.some((issue) => issue.code === "DOCUMENT_FLATTENED" && issue.blocksDelivery));
});

test("spacing validation reports uneven gaps and weak alignment", () => {
  const elements = [
    text({ id: "a", x: 20, y: 20, width: 200, height: 30, role: "headline", text: "Title", typography: { fontFamily: "Inter", fontSize: 24, lineHeight: 1.2 } }),
    text({ id: "b", x: 27, y: 52, width: 180, height: 24, role: "body", text: "One", typography: { fontFamily: "Inter", fontSize: 16, lineHeight: 1.4 } }),
    text({ id: "c", x: 55, y: 78, width: 150, height: 24, role: "body", text: "Two", typography: { fontFamily: "Inter", fontSize: 16, lineHeight: 1.4 } }),
    text({ id: "d", x: 90, y: 200, width: 160, height: 24, role: "caption", text: "Three", typography: { fontFamily: "Inter", fontSize: 14, lineHeight: 1.4 } }),
  ];
  const { issues } = evaluate(miniDocument({ canvas: { width: 400, height: 400, unit: "px" } }, elements));
  assert.ok(issues.some((issue) => issue.code === "SPACING_INCONSISTENT"));
  assert.ok(issues.some((issue) => issue.code === "ALIGNMENT_WEAK"));
});

test("strong poster fixture re-evaluates to no criticals with assets", () => {
  const { issues } = evaluate(strongPoster(), { ...strongContext() });
  assert.equal(issues.filter((issue) => issue.blocksDelivery).length, 0);
});

test("exports that shrink text below legibility are flagged", () => {
  const document = miniDocument({ canvas: { width: 1000, height: 1000, unit: "px" } }, [
    text({
      id: "caption",
      x: 10,
      y: 10,
      width: 400,
      height: 30,
      role: "caption",
      text: "A caption that must survive scaling",
      typography: { fontFamily: "Inter", fontSize: 20, lineHeight: 1.4 },
    }),
  ]);
  const { issues } = evaluate(document, {
    exportSpecs: [{ format: "png", width: 250, height: 250 }],
  });
  const scaled = issues.find((issue) => issue.code === "TEXT_ILLEGIBLE_AT_EXPORT_SCALE");
  assert.ok(scaled);
  assert.ok(scaled?.measured?.value !== undefined && scaled.measured.value < 9);
  assert.deepEqual(scaled?.elementIds, ["caption"]);
});
