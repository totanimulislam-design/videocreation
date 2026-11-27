import type { DocumentAnalysis } from "../analysis.ts";
import type { QualityContext, QualityIssue } from "../types.ts";
import { createIssue, round } from "./issue.ts";

const VALIDATOR = "layout-validator";

/**
 * Accidental collisions and obscured content (README §7.2, quality metrics §4).
 *
 * Deliberate layering is protected: elements can opt out with
 * `meta.intentionalOverlap`, which is how art direction records expressive
 * overlap (DESIGN_SYSTEM.md §17, quality metrics §4 critical gate rule).
 */
export function validateLayout(analysis: DocumentAnalysis, _context: QualityContext): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const overlap of analysis.layout.overlaps) {
    const a = analysis.texts.find((block) => block.element.id === overlap.a);
    const b = analysis.texts.find((block) => block.element.id === overlap.b);
    const bothEssential = a?.essential !== false && b?.essential !== false;
    const severe = bothEssential && overlap.ratio > 0.5;
    issues.push(
      createIssue({
        code: "TEXT_COLLISION",
        title: "Overlapping text",
        category: "layout",
        severity: severe ? "critical" : overlap.ratio > 0.3 ? "high" : "medium",
        measured: { value: round(overlap.ratio, 3), unit: "overlap ratio" },
        message: `Text elements "${overlap.a}" and "${overlap.b}" overlap by ${round(overlap.ratio * 100, 0)}%, which obscures content.`,
        elementIds: [overlap.a, overlap.b],
        recommendation:
          "Separate the text blocks, or — if the overlap is an intentional editorial decision — mark the elements with meta.intentionalOverlap.",
        validator: VALIDATOR,
      }),
    );
  }

  for (const hidden of analysis.layout.hiddenEssential) {
    issues.push(
      createIssue({
        code: "CONTENT_OBSCURED",
        title: "Obscured content",
        category: "layout",
        severity: "critical",
        message: `Essential element "${hidden.id}" is painted underneath opaque element "${hidden.by}" and is effectively invisible.`,
        elementIds: [hidden.id, hidden.by],
        recommendation: "Reorder the layers so the content stays visible, or make the covering shape transparent.",
        validator: VALIDATOR,
      }),
    );
  }

  const textCount = analysis.texts.length;
  if (analysis.layout.coverage > 0.72 && textCount >= 6) {
    issues.push(
      createIssue({
        code: "COMPOSITION_OVERCROWDED",
        title: "Overcrowded composition",
        category: "layout",
        severity: "high",
        measured: { value: round(analysis.layout.coverage, 3), unit: "occupied canvas share" },
        message: `${round(analysis.layout.coverage * 100, 0)}% of the canvas is occupied by ${textCount} text blocks, leaving little negative space.`,
        recommendation:
          "Remove or merge supporting content, and restore deliberate negative space around the focal point (DESIGN_SYSTEM.md §3.7).",
        validator: VALIDATOR,
      }),
    );
  }

  return issues;
}
