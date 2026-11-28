/**
 * Measurement: font units → canvas units, and the prefix index used for wrapping.
 *
 * Two rules keep measurements honest and unit-safe:
 *
 * 1. HarfBuzz reports font units. Exactly one multiplication by
 *    `fontSize / unitsPerEm` converts a run to canvas units, and every published
 *    metric (advances, offsets, ascender, descender) goes through it. There is no
 *    second place where a length changes space.
 * 2. Widths used to decide a line break and widths reported for that line come
 *    from the same prefix index (`RunMeasure`), so a line can never "fit" and
 *    then report a width above the container because of floating-point drift
 *    between two code paths.
 *
 * Letter and word spacing are applied per grapheme / per space respectively.
 * Both are canvas-unit lengths that do not scale with the font size, which is the
 * behaviour CSS specifies for `letter-spacing` / `word-spacing`.
 */

import type { LoadedFont } from './font-record.ts';
import type { RawShapedRun } from './shaper.ts';
import type { FontResolution, ResolvedFontInfo, ShapedGlyph, ShapedTextRun } from './types.ts';

export interface BuildRunInput {
  readonly index: number;
  readonly startIndex: number;
  readonly text: string;
  readonly script: ShapedTextRun['script'];
  readonly direction: 'ltr' | 'rtl';
  readonly language?: string;
  readonly font: LoadedFont;
  readonly resolution: FontResolution;
  readonly raw: RawShapedRun;
  readonly fontSize: number;
}

/** Converts one raw run to canvas units and absolute cluster indices. */
export function buildShapedRun(input: BuildRunInput): ShapedTextRun {
  const { font, raw, fontSize } = input;
  const unitsPerEm = raw.unitsPerEm > 0 ? raw.unitsPerEm : font.metadata.metrics.unitsPerEm;
  const scale = fontSize / unitsPerEm;
  const glyphs: ShapedGlyph[] = raw.glyphs.map((glyph) =>
    Object.freeze({
      glyphId: glyph.glyphId,
      cluster: input.startIndex + glyph.cluster,
      xAdvance: glyph.xAdvance * scale,
      yAdvance: glyph.yAdvance * scale,
      xOffset: glyph.xOffset * scale,
      yOffset: glyph.yOffset * scale,
      flags: glyph.flags,
      missing: glyph.glyphId === 0,
    }),
  );
  const resolution = input.resolution;
  const info: ResolvedFontInfo = resolution.resolved ?? {
    id: font.metadata.id,
    family: font.metadata.family,
    weight: font.metadata.weight,
    style: font.metadata.style,
    format: font.metadata.format,
  };
  return Object.freeze({
    index: input.index,
    text: input.text,
    startIndex: input.startIndex,
    endIndex: input.startIndex + input.text.length,
    script: input.script,
    direction: input.direction,
    ...(input.language === undefined ? {} : { language: input.language }),
    font: info,
    resolution,
    glyphs: Object.freeze(glyphs),
    width: raw.advanceWidth * scale,
    ascent: font.metadata.metrics.ascender * scale,
    descent: font.metadata.metrics.descender * scale,
    missingGlyphs: raw.missingGlyphs,
  });
}

/**
 * Prefix index for one run.
 *
 * `clusters[i]` is an ascending list of occupied cluster starts and
 * `cumulative[i]` the advance of all glyphs whose cluster is below `clusters[i]`,
 * with `cumulative[0] === 0`. Runs in RTL scripts produce glyphs in visual order
 * (descending clusters), so the map is built from cluster values rather than
 * array order.
 */
export interface RunMeasure {
  readonly run: ShapedTextRun;
  readonly clusters: readonly number[];
  readonly cumulative: readonly number[];
  readonly total: number;
}

export function buildRunMeasure(run: ShapedTextRun): RunMeasure {
  const byCluster = new Map<number, number>();
  let total = 0;
  for (const glyph of run.glyphs) {
    byCluster.set(glyph.cluster, (byCluster.get(glyph.cluster) ?? 0) + glyph.xAdvance);
    total += glyph.xAdvance;
  }
  const clusters = [...byCluster.keys()].sort((a, b) => a - b);
  const cumulative: number[] = [0];
  let running = 0;
  for (const cluster of clusters) {
    running += byCluster.get(cluster) ?? 0;
    cumulative.push(running);
  }
  return { run, clusters: Object.freeze(clusters), cumulative: Object.freeze(cumulative), total };
}

/** Index of the first cluster start `>= position` (binary search). */
function lowerBound(values: readonly number[], position: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const value = values[mid];
    if (value === undefined || value < position) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Advance of all glyphs in the run whose cluster starts before `position`. */
export function advanceBefore(measure: RunMeasure, position: number): number {
  const run = measure.run;
  if (position <= run.startIndex) return 0;
  if (position >= run.endIndex) return measure.total;
  const index = lowerBound(measure.clusters, position);
  return measure.cumulative[index] ?? measure.total;
}

/**
 * End (exclusive) of the shaping cluster that contains `position`.
 *
 * Used to prevent an emergency break from splitting a ligature or a shaped
 * conjunct that HarfBuzz merged into one cluster. Returns `undefined` when no
 * cluster spans the position.
 */
export function clusterSpanEnd(measure: RunMeasure, position: number): number | undefined {
  const run = measure.run;
  if (position <= run.startIndex || position >= run.endIndex) return undefined;
  const index = lowerBound(measure.clusters, position);
  const next = measure.clusters[index];
  if (next === undefined) return undefined;
  // A cluster starts exactly at `position`; nothing is split.
  if (next === position) return undefined;
  return next;
}

/** Total glyph count of a run. */
export function glyphCount(run: ShapedTextRun): number {
  return run.glyphs.length;
}
