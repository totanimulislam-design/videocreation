/**
 * Structural validators: canvas, design tokens, art direction, assets, guides.
 *
 * Each function reads an `unknown` fragment and records diagnostics; none of
 * them throws on bad input, and none of them repairs a value silently except
 * where the contract defines a *safe default that cannot change meaning*
 * (documented at the call site).
 */

import { CODES, type DiagnosticBag, type DiagnosticCode } from '../core/diagnostics.ts';
import { isHexColor, parseHexColor } from '../core/color.ts';
import { isValidId } from '../core/ids.ts';
import { normalizeLanguageTag, isSupportedLanguage } from '../core/script.ts';
import { ART_DIRECTION_STYLE_IDS, COLOR_ROLE_IDS, COLOR_STRATEGY_IDS, isDesignCategoryId } from '../knowledge/ids.ts';
import {
  CANVAS_MAX_ASPECT_RATIO,
  CANVAS_MAX_SIZE,
  CANVAS_MIN_SIZE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_WEIGHT_MAX,
  FONT_WEIGHT_MIN,
  LETTER_SPACING_ABSOLUTE_MAX,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  OPACITY_MAX,
  OPACITY_MIN,
} from '../schema/limits.ts';
import { DEFAULT_DPI, MAX_DPI, MIN_DPI, UNITS } from '../schema/units.ts';
import {
  COMPLEXITY_LEVELS,
  MEDIUMS,
  VISUAL_DENSITIES,
  type ArtDirection,
  type BoxInset,
  type CanvasBackground,
  type CanvasConfig,
  type DesignAsset,
  type DesignGuide,
  type DesignSettings,
  type DesignTokens,
  type ShadowToken,
  type TypographyScale,
  type TypographyToken,
  type Unit,
} from '../schema/types.ts';
import {
  describeType,
  isFiniteNumber,
  isRecord,
  noteUnknownKeys,
  readArray,
  readBoolean,
  readEnum,
  readNumber,
  readObject,
  readString,
  readStringRecord,
  type ReaderContext,
} from './primitives.ts';

const HEX_HINT = 'Use sRGB hex such as "#1a1a1a" or "#1a1a1aff".';

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

/** Validates and reads `CanvasConfig`. */
export function validateCanvas(ctx: ReaderContext, value: unknown, path: string): CanvasConfig | undefined {
  const record = readObject(ctx, value, path, 'canvas');
  if (!record) return undefined;

  const width = readNumber(ctx, record['width'], `${path}.width`, 'canvas.width', {
    min: CANVAS_MIN_SIZE,
    max: CANVAS_MAX_SIZE,
    code: CODES.CANVAS_DIMENSION_INVALID,
  });
  const height = readNumber(ctx, record['height'], `${path}.height`, 'canvas.height', {
    min: CANVAS_MIN_SIZE,
    max: CANVAS_MAX_SIZE,
    code: CODES.CANVAS_DIMENSION_INVALID,
  });
  const unit = readEnum<Unit>(ctx, record['unit'], `${path}.unit`, 'canvas.unit', UNITS, CODES.UNIT_INVALID);

  if (width !== undefined && height !== undefined) {
    const ratio = Math.max(width / height, height / width);
    if (ratio > CANVAS_MAX_ASPECT_RATIO) {
      ctx.bag.warning(
        CODES.CANVAS_ASPECT_UNUSUAL,
        `canvas aspect ratio is extreme (${ratio.toFixed(1)}:1 at ${width}×${height}).`,
        { path, hint: `Aspect ratios above ${CANVAS_MAX_ASPECT_RATIO}:1 are usually a unit or dimension mistake.` },
      );
    }
    if (width * height > CANVAS_MAX_SIZE * CANVAS_MAX_SIZE * 0.25) {
      ctx.bag.warning(
        CODES.CANVAS_DIMENSION_OUT_OF_RANGE,
        `canvas area is very large (${width}×${height} ${unit ?? 'units'}); export cost and precision may suffer.`,
        { path },
      );
    }
  }

  const dpi = record['dpi'] === undefined
    ? undefined
    : readNumber(ctx, record['dpi'], `${path}.dpi`, 'canvas.dpi', { min: MIN_DPI, max: MAX_DPI, code: CODES.DPI_INVALID });

  const bleed = record['bleed'] === undefined ? undefined : readInsets(ctx, record['bleed'], `${path}.bleed`, 'canvas.bleed');
  const safeArea =
    record['safeArea'] === undefined ? undefined : readInsets(ctx, record['safeArea'], `${path}.safeArea`, 'canvas.safeArea');

  if (bleed && width !== undefined && height !== undefined) {
    assertInsetsFit(ctx, bleed, width, height, `${path}.bleed`, 'bleed');
  }
  if (safeArea && width !== undefined && height !== undefined) {
    assertInsetsFit(ctx, safeArea, width, height, `${path}.safeArea`, 'safeArea');
  }
  if (bleed && safeArea) {
    assertSafeAreaInsideBleed(ctx, bleed, safeArea, path);
  }

  const background = record['background'] === undefined
    ? (ctx.bag.error(CODES.REQUIRED, 'canvas.background is required.', { path: `${path}.background` }),
      undefined)
    : validateCanvasBackground(ctx, record['background'], `${path}.background`);

  if (width === undefined || height === undefined || unit === undefined || !background) return undefined;

  noteUnknownKeys(ctx, record, ['width', 'height', 'unit', 'background', 'dpi', 'bleed', 'safeArea'], path, 'canvas');

  const canvas: CanvasConfig = {
    width,
    height,
    unit,
    background,
    ...(dpi === undefined ? {} : { dpi }),
    ...(bleed === undefined ? {} : { bleed }),
    ...(safeArea === undefined ? {} : { safeArea }),
  };
  return canvas;
}

function readInsets(ctx: ReaderContext, value: unknown, path: string, label: string): BoxInset | undefined {
  const record = readObject(ctx, value, path, label, label === 'canvas.bleed' ? CODES.BLEED_INVALID : CODES.SAFE_AREA_INVALID);
  if (!record) return undefined;
  const code = label === 'canvas.bleed' ? CODES.BLEED_INVALID : CODES.SAFE_AREA_INVALID;
  const top = readNumber(ctx, record['top'], `${path}.top`, `${label}.top`, { min: 0, code });
  const right = readNumber(ctx, record['right'], `${path}.right`, `${label}.right`, { min: 0, code });
  const bottom = readNumber(ctx, record['bottom'], `${path}.bottom`, `${label}.bottom`, { min: 0, code });
  const left = readNumber(ctx, record['left'], `${path}.left`, `${label}.left`, { min: 0, code });
  if (top === undefined || right === undefined || bottom === undefined || left === undefined) return undefined;
  return { top, right, bottom, left };
}

function assertInsetsFit(
  ctx: ReaderContext,
  insets: BoxInset,
  width: number,
  height: number,
  path: string,
  label: string,
): void {
  if (insets.left + insets.right >= width) {
    ctx.bag.error(
      label === 'bleed' ? CODES.INSETS_EXCEED_CANVAS : CODES.SAFE_AREA_INVALID,
      `${path} horizontal insets (${insets.left}+${insets.right}) consume the entire canvas width (${width}).`,
      { path, hint: 'Reduce the insets so positive design space remains.' },
    );
  }
  if (insets.top + insets.bottom >= height) {
    ctx.bag.error(
      label === 'bleed' ? CODES.INSETS_EXCEED_CANVAS : CODES.SAFE_AREA_INVALID,
      `${path} vertical insets (${insets.top}+${insets.bottom}) consume the entire canvas height (${height}).`,
      { path, hint: 'Reduce the insets so positive design space remains.' },
    );
  }
}

function assertSafeAreaInsideBleed(ctx: ReaderContext, bleed: BoxInset, safeArea: BoxInset, path: string): void {
  if (
    safeArea.top < bleed.top ||
    safeArea.right < bleed.right ||
    safeArea.bottom < bleed.bottom ||
    safeArea.left < bleed.left
  ) {
    ctx.bag.error(
      CODES.SAFE_AREA_INVALID,
      'canvas.safeArea is inside canvas.bleed, which places essential content in the trim area.',
      {
        path: `${path}.safeArea`,
        hint: 'The safe area must inset at least as far as the bleed on every side.',
      },
    );
  }
}

function validateCanvasBackground(ctx: ReaderContext, value: unknown, path: string): CanvasBackground | undefined {
  const record = readObject(ctx, value, path, 'canvas.background', CODES.CANVAS_BACKGROUND_INVALID);
  if (!record) return undefined;
  const type = record['type'];
  switch (type) {
    case 'solid': {
      const color = readColor(ctx, record['color'], `${path}.color`, 'canvas.background.color');
      return color === undefined ? undefined : { type: 'solid', color };
    }
    case 'transparent':
      return { type: 'transparent' };
    case 'image': {
      const assetId = readString(ctx, record['assetId'], `${path}.assetId`, 'canvas.background.assetId', {
        code: CODES.CANVAS_BACKGROUND_INVALID,
      });
      return assetId === undefined ? undefined : { type: 'image', assetId };
    }
    case 'gradient': {
      const kind = readEnum(ctx, record['kind'], `${path}.kind`, 'canvas.background.kind', ['linear', 'radial'] as const, CODES.GRADIENT_INVALID);
      const stopsRaw = readArray(ctx, record['stops'], `${path}.stops`, 'canvas.background.stops', {
        minLength: 2,
        code: CODES.GRADIENT_INVALID,
      });
      if (!kind || !stopsRaw) return undefined;

      const stops: Array<{ offset: number; color: string }> = [];
      let stopFailed = false;
      stopsRaw.forEach((stopValue, index) => {
        const stopPath = `${path}.stops[${index}]`;
        const stop = readObject(ctx, stopValue, stopPath, 'gradient stop', CODES.GRADIENT_INVALID);
        if (!stop) {
          stopFailed = true;
          return;
        }
        const offset = readNumber(ctx, stop['offset'], `${stopPath}.offset`, 'gradient stop offset', {
          min: 0,
          max: 1,
          code: CODES.GRADIENT_STOP_OFFSET,
        });
        const color = readColor(ctx, stop['color'], `${stopPath}.color`, 'gradient stop color');
        if (offset === undefined || color === undefined) {
          stopFailed = true;
          return;
        }
        stops.push({ offset, color });
      });
      if (stopFailed) return undefined;

      for (let index = 1; index < stops.length; index += 1) {
        const previous = stops[index - 1];
        const current = stops[index];
        if (previous && current && current.offset < previous.offset) {
          ctx.bag.error(
            CODES.GRADIENT_STOP_ORDER,
            `gradient stops must be ordered by ascending offset; stop ${index} (${current.offset}) precedes stop ${index - 1} (${previous.offset}).`,
            { path: `${path}.stops`, hint: 'Sort the stops by offset.' },
          );
          break;
        }
      }

      const angle = record['angle'] === undefined
        ? undefined
        : readNumber(ctx, record['angle'], `${path}.angle`, 'canvas.background.angle', { code: CODES.GRADIENT_INVALID });
      if (kind === 'radial' && angle !== undefined) {
        ctx.bag.warning(CODES.GRADIENT_INVALID, 'canvas.background.angle applies only to linear gradients and will be ignored.', {
          path: `${path}.angle`,
        });
      }

      let center: { x: number; y: number } | undefined;
      if (record['center'] !== undefined) {
        const centerRecord = readObject(ctx, record['center'], `${path}.center`, 'canvas.background.center', CODES.GRADIENT_INVALID);
        if (centerRecord) {
          const x = readNumber(ctx, centerRecord['x'], `${path}.center.x`, 'gradient center x', { min: 0, max: 1, code: CODES.GRADIENT_INVALID });
          const y = readNumber(ctx, centerRecord['y'], `${path}.center.y`, 'gradient center y', { min: 0, max: 1, code: CODES.GRADIENT_INVALID });
          if (x !== undefined && y !== undefined) center = { x, y };
        }
        if (kind === 'linear') {
          ctx.bag.warning(CODES.GRADIENT_INVALID, 'canvas.background.center applies only to radial gradients and will be ignored.', {
            path: `${path}.center`,
          });
        }
      }

      return {
        type: 'gradient',
        kind,
        stops,
        ...(angle === undefined ? {} : { angle }),
        ...(center === undefined ? {} : { center }),
      };
    }
    default:
      ctx.bag.error(
        CODES.CANVAS_BACKGROUND_INVALID,
        `canvas.background.type must be one of "solid", "gradient", "image", "transparent"; received ${JSON.stringify(type)}.`,
        { path: `${path}.type` },
      );
      return undefined;
  }
}

/** Reads a hex color, reporting `COLOR_INVALID` when it does not parse. */
export function readColor(ctx: ReaderContext, value: unknown, path: string, label: string): string | undefined {
  if (value === undefined) {
    ctx.bag.error(CODES.REQUIRED, `${label} is required.`, { path });
    return undefined;
  }
  if (!isHexColor(value)) {
    ctx.bag.error(CODES.COLOR_INVALID, `${label} must be an sRGB hex color; received ${JSON.stringify(value)}.`, {
      path,
      hint: HEX_HINT,
    });
    return undefined;
  }
  return value as string;
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const TYPOGRAPHY_ROLES = ['display', 'heading', 'subheading', 'body', 'caption'] as const;

export function validateDesignTokens(ctx: ReaderContext, value: unknown, path: string, canvas: CanvasConfig | undefined): DesignTokens | undefined {
  const record = readObject(ctx, value, path, 'designTokens');
  if (!record) return undefined;

  const colorsRaw = readStringRecord(ctx, record['colors'], `${path}.colors`, 'designTokens.colors');
  let colors: Record<string, string> | undefined;
  if (colorsRaw) {
    colors = {};
    for (const [role, color] of Object.entries(colorsRaw)) {
      if (!isHexColor(color)) {
        ctx.bag.error(CODES.COLOR_INVALID, `designTokens.colors["${role}"] must be a hex color; received ${JSON.stringify(color)}.`, {
          path: `${path}.colors.${role}`,
          hint: HEX_HINT,
        });
        continue;
      }
      colors[role] = color;
      if (!(COLOR_ROLE_IDS as readonly string[]).includes(role)) {
        ctx.bag.warning(
          CODES.COLOR_ROLE_UNKNOWN,
          `designTokens.colors has no documented role named "${role}".`,
          { path: `${path}.colors.${role}`, hint: `Documented roles: ${COLOR_ROLE_IDS.join(', ')}.` },
        );
      }
    }
    const declared = colors;
    const missing = COLOR_ROLE_IDS.filter((role) => !(role in declared));
    if (missing.length === COLOR_ROLE_IDS.length) {
      ctx.bag.warning(CODES.COLOR_ROLE_MISSING, 'designTokens.colors declares no functional color roles.', {
        path: `${path}.colors`,
        hint: `Declare at least the roles the design uses, e.g. ${COLOR_ROLE_IDS.slice(0, 4).join(', ')}.`,
      });
    } else if (missing.length > 0) {
      ctx.bag.warning(CODES.COLOR_ROLE_MISSING, `designTokens.colors is missing documented role(s): ${missing.join(', ')}.`, {
        path: `${path}.colors`,
        hint: 'Roles may be omitted when unused, but their absence is recorded so contrast checks are not assumed.',
      });
    }
  }

  const typographyRaw = readObject(ctx, record['typography'], `${path}.typography`, 'designTokens.typography', CODES.TYPOGRAPHY_TOKEN_MISSING);
  let typography: TypographyScale | undefined;
  if (typographyRaw) {
    const built: Partial<TypographyScale> = {};
    let typographyFailed = false;
    for (const role of TYPOGRAPHY_ROLES) {
      const tokenPath = `${path}.typography.${role}`;
      if (typographyRaw[role] === undefined) {
        ctx.bag.error(CODES.TYPOGRAPHY_TOKEN_MISSING, `designTokens.typography.${role} is required.`, {
          path: tokenPath,
          hint: 'The token contract requires display, heading, subheading, body and caption.',
        });
        typographyFailed = true;
        continue;
      }
      const token = validateTypographyToken(ctx, typographyRaw[role], tokenPath, `designTokens.typography.${role}`, canvas);
      if (!token) {
        typographyFailed = true;
        continue;
      }
      built[role] = token;
    }
    if (!typographyFailed) typography = built as TypographyScale;
  }

  const spacing = record['spacing'] === undefined
    ? (ctx.bag.error(CODES.REQUIRED, 'designTokens.spacing is required (use {} when unused).', { path: `${path}.spacing` }),
      undefined)
    : readNumberRecord(ctx, record['spacing'], `${path}.spacing`, 'designTokens.spacing', CODES.SPACING_TOKEN_INVALID);

  const radii = record['radii'] === undefined
    ? (ctx.bag.error(CODES.REQUIRED, 'designTokens.radii is required (use {} when unused).', { path: `${path}.radii` }),
      undefined)
    : readNumberRecord(ctx, record['radii'], `${path}.radii`, 'designTokens.radii', CODES.RADIUS_TOKEN_INVALID);

  const shadowsRaw = record['shadows'] === undefined
    ? (ctx.bag.error(CODES.REQUIRED, 'designTokens.shadows is required (use {} when unused).', { path: `${path}.shadows` }),
      undefined)
    : readObject(ctx, record['shadows'], `${path}.shadows`, 'designTokens.shadows');
  let shadows: Record<string, ShadowToken> | undefined;
  if (shadowsRaw) {
    shadows = {};
    for (const [name, shadowValue] of Object.entries(shadowsRaw)) {
      const shadow = validateShadowToken(ctx, shadowValue, `${path}.shadows.${name}`, `designTokens.shadows["${name}"]`);
      if (shadow) shadows[name] = shadow;
    }
  }

  if (!colors || !typography || !spacing || !radii || !shadows) return undefined;

  noteUnknownKeys(ctx, record, ['colors', 'typography', 'spacing', 'radii', 'shadows'], path, 'designTokens');

  return { colors, typography, spacing, radii, shadows };
}

function validateShadowToken(ctx: ReaderContext, value: unknown, path: string, label: string): ShadowToken | undefined {
  const record = readObject(ctx, value, path, label, CODES.SHADOW_TOKEN_INVALID);
  if (!record) return undefined;
  const x = readNumber(ctx, record['x'], `${path}.x`, `${label}.x`, { code: CODES.SHADOW_TOKEN_INVALID });
  const y = readNumber(ctx, record['y'], `${path}.y`, `${label}.y`, { code: CODES.SHADOW_TOKEN_INVALID });
  const blur = readNumber(ctx, record['blur'], `${path}.blur`, `${label}.blur`, { min: 0, code: CODES.SHADOW_TOKEN_INVALID });
  const spread = readNumber(ctx, record['spread'], `${path}.spread`, `${label}.spread`, { code: CODES.SHADOW_TOKEN_INVALID });
  const color = readColor(ctx, record['color'], `${path}.color`, `${label}.color`);
  const opacity = readNumber(ctx, record['opacity'], `${path}.opacity`, `${label}.opacity`, {
    min: OPACITY_MIN,
    max: OPACITY_MAX,
    code: CODES.SHADOW_OPACITY_INVALID,
  });
  if (
    x === undefined || y === undefined || blur === undefined || spread === undefined ||
    color === undefined || opacity === undefined
  ) {
    return undefined;
  }
  return { x, y, blur, spread, color, opacity };
}

/**
 * Validates one typography token.
 *
 * `canvas` is used only to sanity-check font size against the document's unit
 * (e.g. a 9000-unit font on a 100-unit canvas). Sizes are never clamped: an
 * implausible value is reported, not rewritten.
 */
export function validateTypographyToken(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  label: string,
  canvas?: CanvasConfig,
): TypographyToken | undefined {
  const record = readObject(ctx, value, path, label, CODES.TYPOGRAPHY_TOKEN_MISSING);
  if (!record) return undefined;

  const fontFamily = readString(ctx, record['fontFamily'], `${path}.fontFamily`, `${label}.fontFamily`, {
    code: CODES.FONT_FAMILY_EMPTY,
  });
  const fontSize = readNumber(ctx, record['fontSize'], `${path}.fontSize`, `${label}.fontSize`, {
    min: FONT_SIZE_MIN,
    max: FONT_SIZE_MAX,
    code: CODES.FONT_SIZE_INVALID,
  });
  const lineHeight = readNumber(ctx, record['lineHeight'], `${path}.lineHeight`, `${label}.lineHeight`, {
    min: LINE_HEIGHT_MIN,
    max: LINE_HEIGHT_MAX,
    code: CODES.LINE_HEIGHT_INVALID,
  });
  const letterSpacing = readNumber(ctx, record['letterSpacing'], `${path}.letterSpacing`, `${label}.letterSpacing`, {
    min: -LETTER_SPACING_ABSOLUTE_MAX,
    max: LETTER_SPACING_ABSOLUTE_MAX,
    code: CODES.LETTER_SPACING_INVALID,
  });

  // fontWeight accepts a numeric OpenType weight or a named keyword.
  let fontWeight: number | string | undefined;
  const weightValue = record['fontWeight'];
  if (weightValue === undefined) {
    ctx.bag.error(CODES.REQUIRED, `${label}.fontWeight is required.`, { path: `${path}.fontWeight` });
  } else if (typeof weightValue === 'number') {
    fontWeight = readNumber(ctx, weightValue, `${path}.fontWeight`, `${label}.fontWeight`, {
      min: FONT_WEIGHT_MIN,
      max: FONT_WEIGHT_MAX,
      code: CODES.FONT_WEIGHT_INVALID,
    });
  } else if (typeof weightValue === 'string' && weightValue.trim().length > 0) {
    fontWeight = weightValue;
  } else {
    ctx.bag.error(CODES.FONT_WEIGHT_INVALID, `${label}.fontWeight must be a number or a keyword string; received ${describeType(weightValue)}.`, {
      path: `${path}.fontWeight`,
      hint: 'Use 100–900 or a keyword such as "bold".',
    });
  }

  const textAlign = record['textAlign'] === undefined
    ? undefined
    : readEnum(ctx, record['textAlign'], `${path}.textAlign`, `${label}.textAlign`, ['left', 'center', 'right', 'justify'] as const, CODES.TEXT_ALIGN_INVALID);
  const textTransform = record['textTransform'] === undefined
    ? undefined
    : readString(ctx, record['textTransform'], `${path}.textTransform`, `${label}.textTransform`, { code: CODES.UNEXPECTED_VALUE });

  if (fontSize !== undefined && canvas) {
    // A font size larger than the canvas itself cannot be intentional body copy.
    if (fontSize > Math.max(canvas.width, canvas.height)) {
      ctx.bag.error(
        CODES.FONT_SIZE_IMPLAUSIBLE,
        `${label}.fontSize (${fontSize}${canvas.unit}) exceeds the canvas (${canvas.width}×${canvas.height}${canvas.unit}).`,
        { path: `${path}.fontSize`, hint: 'Reduce the size or correct the canvas unit.' },
      );
    }
  }
  if (lineHeight !== undefined && lineHeight < 1) {
    ctx.bag.warning(
      CODES.LINE_HEIGHT_INVALID,
      `${label}.lineHeight (${lineHeight}) is below 1.0, so lines will overlap.`,
      { path: `${path}.lineHeight`, hint: 'Body text is normally 1.2–1.6; display type rarely goes below 0.85.' },
    );
  }

  if (fontFamily === undefined || fontSize === undefined || lineHeight === undefined ||
      letterSpacing === undefined || fontWeight === undefined) {
    return undefined;
  }

  return {
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing,
    ...(textAlign === undefined ? {} : { textAlign }),
    ...(textTransform === undefined ? {} : { textTransform }),
  };
}

// ---------------------------------------------------------------------------
// Art direction
// ---------------------------------------------------------------------------

const REQUIRED_ART_DIRECTION_FIELDS = [
  'style',
  'mood',
  'colorStrategy',
  'typographyStrategy',
  'imageStrategy',
  'shapeLanguage',
  'visualDensity',
  'complexity',
] as const;

export function validateArtDirection(ctx: ReaderContext, value: unknown, path: string): ArtDirection | undefined {
  const record = readObject(ctx, value, path, 'artDirection');
  if (!record) return undefined;

  for (const required of ['typographyStrategy', 'imageStrategy', 'shapeLanguage'] as const) {
    if (record[required] === undefined) {
      ctx.bag.error(CODES.ART_DIRECTION_FIELD_MISSING, `artDirection.${required} is required.`, {
        path: `${path}.${required}`,
        hint: 'Describe the strategy in a short phrase; this is free-form, not an ID.',
      });
    } else {
      readString(ctx, record[required], `${path}.${required}`, `artDirection.${required}`, {
        code: CODES.ART_DIRECTION_FIELD_MISSING,
      });
    }
  }

  const style = readString(ctx, record['style'], `${path}.style`, 'artDirection.style', {
    code: CODES.ART_DIRECTION_FIELD_MISSING,
  });
  if (style !== undefined && !ART_DIRECTION_STYLE_IDS.includes(style)) {
    ctx.bag.error(
      CODES.ART_DIRECTION_STYLE_UNKNOWN,
      `artDirection.style "${style}" is not a documented style ID.`,
      {
        path: `${path}.style`,
        hint: `Use a stable ID from DESIGN_SYSTEM.md §4, e.g. ${ART_DIRECTION_STYLE_IDS.slice(0, 5).join(', ')}.`,
      },
    );
  }

  const colorStrategy = readString(ctx, record['colorStrategy'], `${path}.colorStrategy`, 'artDirection.colorStrategy', {
    code: CODES.ART_DIRECTION_FIELD_MISSING,
  });
  if (colorStrategy !== undefined && !(COLOR_STRATEGY_IDS as readonly string[]).includes(colorStrategy)) {
    ctx.bag.error(
      CODES.COLOR_STRATEGY_UNKNOWN,
      `artDirection.colorStrategy "${colorStrategy}" is not a documented strategy ID.`,
      {
        path: `${path}.colorStrategy`,
        hint: `Use an ID from DESIGN_ENGINE_SPEC.md §10.2, e.g. ${COLOR_STRATEGY_IDS.slice(0, 4).join(', ')}.`,
      },
    );
  }

  let mood: string[] | undefined;
  const moodRaw = readArray(ctx, record['mood'], `${path}.mood`, 'artDirection.mood');
  if (moodRaw) {
    mood = [];
    moodRaw.forEach((entry, index) => {
      const moodValue = readString(ctx, entry, `${path}.mood[${index}]`, 'artDirection.mood entry', { code: CODES.MOOD_EMPTY });
      if (moodValue !== undefined) mood?.push(moodValue);
    });
    if (mood.length === 0) {
      ctx.bag.error(CODES.MOOD_EMPTY, 'artDirection.mood must contain at least one mood descriptor.', { path: `${path}.mood` });
      mood = undefined;
    }
  }

  const visualDensity = readEnum(ctx, record['visualDensity'], `${path}.visualDensity`, 'artDirection.visualDensity', VISUAL_DENSITIES, CODES.VISUAL_DENSITY_INVALID);
  const complexity = readEnum(ctx, record['complexity'], `${path}.complexity`, 'artDirection.complexity', COMPLEXITY_LEVELS, CODES.COMPLEXITY_INVALID);

  const references = record['references'] === undefined
    ? undefined
    : readStringArray(ctx, record['references'], `${path}.references`, 'artDirection.references');

  if (
    style === undefined || colorStrategy === undefined || mood === undefined ||
    visualDensity === undefined || complexity === undefined ||
    typeof record['typographyStrategy'] !== 'string' ||
    typeof record['imageStrategy'] !== 'string' ||
    typeof record['shapeLanguage'] !== 'string'
  ) {
    return undefined;
  }

  noteUnknownKeys(ctx, record, [...REQUIRED_ART_DIRECTION_FIELDS, 'references'], path, 'artDirection');

  return {
    style,
    mood,
    colorStrategy,
    typographyStrategy: record['typographyStrategy'],
    imageStrategy: record['imageStrategy'],
    shapeLanguage: record['shapeLanguage'],
    visualDensity,
    complexity,
    ...(references === undefined ? {} : { references }),
  };
}

function readStringArray(ctx: ReaderContext, value: unknown, path: string, label: string): string[] | undefined {
  const array = readArray(ctx, value, path, label);
  if (!array) return undefined;
  const out: string[] = [];
  array.forEach((entry, index) => {
    const text = readString(ctx, entry, `${path}[${index}]`, `${label} entry`);
    if (text !== undefined) out.push(text);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

const ASSET_SCHEMES = ['data:', 'https:', 'file:', 'asset:', 'blob:', 'urn:'];

export function validateAssets(ctx: ReaderContext, value: unknown, path: string): DesignAsset[] | undefined {
  const array = readArray(ctx, value, path, 'assets');
  if (!array) return undefined;

  const assets: DesignAsset[] = [];
  array.forEach((entry, index) => {
    const assetPath = `${path}[${index}]`;
    const record = readObject(ctx, entry, assetPath, 'asset');
    if (!record) return;

    const id = readString(ctx, record['id'], `${assetPath}.id`, 'asset.id', { code: CODES.ID_INVALID });
    if (id !== undefined && !isValidId(id)) {
      ctx.bag.error(CODES.ID_INVALID, `asset.id "${id}" is not a valid stable ID.`, {
        path: `${assetPath}.id`,
        hint: 'Use 1–128 characters from letters, digits, "-", "_", ".", ":" or "/".',
      });
    }
    const kind = readEnum(ctx, record['kind'], `${assetPath}.kind`, 'asset.kind', ['image', 'font', 'vector'] as const, CODES.ASSET_KIND_INVALID);
    const uri = readString(ctx, record['uri'], `${assetPath}.uri`, 'asset.uri', { code: CODES.ASSET_URI_INVALID });
    const mimeType = readString(ctx, record['mimeType'], `${assetPath}.mimeType`, 'asset.mimeType', {
      code: CODES.ASSET_MIME_MISSING,
    });

    if (uri !== undefined) {
      const scheme = ASSET_SCHEMES.find((candidate) => uri.toLowerCase().startsWith(candidate));
      if (!scheme) {
        ctx.bag.error(
          CODES.ASSET_URI_SCHEME_UNSUPPORTED,
          `asset.uri scheme is not allowed ("${uri.slice(0, 32)}…").`,
          {
            path: `${assetPath}.uri`,
            hint: `Supported schemes: ${ASSET_SCHEMES.join(', ')}. Remote assets must be fetched and re-hosted by the host application.`,
          },
        );
      }
    }

    const width = record['width'] === undefined
      ? undefined
      : readNumber(ctx, record['width'], `${assetPath}.width`, 'asset.width', { min: 1, code: CODES.ASSET_DIMENSION_INVALID });
    const height = record['height'] === undefined
      ? undefined
      : readNumber(ctx, record['height'], `${assetPath}.height`, 'asset.height', { min: 1, code: CODES.ASSET_DIMENSION_INVALID });

    let licensing: { source?: string; usage?: string } | undefined;
    if (record['licensing'] !== undefined) {
      const licensingRecord = readObject(ctx, record['licensing'], `${assetPath}.licensing`, 'asset.licensing');
      if (licensingRecord) {
        licensing = {};
        if (licensingRecord['source'] !== undefined) {
          const source = readString(ctx, licensingRecord['source'], `${assetPath}.licensing.source`, 'asset.licensing.source');
          if (source !== undefined) licensing.source = source;
        }
        if (licensingRecord['usage'] !== undefined) {
          const usage = readString(ctx, licensingRecord['usage'], `${assetPath}.licensing.usage`, 'asset.licensing.usage');
          if (usage !== undefined) licensing.usage = usage;
        }
      }
    }

    // Unlicensed imagery is a real production risk, not a stylistic issue.
    if (kind === 'image' && licensing?.usage === undefined) {
      ctx.bag.warning(
        CODES.ASSET_LICENSING_MISSING,
        `image asset "${id ?? index}" declares no licensing.usage.`,
        { path: `${assetPath}.licensing`, hint: 'Record provenance and permitted usage before production delivery.' },
      );
    }

    if (id === undefined || kind === undefined || uri === undefined || mimeType === undefined) return;
    assets.push({
      id,
      kind,
      uri,
      mimeType,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      ...(licensing === undefined ? {} : { licensing }),
    });
  });

  return assets;
}

// ---------------------------------------------------------------------------
// Guides and settings
// ---------------------------------------------------------------------------

export function validateGuides(ctx: ReaderContext, value: unknown, path: string): DesignGuide[] | undefined {
  const array = readArray(ctx, value, path, 'guides');
  if (!array) return undefined;
  const guides: DesignGuide[] = [];
  array.forEach((entry, index) => {
    const guidePath = `${path}[${index}]`;
    const record = readObject(ctx, entry, guidePath, 'guide', CODES.GUIDE_INVALID);
    if (!record) return;
    const id = readString(ctx, record['id'], `${guidePath}.id`, 'guide.id', { code: CODES.GUIDE_INVALID });
    const kind = readEnum(ctx, record['kind'], `${guidePath}.kind`, 'guide.kind', ['line', 'rect'] as const, CODES.GUIDE_INVALID);
    const x = readNumber(ctx, record['x'], `${guidePath}.x`, 'guide.x', { code: CODES.GUIDE_INVALID });
    const y = readNumber(ctx, record['y'], `${guidePath}.y`, 'guide.y', { code: CODES.GUIDE_INVALID });
    const visible = readBoolean(ctx, record['visible'], `${guidePath}.visible`, 'guide.visible');
    const width = record['width'] === undefined ? undefined : readNumber(ctx, record['width'], `${guidePath}.width`, 'guide.width', { min: 0, code: CODES.GUIDE_INVALID });
    const height = record['height'] === undefined ? undefined : readNumber(ctx, record['height'], `${guidePath}.height`, 'guide.height', { min: 0, code: CODES.GUIDE_INVALID });
    if (kind === 'rect' && (width === undefined || height === undefined)) {
      ctx.bag.error(CODES.GUIDE_INVALID, 'A rect guide requires width and height.', { path: guidePath });
      return;
    }
    if (id === undefined || kind === undefined || x === undefined || y === undefined || visible === undefined) return;
    guides.push({
      id,
      kind,
      x,
      y,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      visible,
    });
  });
  return guides;
}

export function validateSettings(ctx: ReaderContext, value: unknown, path: string): DesignSettings | undefined {
  const record = readObject(ctx, value, path, 'settings', CODES.SETTINGS_INVALID);
  if (!record) return undefined;
  const colorProfile = record['colorProfile'] === undefined
    ? undefined
    : readString(ctx, record['colorProfile'], `${path}.colorProfile`, 'settings.colorProfile', { code: CODES.SETTINGS_INVALID });
  const exportScale = record['exportScale'] === undefined
    ? undefined
    : readNumber(ctx, record['exportScale'], `${path}.exportScale`, 'settings.exportScale', { min: 0.1, max: 20, code: CODES.SETTINGS_INVALID });
  return {
    ...(colorProfile === undefined ? {} : { colorProfile }),
    ...(exportScale === undefined ? {} : { exportScale }),
  };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export function validateMetadata(
  ctx: ReaderContext,
  value: unknown,
  path: string,
): { category: string; createdAt: string; updatedAt: string; description?: string } | undefined {
  const record = readObject(ctx, value, path, 'metadata');
  if (!record) return undefined;

  const category = readString(ctx, record['category'], `${path}.category`, 'metadata.category');
  if (category !== undefined && !isDesignCategoryId(category)) {
    ctx.bag.warning(
      CODES.METADATA_CATEGORY_UNKNOWN,
      `metadata.category "${category}" is not a documented design category ID.`,
      { path: `${path}.category`, hint: 'Unknown categories are permitted but will not match category rules.' },
    );
  }

  const createdAt = readTimestamp(ctx, record['createdAt'], `${path}.createdAt`);
  const updatedAt = readTimestamp(ctx, record['updatedAt'], `${path}.updatedAt`);
  if (createdAt && updatedAt && createdAt > updatedAt) {
    ctx.bag.error(CODES.METADATA_TIMESTAMP_ORDER, 'metadata.updatedAt precedes metadata.createdAt.', {
      path: `${path}.updatedAt`,
    });
  }

  const description = record['description'] === undefined
    ? undefined
    : readString(ctx, record['description'], `${path}.description`, 'metadata.description', { allowEmpty: true });

  if (category === undefined || createdAt === undefined || updatedAt === undefined) return undefined;
  return { category, createdAt, updatedAt, ...(description === undefined ? {} : { description }) };
}

function readTimestamp(ctx: ReaderContext, value: unknown, path: string): string | undefined {
  const text = readString(ctx, value, path, path.split('.').pop() ?? 'timestamp', { code: CODES.METADATA_TIMESTAMP_INVALID });
  if (text === undefined) return undefined;
  const time = Date.parse(text);
  if (Number.isNaN(time)) {
    ctx.bag.error(CODES.METADATA_TIMESTAMP_INVALID, `${path} is not an ISO-8601 timestamp: ${JSON.stringify(text)}.`, {
      path,
      hint: 'Use an ISO-8601 value such as "2026-01-05T09:30:00Z".',
    });
    return undefined;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Shared cross-cutting readers
// ---------------------------------------------------------------------------

export function readNumberRecord(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  label: string,
  code: DiagnosticCode,
): Record<string, number> | undefined {
  const record = readObject(ctx, value, path, label);
  if (!record) return undefined;
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (!isFiniteNumber(entry)) {
      ctx.bag.error(code, `${label}["${key}"] must be a finite number.`, { path: `${path}.${key}` });
      continue;
    }
    out[key] = entry;
  }
  return out;
}

export function validateMedium(ctx: ReaderContext, value: unknown, path: string): void {
  if (value !== undefined) readEnum(ctx, value, path, 'requirements.medium', MEDIUMS);
}

export function validateLanguageList(ctx: ReaderContext, value: unknown, path: string): string[] | undefined {
  const list = readStringArray(ctx, value, path, 'requirements.languages');
  if (!list) return undefined;
  const normalized = list.map((language) => normalizeLanguageTag(language)).filter((language) => language.length > 0);
  if (normalized.length === 0) {
    ctx.bag.error(CODES.REQUIRED, 'requirements.languages must name at least one language.', { path });
    return undefined;
  }
  for (const [index, language] of normalized.entries()) {
    if (!isSupportedLanguage(language)) {
      ctx.bag.warning(
        CODES.BRIEF_SCRIPT_UNSUPPORTED,
        `requirements.languages[${index}] "${language}" is outside the documented supported set; shaping support is unverified.`,
        { path: `${path}[${index}]`, hint: 'Flag for Human Review rather than claiming correct rendering.' },
      );
    }
  }
  return normalized;
}

/** Re-exports for the orchestrator so it does not need deep imports. */
export { isRecord, readArray, readObject, readString, describeType };
export { parseHexColor };
