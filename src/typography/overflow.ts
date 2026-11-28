/**
 * Overflow and support diagnostics for a measured text block.
 *
 * Everything here is derived from real measurements. Nothing is inferred from
 * character counts, and nothing throws: a text block that does not fit is a
 * validation outcome, not an exception (`AGENTS.md` §3, `src/core/diagnostics.ts`).
 *
 * Severity model, following the existing conventions:
 * - an overflow that the caller explicitly constrained (`maxWidth`, `maxHeight`,
 *   `maxLines`) is an **error** — it would clip or displace content;
 * - observations that do not, on their own, make the layout invalid (a `.notdef`
 *   glyph, a script outside the support matrix, an unbreakable word that was
 *   preserved rather than split) are **warnings** and never hidden.
 */

import { CODES, DiagnosticBag, type Diagnostic } from '../core/diagnostics.ts';
import type { TextLine } from './types.ts';
import type { OverflowReport } from './types.ts';

export interface OverflowInput {
  readonly lines: readonly TextLine[];
  readonly height: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxLines?: number;
  readonly missingGlyphs: number;
  readonly missingFont: boolean;
  readonly unsupportedScripts: readonly string[];
  readonly unbreakable: boolean;
}

export interface OverflowResult {
  readonly report: OverflowReport;
  readonly diagnostics: readonly Diagnostic[];
  /** True when any hard constraint is violated. */
  readonly hasOverflow: boolean;
}

const TOLERANCE = 1e-9;

/** Largest line width in the block, `0` for an empty block. */
export function widestLine(lines: readonly TextLine[]): number {
  let widest = 0;
  for (const line of lines) {
    if (line.width > widest) widest = line.width;
  }
  return widest;
}

export function detectOverflow(input: OverflowInput): OverflowResult {
  const bag = new DiagnosticBag();
  const reasons: string[] = [];
  const widest = widestLine(input.lines);
  const horizontal = input.maxWidth !== undefined && widest > input.maxWidth + TOLERANCE;
  const vertical = input.maxHeight !== undefined && input.height > input.maxHeight + TOLERANCE;
  const lineCountExceeded = input.maxLines !== undefined && input.lines.length > input.maxLines;

  if (horizontal && input.maxWidth !== undefined) {
    reasons.push(`Widest line is ${round(widest)} but the container allows ${round(input.maxWidth)}.`);
    bag.error(CODES.TEXT_OVERFLOW_HORIZONTAL, `Text overflows horizontally: widest line ${round(widest)} > available ${round(input.maxWidth)}.`, {
      path: 'width',
      hint: 'Widen the container, reduce the font size within its minimum, or allow emergency word breaks.',
      context: { measuredWidth: widest, availableWidth: input.maxWidth, unit: 'canvas units' },
    });
  }
  if (vertical && input.maxHeight !== undefined) {
    reasons.push(`Block height is ${round(input.height)} but the container allows ${round(input.maxHeight)}.`);
    bag.error(CODES.TEXT_OVERFLOW_VERTICAL, `Text overflows vertically: ${round(input.height)} > available ${round(input.maxHeight)}.`, {
      path: 'height',
      hint: 'Reduce the font size within its minimum, reduce the line-height multiple, or allow more lines.',
      context: { measuredHeight: input.height, availableHeight: input.maxHeight, unit: 'canvas units' },
    });
  }
  if (lineCountExceeded && input.maxLines !== undefined) {
    reasons.push(`Text needs ${input.lines.length} lines but only ${input.maxLines} are allowed.`);
    bag.error(CODES.TEXT_LINE_COUNT_EXCEEDED, `Text needs ${input.lines.length} lines; the constraint allows ${input.maxLines}.`, {
      path: 'lineCount',
      hint: 'Increase the allowed line count, shorten the copy, or reduce the font size.',
      context: { lineCount: input.lines.length, maxLines: input.maxLines },
    });
  }
  if (input.unbreakable) {
    reasons.push('At least one unbreakable segment is wider than the container.');
    bag.warning(CODES.TEXT_UNBREAKABLE_OVERFLOW, 'An unbreakable word or cluster is wider than the available width.', {
      path: 'lines',
      hint: 'Enable `overflowWrap: "break-word"`, widen the container, or reduce the font size.',
    });
  }
  if (input.missingGlyphs > 0) {
    reasons.push(`${input.missingGlyphs} glyph(s) rendered as .notdef because the font does not map the characters.`);
    bag.warning(CODES.GLYPH_MISSING, `${input.missingGlyphs} glyph(s) have no mapping in the resolved font.`, {
      path: 'fonts',
      hint: 'Register a font that covers these characters. HarfBuzz reports glyph id 0, which renders as a blank/box glyph.',
      context: { missingGlyphs: input.missingGlyphs },
    });
  }
  if (input.missingFont) {
    reasons.push('No font could be resolved for at least one run.');
  }
  if (input.unsupportedScripts.length > 0) {
    reasons.push(`Script(s) outside the documented support matrix: ${input.unsupportedScripts.join(', ')}.`);
    bag.warning(
      CODES.SHAPING_SCRIPT_UNSUPPORTED,
      `Text contains script(s) this engine does not document as supported: ${input.unsupportedScripts.join(', ')}.`,
      {
        path: 'text',
        hint: 'HarfBuzz may still shape these scripts if a font covers them, but no capability claim is made for them.',
      },
    );
  }

  const report: OverflowReport = Object.freeze({
    horizontal,
    vertical,
    lineCountExceeded,
    unbreakable: input.unbreakable,
    missingGlyphs: input.missingGlyphs,
    missingFont: input.missingFont,
    unsupportedScripts: Object.freeze([...input.unsupportedScripts]),
    reasons: Object.freeze(reasons),
  });

  return { report, diagnostics: bag.all, hasOverflow: horizontal || vertical || lineCountExceeded || input.missingFont };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
