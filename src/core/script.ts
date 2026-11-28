/**
 * Script, language and direction detection.
 *
 * This is *detection and classification only*. It does not shape text, measure
 * glyphs, reorder bidirectional runs, or reverse strings. Correct rendering of
 * Bengali conjuncts and Arabic joining requires a real shaping engine (spec
 * §9.6); nothing here may be used to fake that, and callers must not treat
 * detection as proof that the platform can render a script.
 *
 * Supported set is deliberately narrow and explicit: Latin, Bengali, Arabic and
 * Urdu (`DESIGN_ENGINE_SPEC.md` §9.6, `DESIGN_SYSTEM.md` §6.5). Other scripts
 * are reported as unsupported rather than passed through silently.
 */

export type ScriptId = 'latin' | 'bengali' | 'arabic' | 'urdu' | 'unknown';

export type TextDirection = 'ltr' | 'rtl';

/** Unicode ranges for the scripts this platform documents as supported. */
const RANGES: ReadonlyArray<{ readonly script: Exclude<ScriptId, 'urdu' | 'unknown'>; readonly re: RegExp }> = [
  { script: 'bengali', re: /[\u0980-\u09FF]/ },
  { script: 'arabic', re: /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/ },
  { script: 'latin', re: /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/ },
];

/** Scripts written right-to-left among the supported set. */
const RTL_SCRIPTS: ReadonlySet<ScriptId> = new Set<ScriptId>(['arabic', 'urdu']);

export function isRtlScript(script: ScriptId): boolean {
  return RTL_SCRIPTS.has(script);
}

/**
 * Strips an ASCII multiplication sign used as a dimension separator between
 * digits (`৮x১০`, `10x20`). Without this, the `x` would look like Latin text and
 * a Bengali or Arabic brief would be misreported as mixed-script.
 */
function stripNumericSeparators(text: string): string {
  return text.replace(/(\p{Nd})\s?[x×*]\s?(?=\p{Nd})/gu, '$1');
}

/** Coarse script detection for a string. Mixed text returns the dominant scripts. */
export function detectScripts(text: string): ScriptId[] {
  const found: ScriptId[] = [];
  text = stripNumericSeparators(text);
  for (const { script, re } of RANGES) {
    if (re.test(text)) found.push(script);
  }
  return found.length > 0 ? found : ['unknown'];
}

/** True when the string mixes scripts that need different shaping. */
export function isMixedScript(text: string): boolean {
  return detectScripts(text).filter((script) => script !== 'unknown').length > 1;
}

/**
 * Maps a language tag to its script and base direction.
 *
 * Urdu is distinguished from generic Arabic because it is a documented
 * requirement with different typographic preferences (Nastaliq family support),
 * even though both use the Arabic script and RTL direction.
 */
export function scriptForLanguage(language: string): { script: ScriptId; direction: TextDirection } | undefined {
  const primary = language.trim().toLowerCase().split(/[-_]/)[0];
  if (!primary) return undefined;
  switch (primary) {
    case 'en':
    case 'fr':
    case 'de':
    case 'es':
    case 'it':
    case 'pt':
    case 'nl':
    case 'tr':
    case 'id':
    case 'ms':
      return { script: 'latin', direction: 'ltr' };
    case 'bn':
      return { script: 'bengali', direction: 'ltr' };
    case 'ur':
      return { script: 'urdu', direction: 'rtl' };
    case 'ar':
    case 'fa':
    case 'ps':
      return { script: 'arabic', direction: 'rtl' };
    default:
      return undefined;
  }
}

/** True when the language tag is one the platform documents as supported. */
export function isSupportedLanguage(language: string): boolean {
  return scriptForLanguage(language) !== undefined;
}

/**
 * Approximate base direction of a language set.
 *
 * Used by the brief parser and validator for *selection* signals only (e.g. a
 * reading flow of `rtl` is more plausible for an Arabic-only brief). Per spec
 * §6.4 and §9.6, each text run keeps its own direction; a document is never
 * globally mirrored, so this never rewrites content.
 */
export function dominantDirection(languages: readonly string[]): TextDirection | 'mixed' | 'unknown' {
  const directions = new Set<TextDirection>();
  for (const language of languages) {
    const info = scriptForLanguage(language);
    if (info) directions.add(info.direction);
  }
  if (directions.size === 0) return 'unknown';
  if (directions.size > 1) return 'mixed';
  return (directions.values().next().value as TextDirection | undefined) ?? 'unknown';
}

/** Normalizes a language tag: trims and lowercases the primary subtag, keeps the region. */
export function normalizeLanguageTag(language: string): string {
  const parts = language.trim().replace(/_/g, '-').split('-').filter((part) => part.length > 0);
  if (parts.length === 0) return '';
  const [primary, ...rest] = parts;
  return [primary?.toLowerCase() ?? '', ...rest.map((part) => (part.length === 2 ? part.toUpperCase() : part))]
    .filter((part) => part.length > 0)
    .join('-');
}

/**
 * Digits used across the supported scripts.
 *
 * Preserved verbatim by the brief parser: a Bengali or Arabic-Indic numeral is
 * user content, not a number to normalize.
 */
export const SCRIPT_DIGITS: Readonly<Record<string, RegExp>> = Object.freeze({
  latin: /[0-9]/,
  bengali: /[\u09E6-\u09EF]/,
  arabicIndic: /[\u0660-\u0669]/,
  extendedArabicIndic: /[\u06F0-\u06F9]/,
});
