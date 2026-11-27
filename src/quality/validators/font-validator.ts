import type { DocumentAnalysis } from "../analysis.ts";
import type { QualityContext, QualityIssue } from "../types.ts";
import { createIssue } from "./issue.ts";

const VALIDATOR = "font-validator";

/**
 * Font availability and script coverage (README §7.1/§7.3, quality metrics
 * §3.4, §4 "Missing fonts" / "Broken characters").
 *
 * Multilingual rendering is a hard requirement: a Latin-only face cannot render
 * Bengali conjuncts or Arabic shaping, so declaring such a face is a critical
 * failure rather than a styling preference.
 */
export function validateFonts(analysis: DocumentAnalysis, context: QualityContext): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const registry = context.fonts;

  for (const entry of analysis.fonts) {
    const face = registry?.get(entry.family);

    if (!face) {
      issues.push(
        createIssue({
          code: "FONT_UNAVAILABLE",
          title: "Font not available",
          category: "font",
          severity: "critical",
          message: `Font family "${entry.family}" is not part of the studio font library, so the renderer will substitute a fallback.`,
          elementIds: entry.elementIds,
          recommendation:
            "Use a family from the documented font library, or register the uploaded font with its metadata before rendering.",
          revision: { action: "register_font", elementIds: entry.elementIds },
          validator: VALIDATOR,
        }),
      );
      continue;
    }

    if (!face.available) {
      issues.push(
        createIssue({
          code: "FONT_UNAVAILABLE",
          title: "Font not loaded",
          category: "font",
          severity: "critical",
          message: `Font family "${entry.family}" is registered but not loaded for rendering.`,
          elementIds: entry.elementIds,
          recommendation: "Load the font face before rendering, or switch the text to an available family.",
          revision: { action: "register_font", elementIds: entry.elementIds },
          validator: VALIDATOR,
        }),
      );
      continue;
    }

    const missingScripts = entry.scripts.filter((script) => !face.scripts.includes(script));
    if (missingScripts.length > 0) {
      issues.push(
        createIssue({
          code: "GLYPH_UNSUPPORTED",
          title: "Unsupported script",
          category: "font",
          severity: "critical",
          message: `"${entry.family}" does not cover ${missingScripts.join(", ")} text used on this design, so characters would render as tofu or be substituted.`,
          elementIds: entry.elementIds,
          recommendation:
            "Use a script-appropriate family (e.g. Noto Sans Bengali or Noto Naskh Arabic) for this text layer.",
          validator: VALIDATOR,
        }),
      );
    }

    for (const block of analysis.texts.filter((candidate) => candidate.typography.fontFamily === entry.family)) {
      const weight = block.typography.fontWeight;
      if (!face.weights.includes(weight) && face.weights.length > 0) {
        issues.push(
          createIssue({
            code: "FONT_WEIGHT_UNAVAILABLE",
            title: "Missing font weight",
            category: "font",
            severity: "medium",
            measured: { value: weight, unit: "font weight" },
            message: `"${entry.family}" has no ${weight} weight; the renderer would synthesize or substitute it.`,
            elementIds: [block.element.id],
            recommendation: `Choose one of the available weights (${face.weights.join(", ")}) or use a family that ships the required weight.`,
            validator: VALIDATOR,
          }),
        );
      }
      if (block.typography.fontStyle === "italic" && face.style !== "italic" && face.scripts.length === 0) {
        issues.push(
          createIssue({
            code: "FONT_STYLE_UNAVAILABLE",
            title: "Missing italic style",
            category: "font",
            severity: "low",
            message: `"${entry.family}" has no italic style in the library.`,
            elementIds: [block.element.id],
            recommendation: "Use the roman style, or select a family that provides italics.",
            validator: VALIDATOR,
          }),
        );
      }
    }
  }

  return issues;
}
