import type { Typography } from "../../core/design-document/types.ts";
import type { TextMeasurement, TextMeasurer } from "../types.ts";

/**
 * Deterministic text measurement.
 *
 * The Quality Engine must be able to detect overflow, clipping and unreadable
 * line lengths even before a browser renderer is available. Real font metrics
 * are always preferable, so `TextMeasurer` is an injected interface: the
 * renderer can supply exact metrics from Fontkit/browser APIs and the engine
 * will use them unchanged.
 *
 * `ApproximateTextMeasurer` is the documented fallback. It estimates advance
 * widths from per-character classes and is explicitly flagged as approximate
 * everywhere its results appear (measurements, issues, reports).
 */

export interface ApproximateMeasurerOptions {
  /** Global width multiplier, for very wide or condensed families. */
  widthFactor?: number;
}

const NARROW = new Set("iIlj|!.,:;'`’‘-()[]{}");
const WIDE = new Set("mwMW@%&");
const UPPER = /[A-Z]/;
const DIGIT = /[0-9]/;
const SPACE = /\s/;

const SCRIPT_RANGES: Array<{ script: string; test: RegExp }> = [
  { script: "bengali", test: /[\u0980-\u09FF]/ },
  { script: "arabic", test: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/ },
  { script: "devanagari", test: /[\u0900-\u097F]/ },
  { script: "cjk", test: /[\u3000-\u9FFF\uF900-\uFAFF]/ },
];

export function detectScripts(text: string): string[] {
  const found: string[] = [];
  for (const { script, test } of SCRIPT_RANGES) {
    if (test.test(text)) found.push(script);
  }
  if (found.length === 0) return ["latin"];
  return found;
}

function charWidth(char: string): number {
  if (SPACE.test(char)) return 0.28;
  if (NARROW.has(char)) return 0.3;
  if (WIDE.has(char)) return 0.86;
  if (DIGIT.test(char)) return 0.56;
  if (UPPER.test(char)) return 0.67;
  if (/[\u0980-\u09FF]/.test(char)) return 0.6;
  if (/[\u0600-\u06FF]/.test(char)) return 0.52;
  if (/[\u0900-\u097F]/.test(char)) return 0.6;
  return 0.52;
}

function advanceWidth(text: string, typography: Typography, widthFactor: number): number {
  const fontSize = typography.fontSize;
  const letterSpacing = typography.letterSpacing ?? 0;
  let total = 0;
  for (const char of text) {
    total += charWidth(char) * fontSize * widthFactor + letterSpacing;
  }
  return Math.max(0, total);
}

/** Greedy word wrapping, matching the renderer contract used by the editor. */
export function wrapText(
  text: string,
  typography: Typography,
  maxWidth: number,
  widthFactor = 1,
): string[] {
  const explicitLines = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of explicitLines) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (maxWidth <= 0 || advanceWidth(candidate, typography, widthFactor) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = word;
      } else {
        // Very long token: hard-break it so overflow stays measurable.
        let fragment = "";
        for (const char of word) {
          if (advanceWidth(fragment + char, typography, widthFactor) > maxWidth && fragment) {
            lines.push(fragment);
            fragment = char;
          } else {
            fragment += char;
          }
        }
        current = fragment;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

export class ApproximateTextMeasurer implements TextMeasurer {
  private readonly widthFactor: number;

  constructor(options: ApproximateMeasurerOptions = {}) {
    this.widthFactor = options.widthFactor ?? 1;
  }

  measure(
    text: string,
    typography: Typography,
    options: { maxWidth?: number; wrap?: boolean },
  ): TextMeasurement {
    const shouldWrap = options.wrap !== false && typeof options.maxWidth === "number" && options.maxWidth > 0;
    const lines = shouldWrap
      ? wrapText(text, typography, options.maxWidth as number, this.widthFactor)
      : text.split(/\r?\n/);
    const longest = lines.reduce(
      (max, line) => Math.max(max, advanceWidth(line, typography, this.widthFactor)),
      0,
    );
    const lineCount = Math.max(1, lines.length);
    return {
      width: longest,
      height: lineCount * typography.fontSize * typography.lineHeight,
      lines,
      approximate: true,
    };
  }
}

export const defaultTextMeasurer = new ApproximateTextMeasurer();
