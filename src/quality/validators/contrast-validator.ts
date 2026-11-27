import { parseColor, readableTextColor } from "../../core/color/color.ts";
import type { DocumentAnalysis } from "../analysis.ts";
import type { QualityContext, QualityIssue } from "../types.ts";
import { createIssue, round } from "./issue.ts";

const VALIDATOR = "contrast-validator";

/**
 * WCAG-based contrast validation (README §7.3, quality metrics §3.5).
 *
 * Contrast is computed from the actual paint stack: the text fill is composited
 * against every lower layer that covers it, ending at the canvas background.
 * When the real background is imagery or a gradient, the check is reported as
 * unverifiable instead of guessed — the engine never claims to have verified
 * what it could not measure.
 */
export function validateContrast(analysis: DocumentAnalysis, _context: QualityContext): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const sample of analysis.contrastSamples) {
    const block = analysis.texts.find((entry) => entry.element.id === sample.elementId);
    if (!block || !block.essential) continue;

    if (!sample.verifiable || sample.ratio === null) {
      issues.push(
        createIssue({
          code: "CONTRAST_UNVERIFIED",
          title: "Contrast could not be verified",
          category: "color",
          severity: "low",
          message: `Contrast for "${block.element.name}" cannot be computed: ${sample.reason ?? "unknown paint stack"}.`,
          elementIds: [block.element.id],
          recommendation:
            "Provide the image's dominant color or inspect the rendered preview to confirm the text remains legible over the artwork.",
          validator: VALIDATOR,
        }),
      );
      continue;
    }

    if (sample.passes) continue;

    const ratio = sample.ratio;
    const ratioText = round(ratio, 2);
    const severity = ratio < 2.5 ? "critical" : ratio < sample.required - 1 ? "high" : "medium";
    const suggested =
      sample.background !== null
        ? readableTextColor(parseColor(sample.background) ?? { r: 255, g: 255, b: 255, a: 1 })
        : null;

    issues.push(
      createIssue({
        code: "CONTRAST_INSUFFICIENT",
        title: "Insufficient text contrast",
        category: "color",
        severity,
        measured: { value: ratioText, expected: sample.required, unit: "WCAG contrast ratio" },
        message: `"${block.element.name}" has a contrast ratio of ${ratioText}:1 against its background; ${sample.required}:1 is required at this size.`,
        elementIds: [block.element.id],
        recommendation: suggested
          ? `Raise contrast to at least ${sample.required}:1 — for example render this text in ${suggested.r === 0 ? "black" : "white"} or adjust the background behind it.`
          : `Raise contrast to at least ${sample.required}:1 by darkening the background or lightening the text.`,
        revision: {
          action: "replace_text_color",
          elementIds: [block.element.id],
          parameters: {
            foreground: sample.foreground,
            requiredRatio: sample.required,
          },
        },
        validator: VALIDATOR,
      }),
    );
  }

  return issues;
}
