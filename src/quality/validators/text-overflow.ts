import type { DocumentAnalysis } from "../analysis.ts";
import type { QualityContext, QualityIssue, TextBlock } from "../types.ts";
import { createIssue, round } from "./issue.ts";

const VALIDATOR = "text-overflow";

function describe(block: TextBlock): string {
  const excerpt = block.text.length > 40 ? `${block.text.slice(0, 37)}…` : block.text;
  return `"${excerpt}"`;
}

/**
 * Text fitting (README §7.3, quality metrics §3.4/§4).
 *
 * A text frame that is smaller than the measured text means the renderer will
 * clip content. With approximate glyph metrics the engine is deliberately
 * conservative: small overflows are reported as high severity, and only clear,
 * substantial clipping blocks delivery. An exact `TextMeasurer` supplied by the
 * renderer makes every essential overflow critical.
 */
export function validateTextOverflow(analysis: DocumentAnalysis, _context: QualityContext): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const block of analysis.texts) {
    if (!block.essential) continue;
    if (block.element.allowOverflow) continue;

    const approximate = block.measurement.approximate;
    const lineHeight = block.typography.fontSize * block.typography.lineHeight;
    const verticalOverflowRatio =
      block.frameHeight > 0 ? block.overflowY / block.frameHeight : block.overflowY > 0 ? 1 : 0;

    const substantial =
      block.overflowY > lineHeight * 1.25 * (approximate ? 1 : 0.25) ||
      block.overflowX > block.frameWidth * (approximate ? 0.1 : 0.01) ||
      verticalOverflowRatio > (approximate ? 0.12 : 0.01);

    if (block.overflowY > 1 || block.overflowX > 1) {
      issues.push(
        createIssue({
          code: "TEXT_OVERFLOW_FRAME",
          title: "Text overflows its frame",
          category: "typography",
          severity: substantial ? "critical" : "high",
          measured: {
            value: round(Math.max(block.overflowY, block.overflowX), 1),
            expected: 0,
            unit: "document units of overflow",
            ...(approximate ? { approximate: true } : {}),
          },
          message: `Text ${describe(block)} needs ${round(block.measurement.width, 1)}×${round(block.measurement.height, 1)} but its frame is ${round(block.frameWidth, 1)}×${round(block.frameHeight, 1)}, so ${round(Math.max(block.overflowY, block.overflowX), 1)} units will be clipped.`,
          elementIds: [block.element.id],
          recommendation:
            "Enlarge the text frame, reduce the font size, or rewrite the copy. Never let the renderer clip essential text.",
          revision: {
            action: "grow_text_frame",
            elementIds: [block.element.id],
            parameters: {
              width: Math.ceil(block.measurement.width),
              height: Math.ceil(block.measurement.height),
            },
          },
          validator: VALIDATOR,
        }),
      );
    }

    if (
      block.typography.maxLines !== undefined &&
      block.measurement.lines.length > block.typography.maxLines
    ) {
      issues.push(
        createIssue({
          code: "TEXT_EXCEEDS_MAX_LINES",
          title: "Too many text lines",
          category: "typography",
          severity: block.measurement.lines.length > block.typography.maxLines + 1 ? "high" : "medium",
          measured: {
            value: block.measurement.lines.length,
            expected: block.typography.maxLines,
            unit: "lines",
            ...(approximate ? { approximate: true } : {}),
          },
          message: `Text ${describe(block)} wraps to ${block.measurement.lines.length} lines but the design allows ${block.typography.maxLines}.`,
          elementIds: [block.element.id],
          recommendation: "Shorten the copy, widen the frame, or adjust the type size so the line count fits the layout.",
          validator: VALIDATOR,
        }),
      );
    }

    if (block.typography.wrap === false && /\s/.test(block.text) && block.measurement.width > block.frameWidth) {
      // Already reported by TEXT_OVERFLOW_FRAME; no duplicate issue.
      continue;
    }
  }

  // A very long single line is hard to read regardless of the frame (typography §6.4).
  for (const block of analysis.texts) {
    if (!block.essential) continue;
    if (block.typography.textAlign === "justify") continue;
    const longestLine = block.measurement.lines.reduce((max, line) => Math.max(max, line.length), 0);
    if (block.measurement.lines.length === 1 && longestLine > 90) {
      issues.push(
        createIssue({
          code: "TEXT_LINE_TOO_LONG",
          title: "Excessive line length",
          category: "typography",
          severity: "low",
          measured: { value: longestLine, expected: 75, unit: "characters per line" },
          message: `Text ${describe(block)} runs ${longestLine} characters on one line, which is tiring to read.`,
          elementIds: [block.element.id],
          recommendation: "Wrap the copy to a comfortable measure (roughly 45–75 characters per line).",
          validator: VALIDATOR,
        }),
      );
    }
  }

  return issues;
}
