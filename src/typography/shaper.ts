/**
 * Text shaping through HarfBuzz WebAssembly.
 *
 * This is the measurement authority of the engine: widths come from positioned
 * glyph advances produced by HarfBuzz, not from character counts, average glyph
 * ratios or a browser canvas. HarfBuzz is the shaping engine used by Firefox,
 * Chrome (via Skia) and Android, which is why it can be trusted for Bengali
 * conjuncts (`ক্ষ` → one ligature glyph), Arabic contextual joining and mark
 * positioning.
 *
 * Units: fonts are created with `font.setScale(unitsPerEm, unitsPerEm)`, so
 * HarfBuzz returns advances and offsets in **font units**. Callers scale by
 * `fontSize / unitsPerEm` exactly once (`measure.ts`). Nothing in this module
 * assumes pixels.
 *
 * Determinism: HarfBuzz shaping at a fixed scale is deterministic for a given
 * font binary and HarfBuzz build. `harfbuzzjs` pins the HarfBuzz version in its
 * release, and every cache key includes the font id, text, script, direction,
 * language and feature set, so repeated calls cannot return a different result.
 */

import type { Buffer as HarfBuzzBuffer, Direction, Feature, Font } from 'harfbuzzjs';

import type { HarfBuzzApi, LoadedFont } from './font-record.ts';
import { scriptTag } from './script-runs.ts';
import type { RunScript } from './types.ts';

/** One glyph exactly as HarfBuzz reports it (font units, UTF-16 clusters). */
export interface RawShapedGlyph {
  readonly glyphId: number;
  /** UTF-16 index of the first character of the glyph's cluster. */
  readonly cluster: number;
  readonly xAdvance: number;
  readonly yAdvance: number;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly flags: number;
}

export interface RawShapedRun {
  readonly glyphs: readonly RawShapedGlyph[];
  /** Sum of advances in font units. */
  readonly advanceWidth: number;
  readonly missingGlyphs: number;
  readonly unitsPerEm: number;
}

export interface ShapeOptions {
  readonly script: RunScript;
  readonly direction: 'ltr' | 'rtl';
  readonly language?: string;
  readonly features?: readonly string[];
}

const LANGUAGE_PATTERN = /^[A-Za-z0-9-]{1,35}$/;

function directionValue(hb: HarfBuzzApi, direction: 'ltr' | 'rtl'): Direction {
  return (direction === 'rtl' ? hb.Direction.RTL : hb.Direction.LTR) as Direction;
}

/**
 * Turns feature strings into HarfBuzz features, dropping invalid tags.
 *
 * Invalid tags are reported by the engine's request validation, not here: this
 * layer stays a pure shaping primitive.
 */
export function toFeatures(hb: HarfBuzzApi, features: readonly string[] | undefined): Feature[] {
  if (!features || features.length === 0) return [];
  const out: Feature[] = [];
  for (const feature of features) {
    const parsed = hb.Feature.fromString(feature);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Shape one run. Does not cache; use `shapeRun` through the engine. */
export function shapeRunRaw(hb: HarfBuzzApi, font: LoadedFont, text: string, options: ShapeOptions): RawShapedRun {
  const buffer: HarfBuzzBuffer = new hb.Buffer();
  buffer.addText(text);
  buffer.setDirection(directionValue(hb, options.direction));
  const tag = scriptTag(options.script);
  if (tag) buffer.setScript(tag);
  if (options.language && LANGUAGE_PATTERN.test(options.language)) buffer.setLanguage(options.language);
  // Fills in whatever was not set (script for `other`, language when absent).
  buffer.guessSegmentProperties();

  const features = toFeatures(hb, options.features);
  hb.shape(font.font, buffer, features);

  const infos = buffer.getGlyphInfos();
  const positions = buffer.getGlyphPositions();
  const glyphs: RawShapedGlyph[] = [];
  let advanceWidth = 0;
  let missingGlyphs = 0;
  for (let i = 0; i < infos.length; i += 1) {
    const info = infos[i];
    const position = positions[i];
    if (!info || !position) continue;
    if (info.codepoint === 0) missingGlyphs += 1;
    advanceWidth += position.xAdvance;
    glyphs.push({
      glyphId: info.codepoint,
      cluster: info.cluster,
      xAdvance: position.xAdvance,
      yAdvance: position.yAdvance,
      xOffset: position.xOffset,
      yOffset: position.yOffset,
      flags: info.flags,
    });
  }

  return {
    glyphs: Object.freeze(glyphs),
    advanceWidth,
    missingGlyphs,
    unitsPerEm: font.metadata.metrics.unitsPerEm,
  };
}

/** Shaping cache key. Every input that can change glyphs is included. */
export function shapingCacheKey(font: LoadedFont, text: string, options: ShapeOptions): string {
  const features = options.features && options.features.length > 0 ? [...options.features].join(',') : '';
  return `${font.metadata.id}\u0000${options.script}\u0000${options.direction}\u0000${options.language ?? ''}\u0000${features}\u0000${text}`;
}

/** Small insertion-ordered LRU used for shaping results. */
export class ShapeCache {
  readonly #max: number;
  readonly #map = new Map<string, RawShapedRun>();
  #hits = 0;
  #misses = 0;

  constructor(maxEntries = 512) {
    this.#max = Math.max(1, Math.floor(maxEntries));
  }

  get size(): number {
    return this.#map.size;
  }

  get stats(): { entries: number; hits: number; misses: number } {
    return { entries: this.#map.size, hits: this.#hits, misses: this.#misses };
  }

  get(key: string): RawShapedRun | undefined {
    const value = this.#map.get(key);
    if (value) {
      this.#hits += 1;
      // Refresh recency.
      this.#map.delete(key);
      this.#map.set(key, value);
      return value;
    }
    this.#misses += 1;
    return undefined;
  }

  set(key: string, value: RawShapedRun): void {
    if (this.#map.has(key)) this.#map.delete(key);
    this.#map.set(key, value);
    while (this.#map.size > this.#max) {
      const oldest = this.#map.keys().next();
      if (oldest.done) break;
      this.#map.delete(oldest.value);
    }
  }

  clear(): void {
    this.#map.clear();
  }
}

/** Font handle plus the HarfBuzz module, threaded through the engine. */
export interface ShapingContext {
  readonly hb: HarfBuzzApi;
  readonly cache: ShapeCache;
}

/** Cached shaping for one run. */
export function shapeRun(context: ShapingContext, font: LoadedFont, text: string, options: ShapeOptions): RawShapedRun {
  const key = shapingCacheKey(font, text, options);
  const cached = context.cache.get(key);
  if (cached) return cached;
  const shaped = shapeRunRaw(context.hb, font, text, options);
  context.cache.set(key, shaped);
  return shaped;
}

/**
 * Creates a HarfBuzz buffer for tests and diagnostics.
 *
 * Exposed so the test suite can prove the module is really shaping rather than
 * trusting the wrapper's own numbers.
 */
export function createBuffer(hb: HarfBuzzApi): HarfBuzzBuffer {
  return new hb.Buffer();
}

/** Unused-parameter guard: keeps `Font` imported for its type in callbacks. */
export type HarfBuzzFont = Font;
