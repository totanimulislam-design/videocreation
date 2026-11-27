import type { DocumentAnalysis } from "../analysis.ts";
import type { QualityContext, QualityIssue } from "../types.ts";
import { createIssue, round } from "./issue.ts";

const VALIDATOR = "typography-validator";

const BODY_ROLES = new Set(["body", "caption", "label", "contact", "subheading"]);
const DISPLAY_ROLES = new Set(["headline", "subheadline", "cta"]);

const PLACEHOLDER_PATTERNS = [
  /\blorem ipsum\b/i,
  /\bTODO\b/,
  /\bplaceholder\b/i,
  /\bTBD\b/,
  /\bxxx+\b/i,
  /\{\{[^}]+\}\}/,
  /\[insert[^\]]*\]/i,
];

/**
 * Typographic craft checks that can be measured (DESIGN_SYSTEM.md §6,
 * README §7.3, quality metrics §3.4).
 *
 * Subjective pairing and personality judgement stays with the visual critic;
 * this validator only enforces objective facts: readable sizes, sane leading,
 * bounded family count and a genuine size hierarchy.
 */
export function validateTypography(analysis: DocumentAnalysis, _context: QualityContext): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const canvas = analysis.canvas;
  const brief = analysis.brief;
  const minBody = brief.minimumBodyFontSize ?? Math.max(9, Math.min(18, Math.round(Math.min(canvas.width, canvas.height) * 0.012)));
  const absoluteFloor = Math.max(7, minBody * 0.65);

  if (analysis.texts.length === 0) {
    issues.push(
      createIssue({
        code: "NO_TYPOGRAPHY",
        title: "No text in composition",
        category: "typography",
        severity: "medium",
        message: "The document contains no text elements; confirm this is an intentional image-only composition.",
        recommendation: "If the brief requires communication, add the headline and supporting copy as editable text elements.",
        validator: VALIDATOR,
      }),
    );
  }

  const families = new Set(analysis.texts.map((block) => block.typography.fontFamily.toLowerCase()));
  if (families.size > 3) {
    issues.push(
      createIssue({
        code: "TOO_MANY_FONT_FAMILIES",
        title: "Too many typefaces",
        category: "typography",
        severity: families.size > 4 ? "high" : "medium",
        measured: { value: families.size, expected: 2, unit: "font families" },
        message: `The design uses ${families.size} font families (${[...families].join(", ")}), which weakens typographic coherence.`,
        recommendation: "Limit the design to one or two families (three at most) and create hierarchy with weight and size instead.",
        validator: VALIDATOR,
      }),
    );
  }

  for (const block of analysis.texts) {
    if (!block.essential) continue;
    const { typography } = block;

    const pxSize =
      canvas.unit === "px" ? typography.fontSize : (typography.fontSize / analysis.unitsPerInch) * 96;
    const isBodyLike = BODY_ROLES.has(block.role) || block.role === "unassigned";

    if (pxSize < absoluteFloor) {
      issues.push(
        createIssue({
          code: "TEXT_TOO_SMALL",
          title: "Unreadable text size",
          category: "typography",
          severity: pxSize < absoluteFloor * 0.75 ? "critical" : "high",
          measured: { value: round(pxSize, 1), expected: absoluteFloor, unit: "px equivalent" },
          message: `"${block.element.name}" renders at a ${round(pxSize, 1)}px equivalent, below the readable floor of ${round(absoluteFloor, 1)}px.`,
          elementIds: [block.element.id],
          recommendation: "Increase the type size, or remove the information from the composition.",
          revision: {
            action: "increase_font_size",
            elementIds: [block.element.id],
            parameters: { fontSize: round((absoluteFloor / pxSize) * typography.fontSize, 1) },
          },
          validator: VALIDATOR,
        }),
      );
    } else if (isBodyLike && pxSize < minBody && !DISPLAY_ROLES.has(block.role)) {
      issues.push(
        createIssue({
          code: "BODY_TEXT_BELOW_MINIMUM",
          title: "Small body copy",
          category: "typography",
          severity: "medium",
          measured: { value: round(pxSize, 1), expected: minBody, unit: "px equivalent" },
          message: `Supporting text "${block.element.name}" is ${round(pxSize, 1)}px equivalent, smaller than the ${minBody}px minimum for this canvas.`,
          elementIds: [block.element.id],
          recommendation: "Raise supporting text to the minimum readable body size for the output format.",
          revision: {
            action: "increase_font_size",
            elementIds: [block.element.id],
            parameters: { fontSize: round((minBody / pxSize) * typography.fontSize, 1) },
          },
          validator: VALIDATOR,
        }),
      );
    }

    if (typography.lineHeight < 1) {
      issues.push(
        createIssue({
          code: "LINE_HEIGHT_COLLISION",
          title: "Colliding leading",
          category: "typography",
          severity: "critical",
          measured: { value: round(typography.lineHeight, 2), expected: 1.15, unit: "line-height multiple" },
          message: `"${block.element.name}" uses a line height below 1.0, so its own lines overlap.`,
          elementIds: [block.element.id],
          recommendation: "Set leading to at least 1.1 for display text and 1.3–1.6 for body copy.",
          revision: {
            action: "increase_line_height",
            elementIds: [block.element.id],
            parameters: { lineHeight: 1.2 },
          },
          validator: VALIDATOR,
        }),
      );
    } else if (typography.lineHeight < 1.15) {
      issues.push(
        createIssue({
          code: "LINE_HEIGHT_TIGHT",
          title: "Tight leading",
          category: "typography",
          severity: isBodyLike ? "medium" : "low",
          measured: { value: round(typography.lineHeight, 2), expected: isBodyLike ? 1.4 : 1.1, unit: "line-height multiple" },
          message: `"${block.element.name}" uses ${round(typography.lineHeight, 2)} line height, which crowds ${block.measurement.lines.length > 1 ? "its lines" : "the type"} and reduces reading comfort.`,
          elementIds: [block.element.id],
          recommendation:
            "Use 1.05–1.2 for display type and 1.35–1.6 for body copy, and keep leading consistent within a text group.",
          revision: {
            action: "increase_line_height",
            elementIds: [block.element.id],
            parameters: { lineHeight: isBodyLike ? 1.45 : 1.15 },
          },
          validator: VALIDATOR,
        }),
      );
    }

    if (isBodyLike && typography.lineHeight > 2.2) {
      issues.push(
        createIssue({
          code: "LINE_HEIGHT_LOOSE",
          title: "Loose leading",
          category: "typography",
          severity: "low",
          measured: { value: round(typography.lineHeight, 2), expected: 1.5, unit: "line-height multiple" },
          message: `"${block.element.name}" uses ${round(typography.lineHeight, 2)} line height, so lines no longer read as one paragraph.`,
          elementIds: [block.element.id],
          recommendation: "Tighten body leading to roughly 1.35–1.6.",
          validator: VALIDATOR,
        }),
      );
    }

    if (typography.letterSpacing !== undefined && typography.fontSize > 0) {
      const trackingEm = typography.letterSpacing / typography.fontSize;
      if (trackingEm < -0.06) {
        issues.push(
          createIssue({
            code: "LETTER_SPACING_CRAMPED",
            title: "Cramped tracking",
            category: "typography",
            severity: "medium",
            measured: { value: round(trackingEm, 3), expected: 0, unit: "em" },
            message: `"${block.element.name}" is tracked ${round(trackingEm, 3)}em, so glyphs collide.`,
            elementIds: [block.element.id],
            recommendation: "Keep negative tracking above about -0.03em, and never apply it to body copy.",
            validator: VALIDATOR,
          }),
        );
      }
    }

    if (typography.textTransform === "uppercase" && block.text.length > 60 && isBodyLike) {
      issues.push(
        createIssue({
          code: "LONG_TEXT_UPPERCASE",
          title: "Uppercase body copy",
          category: "typography",
          severity: "low",
          measured: { value: block.text.length, unit: "characters" },
          message: `"${block.element.name}" sets ${block.text.length} characters of body copy in uppercase, slowing reading.`,
          elementIds: [block.element.id],
          recommendation: "Reserve uppercase for short labels and display lines; use sentence case for body copy.",
          validator: VALIDATOR,
        }),
      );
    }

    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(block.text)) {
        issues.push(
          createIssue({
            code: "PLACEHOLDER_CONTENT",
            title: "Placeholder content",
            category: "content",
            severity: "critical",
            message: `"${block.element.name}" still contains placeholder content: ${JSON.stringify(block.text.slice(0, 60))}.`,
            elementIds: [block.element.id],
            recommendation: "Replace placeholder copy with the user's real content before delivery.",
            validator: VALIDATOR,
          }),
        );
        break;
      }
    }

    if (block.text.trim() === "") {
      issues.push(
        createIssue({
          code: "EMPTY_TEXT",
          title: "Empty text element",
          category: "content",
          severity: block.essential ? "high" : "low",
          message: `Text element "${block.element.name}" is visible but empty.`,
          elementIds: [block.element.id],
          recommendation: "Fill the element with the intended copy or remove it.",
          validator: VALIDATOR,
        }),
      );
    }
  }

  // Real size hierarchy: the headline must clearly outrank body copy.
  const headline = analysis.texts.find((block) => block.role === "headline");
  const bodySizes = analysis.texts
    .filter((block) => BODY_ROLES.has(block.role))
    .map((block) => block.typography.fontSize);
  if (headline && bodySizes.length > 0) {
    const maxBody = Math.max(...bodySizes);
    if (maxBody > 0 && headline.typography.fontSize / maxBody < 1.35) {
      issues.push(
        createIssue({
          code: "WEAK_TYPE_HIERARCHY",
          title: "Weak typographic hierarchy",
          category: "hierarchy",
          severity: headline.typography.fontSize / maxBody < 1.15 ? "high" : "medium",
          measured: {
            value: round(headline.typography.fontSize / maxBody, 2),
            expected: 1.6,
            unit: "headline to body size ratio",
          },
          message: `The headline is only ${round(headline.typography.fontSize / maxBody, 2)}× the largest body text, so it does not read as the primary message.`,
          elementIds: [headline.element.id],
          recommendation:
            "Increase the headline size or reduce supporting copy so the primary message clearly dominates the hierarchy.",
          validator: VALIDATOR,
        }),
      );
    }
  } else if (analysis.texts.length >= 3 && !headline) {
    issues.push(
      createIssue({
        code: "NO_HEADLINE_ROLE",
        title: "No headline",
        category: "hierarchy",
        severity: "medium",
        message: "No text element is assigned the `headline` role, so the hierarchy cannot be validated or communicated.",
        recommendation: "Assign semantic roles (`meta.role`) to the text layers, starting with the headline.",
        validator: VALIDATOR,
      }),
    );
  }

  return issues;
}
