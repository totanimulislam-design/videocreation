import {
  area,
  containsRect,
  elementBounds,
  inset,
  intersectionArea,
} from "../../core/geometry/bounds.ts";
import type { DocumentAnalysis } from "../analysis.ts";
import type { QualityContext, QualityIssue } from "../types.ts";
import { createIssue, round } from "./issue.ts";

const VALIDATOR = "bounds-validator";

/**
 * Geometry validation: elements must live inside the document, respect the
 * safe area and keep usable dimensions (README §7.2, quality metrics §4
 * "Layout Failure").
 *
 * Deliberate full-bleed artwork is recognised through the `background` role, so
 * intentional edge-to-edge composition is not penalised.
 */
export function validateBounds(analysis: DocumentAnalysis, _context: QualityContext): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const canvas = { x: 0, y: 0, width: analysis.canvas.width, height: analysis.canvas.height };
  const tolerance = 0.5;

  for (const element of analysis.visible) {
    const bounds = elementBounds(element);
    const isBackground = element.meta?.role === "background";
    const essential = element.meta?.decorative !== true && !isBackground;

    if (bounds.width <= 0 || bounds.height <= 0) {
      issues.push(
        createIssue({
          code: "ELEMENT_ZERO_SIZE",
          title: "Zero-size element",
          category: "bounds",
          severity: element.type === "text" || element.type === "image" ? "critical" : "high",
          message: `Element "${element.name}" has ${round(bounds.width, 1)}×${round(bounds.height, 1)} document units and cannot render.`,
          elementIds: [element.id],
          recommendation: "Give the element a non-zero width and height, or remove it from the document.",
          validator: VALIDATOR,
        }),
      );
      continue;
    }

    const fullyInside = containsRect(canvas, bounds, tolerance);
    const overlap = intersectionArea(canvas, bounds);
    const visibleShare = area(bounds) === 0 ? 0 : overlap / area(bounds);

    if (visibleShare <= 0.001 && !isBackground) {
      issues.push(
        createIssue({
          code: "ELEMENT_OUTSIDE_CANVAS",
          title: "Element outside the canvas",
          category: "bounds",
          severity: essential ? "critical" : "high",
          message: `Element "${element.name}" is completely outside the ${analysis.canvas.width}×${analysis.canvas.height} canvas.`,
          elementIds: [element.id],
          recommendation: "Move the element inside the canvas bounds, or delete it if it is unused.",
          revision: { action: "nudge_into_bounds", elementIds: [element.id] },
          validator: VALIDATOR,
        }),
      );
      continue;
    }

    if (!fullyInside && !isBackground) {
      issues.push(
        createIssue({
          code: "ELEMENT_PARTIALLY_OUTSIDE",
          title: "Clipped element",
          category: "bounds",
          severity: essential && visibleShare < 0.95 ? "critical" : essential ? "high" : "medium",
          measured: { value: round(1 - visibleShare, 3), unit: "share of element outside canvas" },
          message: `Element "${element.name}" extends ${round((1 - visibleShare) * 100, 1)}% outside the canvas and will be clipped.`,
          elementIds: [element.id],
          recommendation:
            "Either move the element fully inside the canvas or mark it as a deliberate bleed element with the background role.",
          revision: { action: "nudge_into_bounds", elementIds: [element.id] },
          validator: VALIDATOR,
        }),
      );
    }

    // Explicit safe margins are a hard production requirement.
    if (analysis.canvas.safeMargin && analysis.canvas.safeMargin > 0 && !isBackground) {
      const safe = inset(canvas, analysis.canvas.safeMargin);
      if (!containsRect(safe, bounds, tolerance)) {
        const outsideSafe = essential && element.type !== "image";
        issues.push(
          createIssue({
            code: "SAFE_AREA_VIOLATION",
            title: "Safe-area violation",
            category: "bounds",
            severity: outsideSafe ? "high" : "medium",
            measured: {
              value: round(analysis.canvas.safeMargin, 1),
              unit: "document units",
            },
            message: `Element "${element.name}" crosses the declared ${analysis.canvas.safeMargin}-unit safe margin.`,
            elementIds: [element.id],
            recommendation:
              "Keep essential content inside the safe area; only background or bleed artwork may extend past it.",
            revision: {
              action: "move_inside_safe_area",
              elementIds: [element.id],
              parameters: { safeMargin: analysis.canvas.safeMargin },
            },
            validator: VALIDATOR,
          }),
        );
      }
    }

    // Random rotation of important text is a typography anti-pattern
    // (DESIGN_SYSTEM.md §17), and it also breaks readable baselines.
    if (
      element.type === "text" &&
      essential &&
      Math.abs(element.transform.rotation) > 3 &&
      Math.abs(element.transform.rotation) % 90 > 3
    ) {
      issues.push(
        createIssue({
          code: "ESSENTIAL_TEXT_ROTATED",
          title: "Rotated essential text",
          category: "typography",
          severity: "medium",
          measured: { value: round(element.transform.rotation, 1), unit: "degrees" },
          message: `Essential text "${element.name}" is rotated ${round(element.transform.rotation, 1)}°, which reduces reading comfort.`,
          elementIds: [element.id],
          recommendation:
            "Either remove the rotation from essential text or declare it as an intentional expressive treatment in the art direction.",
          validator: VALIDATOR,
        }),
      );
    }

    if (element.transform.scaleX < 0 || element.transform.scaleY < 0) {
      issues.push(
        createIssue({
          code: "NEGATIVE_SCALE",
          title: "Mirrored element",
          category: "bounds",
          severity: "medium",
          message: `Element "${element.name}" uses a negative scale, which mirrors it unexpectedly in export.`,
          elementIds: [element.id],
          recommendation: "Use an explicit mirrored transform only when intended; otherwise restore positive scale values.",
          validator: VALIDATOR,
        }),
      );
    }
  }

  return issues;
}
