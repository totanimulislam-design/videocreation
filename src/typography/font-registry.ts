/**
 * Font registry and resolver.
 *
 * The registry owns loaded fonts. The resolver answers "which face do I shape
 * this text with?" and always explains the answer: a missing family, a
 * substituted weight, a fallback family and incomplete glyph coverage each
 * produce a diagnostic. `DESIGN_ENGINE_SPEC.md` §9.5 and the quality metrics
 * forbid silent substitution, so `FontResolution` distinguishes the requested
 * font from the resolved one on every path.
 *
 * Family-name handling mirrors CSS font matching closely enough for design
 * tokens:
 * - `fontFamily` may be a comma-separated stack (`"Noto Sans Bengali, sans-serif"`).
 * - Generic names (`sans-serif`, `serif`, `monospace`, `system-ui`, …) are never
 *   treated as font families; they expand through configured mappings.
 * - Weight matching follows the CSS rule direction: below 400 prefer lighter
 *   faces first, at or above 400 prefer heavier faces first, and fall back to the
 *   nearest available weight.
 * - Italic is matched, never synthesised (no shearing): an italic request with no
 *   italic face resolves to the upright face and reports `FONT_STYLE_SUBSTITUTED`.
 */

import { CODES, DiagnosticBag, type Diagnostic } from '../core/diagnostics.ts';
import { MIN_SCRIPT_COVERAGE } from './font-record.ts';
import type { LoadedFont } from './font-record.ts';
import type {
  FontMetadata,
  FontRequest,
  FontResolveResult,
  FontResolution,
  FontResolutionKind,
  FontStyle,
  ResolvedFontInfo,
  SupportedScript,
} from './types.ts';

/** CSS generic family names that must never be matched as real families. */
export const GENERIC_FAMILIES: readonly string[] = Object.freeze([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

export function isGenericFamilyName(family: string): boolean {
  return (GENERIC_FAMILIES as readonly string[]).includes(family.trim().toLowerCase());
}

/** Case-, quote- and whitespace-insensitive family key. */
export function familyKey(family: string): string {
  return family
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Splits a CSS-like font stack on commas, dropping empty entries. */
export function parseFontStack(fontFamily: string): string[] {
  return fontFamily
    .split(',')
    .map((part) => part.replace(/["']/g, '').trim())
    .filter((part) => part.length > 0);
}

export interface FontRegistryOptions {
  readonly fallbackFamilies?: readonly string[];
  readonly genericFamilies?: Readonly<Record<string, readonly string[]>>;
}

interface RegistryEntry {
  readonly font: LoadedFont;
  readonly order: number;
}

/** Ordered candidate face for one family. */
export interface FontCandidate {
  readonly family: string;
  readonly font: LoadedFont;
  readonly weightExact: boolean;
  readonly styleExact: boolean;
  /** How the family was reached. */
  readonly reach: 'requested' | 'generic' | 'fallback' | 'registry';
}

export interface RegistryLookupOptions {
  readonly weight?: number;
  readonly style?: FontStyle;
}

function toInfo(font: LoadedFont): ResolvedFontInfo {
  const metadata = font.metadata;
  return Object.freeze({
    id: metadata.id,
    family: metadata.family,
    weight: metadata.weight,
    style: metadata.style,
    format: metadata.format,
  });
}

function normalizeWeight(weight: number | string | undefined): number | undefined {
  if (weight === undefined) return undefined;
  if (typeof weight === 'number') return Number.isFinite(weight) ? weight : undefined;
  const trimmed = weight.trim().toLowerCase();
  const named: Record<string, number> = {
    thin: 100,
    extralight: 200,
    'extra-light': 200,
    light: 300,
    normal: 400,
    regular: 400,
    medium: 500,
    semibold: 600,
    'semi-bold': 600,
    bold: 700,
    extrabold: 800,
    'extra-bold': 800,
    black: 900,
  };
  if (trimmed in named) return named[trimmed];
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}

/** CSS-style weight preference order for a target weight. */
function weightPreference(target: number, available: readonly number[]): number[] {
  const unique = [...new Set(available)].sort((a, b) => a - b);
  if (unique.length === 0) return [];
  if (target < 400) {
    const lighter = unique.filter((weight) => weight <= target).reverse();
    const heavier = unique.filter((weight) => weight > target);
    return [...lighter, ...heavier];
  }
  const heavier = unique.filter((weight) => weight >= target);
  const lighter = unique.filter((weight) => weight < target).reverse();
  return [...heavier, ...lighter];
}

/** Registry of loaded fonts plus deterministic resolution. */
export class FontRegistry {
  readonly #entries: RegistryEntry[] = [];
  readonly #fallbackFamilies: readonly string[];
  readonly #genericFamilies: Readonly<Record<string, readonly string[]>>;
  #sequence = 0;

  constructor(options: FontRegistryOptions = {}) {
    this.#fallbackFamilies = Object.freeze([...(options.fallbackFamilies ?? [])]);
    this.#genericFamilies = Object.freeze({ ...(options.genericFamilies ?? {}) });
  }

  get size(): number {
    return this.#entries.length;
  }

  /** True when a family (any weight/style) is registered. */
  hasFamily(family: string): boolean {
    const key = familyKey(family);
    return this.#entries.some((entry) => familyKey(entry.font.metadata.family) === key);
  }

  /** Detects a duplicate registration (same family, weight and style). */
  findDuplicate(font: LoadedFont): LoadedFont | undefined {
    const metadata = font.metadata;
    return this.#entries.find((entry) => {
      const existing = entry.font.metadata;
      return (
        familyKey(existing.family) === familyKey(metadata.family) &&
        existing.weight === metadata.weight &&
        existing.style === metadata.style
      );
    })?.font;
  }

  /** Adds an already-loaded font. Duplicate detection is the caller's job. */
  add(font: LoadedFont): void {
    this.#sequence += 1;
    this.#entries.push({ font, order: this.#sequence });
  }

  list(): readonly FontMetadata[] {
    return Object.freeze(this.#entries.map((entry) => entry.font.metadata));
  }

  getById(id: string): LoadedFont | undefined {
    return this.#entries.find((entry) => entry.font.metadata.id === id)?.font;
  }

  findFamily(family: string): LoadedFont[] {
    const key = familyKey(family);
    return this.#entries
      .filter((entry) => familyKey(entry.font.metadata.family) === key)
      .sort((a, b) => a.font.metadata.weight - b.font.metadata.weight || a.order - b.order)
      .map((entry) => entry.font);
  }

  families(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of this.#entries) {
      const key = familyKey(entry.font.metadata.family);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry.font.metadata.family);
    }
    return out;
  }

  /**
   * Ordered family names to try for a request.
   *
   * Order is: requested families (generic names expanded in place), configured
   * fallback families, then every other registered family in registration order.
   * The last group is what makes mixed-script text work even when the caller
   * supplied one family; it is always reported as a fallback.
   */
  familySequence(fontFamily: string): Array<{ family: string; reach: FontCandidate['reach'] }> {
    const out: Array<{ family: string; reach: FontCandidate['reach'] }> = [];
    const seen = new Set<string>();
    const push = (family: string, reach: FontCandidate['reach']): void => {
      const key = familyKey(family);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ family, reach });
    };

    for (const part of parseFontStack(fontFamily)) {
      if (isGenericFamilyName(part)) {
        const mapped = this.#genericFamilies[part.toLowerCase()] ?? [];
        for (const family of mapped) push(family, 'generic');
        continue;
      }
      push(part, 'requested');
    }
    for (const family of this.#fallbackFamilies) {
      if (!isGenericFamilyName(family)) push(family, 'fallback');
    }
    for (const family of this.families()) push(family, 'registry');
    return out;
  }

  /** Variants for one family, ordered by weight then registration order. */
  #variants(family: string): LoadedFont[] {
    return this.findFamily(family);
  }

  /**
   * Ordered candidate faces for a request.
   *
   * One face per family is chosen: the style match first, then the
   * CSS-preferred weight. Families that are not registered contribute nothing.
   */
  candidates(fontFamily: string, options: RegistryLookupOptions = {}): FontCandidate[] {
    const targetWeight = options.weight ?? 400;
    const targetStyle = options.style ?? 'normal';
    const out: FontCandidate[] = [];
    for (const { family, reach } of this.familySequence(fontFamily)) {
      const variants = this.#variants(family);
      if (variants.length === 0) continue;
      const withStyle = variants.filter((font) => font.metadata.style === targetStyle);
      const pool = withStyle.length > 0 ? withStyle : variants;
      const weights = pool.map((font) => font.metadata.weight);
      const preferred = weightPreference(targetWeight, weights);
      const chosenWeight = preferred[0];
      const chosen = pool.find((font) => font.metadata.weight === chosenWeight) ?? pool[0];
      if (!chosen) continue;
      out.push({
        family,
        font: chosen,
        weightExact: chosen.metadata.weight === targetWeight,
        styleExact: chosen.metadata.style === targetStyle,
        reach,
      });
    }
    return out;
  }

  /**
   * Resolves a request, using coverage when text is supplied.
   *
   * Returns a resolution plus diagnostics; never throws.
   */
  resolve(request: FontRequest, options: RegistryLookupOptions = {}): FontResolveResult {
    const bag = new DiagnosticBag();
    const requestedFamily = parseFontStack(request.fontFamily)[0] ?? request.fontFamily.trim();
    const weight = normalizeWeight(request.fontWeight) ?? options.weight ?? 400;
    const style = (request.fontStyle ?? options.style ?? 'normal') as FontStyle;
    const codepoints = coverageCodepoints(request.text ?? '');

    const resolution = this.resolveCodepoints(codepoints, request.fontFamily, { weight, style });

    if (resolution.status === 'missing') {
      bag.error(CODES.FONT_NOT_FOUND, `No registered font satisfies "${request.fontFamily}".`, {
        path: 'fontFamily',
        hint: 'Register the font with `registerFont`, or supply a fallback family. Text is not measured without a real face.',
        context: { requestedFamily, attempted: resolution.fallbackChain, registered: this.families() },
      });
    } else {
      if (resolution.status === 'fallback') {
        bag.warning(CODES.FONT_FALLBACK_APPLIED, resolution.reason, {
          path: 'fontFamily',
          hint: 'Font substitution is reported, never silent: update the typography token or register the requested face.',
          context: {
            requestedFamily,
            resolvedFamily: resolution.resolved?.family,
            kind: resolution.kind,
            attempted: resolution.fallbackChain,
          },
        });
      }
      if (!resolution.resolved?.id) {
        // Defensive: a resolved status must carry a font.
        bag.error(CODES.FONT_NOT_FOUND, `Font resolution for "${request.fontFamily}" produced no face.`, { path: 'fontFamily' });
      }
      if (resolution.kind === 'weight-nearest') {
        bag.warning(
          CODES.FONT_WEIGHT_SUBSTITUTED,
          `Requested weight ${weight} is unavailable; using ${resolution.resolved?.weight} from "${resolution.resolved?.family}".`,
          { path: 'fontWeight', context: { requested: weight, resolved: resolution.resolved?.weight } },
        );
      }
      if (resolution.kind === 'style-substituted') {
        bag.warning(
          CODES.FONT_STYLE_SUBSTITUTED,
          `Requested style "${style}" is unavailable; using "${resolution.resolved?.style}".`,
          { path: 'fontStyle', hint: 'Italic faces are matched, not synthesised. Register the italic cut to use it.' },
        );
      }
      if (resolution.missingCodepoints.length > 0) {
        bag.warning(
          CODES.FONT_COVERAGE_INCOMPLETE,
          `"${resolution.resolved?.family}" does not map ${resolution.missingCodepoints.length} code point(s) of the text.`,
          {
            path: 'text',
            hint: 'Register a font that covers these characters, or use per-run fallback families.',
            context: {
              missing: resolution.missingCodepoints.slice(0, 24).map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`),
            },
          },
        );
      }
    }

    return { ok: resolution.status !== 'missing', resolution, diagnostics: bag.all };
  }

  /**
   * Resolves the face for a set of code points and a family stack.
   *
   * Selection is family-order first, coverage second: a requested family wins
   * even when a later family covers more, because silently preferring another
   * family would change the design. Coverage only decides *within* the ordering
   * when the earlier family cannot render the text at all.
   */
  resolveCodepoints(
    codepoints: readonly number[],
    fontFamily: string,
    options: RegistryLookupOptions = {},
  ): FontResolution {
    const requestedFamily = parseFontStack(fontFamily)[0] ?? fontFamily.trim();
    const weight = options.weight ?? 400;
    const style = options.style ?? 'normal';
    const candidates = this.candidates(fontFamily, { weight, style });
    const chain = this.familySequence(fontFamily).map((entry) => entry.family);

    if (candidates.length === 0) {
      return {
        status: 'missing',
        kind: 'missing',
        requestedFamily,
        requestedWeight: weight,
        requestedStyle: style,
        fallbackChain: chain,
        reason: `No registered font matches "${fontFamily}".`,
        coveredCodepoints: 0,
        missingCodepoints: [...codepoints],
      };
    }

    const score = (font: LoadedFont): number => codepoints.reduce((count, cp) => count + (font.coverage.has(cp) ? 1 : 0), 0);
    const full = codepoints.length;

    // 1. The first candidate that covers everything.
    let chosen: FontCandidate | undefined;
    let kind: FontResolutionKind = 'exact';
    for (const candidate of candidates) {
      if (score(candidate.font) === full) {
        chosen = candidate;
        if (candidate.reach === 'requested') {
          kind = !candidate.weightExact ? 'weight-nearest' : !candidate.styleExact ? 'style-substituted' : 'exact';
        } else if (candidate.reach === 'generic') {
          kind = 'generic-fallback';
        } else {
          kind = 'family-fallback';
        }
        break;
      }
    }

    // 2. Otherwise the best partial coverage; the first candidate on a tie.
    if (!chosen) {
      let best = -1;
      for (const candidate of candidates) {
        const covered = score(candidate.font);
        if (covered > best) {
          best = covered;
          chosen = candidate;
        }
      }
      if (chosen) kind = 'coverage-fallback';
    }

    if (!chosen) {
      return {
        status: 'missing',
        kind: 'missing',
        requestedFamily,
        requestedWeight: weight,
        requestedStyle: style,
        fallbackChain: chain,
        reason: `No registered font matches "${fontFamily}".`,
        coveredCodepoints: 0,
        missingCodepoints: [...codepoints],
      };
    }

    const missingCodepoints = codepoints.filter((cp) => !chosen.font.coverage.has(cp));
    const coveredCodepoints = full - missingCodepoints.length;
    const status: FontResolution['status'] =
      chosen.reach === 'requested' && missingCodepoints.length === 0
        ? 'resolved'
        : chosen.reach === 'requested' && missingCodepoints.length > 0
          ? 'fallback'
          : 'fallback';

    const reason = (() => {
      switch (kind) {
        case 'exact':
          return `"${chosen.font.metadata.family}" ${chosen.font.metadata.weight} matched the request exactly.`;
        case 'weight-nearest':
          return `No ${weight} weight in "${chosen.font.metadata.family}"; nearest available is ${chosen.font.metadata.weight}.`;
        case 'style-substituted':
          return `No "${style}" style in "${chosen.font.metadata.family}"; using "${chosen.font.metadata.style}".`;
        case 'generic-fallback':
          return `Generic family resolved to "${chosen.font.metadata.family}" through configured mappings.`;
        case 'family-fallback':
          return `"${requestedFamily}" is unavailable or cannot render the text; fell back to "${chosen.family}".`;
        case 'coverage-fallback':
          return `No candidate covers every character; "${chosen.font.metadata.family}" covers ${coveredCodepoints}/${full}.`;
        default:
          return `No registered font matches "${fontFamily}".`;
      }
    })();

    return {
      status,
      kind,
      requestedFamily,
      requestedWeight: weight,
      requestedStyle: style,
      resolved: toInfo(chosen.font),
      fallbackChain: chain,
      reason,
      coveredCodepoints,
      missingCodepoints,
    };
  }

  /** Fonts whose measured coverage includes a script. */
  fontsCoveringScript(script: SupportedScript): LoadedFont[] {
    return this.#entries
      .map((entry) => entry.font)
      .filter((font) => (font.metadata.scriptCoverage[script] ?? 0) >= MIN_SCRIPT_COVERAGE);
  }
}

/** Code points that require a real glyph: whitespace and joiners do not. */
export function coverageCodepoints(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff) continue;
    if (cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d) continue;
    out.push(cp);
  }
  return out;
}

/** Convenience wrapper used by the engine for a loaded font's diagnostics. */
export function duplicateFontDiagnostic(existing: LoadedFont, incoming: FontMetadata): Diagnostic {
  const bag = new DiagnosticBag();
  bag.error(
    CODES.FONT_DUPLICATE,
    `A font is already registered for "${incoming.family}" weight ${incoming.weight} style ${incoming.style}.`,
    {
      path: 'family',
      hint: 'Weight and style variants must be distinct registrations; unregistering is not supported, use a new engine instance to replace a font.',
      context: { existingId: existing.metadata.id, incomingId: incoming.id },
    },
  );
  const [diagnostic] = bag.all;
  return diagnostic as Diagnostic;
}
