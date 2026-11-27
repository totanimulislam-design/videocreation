import { validateDesignDocument } from "../../core/design-document/validation.ts";
import { area, elementBounds } from "../../core/geometry/bounds.ts";
import type { DocumentAnalysis } from "../analysis.ts";
import type { QualityContext, QualityIssue } from "../types.ts";
import { createIssue, round } from "./issue.ts";

const VALIDATOR = "document-validator";

/**
 * Structural validation (README §7.1, quality metrics §3.10, §4).
 *
 * A document that fails this validator cannot be rendered, scored or exported,
 * so problems are mapped to the critical gate.
 */
export function validateDocument(analysis: DocumentAnalysis, context: QualityContext): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const result = validateDesignDocument(context.document);

  for (const problem of result.problems) {
    issues.push(
      createIssue({
        code: problem.severity === "critical" ? "SCHEMA_INVALID" : "SCHEMA_WARNING",
        title: "Design document structure",
        category: "document",
        severity: problem.severity === "critical" ? "critical" : "medium",
        message: `${problem.path}: ${problem.message}`,
        recommendation:
          problem.severity === "critical"
            ? "Correct the document structure before rendering; every element must satisfy the canonical DesignElement schema."
            : "Resolve the schema warning so downstream tools can rely on the document.",
        validator: VALIDATOR,
      }),
    );
  }

  // A flattened image is not an editable design (README §5.1, AGENTS.md §4).
  const visibleContent = analysis.visible.filter((element) => element.meta?.role !== "background");
  const textCount = analysis.texts.length;
  const canvasArea = analysis.canvas.width * analysis.canvas.height;
  const singleFullBleedImage =
    visibleContent.length === 1 &&
    visibleContent[0]?.type === "image" &&
    area(elementBounds(visibleContent[0])) / canvasArea > 0.9;

  if (singleFullBleedImage && textCount === 0) {
    issues.push(
      createIssue({
        code: "DOCUMENT_FLATTENED",
        title: "Flattened artwork",
        category: "document",
        severity: "critical",
        message:
          "The document consists of a single full-bleed image. A completed design must be composed of editable vector/text objects.",
        elementIds: [visibleContent[0]!.id],
        recommendation:
          "Rebuild the composition from editable text, shape and image elements; never substitute a flattened render for the design.",
        validator: VALIDATOR,
      }),
    );
  }

  if (analysis.visible.length === 0) {
    issues.push(
      createIssue({
        code: "DOCUMENT_EMPTY",
        title: "Empty composition",
        category: "document",
        severity: "critical",
        message: "Every element in the document is hidden, so there is nothing to deliver.",
        recommendation: "Unhide the intended composition or remove empty layers before delivery.",
        validator: VALIDATOR,
      }),
    );
  }

  // Preview/export must come from the same document (AGENTS.md §4).
  if (context.render) {
    const render = context.render;
    if (render.fromSameDocument === false) {
      issues.push(
        createIssue({
          code: "RENDER_NOT_FROM_DOCUMENT",
          title: "Preview mismatch",
          category: "document",
          severity: "high",
          message: "The inspected preview was not generated from the document under evaluation.",
          recommendation: "Re-render the preview from the current document before inspecting or delivering it.",
          validator: VALIDATOR,
        }),
      );
    }
    if (render.elementIds && render.elementIds.length > 0) {
      const rendered = new Set(render.elementIds);
      const missing = analysis.visible
        .filter((element) => !rendered.has(element.id))
        .map((element) => element.id);
      if (missing.length > 0) {
        issues.push(
          createIssue({
            code: "RENDER_INCOMPLETE",
            title: "Preview missing elements",
            category: "document",
            severity: "high",
            message: `${missing.length} visible element(s) were not painted into the preview: ${missing.slice(0, 6).join(", ")}.`,
            elementIds: missing,
            recommendation:
              "Fix the renderer or the element geometry before inspecting and delivering the design; an incomplete preview cannot be approved.",
            validator: VALIDATOR,
          }),
        );
      }
    }
    if (
      render.width !== undefined &&
      render.height !== undefined &&
      (Math.abs(render.width - analysis.canvas.width) > 1 || Math.abs(render.height - analysis.canvas.height) > 1)
    ) {
      issues.push(
        createIssue({
          code: "RENDER_DIMENSION_MISMATCH",
          title: "Preview dimensions",
          category: "document",
          severity: "high",
          measured: {
            value: render.width,
            expected: analysis.canvas.width,
            unit: "px",
          },
          message: `Preview is ${render.width}×${render.height} but the document canvas is ${analysis.canvas.width}×${analysis.canvas.height}.`,
          recommendation: "Render previews and exports at the document's declared dimensions.",
          validator: VALIDATOR,
        }),
      );
    }
  }

  // Category-specific aspect expectations (DESIGN_SYSTEM.md §11).
  const aspect = analysis.canvas.width / analysis.canvas.height;
  const category = analysis.brief.category ?? analysis.document.category;
  if (category === "business-card" && (aspect < 1.3 || aspect > 2.0)) {
    issues.push(
      createIssue({
        code: "CATEGORY_ASPECT_MISMATCH",
        title: "Category dimensions",
        category: "document",
        severity: "medium",
        measured: { value: round(aspect, 2), expected: 1.65, unit: "ratio" },
        message: `A business card is typically landscape at roughly 1.65:1; this canvas is ${round(aspect, 2)}:1.`,
        recommendation: "Use a standard business-card aspect ratio (85 × 55 mm) unless the brief specifies otherwise.",
        validator: VALIDATOR,
      }),
    );
  }
  if (category === "banner" && aspect < 1.8) {
    issues.push(
      createIssue({
        code: "CATEGORY_ASPECT_MISMATCH",
        title: "Category dimensions",
        category: "document",
        severity: "medium",
        measured: { value: round(aspect, 2), expected: 3, unit: "ratio" },
        message: `An advertising banner should read horizontally, but this canvas is ${round(aspect, 2)}:1.`,
        recommendation: "Use a wide horizontal canvas for banners, or change the design category to match the format.",
        validator: VALIDATOR,
      }),
    );
  }

  // Print documents must declare print production specifications.
  const isPrint = analysis.canvas.unit !== "px";
  if (isPrint) {
    if (!analysis.canvas.dpi) {
      issues.push(
        createIssue({
          code: "PRINT_DPI_UNDECLARED",
          title: "Print resolution",
          category: "document",
          severity: "high",
          message: "The document uses physical units but does not declare a target DPI.",
          recommendation: "Declare the document DPI (typically 300 for print artwork) so raster output can be validated.",
          validator: VALIDATOR,
        }),
      );
    }
    if (!analysis.canvas.bleed) {
      issues.push(
        createIssue({
          code: "PRINT_BLEED_MISSING",
          title: "Print bleed",
          category: "document",
          severity: "medium",
          message: "The print document does not declare a bleed area.",
          recommendation: "Add bleed allowance (commonly 3 mm) for print artwork that reaches the page edge.",
          validator: VALIDATOR,
        }),
      );
    }
  }

  return issues;
}
