/**
 * Color parsing and WCAG contrast utilities.
 *
 * The module is intentionally dependency-free and only supports the color
 * syntaxes the design document allows: hex, rgb()/rgba(), hsl()/hsla(),
 * a small set of CSS keywords, `transparent` and `none`.
 *
 * Colors that cannot be parsed (gradients, patterns, asset references) are
 * reported as `null` so validators can mark a check as unverifiable instead of
 * silently guessing (quality metrics §5.2, §13).
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, string> = {
  transparent: "#00000000",
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  navy: "#000080",
  teal: "#008080",
  maroon: "#800000",
  olive: "#808000",
  lime: "#00ff00",
  aqua: "#00ffff",
  cyan: "#00ffff",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
  purple: "#800080",
  pink: "#ffc0cb",
  brown: "#a52a2a",
  gold: "#ffd700",
  beige: "#f5f5dc",
  ivory: "#fffff0",
};

function clamp(value: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, value));
}

function hslToRgb(h: number, s: number, l: number, a: number): RGBA {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return {
    r: clamp(Math.round((rgb[0] + m) * 255)),
    g: clamp(Math.round((rgb[1] + m) * 255)),
    b: clamp(Math.round((rgb[2] + m) * 255)),
    a,
  };
}

function parseHex(input: string): RGBA | null {
  const hex = input.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length === 3 || hex.length === 4) {
    const r = parseInt(hex[0]! + hex[0]!, 16);
    const g = parseInt(hex[1]! + hex[1]!, 16);
    const b = parseInt(hex[2]! + hex[2]!, 16);
    const a = hex.length === 4 ? parseInt(hex[3]! + hex[3]!, 16) / 255 : 1;
    return { r, g, b, a };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  return null;
}

function parseFunction(input: string): RGBA | null {
  const match = /^(rgba?|hsla?)\((.*)\)$/i.exec(input.trim());
  if (!match) return null;
  const fn = match[1]!.toLowerCase();
  const body = match[2]!.replace(/\//g, ",");
  const parts = body
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 3) return null;

  const percentToNumber = (value: string, scale: number): number | null => {
    const numeric = Number.parseFloat(value);
    if (Number.isNaN(numeric)) return null;
    return value.endsWith("%") ? (numeric / 100) * scale : numeric;
  };

  if (fn === "rgb" || fn === "rgba") {
    const r = percentToNumber(parts[0]!, 255);
    const g = percentToNumber(parts[1]!, 255);
    const b = percentToNumber(parts[2]!, 255);
    if (r === null || g === null || b === null) return null;
    let a = 1;
    if (parts.length >= 4) {
      const raw = Number.parseFloat(parts[3]!);
      if (Number.isNaN(raw)) return null;
      a = parts[3]!.endsWith("%") ? raw / 100 : raw;
    }
    return { r: clamp(Math.round(r)), g: clamp(Math.round(g)), b: clamp(Math.round(b)), a: clamp(a, 0, 1) };
  }

  const h = Number.parseFloat(parts[0]!);
  const s = Number.parseFloat(parts[1]!);
  const l = Number.parseFloat(parts[2]!);
  if ([h, s, l].some((value) => Number.isNaN(value))) return null;
  const saturation = parts[1]!.endsWith("%") ? s / 100 : s;
  const lightness = parts[2]!.endsWith("%") ? l / 100 : l;
  let a = 1;
  if (parts.length >= 4) {
    const raw = Number.parseFloat(parts[3]!);
    if (Number.isNaN(raw)) return null;
    a = parts[3]!.endsWith("%") ? raw / 100 : raw;
  }
  return hslToRgb(h, clamp(saturation, 0, 1), clamp(lightness, 0, 1), clamp(a, 0, 1));
}

export function parseColor(input: string | undefined | null): RGBA | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (value === "none" || value === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  if (value.startsWith("#")) return parseHex(value);
  if (value.startsWith("rgb") || value.startsWith("hsl")) return parseFunction(value);
  const named = NAMED[value];
  if (named) return parseColor(named);
  return null;
}

export function isColorReference(input: string | undefined | null): boolean {
  return parseColor(input) !== null;
}

export function toHex(color: RGBA): string {
  const channel = (value: number) => clamp(Math.round(value)).toString(16).padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/** Source-over composite of `top` onto `bottom`. */
export function composite(top: RGBA, bottom: RGBA): RGBA {
  const alpha = top.a + bottom.a * (1 - top.a);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / alpha;
  return {
    r: clamp(Math.round(mix(top.r, bottom.r))),
    g: clamp(Math.round(mix(top.g, bottom.g))),
    b: clamp(Math.round(mix(top.b, bottom.b))),
    a: clamp(alpha, 0, 1),
  };
}

export function relativeLuminance(color: RGBA): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(foreground: RGBA, background: RGBA): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export function toHsl(color: RGBA): HSL {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

export function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Mixes two colors; used for hover/state previews and accessibility fallbacks. */
export function mix(a: RGBA, b: RGBA, amount: number): RGBA {
  const t = Math.min(1, Math.max(0, amount));
  return {
    r: clamp(Math.round(a.r + (b.r - a.r) * t)),
    g: clamp(Math.round(a.g + (b.g - a.g) * t)),
    b: clamp(Math.round(a.b + (b.b - a.b) * t)),
    a: a.a + (b.a - a.a) * t,
  };
}

/** Returns black or white — whichever contrasts better with the background. */
export function readableTextColor(background: RGBA): RGBA {
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  return contrastRatio(black, background) >= contrastRatio(white, background) ? black : white;
}
