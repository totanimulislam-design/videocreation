/**
 * Script classification, per-run segmentation and base direction.
 *
 * `src/core/script.ts` already detects scripts for *brief analysis*. This module
 * answers a different, layout-level question: which contiguous slices of one
 * string must be shaped separately, with which script tag and direction, so that
 * HarfBuzz can apply the right OpenType script system.
 *
 * Scope and honesty:
 * - Supported scripts are Latin, Bengali, Arabic and Urdu (spec §9.6). Anything
 *   else written as a letter is bucketed as `other` and reported, never treated
 *   as a supported script.
 * - Direction is resolved per run from the run's own script. That is the
 *   level-1 approximation of UAX#9: strong characters decide the run direction,
 *   and runs are ordered per the base direction. Full bidi (embedding levels,
 *   isolates, `LRI`/`RLI`, neutral resolution beyond "attach to the neighbouring
 *   strong run") is **not** implemented; the engine emits
 *   `TEXT_BIDI_APPROXIMATED` when more than one direction appears.
 * - No string is ever reversed here. HarfBuzz performs logical→visual glyph
 *   ordering for RTL runs; manually reversing text would corrupt Arabic joining
 *   and Bengali conjuncts (spec §9.6 forbids it).
 */

import type { SupportedScript } from './types.ts';
import type { RunScript } from './types.ts';

/** Documented script support matrix. Claims here are tested in `typography-shaping.test.ts`. */
export const SCRIPT_CAPABILITIES: Readonly<
  Record<
    SupportedScript,
    {
      readonly iso15924: string;
      readonly direction: 'ltr' | 'rtl';
      readonly shapingEngine: 'harfbuzz';
      readonly note: string;
    }
  >
> = Object.freeze({
  latin: Object.freeze({
    iso15924: 'Latn',
    direction: 'ltr',
    shapingEngine: 'harfbuzz',
    note: 'Kerning, standard ligatures and mark positioning come from the font tables.',
  }),
  bengali: Object.freeze({
    iso15924: 'Beng',
    direction: 'ltr',
    shapingEngine: 'harfbuzz',
    note: 'Conjuncts, kar and phala forms require a Bengali OpenType font with Indic GSUB features (akhn, half, rphf, blwf, pstf, …).',
  }),
  arabic: Object.freeze({
    iso15924: 'Arab',
    direction: 'rtl',
    shapingEngine: 'harfbuzz',
    note: 'Contextual joining form substitution and mark positioning require an Arabic-script font.',
  }),
  urdu: Object.freeze({
    iso15924: 'Arab',
    direction: 'rtl',
    shapingEngine: 'harfbuzz',
    note: 'Urdu uses the Arabic script but Nastaliq typography requires a Nastaliq font (e.g. Noto Nastaliq Urdu); a Naskh font shapes Urdu correctly but changes its calligraphic style.',
  }),
});

const SUPPORTED: readonly SupportedScript[] = Object.freeze(['latin', 'bengali', 'arabic', 'urdu']);

export function isSupportedScript(value: string): value is SupportedScript {
  return (SUPPORTED as readonly string[]).includes(value);
}

/** Direction implied by a script, independent of the paragraph base direction. */
export function scriptDirection(script: RunScript): 'ltr' | 'rtl' {
  return script === 'arabic' || script === 'urdu' ? 'rtl' : 'ltr';
}

/** ISO 15924 script tag passed to HarfBuzz; `undefined` lets HarfBuzz guess. */
export function scriptTag(script: RunScript): string | undefined {
  switch (script) {
    case 'latin':
      return 'Latn';
    case 'bengali':
      return 'Beng';
    case 'arabic':
    case 'urdu':
      return 'Arab';
    default:
      return undefined;
  }
}

function isBengaliCodePoint(cp: number): boolean {
  return cp >= 0x0980 && cp <= 0x09ff;
}

function isArabicCodePoint(cp: number): boolean {
  return (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x08a0 && cp <= 0x08ff) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  );
}

function isLatinCodePoint(cp: number): boolean {
  return (
    (cp >= 0x0041 && cp <= 0x005a) ||
    (cp >= 0x0061 && cp <= 0x007a) ||
    (cp >= 0x00c0 && cp <= 0x024f) ||
    (cp >= 0x0250 && cp <= 0x02af) ||
    (cp >= 0x1e00 && cp <= 0x1eff) ||
    (cp >= 0x2c60 && cp <= 0x2c7f) ||
    (cp >= 0xa720 && cp <= 0xa7ff)
  );
}

const MARK_PATTERN = /^\p{M}$/u;
const LETTER_PATTERN = /^\p{L}$/u;
const SPACE_PATTERN = /^\p{Z}$/u;

/**
 * Classifies one code point.
 *
 * `inherit` means "combining mark — belongs to whatever precedes it"; the
 * segmenter resolves it against the previous code point so a Bengali vowel sign
 * or an Arabic diacritic never starts a new run.
 */
export function classifyCodePoint(cp: number): RunScript | 'inherit' {
  const char = String.fromCodePoint(cp);
  if (MARK_PATTERN.test(char)) return 'inherit';
  if (isBengaliCodePoint(cp)) return 'bengali';
  if (isArabicCodePoint(cp)) return 'arabic';
  if (isLatinCodePoint(cp)) return 'latin';
  if (SPACE_PATTERN.test(char)) return 'common';
  // Any other *letter* belongs to a script this engine does not document.
  if (LETTER_PATTERN.test(char)) return 'other';
  return 'common';
}

/** One contiguous slice of text with a single script classification. */
export interface ScriptSegment {
  readonly start: number;
  readonly end: number;
  readonly script: RunScript;
  readonly text: string;
}

interface CodePointEntry {
  readonly cp: number;
  readonly start: number;
  readonly end: number;
  script: RunScript;
}

/**
 * Splits text into script segments.
 *
 * Neutral characters (spaces, punctuation, European digits) attach to the
 * preceding strong script, or to the following one at the start of the string.
 * European digits stay in the neighbouring run deliberately: whether they render
 * depends on font coverage, which the resolver checks per run, so digit glyphs
 * fall back to a font that maps them rather than silently producing `.notdef`.
 */
export function segmentByScript(text: string, language?: string): ScriptSegment[] {
  if (text.length === 0) return [];

  const entries: CodePointEntry[] = [];
  let index = 0;
  let previous: RunScript = 'common';
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    const raw = classifyCodePoint(cp);
    let script: RunScript;
    if (raw === 'inherit') script = previous;
    else script = raw;
    previous = script;
    entries.push({ cp, start: index, end: index + char.length, script });
    index += char.length;
  }

  // Resolve neutrals: attach to the previous strong script, else the next one.
  let i = 0;
  while (i < entries.length) {
    const current = entries[i];
    if (!current || current.script !== 'common') {
      i += 1;
      continue;
    }
    let j = i;
    while (j < entries.length && entries[j]?.script === 'common') j += 1;
    const before = i > 0 ? entries[i - 1]?.script : undefined;
    const after = j < entries.length ? entries[j]?.script : undefined;
    const target: RunScript = before && before !== 'common' ? before : after && after !== 'common' ? after : 'common';
    for (let k = i; k < j; k += 1) {
      const entry = entries[k];
      if (entry) entry.script = target;
    }
    i = j;
  }

  const languageIsUrdu = (language ?? '').trim().toLowerCase().split(/[-_]/)[0] === 'ur';
  if (languageIsUrdu) {
    for (const entry of entries) {
      if (entry.script === 'arabic') entry.script = 'urdu';
    }
  }

  const segments: ScriptSegment[] = [];
  let segmentStart = 0;
  for (let k = 1; k <= entries.length; k += 1) {
    const current = entries[k];
    const previousEntry = entries[k - 1];
    if (k < entries.length && current && previousEntry && current.script === previousEntry.script) continue;
    const end = k < entries.length && current ? current.start : text.length;
    const script = previousEntry?.script ?? 'common';
    segments.push({ start: segmentStart, end, script, text: text.slice(segmentStart, end) });
    segmentStart = end;
  }
  return segments;
}

/**
 * Base direction for a paragraph.
 *
 * A declared `ltr`/`rtl` wins. `auto` uses the first strong script, which is the
 * standard heuristic for a single paragraph and avoids guessing from length.
 */
export function resolveBaseDirection(
  text: string,
  declared: 'ltr' | 'rtl' | 'auto' | undefined,
  language?: string,
): 'ltr' | 'rtl' {
  if (declared === 'ltr' || declared === 'rtl') return declared;
  for (const segment of segmentByScript(text, language)) {
    if (segment.script === 'arabic' || segment.script === 'urdu') return 'rtl';
    if (segment.script === 'latin' || segment.script === 'bengali') return 'ltr';
  }
  return 'ltr';
}

/** Code points of `text` that belong to no documented script (for diagnostics). */
export function unsupportedScriptCodePoints(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (classifyCodePoint(cp) === 'other') out.push(cp);
  }
  return out;
}
