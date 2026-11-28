/**
 * Greedy line wrapping over shaped glyph advances.
 *
 * The wrapper never splits on spaces alone. It walks the Unicode break
 * opportunities from `line-break.ts`, measures each candidate line with the same
 * prefix index used for the final report, and keeps the last candidate that fits.
 * When no legal opportunity fits, behaviour depends on `overflowWrap`:
 *
 * - `normal` — the unbreakable segment stays intact and overflows; the caller
 *   gets a horizontal-overflow diagnostic instead of silently broken words;
 * - `break-word` — the segment is split at **grapheme** boundaries that do not
 *   fall inside a shaping cluster, so ligatures and conjuncts stay intact, and
 *   every such break is reported as an emergency break;
 * - `anywhere` — same as `break-word` for this engine; kept as a distinct value
 *   so callers can express intent, documented rather than silently aliased.
 *
 * Trailing spaces do not contribute to a line's measured width (they collapse at
 * the break), which matches how the line will be rendered.
 */

import { graphemeSegments, breakOpportunities, isWhitespaceGrapheme } from './line-break.ts';
import type { GraphemeSegment } from './line-break.ts';
import { advanceBefore, clusterSpanEnd } from './measure.ts';
import type { RunMeasure } from './measure.ts';
import type { OverflowWrap, ShapedTextRun } from './types.ts';

export interface WrappedLine {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly text: string;
  readonly width: number;
  readonly graphemeCount: number;
  readonly spaceCount: number;
  readonly emergencyBreak: boolean;
}

export interface WrappedParagraph {
  readonly lines: readonly WrappedLine[];
  readonly unbreakable: boolean;
  readonly emergencyBreaks: number;
}

export interface WrapParagraphInput {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly runs: readonly ShapedTextRun[];
  readonly measures: readonly RunMeasure[];
  readonly maxWidth: number;
  readonly letterSpacing: number;
  readonly wordSpacing: number;
  readonly overflowWrap: OverflowWrap;
  readonly locale: string;
}

/** Width comparisons tolerate only floating-point noise, never real overflow. */
function epsilon(maxWidth: number): number {
  return Math.max(1e-9, Math.abs(maxWidth) * 1e-12);
}

interface ParagraphPrefix {
  readonly widthUpTo: (position: number) => number;
  readonly graphemeIndexAt: (position: number) => number;
  readonly graphemes: readonly GraphemeSegment[];
  readonly trimTrailingSpaces: (position: number) => number;
  readonly skipLeadingSpaces: (position: number) => number;
}

function buildParagraphPrefix(input: WrapParagraphInput): ParagraphPrefix {
  const { start, end, text, measures, letterSpacing, wordSpacing, locale } = input;
  const graphemes = graphemeSegments(text.slice(start, end), locale).map((grapheme) => ({
    start: grapheme.start + start,
    end: grapheme.end + start,
    text: grapheme.text,
  }));

  const indexByPosition = new Map<number, number>();
  const spaceCumulative: number[] = [0];
  indexByPosition.set(start, 0);
  for (let i = 0; i < graphemes.length; i += 1) {
    const grapheme = graphemes[i];
    if (!grapheme) continue;
    indexByPosition.set(grapheme.end, i + 1);
    spaceCumulative.push((spaceCumulative[i] ?? 0) + (isWhitespaceGrapheme(grapheme.text) ? 1 : 0));
  }

  const graphemeIndexAt = (position: number): number => {
    const direct = indexByPosition.get(position);
    if (direct !== undefined) return direct;
    // All internal candidates are grapheme boundaries; this protects callers
    // that pass an arbitrary offset (e.g. a mid-grapheme overflow probe).
    let low = 0;
    let high = graphemes.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      const grapheme = graphemes[mid];
      if (grapheme && grapheme.end <= position) low = mid + 1;
      else high = mid;
    }
    return low;
  };

  const widthUpTo = (position: number): number => {
    let glyphWidth = 0;
    for (const measure of measures) glyphWidth += advanceBefore(measure, position);
    const index = graphemeIndexAt(position);
    return glyphWidth + letterSpacing * index + wordSpacing * (spaceCumulative[index] ?? 0);
  };

  const trimTrailingSpaces = (position: number): number => {
    let cursor = position;
    while (cursor > start) {
      const index = graphemeIndexAt(cursor);
      const grapheme = graphemes[index - 1];
      if (!grapheme || !isWhitespaceGrapheme(grapheme.text) || grapheme.end !== cursor) break;
      cursor = grapheme.start;
    }
    return cursor;
  };

  const skipLeadingSpaces = (position: number): number => {
    let cursor = position;
    while (cursor < end) {
      const index = graphemeIndexAt(cursor);
      const grapheme = graphemes[index];
      if (!grapheme || !isWhitespaceGrapheme(grapheme.text) || grapheme.start !== cursor) break;
      cursor = grapheme.end;
    }
    return Math.min(cursor, end);
  };

  return { widthUpTo, graphemeIndexAt, graphemes, trimTrailingSpaces, skipLeadingSpaces };
}

/** End of the shaping cluster containing `position`, if any. */
function clusterSafePosition(measures: readonly RunMeasure[], position: number): number {
  for (const measure of measures) {
    const spanEnd = clusterSpanEnd(measure, position);
    if (spanEnd !== undefined && spanEnd > position) return spanEnd;
  }
  return position;
}

/**
 * Wraps one paragraph.
 *
 * The paragraph range must already exclude line terminators; explicit newlines
 * are handled by the caller so empty lines survive as empty lines.
 */
export function wrapParagraph(input: WrapParagraphInput): WrappedParagraph {
  const { start, end, text, measures, maxWidth, overflowWrap, locale } = input;
  if (end <= start) {
    return { lines: [], unbreakable: false, emergencyBreaks: 0 };
  }

  const prefix = buildParagraphPrefix(input);
  const opportunities = breakOpportunities(text.slice(start, end), locale)
    .map((opportunity) => opportunity.position + start)
    .filter((position) => position > start && position <= end);

  const tolerance = epsilon(maxWidth);
  const lines: WrappedLine[] = [];
  let unbreakable = false;
  let emergencyBreaks = 0;
  // Leading spaces at the very start of a paragraph are content and are kept
  // (they contribute to the measured width). Spaces exposed by a soft wrap are
  // not: they are collapsed at the break, like every other trailing space.
  let lineStart = start;
  let opportunityIndex = 0;
  let guard = 0;

  while (lineStart < end) {
    guard += 1;
    if (guard > 100_000) break; // defensive: pathological input cannot hang the engine
    while (opportunityIndex < opportunities.length && (opportunities[opportunityIndex] ?? 0) <= lineStart) {
      opportunityIndex += 1;
    }

    let chosenEnd = -1;
    let nextStart = -1;
    let emergency = false;
    let lastFitEnd = -1;
    let lastFitStart = -1;

    for (let i = opportunityIndex; i < opportunities.length; i += 1) {
      const position = opportunities[i];
      if (position === undefined) break;
      const candidateEnd = prefix.trimTrailingSpaces(position);
      if (candidateEnd <= lineStart) {
        // The opportunity only consumes whitespace. At the start of a paragraph
        // those spaces are part of the first line's content, so the break is not
        // a line ending; later on it is a placeholder so a line of spaces still
        // advances.
        if (lineStart === start) continue;
        lastFitEnd = candidateEnd;
        lastFitStart = prefix.skipLeadingSpaces(position);
        continue;
      }
      const width = prefix.widthUpTo(candidateEnd) - prefix.widthUpTo(lineStart);
      if (width <= maxWidth + tolerance) {
        lastFitEnd = candidateEnd;
        lastFitStart = prefix.skipLeadingSpaces(position);
      } else {
        break;
      }
    }

    if (lastFitEnd > lineStart) {
      chosenEnd = lastFitEnd;
      nextStart = lastFitStart;
    } else if (lastFitEnd === lineStart && lastFitStart > lineStart) {
      // A run of whitespace wider than the container: emit an empty line and move on.
      chosenEnd = lineStart;
      nextStart = lastFitStart;
    } else {
      // No opportunity fits. Find the hard limit for this line. Opportunities
      // that only consume whitespace carry no text, so a line that starts with
      // (content) spaces must look past them instead of emitting an empty line.
      let firstOpportunity = opportunities[opportunityIndex] ?? end;
      if (prefix.trimTrailingSpaces(firstOpportunity) <= lineStart) {
        const contentOpportunity = opportunities
          .slice(opportunityIndex)
          .find((position) => prefix.trimTrailingSpaces(position) > lineStart);
        firstOpportunity = contentOpportunity ?? end;
      }
      if (overflowWrap === 'normal') {
        chosenEnd = Math.max(prefix.trimTrailingSpaces(firstOpportunity), lineStart);
        nextStart = Math.max(prefix.skipLeadingSpaces(firstOpportunity), chosenEnd);
        unbreakable = true;
      } else {
        emergency = true;
        emergencyBreaks += 1;
        // Largest grapheme-safe boundary that fits, starting from the first one.
        let cursor = lineStart;
        let best = -1;
        while (cursor < firstOpportunity) {
          const index = prefix.graphemeIndexAt(cursor);
          const grapheme = prefix.graphemes[index];
          if (!grapheme) break;
          let candidate = grapheme.end;
          const safe = clusterSafePosition(measures, candidate);
          if (safe > candidate) candidate = Math.min(safe, firstOpportunity);
          const width = prefix.widthUpTo(candidate) - prefix.widthUpTo(lineStart);
          if (width <= maxWidth + tolerance) {
            best = candidate;
            cursor = candidate;
            continue;
          }
          if (best === -1) {
            // A single grapheme/cluster already exceeds the container.
            best = candidate;
            unbreakable = true;
          }
          break;
        }
        if (best === -1) best = firstOpportunity;
        chosenEnd = Math.max(prefix.trimTrailingSpaces(best), lineStart);
        nextStart = Math.max(prefix.skipLeadingSpaces(best), best);
      }
    }

    if (nextStart <= lineStart) {
      // Guarantee progress even on degenerate whitespace-only content.
      nextStart = Math.max(prefix.skipLeadingSpaces(lineStart + 1), lineStart + 1);
      if (nextStart > end) nextStart = end;
      if (chosenEnd <= lineStart) chosenEnd = Math.min(lineStart + 1, end);
    }

    const lineEnd = Math.min(Math.max(chosenEnd, lineStart), end);
    const width = prefix.widthUpTo(lineEnd) - prefix.widthUpTo(lineStart);
    const graphemeCount = Math.max(0, prefix.graphemeIndexAt(lineEnd) - prefix.graphemeIndexAt(lineStart));
    const spaceCount = countSpaces(prefix.graphemes, lineStart, lineEnd);
    if (width > maxWidth + tolerance) unbreakable = true;
    lines.push({
      startIndex: lineStart,
      endIndex: lineEnd,
      text: text.slice(lineStart, lineEnd),
      width,
      graphemeCount,
      spaceCount,
      emergencyBreak: emergency,
    });
    lineStart = nextStart;
  }

  return { lines, unbreakable, emergencyBreaks };
}

function countSpaces(graphemes: readonly GraphemeSegment[], start: number, end: number): number {
  let count = 0;
  for (const grapheme of graphemes) {
    if (grapheme.start >= end) break;
    if (grapheme.end <= start) continue;
    if (isWhitespaceGrapheme(grapheme.text)) count += 1;
  }
  return count;
}
