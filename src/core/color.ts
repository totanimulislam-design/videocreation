/**
 * Color parsing and contrast measurement.
 *
 * Scope note: this module provides *parsing* and *evidence* primitives (WCAG
 * relative luminance and contrast ratio). It does not choose palettes and it
 * does not certify print contrast — `DESIGN_QUALITY_METRICS.md` §5.1 requires
 * compositing transparency against the effective background and proofing the
 * actual print profile, which is a renderer concern. Anything this module cannot
 * establish must be reported as `not_assessed`, never as a pass.
 */

export interface Rgba {
  /** 0–255 */
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 0–1 */
  readonly a: number;
}

const HEX_PATTERN = /^#([0-9a-fA-F]{3,8})$/;

/**
 * Parses `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA` sRGB hex.
 *
 * Returns `undefined` for anything else. Named CSS colors are intentionally not
 * accepted: the contract stores hex so renderers and contrast checks cannot
 * disagree about a color's meaning.
 */
export function parseHexColor(value: unknown): Rgba | undefined {
  if (typeof value !== 'string') return undefined;
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) return undefined;
  const hex = match[1];
  if (hex === undefined) return undefined;

  const expand = (char: string): number => Number.parseInt(`${char}${char}`, 16);

  switch (hex.length) {
    case 3:
      return { r: expand(hex[0] as string), g: expand(hex[1] as string), b: expand(hex[2] as string), a: 1 };
    case 4:
      return {
        r: expand(hex[0] as string),
        g: expand(hex[1] as string),
        b: expand(hex[2] as string),
        a: expand(hex[3] as string) / 255,
      };
    case 6:
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    case 8:
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        a: Number.parseInt(hex.slice(6, 8), 16) / 255,
      };
    default:
      return undefined;
  }
}

export function isHexColor(value: unknown): boolean {
  return parseHexColor(value) !== undefined;
}

/** Normalizes a hex color to lowercase `#rrggbb` or `#rrggbbaa`; `undefined` when invalid. */
export function normalizeHexColor(value: unknown): string | undefined {
  const rgba = parseHexColor(value);
  if (!rgba) return undefined;
  const channel = (part: number): string => Math.round(part).toString(16).padStart(2, '0');
  const base = `#${channel(rgba.r)}${channel(rgba.g)}${channel(rgba.b)}`;
  return rgba.a >= 1 ? base : `${base}${channel(rgba.a * 255)}`;
}

/**
 * Alpha-composites `top` over `bottom` in sRGB.
 *
 * Uses straight (non-premultiplied) source-over. This is the standard basis for
 * text-over-background contrast evidence; it is an approximation of a real
 * renderer's blending, so results are labelled as measured sRGB only.
 */
export function compositeOver(top: Rgba, bottom: Rgba): Rgba {
  const topAlpha = clamp01(top.a);
  const bottomAlpha = clamp01(bottom.a);
  const outAlpha = topAlpha + bottomAlpha * (1 - topAlpha);
  if (outAlpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (front: number, back: number): number =>
    (front * topAlpha + back * bottomAlpha * (1 - topAlpha)) / outAlpha;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: outAlpha };
}

/** WCAG 2.x relative luminance of an opaque color. */
export function relativeLuminance(color: Rgba): number {
  const channel = (value: number): number => {
    const srgb = clamp01(value / 255);
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/**
 * WCAG contrast ratio (`1..21`) between two opaque colors.
 * Order does not matter. Returns `undefined` for translucent inputs, because a
 * ratio is only meaningful once both colors are composited.
 */
export function contrastRatio(foreground: Rgba, background: Rgba): number | undefined {
  if (foreground.a < 1 || background.a < 1) return undefined;
  const light = relativeLuminance(foreground);
  const dark = relativeLuminance(background);
  const [hi, lo] = light >= dark ? [light, dark] : [dark, light];
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** WCAG AA thresholds used by `DESIGN_QUALITY_METRICS.md` §5.1. */
export const CONTRAST_AA_NORMAL = 4.5;
export const CONTRAST_AA_LARGE = 3;
export const CONTRAST_AAA_NORMAL = 7;
export const CONTRAST_AAA_LARGE = 4.5;

/** Classifies a measured ratio against WCAG AA. */
export function meetsWcagAa(ratio: number, size: 'normal' | 'large'): boolean {
  return size === 'large' ? ratio >= CONTRAST_AA_LARGE : ratio >= CONTRAST_AA_NORMAL;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
