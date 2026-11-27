import type { DocumentAnalysis } from "../analysis.ts";
import type { QualityContext, QualityIssue } from "../types.ts";
import { createIssue, round } from "./issue.ts";

const VALIDATOR = "spacing-validator";

/**
 * Spacing and alignment consistency (README §7.2, quality metrics §3.6).
 *
 * The rules are deliberately ratio-based: different relationships may require
 * different spacing, so only *inconsistency* is reported, never a single
 * "correct" value.
 */
export function validateSpacing(analysis: DocumentAnalysis, _context: QualityContext): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const { margins, alignment, spacing, canvas } = analysis;
  const contentCount = analysis.visible.filter((element) => {
    if (element.meta?.role === "background") return false;
    const bounds = element.transform;
    return bounds.width * bounds.height < canvas.width * canvas.height * 0.98;
  }).length;

  if (contentCount >= 3) {
    const deviation = margins.max - margins.min;
    const relative = deviation / Math.max(1, Math.min(canvas.width, canvas.height));
    if (deviation > 8 && relative > 0.02) {
      issues.push(
        createIssue({
          code: "MARGIN_INCONSISTENT",
          title: "Inconsistent margins",
          category: "spacing",
          severity: deviation > 24 && relative > 0.06 ? "high" : "medium",
          measured: { value: round(deviation, 1), expected: round(margins.recommended, 1), unit: "document units" },
          message: `Content margins differ by ${round(deviation, 1)} units (left ${round(margins.left, 1)}, right ${round(margins.right, 1)}, top ${round(margins.top, 1)}, bottom ${round(margins.bottom, 1)}).`,
          recommendation:
            "Align the composition to a consistent margin system; intentional asymmetry should still read as a controlled margin relationship.",
          validator: VALIDATOR,
        }),
      );
    }
  }

  if (contentCount >= 4 && alignment.alignedShare < 0.5) {
    issues.push(
      createIssue({
        code: "ALIGNMENT_WEAK",
        title: "Weak alignment",
        category: "spacing",
        severity: "medium",
        measured: { value: round(alignment.alignedShare, 2), expected: 0.5, unit: "share of aligned elements" },
        message: `Only ${round(alignment.alignedShare * 100, 0)}% of elements share an edge with another element.`,
        recommendation:
          "Establish a small number of shared alignment axes; every element should relate to a grid line or another element.",
        validator: VALIDATOR,
      }),
    );
  }

  if (spacing.gaps.length >= 3 && spacing.meanGap > 0) {
    const deviationRatio = spacing.deviation / spacing.meanGap;
    if (deviationRatio > 0.75) {
      issues.push(
        createIssue({
          code: "SPACING_INCONSISTENT",
          title: "Uneven vertical spacing",
          category: "spacing",
          severity: deviationRatio > 1.2 ? "high" : "medium",
          measured: { value: round(deviationRatio, 2), expected: 0.5, unit: "relative gap deviation" },
          message: `Vertical gaps between text blocks vary by ±${round(deviationRatio * 100, 0)}% around the mean, which reads as accidental rather than rhythmic.`,
          recommendation:
            "Apply a spacing scale (4/8/16/24/32/48/64) so related groups are consistently tight and sections are consistently separated.",
          validator: VALIDATOR,
        }),
      );
    }
  }

  return issues;
}
