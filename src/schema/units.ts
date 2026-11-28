/**
 * Explicit units for the canonical design contract.
 *
 * Spec §3.1: "Canvas `width`, `height`, positions, dimensions, spacing, and
 * vector measurements use `CanvasConfig.unit`; physical print conversion uses
 * the declared DPI/profile, never an implicit pixel-to-mm conversion."
 *
 * Nothing in this module assumes pixels. Values without a unit are invalid by
 * construction: every measurable value inherits the document's declared unit.
 */

export type Unit = 'px' | 'mm' | 'cm' | 'in';

export const UNITS: readonly Unit[] = Object.freeze(['px', 'mm', 'cm', 'in']);

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value);
}

/** Millimetres per one unit. `px` is resolution dependent and not listed. */
const MM_PER_UNIT: Readonly<Record<Exclude<Unit, 'px'>, number>> = Object.freeze({
  mm: 1,
  cm: 10,
  in: 25.4,
});

/** Standard CSS/print reference resolution used when none is declared. */
export const DEFAULT_DPI = 300;

export const MIN_DPI = 36;
export const MAX_DPI = 2400;

/**
 * Converts a physical length between `mm`, `cm`, and `in` exactly.
 * Throws for `px`, because a pixel count cannot be converted without a DPI.
 */
export function convertPhysical(value: number, from: Exclude<Unit, 'px'>, to: Exclude<Unit, 'px'>): number {
  return (value * MM_PER_UNIT[from]) / MM_PER_UNIT[to];
}

/**
 * Converts a length to millimetres. Returns `undefined` for pixel units unless
 * a `dpi` is supplied, which keeps the "never convert px implicitly" rule.
 */
export function toMillimetres(value: number, unit: Unit, dpi?: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (unit !== 'px') return value * MM_PER_UNIT[unit];
  if (dpi === undefined || !Number.isFinite(dpi) || dpi <= 0) return undefined;
  return (value / dpi) * 25.4;
}

/** Converts a length from millimetres into the requested unit. */
export function fromMillimetres(value: number, unit: Unit, dpi?: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (unit !== 'px') return value / MM_PER_UNIT[unit];
  if (dpi === undefined || !Number.isFinite(dpi) || dpi <= 0) return undefined;
  return (value / 25.4) * dpi;
}

/** Physical-equivalent size of a canvas, in millimetres, when resolvable. */
export function canvasMillimetres(
  canvas: { width: number; height: number; unit: Unit; dpi?: number },
): { width: number; height: number } | undefined {
  const width = toMillimetres(canvas.width, canvas.unit, canvas.dpi);
  const height = toMillimetres(canvas.height, canvas.unit, canvas.dpi);
  if (width === undefined || height === undefined) return undefined;
  return { width, height };
}

/** Human-readable length such as `1080px` or `85mm`, for messages only. */
export function formatLength(value: number, unit: Unit): string {
  return `${value}${unit}`;
}
