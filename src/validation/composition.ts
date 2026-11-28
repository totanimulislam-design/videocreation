/**
 * Composition-plan validation.
 *
 * Checks the parts of the plan that describe *structure* — pattern choice,
 * reading flow, focal point, hierarchy, zones, grid and constraints — against
 * `DESIGN_ENGINE_SPEC.md` §6.1/§7.2 and the pattern metadata in
 * `DESIGN_PATTERNS_LIBRARY.md`.
 *
 * Boundary respected here: this module never lays anything out. It does not
 * compute element geometry, resolve collisions, or re-order hierarchy. It
 * reports whether the *stated plan* is internally consistent and references
 * things that exist.
 */

import { CODES } from '../core/diagnostics.ts';
import { isRtlScript, scriptForLanguage } from '../core/script.ts';
import type { DesignCategoryId } from '../knowledge/ids.ts';
import { hasPattern, isPatternIdSyntax, isRecommendedCombination, lookupPattern, patternCategoryFitsDesignCategory } from '../knowledge/patterns.ts';
import { GRID_TYPES, type CanvasConfig, type CompositionConstraints, type CompositionPlan, type CompositionZone, type GridConfiguration, type HierarchyItem, type ReadingFlow, type Rect } from '../schema/types.ts';
import { MAX_ELEMENTS, MAX_SUPPORTING_PATTERNS } from '../schema/limits.ts';
import {
  describeType,
  noteUnknownKeys,
  readArray,
  readBoolean,
  readEnum,
  readNumber,
  readObject,
  readString,
  type ReaderContext,
} from './primitives.ts';

export interface CompositionValidationContext {
  readonly canvas: CanvasConfig | undefined;
  /** IDs of scene nodes declared in the document, used to resolve zone members. */
  readonly nodeIds: ReadonlySet<string>;
  /** Content slots the brief actually supplies, used to resolve hierarchy ranks. */
  readonly contentSlots: ReadonlySet<string>;
  readonly category: DesignCategoryId | undefined;
  readonly documentLanguages: readonly string[];
  /** Zone IDs collected across the plan, for duplicate detection. */
  readonly zoneIds: Set<string>;
}

export function validateComposition(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  context: CompositionValidationContext,
): CompositionPlan | undefined {
  const record = readObject(ctx, value, path, 'composition');
  if (!record) return undefined;

  const primaryPattern = validatePatternId(ctx, record['primaryPattern'], `${path}.primaryPattern`, 'composition.primaryPattern');

  const supportingRaw = readArray(ctx, record['supportingPatterns'], `${path}.supportingPatterns`, 'composition.supportingPatterns');
  const supportingPatterns: string[] = [];
  if (supportingRaw) {
    supportingRaw.forEach((entry, index) => {
      const id = validatePatternId(ctx, entry, `${path}.supportingPatterns[${index}]`, 'composition.supportingPatterns entry');
      if (id !== undefined) supportingPatterns.push(id);
    });
    if (supportingPatterns.length > MAX_SUPPORTING_PATTERNS) {
      ctx.bag.error(
        CODES.SUPPORTING_PATTERNS_EXCESSIVE,
        `composition.supportingPatterns has ${supportingPatterns.length} entries; the library allows one or two (DESIGN_PATTERNS_LIBRARY.md §2.3).`,
        { path: `${path}.supportingPatterns` },
      );
    }
    if (primaryPattern !== undefined) {
      if (supportingPatterns.includes(primaryPattern)) {
        ctx.bag.error(CODES.PATTERN_DUPLICATE, `composition.supportingPatterns repeats the primary pattern "${primaryPattern}".`, {
          path: `${path}.supportingPatterns`,
        });
      }
      const duplicates = supportingPatterns.filter((id, index) => supportingPatterns.indexOf(id) !== index);
      for (const duplicate of new Set(duplicates)) {
        ctx.bag.error(CODES.PATTERN_DUPLICATE, `composition.supportingPatterns repeats "${duplicate}".`, {
          path: `${path}.supportingPatterns`,
        });
      }
      for (const supporting of supportingPatterns) {
        if (hasPattern(supporting) && hasPattern(primaryPattern) && !isRecommendedCombination(primaryPattern, supporting)) {
          ctx.bag.warning(
            CODES.PATTERN_COMBINATION_UNVERIFIED,
            `"${primaryPattern}" + "${supporting}" is not one of the recommended combinations in DESIGN_PATTERNS_LIBRARY.md §16.1.`,
            {
              path: `${path}.supportingPatterns`,
              hint: 'Combinations are allowed when they have a clear compositional purpose, but they are unverified.',
            },
          );
        }
      }
    }
  }

  if (primaryPattern !== undefined && context.category !== undefined) {
    const fit = patternCategoryFitsDesignCategory(primaryPattern, context.category);
    if (fit === 'mismatch') {
      const pattern = lookupPattern(primaryPattern);
      ctx.bag.warning(
        CODES.PATTERN_CATEGORY_MISMATCH,
        `Pattern "${primaryPattern}" is catalogued for ${pattern?.category ?? 'another'} work, which does not normally serve the "${context.category}" category.`,
        { path: `${path}.primaryPattern`, hint: 'Confirm the pattern choice is deliberate for this category.' },
      );
    }
  }

  const focalPoint = validateFocalPoint(ctx, record['focalPoint'], `${path}.focalPoint`, context.canvas);
  const readingFlow = validateReadingFlow(ctx, record['readingFlow'], `${path}.readingFlow`, context);

  const hierarchy = validateHierarchy(ctx, record['hierarchy'], `${path}.hierarchy`, context);

  const zonesRaw = readArray(ctx, record['zones'], `${path}.zones`, 'composition.zones');
  const zones: CompositionZone[] = [];
  if (zonesRaw) {
    zonesRaw.forEach((entry, index) => {
      const zone = validateZone(ctx, entry, `${path}.zones[${index}]`, context);
      if (zone) zones.push(zone);
    });
    checkZoneCoverage(ctx, zones, `${path}.zones`);
  }

  const grid = validateGrid(ctx, record['grid'], `${path}.grid`, context.canvas);
  const constraints = validateConstraints(ctx, record['constraints'], `${path}.constraints`);

  if (
    primaryPattern === undefined || focalPoint === undefined || readingFlow === undefined ||
    hierarchy === undefined || !zonesRaw || grid === undefined || constraints === undefined
  ) {
    return undefined;
  }

  noteUnknownKeys(ctx, record, ['primaryPattern', 'supportingPatterns', 'focalPoint', 'readingFlow', 'hierarchy', 'zones', 'grid', 'constraints'], path, 'composition');

  return { primaryPattern, supportingPatterns, focalPoint, readingFlow, hierarchy, zones, grid, constraints };
}

function validatePatternId(ctx: ReaderContext, value: unknown, path: string, label: string): string | undefined {
  if (value === undefined) {
    ctx.bag.error(CODES.REQUIRED, `${label} is required.`, {
      path,
      hint: 'Select one pattern ID from DESIGN_PATTERNS_LIBRARY.md (P01–P100).',
    });
    return undefined;
  }
  if (typeof value !== 'string') {
    ctx.bag.error(CODES.INVALID_TYPE, `${label} must be a string, received ${describeType(value)}.`, { path });
    return undefined;
  }
  if (!isPatternIdSyntax(value)) {
    ctx.bag.error(CODES.PATTERN_ID_INVALID, `${label} "${value}" is not a pattern ID; expected P01–P100.`, { path });

    return undefined;
  }
  if (!hasPattern(value)) {
    ctx.bag.error(CODES.PATTERN_UNKNOWN, `${label} "${value}" does not exist in the pattern catalogue.`, {
      path,
      hint: 'Use a documented ID; unknown patterns cannot be validated or constructed.',
    });
    return undefined;
  }

  const pattern = lookupPattern(value);
  if (pattern && !pattern.completeness.hasFailureGuidance) {
    ctx.bag.warning(
      CODES.PATTERN_GUIDANCE_INCOMPLETE,
      `Pattern "${value}" (${pattern.name}) has no per-entry failure/validation guidance in the library.`,
      {
        path,
        hint: 'Apply the five-part pattern decision contract (DESIGN_PATTERNS_LIBRARY.md §1.1) before use.',
      },
    );
  }
  return value;
}

function validateFocalPoint(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  canvas: CanvasConfig | undefined,
): CompositionPlan['focalPoint'] | undefined {
  const record = readObject(ctx, value, path, 'composition.focalPoint', CODES.FOCAL_POINT_INVALID);
  if (!record) return undefined;
  const x = readNumber(ctx, record['x'], `${path}.x`, 'focalPoint.x', { code: CODES.FOCAL_POINT_INVALID });
  const y = readNumber(ctx, record['y'], `${path}.y`, 'focalPoint.y', { code: CODES.FOCAL_POINT_INVALID });
  const strength = readNumber(ctx, record['strength'], `${path}.strength`, 'focalPoint.strength', {
    min: 0,
    max: 1,
    code: CODES.FOCAL_STRENGTH_INVALID,
  });

  if (canvas && x !== undefined && y !== undefined) {
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) {
      ctx.bag.error(
        CODES.FOCAL_POINT_OUTSIDE_CANVAS,
        `focalPoint (${x}, ${y}) lies outside the canvas (0..${canvas.width}, 0..${canvas.height} ${canvas.unit}).`,
        { path, hint: 'Focal coordinates are in canvas units and must fall inside the canvas.' },
      );
    }
  }
  if (x === undefined || y === undefined || strength === undefined) return undefined;
  return { x, y, strength };
}

function validateReadingFlow(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  context: CompositionValidationContext,
): ReadingFlow | undefined {
  const flow = readEnum<ReadingFlow>(
    ctx,
    value,
    path,
    'composition.readingFlow',
    ['ltr', 'rtl', 'vertical', 'custom'] as const,
    CODES.READING_FLOW_INVALID,
  );
  if (flow === undefined) return undefined;

  // Advisory only: a document is never globally mirrored, but a mismatch between
  // declared flow and the document's languages is worth surfacing before layout.
  const rtlLanguages = context.documentLanguages.filter((language) => {
    const info = scriptForLanguage(language);
    return info !== undefined && isRtlScript(info.script);
  });
  const ltrLanguages = context.documentLanguages.filter((language) => {
    const info = scriptForLanguage(language);
    return info !== undefined && !isRtlScript(info.script);
  });

  if (flow === 'rtl' && rtlLanguages.length === 0 && ltrLanguages.length > 0) {
    ctx.bag.warning(
      CODES.READING_FLOW_INVALID,
      `composition.readingFlow is "rtl" but the document has no right-to-left language (${context.documentLanguages.join(', ')}).`,
      { path, hint: 'Confirm the flow is intentional; per-run direction still follows each text run.' },
    );
  }
  if (flow === 'ltr' && ltrLanguages.length === 0 && rtlLanguages.length > 0) {
    ctx.bag.warning(
      CODES.READING_FLOW_INVALID,
      `composition.readingFlow is "ltr" but the document languages are right-to-left (${rtlLanguages.join(', ')}).`,
      { path, hint: 'An RTL layout flow is normally expected; per-run direction still follows each text run.' },
    );
  }
  return flow;
}

function validateHierarchy(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  context: CompositionValidationContext,
): HierarchyItem[] | undefined {
  const array = readArray(ctx, value, path, 'composition.hierarchy', { minLength: 1, code: CODES.HIERARCHY_EMPTY });
  if (!array) return undefined;
  if (array.length === 0) {
    ctx.bag.error(CODES.HIERARCHY_EMPTY, 'composition.hierarchy must rank at least one content slot.', { path });
    return undefined;
  }

  const items: HierarchyItem[] = [];
  const ranks = new Map<number, number>();
  const contentIds = new Map<string, number>();

  array.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const record = readObject(ctx, entry, itemPath, 'hierarchy item');
    if (!record) return;

    const contentId = readString(ctx, record['contentId'], `${itemPath}.contentId`, 'hierarchy.contentId', {
      code: CODES.HIERARCHY_CONTENT_UNRESOLVED,
    });
    const rank = readNumber(ctx, record['rank'], `${itemPath}.rank`, 'hierarchy.rank', {
      min: 1,
      max: MAX_ELEMENTS,
      code: CODES.HIERARCHY_RANK_INVALID,
    });
    const role = readEnum(ctx, record['role'], `${itemPath}.role`, 'hierarchy.role', ['primary', 'secondary', 'tertiary', 'utility'] as const, CODES.HIERARCHY_ROLE_INVALID);

    if (rank !== undefined) {
      const previous = ranks.get(rank);
      if (previous !== undefined) {
        ctx.bag.error(
          CODES.HIERARCHY_RANK_DUPLICATE,
          `hierarchy rank ${rank} is used twice (items ${previous} and ${index}).`,
          { path: `${itemPath}.rank`, hint: 'Ranks must be unique so the reading order is deterministic.' },
        );
      } else {
        ranks.set(rank, index);
      }
    }

    if (contentId !== undefined) {
      const previous = contentIds.get(contentId);
      if (previous !== undefined) {
        ctx.bag.error(
          CODES.HIERARCHY_CONTENT_DUPLICATE,
          `contentId "${contentId}" is ranked twice (items ${previous} and ${index}).`,
          { path: `${itemPath}.contentId` },
        );
      } else {
        contentIds.set(contentId, index);
      }
      if (context.contentSlots.size > 0 && !contentSlotExists(contentId, context.contentSlots)) {
        ctx.bag.error(
          CODES.HIERARCHY_CONTENT_UNRESOLVED,
          `hierarchy.contentId "${contentId}" does not exist in the brief content.`,
          {
            path: `${itemPath}.contentId`,
            hint: `Available slots: ${[...context.contentSlots].sort().join(', ')}.`,
          },
        );
      }
    }

    if (contentId !== undefined && rank !== undefined && role !== undefined) {
      items.push({ contentId, rank, role });
    }
  });

  // Role/rank consistency: a "primary" item must not rank below a "utility" one.
  const sorted = [...items].sort((a, b) => a.rank - b.rank);
  const firstUtility = sorted.findIndex((item) => item.role === 'utility');
  const lastPrimary = sorted.map((item) => item.role).lastIndexOf('primary');
  if (firstUtility !== -1 && lastPrimary !== -1 && lastPrimary > firstUtility) {
    ctx.bag.warning(
      CODES.HIERARCHY_ROLE_RANK_INCONSISTENT,
      'A "primary" hierarchy item ranks below a "utility" item.',
      {
        path,
        hint: 'Either the rank or the role is probably wrong; roles should agree with rank order.',
      },
    );
  }

  if (items.length === 0) return undefined;
  if (!items.some((item) => item.role === 'primary')) {
    ctx.bag.warning(CODES.HIERARCHY_ROLE_RANK_INCONSISTENT, 'No hierarchy item has the "primary" role.', {
      path,
      hint: 'Every design needs a primary focus; assigning one avoids competing emphasis.',
    });
  }
  return items;
}

/** `headline`, `subheadline`, `body/<n>`, `details/<n>`, `cta`, or a declared slot ID. */
function contentSlotExists(contentId: string, slots: ReadonlySet<string>): boolean {
  if (slots.has(contentId)) return true;
  const indexed = /^(body|details)\/(\d+)$/.exec(contentId);
  if (indexed) {
    const family = indexed[1];
    const index = indexed[2];
    if (family === undefined || index === undefined) return false;
    return slots.has(`${family}/${index}`);
  }
  return false;
}

function validateZone(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  context: CompositionValidationContext,
): CompositionZone | undefined {
  const record = readObject(ctx, value, path, 'composition zone');
  if (!record) return undefined;

  const id = readString(ctx, record['id'], `${path}.id`, 'zone.id', { code: CODES.ZONE_ID_INVALID });
  if (id !== undefined) {
    if (context.zoneIds.has(id)) {
      ctx.bag.error(CODES.ID_NOT_UNIQUE, `zone.id "${id}" is declared more than once.`, { path: `${path}.id` });
    } else {
      context.zoneIds.add(id);
    }
  }
  const purpose = readString(ctx, record['purpose'], `${path}.purpose`, 'zone.purpose', { code: CODES.ZONE_BOUNDS_INVALID });
  const priority = readNumber(ctx, record['priority'], `${path}.priority`, 'zone.priority', { min: 1, code: CODES.ZONE_BOUNDS_INVALID });
  const bounds = readRect(ctx, record['bounds'], `${path}.bounds`, 'zone.bounds');

  const elementIdsRaw = readArray(ctx, record['elementIds'], `${path}.elementIds`, 'zone.elementIds');
  const elementIds: string[] = [];
  if (elementIdsRaw) {
    elementIdsRaw.forEach((entry, index) => {
      const elementId = readString(ctx, entry, `${path}.elementIds[${index}]`, 'zone element id', {
        code: CODES.ZONE_ELEMENT_NOT_FOUND,
      });
      if (elementId === undefined) return;
      if (context.nodeIds.size > 0 && !context.nodeIds.has(elementId)) {
        ctx.bag.error(CODES.ZONE_ELEMENT_NOT_FOUND, `zone "${id ?? path}" references unknown element "${elementId}".`, {
          path: `${path}.elementIds[${index}]`,
          hint: 'Zone members must be declared scene-node IDs in the same document.',
        });
        return;
      }
      elementIds.push(elementId);
    });
  }

  if (bounds && context.canvas) {
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const tolerance = 1e-9;
    if (bounds.x < -tolerance || bounds.y < -tolerance || right > context.canvas.width + tolerance || bottom > context.canvas.height + tolerance) {
      ctx.bag.error(
        CODES.ZONE_OUTSIDE_CANVAS,
        `zone "${id ?? path}" bounds (${bounds.x}, ${bounds.y}) ${bounds.width}×${bounds.height} extend outside the canvas (${context.canvas.width}×${context.canvas.height} ${context.canvas.unit}).`,
        { path: `${path}.bounds`, hint: 'Irregular zones are fine, but they must stay within the canvas.' },
      );
    }
  }

  if (id === undefined || purpose === undefined || priority === undefined || bounds === undefined || !elementIdsRaw) {
    return undefined;
  }
  return { id, purpose, priority, bounds, elementIds };
}

function readRect(ctx: ReaderContext, value: unknown, path: string, label: string): Rect | undefined {
  const record = readObject(ctx, value, path, label, CODES.ZONE_BOUNDS_INVALID);
  if (!record) return undefined;
  const x = readNumber(ctx, record['x'], `${path}.x`, `${label}.x`, { code: CODES.ZONE_BOUNDS_INVALID });
  const y = readNumber(ctx, record['y'], `${path}.y`, `${label}.y`, { code: CODES.ZONE_BOUNDS_INVALID });
  const width = readNumber(ctx, record['width'], `${path}.width`, `${label}.width`, {
    exclusiveMin: 0,
    code: CODES.ZONE_BOUNDS_INVALID,
  });
  const height = readNumber(ctx, record['height'], `${path}.height`, `${label}.height`, {
    exclusiveMin: 0,
    code: CODES.ZONE_BOUNDS_INVALID,
  });
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  return { x, y, width, height };
}

/**
 * Reports overlapping zones that are not explained.
 *
 * Zones may deliberately overlap (`DESIGN_ENGINE_SPEC.md` §6.2), so this is a
 * warning: the plan should be able to say *why* two areas share space.
 */
function checkZoneCoverage(ctx: ReaderContext, zones: readonly CompositionZone[], path: string): void {
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      const a = zones[i];
      const b = zones[j];
      if (!a || !b) continue;
      const overlapX = Math.min(a.bounds.x + a.bounds.width, b.bounds.x + b.bounds.width) - Math.max(a.bounds.x, b.bounds.x);
      const overlapY = Math.min(a.bounds.y + a.bounds.height, b.bounds.y + b.bounds.height) - Math.max(a.bounds.y, b.bounds.y);
      if (overlapX > 0 && overlapY > 0) {
        ctx.bag.warning(
          CODES.ZONE_OVERLAP_UNSTATED,
          `zones "${a.id}" and "${b.id}" overlap by ${overlapX.toFixed(1)}×${overlapY.toFixed(1)} canvas units.`,
          { path, hint: 'Zone overlap is legitimate for layered art direction; record the intent in the plan.' },
        );
      }
    }
  }
}

function validateGrid(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  canvas: CanvasConfig | undefined,
): GridConfiguration | undefined {
  const record = readObject(ctx, value, path, 'composition.grid');
  if (!record) return undefined;

  const type = readEnum(ctx, record['type'], `${path}.type`, 'grid.type', GRID_TYPES, CODES.GRID_TYPE_INVALID);
  const columns = readNumber(ctx, record['columns'], `${path}.columns`, 'grid.columns', {
    min: 1,
    max: 48,
    code: CODES.GRID_COLUMNS_INVALID,
  });
  const rows = record['rows'] === undefined
    ? undefined
    : readNumber(ctx, record['rows'], `${path}.rows`, 'grid.rows', { min: 1, max: 48, code: CODES.GRID_ROWS_INVALID });
  const gutter = readNumber(ctx, record['gutter'], `${path}.gutter`, 'grid.gutter', { min: 0, code: CODES.GRID_GUTTER_INVALID });
  const margin = readMargin(ctx, record['margin'], `${path}.margin`);
  const baseline = record['baseline'] === undefined
    ? undefined
    : readNumber(ctx, record['baseline'], `${path}.baseline`, 'grid.baseline', { exclusiveMin: 0, code: CODES.GRID_BASELINE_INVALID });
  const enabled = readBoolean(ctx, record['enabled'], `${path}.enabled`, 'grid.enabled');

  if (margin && canvas) {
    if (margin.left + margin.right >= canvas.width) {
      ctx.bag.error(CODES.GRID_MARGIN_EXCEEDS_CANVAS, `grid.margin left+right (${margin.left + margin.right}) leaves no content width on a ${canvas.width}${canvas.unit} canvas.`, {
        path: `${path}.margin`,
      });
    }
    if (margin.top + margin.bottom >= canvas.height) {
      ctx.bag.error(CODES.GRID_MARGIN_EXCEEDS_CANVAS, `grid.margin top+bottom (${margin.top + margin.bottom}) leaves no content height on a ${canvas.height}${canvas.unit} canvas.`, {
        path: `${path}.margin`,
      });
    }
  }
  if (type === 'baseline' && baseline === undefined) {
    ctx.bag.warning(CODES.GRID_BASELINE_INVALID, 'grid.type is "baseline" but no baseline rhythm is declared.', {
      path: `${path}.baseline`,
      hint: 'Declare a baseline value so text can align to the rhythm.',
    });
  }

  if (type === undefined || columns === undefined || gutter === undefined || margin === undefined || enabled === undefined) {
    return undefined;
  }
  return {
    type,
    columns,
    ...(rows === undefined ? {} : { rows }),
    gutter,
    margin,
    ...(baseline === undefined ? {} : { baseline }),
    enabled,
  };
}

function readMargin(ctx: ReaderContext, value: unknown, path: string): GridConfiguration['margin'] | undefined {
  const record = readObject(ctx, value, path, 'grid.margin', CODES.GRID_MARGIN_INVALID);
  if (!record) return undefined;
  const top = readNumber(ctx, record['top'], `${path}.top`, 'grid.margin.top', { min: 0, code: CODES.GRID_MARGIN_INVALID });
  const right = readNumber(ctx, record['right'], `${path}.right`, 'grid.margin.right', { min: 0, code: CODES.GRID_MARGIN_INVALID });
  const bottom = readNumber(ctx, record['bottom'], `${path}.bottom`, 'grid.margin.bottom', { min: 0, code: CODES.GRID_MARGIN_INVALID });
  const left = readNumber(ctx, record['left'], `${path}.left`, 'grid.margin.left', { min: 0, code: CODES.GRID_MARGIN_INVALID });
  if (top === undefined || right === undefined || bottom === undefined || left === undefined) return undefined;
  return { top, right, bottom, left };
}

function validateConstraints(
  ctx: ReaderContext,
  value: unknown,
  path: string,
): CompositionConstraints | undefined {
  const record = readObject(ctx, value, path, 'composition.constraints', CODES.CONSTRAINTS_INVALID);
  if (!record) return undefined;

  const preserveContent = readBoolean(ctx, record['preserveContent'], `${path}.preserveContent`, 'constraints.preserveContent');
  const allowOverlap = readBoolean(ctx, record['allowOverlap'], `${path}.allowOverlap`, 'constraints.allowOverlap');

  const pairsRaw = readArray(ctx, record['allowedOverlapPairs'], `${path}.allowedOverlapPairs`, 'constraints.allowedOverlapPairs');
  const pairs: Array<[string, string]> = [];
  const seen = new Set<string>();
  if (pairsRaw) {
    pairsRaw.forEach((entry, index) => {
      const pairPath = `${path}.allowedOverlapPairs[${index}]`;
      if (!Array.isArray(entry) || entry.length !== 2) {
        ctx.bag.error(CODES.OVERLAP_PAIR_UNUSABLE, 'An allowed overlap pair must be a two-element array of element IDs.', {
          path: pairPath,
        });
        return;
      }
      const first = entry[0];
      const second = entry[1];
      if (typeof first !== 'string' || typeof second !== 'string') {
        ctx.bag.error(CODES.OVERLAP_PAIR_UNUSABLE, 'Both IDs in an allowed overlap pair must be strings.', { path: pairPath });
        return;
      }
      if (first === second) {
        ctx.bag.error(CODES.OVERLAP_PAIR_SELF, `An element cannot declare overlap with itself ("${first}").`, { path: pairPath });
        return;
      }
      const key = [first, second].sort().join('\u0000');
      if (seen.has(key)) {
        ctx.bag.warning(CODES.OVERLAP_PAIR_UNUSABLE, `Overlap pair "${first}" ↔ "${second}" is declared more than once.`, { path: pairPath });
        return;
      }
      seen.add(key);
      pairs.push([first, second]);
    });
  }

  if (preserveContent === false) {
    ctx.bag.error(
      CODES.PRESERVE_CONTENT_DISABLED,
      'composition.constraints.preserveContent is false, which permits dropping required user content.',
      {
        path: `${path}.preserveContent`,
        hint: 'Required content must never be dropped (DESIGN_ENGINE_SPEC.md §9.4). Set this to true.',
      },
    );
  }
  if (allowOverlap === false && pairs.length > 0) {
    ctx.bag.warning(
      CODES.OVERLAP_PAIRS_CONTRADICT,
      'constraints.allowOverlap is false but allowedOverlapPairs are declared; the pairs will not be honoured.',
      { path: `${path}.allowedOverlapPairs`, hint: 'Set allowOverlap to true for intentional layering, or remove the pairs.' },
    );
  }
  if (allowOverlap === true && pairs.length === 0) {
    ctx.bag.warning(
      CODES.OVERLAP_NOT_DECLARED,
      'constraints.allowOverlap is true with no declared pairs; every overlap in the document becomes an unexplained collision.',
      { path: `${path}.allowedOverlapPairs`, hint: 'Declare each intentional overlap pair so the quality stage can distinguish design from defect.' },
    );
  }

  if (preserveContent === undefined || allowOverlap === undefined || !pairsRaw) return undefined;
  return { preserveContent, allowOverlap, allowedOverlapPairs: pairs.map((pair) => [pair[0], pair[1]] as const) };
}

/** Exposed for the document validator's cross-checks. */
export function allOverlapPairIds(constraints: CompositionConstraints): Set<string> {
  const ids = new Set<string>();
  for (const [a, b] of constraints.allowedOverlapPairs) {
    ids.add(a);
    ids.add(b);
  }
  return ids;
}

