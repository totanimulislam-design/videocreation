/**
 * Canonical constructors for the design contract.
 *
 * Factories exist so that every code path (tests, future editor, future AI
 * adapter) produces the *same* valid default document shape. Defaults here are
 * limited to values that cannot silently change a user's meaning:
 *
 * - a neutral background, an empty element list, an empty asset list
 * - a spacing scale copied from `DESIGN_SYSTEM.md` §13 (documented starting
 *   tokens, not a design decision)
 * - typography roles with a neutral system font stack, safe to measure-request
 *
 * Anything that *is* a creative decision (pattern, style, mood, palette) is
 * required from the caller. There are no hidden creative defaults.
 */

import { createIdFactory, randomId } from '../core/ids.ts';
import { SCHEMA_VERSION } from './version.ts';
import { DEFAULT_DPI } from './units.ts';
import type {
  ArtDirection,
  CanvasBackground,
  CanvasConfig,
  CompositionPlan,
  DesignAsset,
  DesignDocument,
  DesignGuide,
  DesignTokens,
  DesignSettings,
  GridConfiguration,
  ShadowToken,
  TypographyScale,
  TypographyToken,
  Unit,
} from './types.ts';

/**
 * Spacing scale from `DESIGN_SYSTEM.md` §13 and `DESIGN_ENGINE_SPEC.md` §8.1.
 *
 * Values are in canvas units and are explicitly "illustrative starting points"
 * in the source document, so a design may replace or extend them.
 */
export const DEFAULT_SPACING_SCALE: Readonly<Record<string, number>> = Object.freeze({
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
  '4xl': 96,
});

/**
 * Neutral font stack used only until a caller supplies real families.
 *
 * It names generic CSS families rather than proprietary fonts so a factory-made
 * document never implies a licensed typeface is available.
 */
export const NEUTRAL_FONT_STACK = 'system-ui, sans-serif';

/** Creates one typography token with explicit, documented defaults. */
export function createTypographyToken(overrides: Partial<TypographyToken> = {}): TypographyToken {
  return {
    fontFamily: NEUTRAL_FONT_STACK,
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacing: 0,
    textAlign: 'left',
    ...overrides,
  };
}

/**
 * Creates the five required typography roles.
 *
 * Sizes are a 1.5 ratio from the base size, which is a documented starting
 * relationship rather than a claim about any specific design.
 */
export function createTypographyScale(baseSize = 16): TypographyScale {
  return {
    display: createTypographyToken({ fontSize: baseSize * 5, fontWeight: 700, lineHeight: 1.1 }),
    heading: createTypographyToken({ fontSize: baseSize * 3, fontWeight: 700, lineHeight: 1.2 }),
    subheading: createTypographyToken({ fontSize: baseSize * 1.5, fontWeight: 600, lineHeight: 1.3 }),
    body: createTypographyToken({ fontSize: baseSize, fontWeight: 400, lineHeight: 1.5 }),
    caption: createTypographyToken({ fontSize: baseSize * 0.75, fontWeight: 400, lineHeight: 1.3 }),
  };
}

export function createShadowToken(overrides: Partial<ShadowToken> = {}): ShadowToken {
  return { x: 0, y: 4, blur: 12, spread: 0, color: '#000000', opacity: 0.15, ...overrides };
}

export function createDesignTokens(overrides: Partial<DesignTokens> = {}): DesignTokens {
  return {
    colors: {},
    typography: createTypographyScale(),
    spacing: { ...DEFAULT_SPACING_SCALE },
    radii: {},
    shadows: {},
    ...overrides,
  };
}

export interface CanvasOptions {
  readonly width: number;
  readonly height: number;
  readonly unit: Unit;
  readonly background?: CanvasBackground;
  readonly dpi?: number;
  readonly bleedMm?: number;
  readonly safeMarginMm?: number;
}

/**
 * Creates a canvas.
 *
 * Physical insets are supplied in millimetres and converted with an explicit
 * DPI when the canvas is pixel-based; when that conversion is impossible the
 * insets are omitted rather than guessed (`units.ts` never converts px silently).
 */
export function createCanvas(options: CanvasOptions): CanvasConfig {
  const background: CanvasBackground = options.background ?? { type: 'solid', color: '#ffffff' };
  const canvas: CanvasConfig = {
    width: options.width,
    height: options.height,
    unit: options.unit,
    background,
    ...(options.dpi === undefined ? {} : { dpi: options.dpi }),
  };

  const needsPhysical = options.bleedMm !== undefined || options.safeMarginMm !== undefined;
  if (!needsPhysical) return canvas;

  const dpi = options.dpi ?? (options.unit === 'px' ? DEFAULT_DPI : undefined);
  const scale = unitScaleFromMillimetres(options.unit, dpi);

  const inset = (mm: number | undefined): number | undefined => (mm === undefined ? undefined : mm * scale);

  const bleed = inset(options.bleedMm);
  const safe = inset(options.safeMarginMm);
  return {
    ...canvas,
    ...(bleed === undefined ? {} : { bleed: { top: bleed, right: bleed, bottom: bleed, left: bleed } }),
    ...(safe === undefined ? {} : { safeArea: { top: safe, right: safe, bottom: safe, left: safe } }),
  };
}

/** Canvas units per millimetre for a unit/DPI pair; falls back to 1 when unresolvable. */
function unitScaleFromMillimetres(unit: Unit, dpi: number | undefined): number {
  switch (unit) {
    case 'mm':
      return 1;
    case 'cm':
      return 0.1;
    case 'in':
      return 1 / 25.4;
    case 'px':
      return dpi === undefined ? 1 : dpi / 25.4;
  }
}

export function createGrid(overrides: Partial<GridConfiguration> = {}): GridConfiguration {
  return {
    type: 'column',
    columns: 12,
    gutter: 16,
    margin: { top: 16, right: 16, bottom: 16, left: 16 },
    enabled: true,
    ...overrides,
  };
}

export interface DocumentOptions {
  readonly id?: string;
  readonly name: string;
  readonly category: string;
  readonly canvas: CanvasConfig;
  readonly artDirection: ArtDirection;
  readonly composition: CompositionPlan;
  /** ISO timestamp; supplied rather than generated so output is reproducible. */
  readonly now?: string;
  readonly description?: string;
  readonly designTokens?: DesignTokens;
  readonly assets?: readonly DesignAsset[];
  readonly guides?: readonly DesignGuide[];
  readonly settings?: DesignSettings;
  readonly version?: number;
  readonly elementIds?: readonly string[];
}

/**
 * Creates a complete, structurally valid document.
 *
 * It contains no elements and no assets, which is why it validates: an empty
 * document is honest, whereas invented placeholder text would be fake content.
 */
export function createDesignDocument(options: DocumentOptions): DesignDocument {
  const now = options.now ?? new Date().toISOString();
  const ids = options.elementIds ?? [randomId('design')];
  return {
    id: options.id ?? ids[0] ?? randomId('design'),
    name: options.name,
    schemaVersion: SCHEMA_VERSION,
    version: options.version ?? 1,
    metadata: {
      category: options.category,
      ...(options.description === undefined ? {} : { description: options.description }),
      createdAt: now,
      updatedAt: now,
    },
    canvas: options.canvas,
    designTokens: options.designTokens ?? createDesignTokens(),
    artDirection: options.artDirection,
    composition: options.composition,
    elements: [],
    assets: options.assets ?? [],
    guides: options.guides ?? [],
    settings: options.settings ?? {},
  };
}

/** Deterministic ID factory for document sub-objects. */
export function createDocumentIdFactory(scope: string): (key: string | number) => string {
  return createIdFactory(scope);
}

export { SCHEMA_VERSION };
