/**
 * Unicode-aware line breaking and grapheme segmentation.
 *
 * This is a documented **subset** of UAX #14, not a claim of full conformance.
 * It covers what the supported scripts need:
 *
 * - grapheme clusters come from `Intl.Segmenter`, so codes are never split
 *   between a base character and its combining marks (Bengali kar/phala,
 *   Arabic diacritics) — and, where the runtime implements Unicode 15.1's
 *   conjunct rule (GB9c), inside a Bengali conjunct;
 * - no break inside a word for alphabetic scripts (Latin, Bengali, Arabic,
 *   Urdu), which is the correct default for all four;
 * - break opportunities after spaces, zero-width spaces, hyphens and the
 *   break-after punctuation these scripts actually use (including the Bengali
 *   danda `।`);
 * - no break before closing punctuation, exclamation/interrogation marks,
 *   infix separators (`,` `.` `:` `,` Arabic comma) or quotation marks, and no
 *   break after opening punctuation or quotation marks;
 * - no break inside a number, or between a number and its prefix/postfix
 *   (`$100`, `50%`), and no break at a non-breaking space or word joiner;
 * - breaks between ideographs, since Han/Kana text legitimately breaks there.
 *
 * Not implemented, and therefore reported as a limitation rather than implied:
 * full UAX #14 pair tables (all 40+ classes), language-specific hyphenation, and
 * Thai/Lao/Khmer dictionary breaking (scripts outside the supported set).
 */

/** Line-break classes used by this engine's subset. */
export type LineBreakClass =
  | 'BK'
  | 'SP'
  | 'ZW'
  | 'GL'
  | 'WJ'
  | 'HY'
  | 'BA'
  | 'CL'
  | 'EX'
  | 'IS'
  | 'OP'
  | 'QU'
  | 'NU'
  | 'PR'
  | 'PO'
  | 'AL'
  | 'ID';

const BK_CHARS = new Set<string>(['\n', '\r', '\u000B', '\u000C', '\u0085', '\u2028', '\u2029']);
const SP_CHARS = new Set<string>(['\t', ' ', '\u1680', '\u205F', '\u3000']);
const GL_CHARS = new Set<string>(['\u00A0', '\u2007', '\u202F', '\u2011']);
const WJ_CHARS = new Set<string>(['\u2060', '\u200C']);
const ZW_CHARS = new Set<string>(['\u200B']);
const HY_CHARS = new Set<string>(['-', '\u2010', '\u00AD']);
const BA_CHARS = new Set<string>(['\u2013', '\u2014', '\u0964', '\u0965', '/', '\u2E3A', '\u2E3B']);
const CL_CHARS = new Set<string>([')', ']', '}', '\u00BB', '\u203A', '\u3009', '\u300B', '\u300D', '\u300F', '\u3011', '\u3015']);
const EX_CHARS = new Set<string>(['!', '?', '\u203C', '\u2047', '\u2048', '\u2049', '\u061F']);
const IS_CHARS = new Set<string>([',', '.', ';', ':', '\u060C', '\u061B', '\u066C', '\u066B']);
const OP_CHARS = new Set<string>(['(', '[', '{', '\u00AB', '\u2039', '\u3008', '\u300A', '\u300C', '\u300E', '\u3010', '\u3014']);
const QU_CHARS = new Set<string>(['"', "'", '\u2018', '\u2019', '\u201C', '\u201D']);
const PR_CHARS = new Set<string>(['$', '\u00A3', '\u00A5', '\u20AC', '\u20B9', '\u09F3', '\u00A2', '+', '\u2212']);
const PO_CHARS = new Set<string>(['%', '\u2030', '\u00B0', '\u2032']);
const NUMERIC_PATTERN = /^\p{Nd}$/u;
const LETTER_PATTERN = /^\p{L}$/u;
const MARK_PATTERN = /^\p{M}$/u;

/** Classifies the character that decides a break *before* it. */
export function classifyLineBreakChar(char: string): LineBreakClass {
  if (BK_CHARS.has(char)) return 'BK';
  if (SP_CHARS.has(char)) return 'SP';
  if (GL_CHARS.has(char)) return 'GL';
  if (WJ_CHARS.has(char)) return 'WJ';
  if (ZW_CHARS.has(char)) return 'ZW';
  if (HY_CHARS.has(char)) return 'HY';
  if (BA_CHARS.has(char)) return 'BA';
  if (CL_CHARS.has(char)) return 'CL';
  if (EX_CHARS.has(char)) return 'EX';
  if (IS_CHARS.has(char)) return 'IS';
  if (OP_CHARS.has(char)) return 'OP';
  if (QU_CHARS.has(char)) return 'QU';
  if (PR_CHARS.has(char)) return 'PR';
  if (PO_CHARS.has(char)) return 'PO';
  if (NUMERIC_PATTERN.test(char)) return 'NU';
  if (MARK_PATTERN.test(char)) return 'AL';
  if (LETTER_PATTERN.test(char)) return 'AL';
  // East Asian ideographs/kana are class ID in UAX #14; they wrap between glyphs.
  if (isIdeographic(char)) return 'ID';
  // Unknown symbols behave like alphabetic text: no break before or after.
  return 'AL';
}

/** True for ideographic code points that legitimately break between each other. */
function isIdeographic(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  return (
    (cp >= 0x2e80 && cp <= 0x9fff) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x1f200 && cp <= 0x1f2ff) ||
    (cp >= 0x20000 && cp <= 0x3ffff)
  );
}

/** One grapheme cluster with its UTF-16 range. */
export interface GraphemeSegment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const segmenterCache = new Map<string, Intl.Segmenter>();

function segmenter(locale: string): Intl.Segmenter | undefined {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return undefined;
  const cached = segmenterCache.get(locale);
  if (cached) return cached;
  let created: Intl.Segmenter;
  try {
    created = new Intl.Segmenter(locale, { granularity: 'grapheme' });
  } catch {
    try {
      created = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    } catch {
      return undefined;
    }
  }
  segmenterCache.set(locale, created);
  return created;
}

/**
 * Segments text into grapheme clusters.
 *
 * Uses ICU (`Intl.Segmenter`) when available. The fallback segments by code
 * point, which is *not* grapheme-correct for combining marks; it exists so the
 * engine degrades predictably instead of throwing, and the wrap result reports it
 * through the absence of `Intl.Segmenter` rather than silently trusting it.
 */
export function graphemeSegments(text: string, locale = 'und'): GraphemeSegment[] {
  if (text.length === 0) return [];
  const s = segmenter(locale);
  if (!s) {
    const out: GraphemeSegment[] = [];
    let index = 0;
    for (const char of text) {
      out.push({ start: index, end: index + char.length, text: char });
      index += char.length;
    }
    return out;
  }
  const out: GraphemeSegment[] = [];
  for (const segment of s.segment(text)) {
    out.push({ start: segment.index, end: segment.index + segment.segment.length, text: segment.segment });
  }
  return out;
}

/** True when a grapheme contains no visible content (whitespace only). */
export function isWhitespaceGrapheme(text: string): boolean {
  return /^[\s\u00A0\u2007\u202F]+$/u.test(text);
}

/** True when a grapheme is a mandatory line terminator. */
export function isMandatoryBreak(text: string): boolean {
  return /[\n\r\u000B\u000C\u0085\u2028\u2029]/u.test(text);
}

/** A break opportunity between two grapheme clusters. */
export interface BreakOpportunity {
  /** UTF-16 index at which a new line may start (after the preceding cluster). */
  readonly position: number;
  /** A break that must happen (explicit newline). */
  readonly mandatory: boolean;
}

/** Decides whether a soft break is allowed between two adjacent graphemes. */
export function allowsBreakBetween(previous: string, next: string): boolean {
  const before = previous.slice(-1);
  const after = next.slice(0, 1);
  const prev = classifyLineBreakChar(before);
  const nextClass = classifyLineBreakChar(after);

  if (prev === 'BK' || nextClass === 'BK') return true;
  if (prev === 'SP') return true; // break after spaces
  if (nextClass === 'SP') return false; // never break before a space
  if (prev === 'GL' || nextClass === 'GL') return false;
  if (prev === 'WJ' || nextClass === 'WJ') return false;
  if (prev === 'ZW') return true;
  // `1/2` must not break between the digits and the slash pair.
  if (before === '/' && nextClass === 'NU') return false;
  if (prev === 'HY' || prev === 'BA') return true;
  if (nextClass === 'CL' || nextClass === 'EX' || nextClass === 'IS') return false;
  if (nextClass === 'QU' || prev === 'QU') return false;
  if (prev === 'OP') return false;
  if (prev === 'NU' && (nextClass === 'NU' || nextClass === 'PO')) return false;
  if (prev === 'PR' && nextClass === 'NU') return false;
  if (prev === 'NU' && nextClass === 'PR') return false;
  if (prev === 'NU' && nextClass === 'AL') return false;
  if (nextClass === 'NU' && prev === 'AL') return false;
  if (nextClass === 'AL' || prev === 'AL') return false;
  if (isIdeographic(before) && isIdeographic(after)) return true;
  if (prev === 'ID' && nextClass === 'ID') return true;
  return false;
}

/**
 * All break opportunities in `text`, including a mandatory one after each line
 * terminator and a final opportunity at the end of the text.
 *
 * The end-of-text opportunity is included so wrapping can close the last line
 * even when the text does not end with a space.
 */
export function breakOpportunities(text: string, locale = 'und'): BreakOpportunity[] {
  const graphemes = graphemeSegments(text, locale);
  const out: BreakOpportunity[] = [];
  for (let i = 0; i < graphemes.length; i += 1) {
    const current = graphemes[i];
    const next = graphemes[i + 1];
    if (!current) continue;
    if (!next) {
      out.push({ position: current.end, mandatory: true });
      break;
    }
    if (isMandatoryBreak(current.text)) {
      out.push({ position: current.end, mandatory: true });
      continue;
    }
    if (isMandatoryBreak(next.text)) {
      // The next cluster starts a new mandatory line; the position before it is
      // a mandatory break too.
      out.push({ position: current.end, mandatory: true });
      continue;
    }
    if (allowsBreakBetween(current.text, next.text)) {
      out.push({ position: current.end, mandatory: false });
    }
  }
  return out;
}
