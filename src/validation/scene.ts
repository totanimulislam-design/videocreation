/**
 * Scene-graph validation (`DESIGN_ENGINE_SPEC.md` §13.1).
 *
 * Enforces the document invariants the spec lists for nodes: unique IDs, finite
 * transforms with non-zero scale, per-type required properties (text nodes need
 * text + typography, image nodes need an image asset + placement, path nodes
 * need validated path data, only groups may contain children), asset reference
 * resolution, and bounds/canvas policy.
 *
 * Bounds policy note: an element extending past the canvas is *not* always an
 * error. Intentional bleed and cropped art are legitimate design tools
 * (`DESIGN_PATTERNS_LIBRARY.md` V04, `DESIGN_QUALITY_METRICS.md` §5.1). So the
 * validator distinguishes:
 *   - `bleed`/`unsafe` node metadata opt-outs (declared intent)  → warning
 *   - essential text outside the canvas or safe area            → error
 *   - other overflow                                            → warning
 * Collision detection itself is a Quality Engine concern and is not implemented
 * here; this module only reports declared-vs-undeclared overlap *policy*.
 */

import { CODES } from '../core/diagnostics.ts';
import { isValidId, findDuplicateIds } from '../core/ids.ts';
import { scriptForLanguage, detectScripts, isRtlScript } from '../core/script.ts';
import { MAX_ELEMENTS, MAX_GROUP_DEPTH, OPACITY_MAX, OPACITY_MIN } from '../schema/limits.ts';
import {
  SCENE_NODE_TYPES,
  type CanvasConfig,
  type DesignAsset,
  type ElementStyle,
  type ImagePlacement,
  type SceneGeometry,
  type SceneNode,
  type SceneNodeType,
  type SceneText,
  type SceneTransform,
  type TypographyToken,
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
  type ReaderContext,
} from './primitives.ts';
import { readColor, validateTypographyToken } from './structural.ts';

export interface SceneValidationContext {
  readonly canvas: CanvasConfig | undefined;
  readonly assets: readonly DesignAsset[];
  readonly assetById: ReadonlyMap<string, DesignAsset>;
  readonly shadowTokens: ReadonlySet<string>;
  /** IDs whose overlap is declared intentional in `composition.constraints`. */
  readonly allowedOverlapIds: ReadonlySet<string>;
  /** Collected across the walk so duplicates are reported once. */
  readonly nodeIds: Set<string>;
  readonly allNodeIds: string[];
}

export interface ValidatedScene {
  readonly nodes: readonly SceneNode[];
  /** Every node ID found in the tree, in traversal order (including duplicates). */
  readonly ids: readonly string[];
}

export function validateScene(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  context: SceneValidationContext,
): ValidatedScene | undefined {
  const array = readArray(ctx, value, path, 'elements');
  if (!array) return undefined;
  if (array.length > MAX_ELEMENTS) {
    ctx.bag.error(CODES.BOUNDS_OUTSIDE_CANVAS, `elements contains ${array.length} nodes; the limit is ${MAX_ELEMENTS}.`, { path });
    return undefined;
  }

  const nodes: SceneNode[] = [];
  array.forEach((entry, index) => {
    const node = validateNode(ctx, entry, `${path}[${index}]`, context, 0);
    if (node) nodes.push(node);
  });

  const duplicates = findDuplicateIds(context.allNodeIds);
  for (const duplicate of duplicates) {
    ctx.bag.error(
      CODES.ID_NOT_UNIQUE,
      `element ID "${duplicate.id}" is used ${duplicate.count} times; IDs must be unique within a document.`,
      {
        path: `${path}[${duplicate.indices[1] ?? 0}].id`,
        hint: 'Editing and references are ambiguous while an ID is duplicated.',
      },
    );
  }

  return { nodes, ids: [...context.allNodeIds] };
}

function validateNode(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  context: SceneValidationContext,
  depth: number,
): SceneNode | undefined {
  if (depth > MAX_GROUP_DEPTH) {
    ctx.bag.error(CODES.CHILDREN_NOT_ALLOWED, `Group nesting exceeds the supported depth of ${MAX_GROUP_DEPTH}.`, { path });
    return undefined;
  }

  const record = readObject(ctx, value, path, 'element');
  if (!record) return undefined;

  const id = readString(ctx, record['id'], `${path}.id`, 'element.id', { code: CODES.ID_INVALID });
  if (id !== undefined) {
    if (!isValidId(id)) {
      ctx.bag.error(CODES.ID_INVALID, `element.id ${JSON.stringify(id)} is not a valid stable ID.`, {
        path: `${path}.id`,
        hint: 'Use 1–128 characters from letters, digits, "-", "_", ".", ":" or "/".',
      });
    }
    context.nodeIds.add(id);
    context.allNodeIds.push(id);
  }

  const type = readEnum<SceneNodeType>(ctx, record['type'], `${path}.type`, 'element.type', SCENE_NODE_TYPES, CODES.NODE_TYPE_INVALID);
  const name = readString(ctx, record['name'], `${path}.name`, 'element.name', { code: CODES.NODE_NAME_MISSING });
  const transform = readTransform(ctx, record['transform'], `${path}.transform`);
  const visible = readBoolean(ctx, record['visible'], `${path}.visible`, 'element.visible');
  const locked = readBoolean(ctx, record['locked'], `${path}.locked`, 'element.locked');

  let geometry: SceneGeometry | undefined;
  if (record['geometry'] !== undefined) {
    geometry = readGeometry(ctx, record['geometry'], `${path}.geometry`, type);
  }

  let text: SceneText | undefined;
  if (type === 'text') {
    text = validateText(ctx, record['text'], `${path}.text`, context.canvas);
  } else if (record['text'] !== undefined) {
    ctx.bag.error(CODES.TEXT_MISSING, `element of type "${type}" must not carry a text block.`, { path: `${path}.text` });
  }

  let imagePlacement: ImagePlacement | undefined;
  if (type === 'image') {
    imagePlacement = validateImagePlacement(ctx, record['imagePlacement'], `${path}.imagePlacement`);
  }

  // Asset reference resolution.
  let assetId: string | undefined;
  if (record['assetId'] !== undefined) {
    assetId = readString(ctx, record['assetId'], `${path}.assetId`, 'element.assetId');
    if (assetId !== undefined) {
      const asset = context.assetById.get(assetId);
      if (!asset) {
        ctx.bag.error(CODES.ASSET_NOT_FOUND, `element "${id ?? path}" references undeclared asset "${assetId}".`, {
          path: `${path}.assetId`,
          hint: 'Every asset reference must resolve to an entry in assets[].',
        });
        assetId = undefined;
      } else if (type === 'image' && asset.kind !== 'image') {
        ctx.bag.error(CODES.ASSET_KIND_MISMATCH, `image element "${id ?? path}" references asset "${assetId}" of kind "${asset.kind}".`, {
          path: `${path}.assetId`,
        });
      } else if (type === 'text' && asset.kind !== 'font') {
        ctx.bag.error(CODES.ASSET_KIND_MISMATCH, `text element "${id ?? path}" may only reference a font asset; "${assetId}" is "${asset.kind}".`, {
          path: `${path}.assetId`,
        });
      }
    }
  }
  if (type === 'image' && assetId === undefined && record['assetId'] === undefined) {
    ctx.bag.error(CODES.ASSET_NOT_FOUND, `image element "${id ?? path}" declares no assetId.`, {
      path,
      hint: 'Image nodes must reference a declared image asset.',
    });
  }

  const style = record['style'] === undefined
    ? undefined
    : readStyle(ctx, record['style'], `${path}.style`, context.shadowTokens);

  if (type === 'path') {
    if (typeof record['geometry'] !== 'object' || record['geometry'] === null) {
      ctx.bag.error(CODES.PATH_DATA_MISSING, `path element "${id ?? path}" requires geometry.pathData.`, { path });
    }
    if (geometry?.pathData === undefined && isRecord(record['geometry'])) {
      ctx.bag.error(CODES.PATH_DATA_MISSING, `path element "${id ?? path}" has no geometry.pathData.`, {
        path: `${path}.geometry.pathData`,
      });
    }
    if (typeof record['text'] !== 'undefined') {
      ctx.bag.error(CODES.TEXT_MISSING, 'A path element must not carry text.', { path });
    }
  }

  // Children are only legal on groups.
  let children: SceneNode[] | undefined;
  if (record['children'] !== undefined) {
    if (type !== 'group') {
      ctx.bag.error(CODES.CHILDREN_NOT_ALLOWED, `element of type "${type}" must not contain children; only groups may nest.`, {
        path: `${path}.children`,
      });
    } else {
      const childArray = readArray(ctx, record['children'], `${path}.children`, 'element.children');
      if (childArray) {
        const collected: SceneNode[] = [];
        childArray.forEach((childValue, index) => {
          const child = validateNode(ctx, childValue, `${path}.children[${index}]`, context, depth + 1);
          if (child) collected.push(child);
        });
        children = collected;
      }
    }
  } else if (type === 'group') {
    ctx.bag.error(CODES.GROUP_CHILDREN_MISSING, `group element "${id ?? path}" declares no children.`, {
      path: `${path}.children`,
      hint: 'An empty group cannot be rendered or edited meaningfully.',
    });
  }

  // Bounds / safe-area policy (only possible when geometry and transform exist).
  if (geometry && transform && type !== undefined && context.canvas) {
    applyBoundsPolicy(ctx, { id: id ?? path, type, geometry, transform, metadata: record['metadata'] }, path, context);
  }

  if (
    id === undefined || type === undefined || name === undefined || transform === undefined ||
    visible === undefined || locked === undefined
  ) {
    return undefined;
  }

  const metadata = readMetadata(ctx, record['metadata'], `${path}.metadata`);

  return {
    id,
    type,
    name,
    transform,
    ...(geometry === undefined ? {} : { geometry }),
    ...(text === undefined ? {} : { text }),
    ...(imagePlacement === undefined ? {} : { imagePlacement }),
    ...(assetId === undefined ? {} : { assetId }),
    ...(style === undefined ? {} : { style }),
    visible,
    locked,
    ...(children === undefined ? {} : { children }),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function readTransform(ctx: ReaderContext, value: unknown, path: string): SceneTransform | undefined {
  const record = readObject(ctx, value, path, 'element.transform', CODES.TRANSFORM_INVALID);
  if (!record) return undefined;
  const x = readNumber(ctx, record['x'], `${path}.x`, 'transform.x', { code: CODES.TRANSFORM_INVALID });
  const y = readNumber(ctx, record['y'], `${path}.y`, 'transform.y', { code: CODES.TRANSFORM_INVALID });
  const scaleX = readNumber(ctx, record['scaleX'], `${path}.scaleX`, 'transform.scaleX', { code: CODES.TRANSFORM_INVALID });
  const scaleY = readNumber(ctx, record['scaleY'], `${path}.scaleY`, 'transform.scaleY', { code: CODES.TRANSFORM_INVALID });
  const rotation = readNumber(ctx, record['rotation'], `${path}.rotation`, 'transform.rotation', { code: CODES.TRANSFORM_INVALID });

  if (scaleX === 0 || scaleY === 0) {
    ctx.bag.error(CODES.SCALE_ZERO, 'transform scale must be non-zero; a zero scale makes the element invisible and unrecoverable in the editor.', {
      path: `${path}.scaleX`,
    });
    return undefined;
  }
  if (x === undefined || y === undefined || scaleX === undefined || scaleY === undefined || rotation === undefined) {
    return undefined;
  }
  return { x, y, scaleX, scaleY, rotation };
}

function readGeometry(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  type: SceneNodeType | undefined,
): SceneGeometry | undefined {
  const record = readObject(ctx, value, path, 'element.geometry', CODES.GEOMETRY_INVALID);
  if (!record) return undefined;
  const width = readNumber(ctx, record['width'], `${path}.width`, 'geometry.width', { exclusiveMin: 0, code: CODES.GEOMETRY_INVALID });
  const height = readNumber(ctx, record['height'], `${path}.height`, 'geometry.height', { exclusiveMin: 0, code: CODES.GEOMETRY_INVALID });
  const shape = record['shape'] === undefined
    ? undefined
    : readEnum(ctx, record['shape'], `${path}.shape`, 'geometry.shape', ['rect', 'ellipse', 'polygon'] as const, CODES.GEOMETRY_INVALID);

  let points: Array<{ x: number; y: number }> | undefined;
  if (record['points'] !== undefined) {
    const pointsRaw = readArray(ctx, record['points'], `${path}.points`, 'geometry.points');
    if (pointsRaw) {
      if (shape !== 'polygon') {
        ctx.bag.warning(CODES.GEOMETRY_INVALID, 'geometry.points is only meaningful for a polygon shape.', { path: `${path}.points` });
      }
      if (pointsRaw.length < 3) {
        ctx.bag.error(CODES.GEOMETRY_INVALID, `geometry.points must contain at least 3 vertices; found ${pointsRaw.length}.`, {
          path: `${path}.points`,
        });
      }
      const collectedPoints: Array<{ x: number; y: number }> = [];
      pointsRaw.forEach((point, index) => {
        const pointRecord = readObject(ctx, point, `${path}.points[${index}]`, 'geometry point', CODES.GEOMETRY_INVALID);
        if (!pointRecord) return;
        const px = readNumber(ctx, pointRecord['x'], `${path}.points[${index}].x`, 'point.x', { code: CODES.GEOMETRY_INVALID });
        const py = readNumber(ctx, pointRecord['y'], `${path}.points[${index}].y`, 'point.y', { code: CODES.GEOMETRY_INVALID });
        if (px !== undefined && py !== undefined) collectedPoints.push({ x: px, y: py });
      });
      points = collectedPoints;
    }
  }

  const pathData = record['pathData'] === undefined
    ? undefined
    : readString(ctx, record['pathData'], `${path}.pathData`, 'geometry.pathData', { code: CODES.PATH_DATA_INVALID });
  if (pathData !== undefined) {
    const problem = findUnsafePathData(pathData);
    if (problem) {
      ctx.bag.error(CODES.PATH_DATA_INVALID, `geometry.pathData rejected: ${problem}.`, {
        path: `${path}.pathData`,
        hint: 'Only SVG path commands (M m L l H h V v C c S s Q q T t A a Z z) with numeric arguments are accepted.',
      });
      return undefined;
    }
    if (type !== 'path' && type !== 'shape') {
      ctx.bag.warning(CODES.PATH_DATA_INVALID, `geometry.pathData on a "${type}" element is unusual; custom geometry belongs on path or shape nodes.`, {
        path,
      });
    }
  }

  if (width === undefined || height === undefined) return undefined;
  return {
    width,
    height,
    ...(shape === undefined ? {} : { shape }),
    ...(points === undefined ? {} : { points }),
    ...(pathData === undefined ? {} : { pathData }),
  };
}

/**
 * Rejects SVG path data that is not purely geometric.
 *
 * Path data is stored as data, never markup (`DESIGN_ENGINE_SPEC.md` §13.1,
 * §25). Anything outside the path grammar — element tags, entities, `url(`,
 * script-like content, unbalanced quotes — is refused outright rather than
 * "cleaned", because silently rewriting user geometry is worse than rejecting it.
 */
export function findUnsafePathData(pathData: string): string | undefined {
  if (pathData.trim().length === 0) return 'path data is empty';
  if (/[<>]/.test(pathData)) return 'contains markup characters';
  if (/&[a-zA-Z#]/.test(pathData)) return 'contains an entity reference';
  if (/url\s*\(/i.test(pathData)) return 'contains a url() reference';
  if (/["'`]/.test(pathData)) return 'contains quote characters';
  const withoutCommands = pathData.replace(/[MmLlHhVvCcSsQqTtAaZz]/g, ' ');
  if (/[A-Za-z]/.test(withoutCommands.replace(/[eE]/g, ''))) {
    return 'contains tokens that are not SVG path commands';
  }
  if (!/^[\sMmLlHhVvCcSsQqTtAaZz0-9eE.,+-]*$/.test(pathData)) {
    return 'contains characters outside the path grammar';
  }
  if (!/^\s*[Mm]/.test(pathData)) return 'does not begin with a moveto command';
  return undefined;
}

function validateText(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  canvas: CanvasConfig | undefined,
): SceneText | undefined {
  const record = readObject(ctx, value, path, 'element.text', CODES.TEXT_MISSING);
  if (!record) return undefined;

  const content = readString(ctx, record['content'], `${path}.content`, 'text.content', { code: CODES.TEXT_CONTENT_EMPTY });
  const typography = record['typography'] === undefined
    ? (ctx.bag.error(CODES.REQUIRED, 'text.typography is required for text nodes.', { path: `${path}.typography` }), undefined)
    : validateTypographyToken(ctx, record['typography'], `${path}.typography`, 'text.typography', canvas);

  const language = record['language'] === undefined
    ? undefined
    : readString(ctx, record['language'], `${path}.language`, 'text.language');

  const direction = record['direction'] === undefined
    ? undefined
    : readEnum(ctx, record['direction'], `${path}.direction`, 'text.direction', ['ltr', 'rtl', 'auto'] as const, CODES.TEXT_DIRECTION_INVALID);

  // Direction vs. language consistency. Per spec §6.4/§9.6 each run keeps its own
  // direction, so a conflict is an error (it would render shaped text backwards),
  // while `auto` defers to script detection and is always acceptable.
  if (language !== undefined && direction !== undefined && direction !== 'auto') {
    const info = scriptForLanguage(language);
    if (info) {
      const expectedRtl = isRtlScript(info.script);
      if ((direction === 'rtl') !== expectedRtl) {
        ctx.bag.error(
          CODES.TEXT_DIRECTION_CONFLICT,
          `text.direction "${direction}" contradicts language "${language}" (${info.script} is ${expectedRtl ? 'RTL' : 'LTR'}).`,
          {
            path: `${path}.direction`,
            hint: 'Set the direction from the language, or use "auto". Never reverse strings to fake direction.',
          },
        );
      }
    }
  } else if (content !== undefined && direction !== undefined && direction !== 'auto' && language === undefined) {
    const detected = detectScripts(content);
    if (detected.length === 1) {
      const only = detected[0];
      if (only !== 'unknown') {
        const expectedRtl = only === 'arabic' || only === 'urdu';
        if ((direction === 'rtl') !== expectedRtl) {
          ctx.bag.warning(
            CODES.TEXT_DIRECTION_CONFLICT,
            `text.direction "${direction}" disagrees with the script detected in the content (${only}).`,
            { path: `${path}.direction`, hint: 'Add an explicit language or use "auto".' },
          );
        }
      }
    }
  }

  if (content === undefined || typography === undefined) return undefined;
  return {
    content,
    typography,
    ...(language === undefined ? {} : { language }),
    ...(direction === undefined ? {} : { direction }),
  };
}

function validateImagePlacement(ctx: ReaderContext, value: unknown, path: string): ImagePlacement | undefined {
  const record = value === undefined
    ? (ctx.bag.error(CODES.IMAGE_PLACEMENT_MISSING, 'image elements require imagePlacement.', { path }), undefined)
    : readObject(ctx, value, path, 'element.imagePlacement', CODES.IMAGE_PLACEMENT_MISSING);
  if (!record) return undefined;

  const fit = readEnum(ctx, record['fit'], `${path}.fit`, 'imagePlacement.fit', ['contain', 'cover', 'stretch'] as const, CODES.IMAGE_PLACEMENT_MISSING);

  let crop: { x: number; y: number; width: number; height: number } | undefined;
  if (record['crop'] !== undefined) {
    const cropRecord = readObject(ctx, record['crop'], `${path}.crop`, 'imagePlacement.crop', CODES.IMAGE_CROP_INVALID);
    if (cropRecord) {
      const x = readNumber(ctx, cropRecord['x'], `${path}.crop.x`, 'crop.x', { min: 0, max: 1, code: CODES.IMAGE_CROP_INVALID });
      const y = readNumber(ctx, cropRecord['y'], `${path}.crop.y`, 'crop.y', { min: 0, max: 1, code: CODES.IMAGE_CROP_INVALID });
      const width = readNumber(ctx, cropRecord['width'], `${path}.crop.width`, 'crop.width', {
        exclusiveMin: 0,
        max: 1,
        code: CODES.IMAGE_CROP_INVALID,
      });
      const height = readNumber(ctx, cropRecord['height'], `${path}.crop.height`, 'crop.height', {
        exclusiveMin: 0,
        max: 1,
        code: CODES.IMAGE_CROP_INVALID,
      });
      if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
        if (x + width > 1 + 1e-9 || y + height > 1 + 1e-9) {
          ctx.bag.error(CODES.IMAGE_CROP_INVALID, 'imagePlacement.crop extends beyond the normalized source rectangle (0..1).', {
            path: `${path}.crop`,
          });
        } else {
          crop = { x, y, width, height };
        }
      }
    }
  }

  if (fit === undefined) return undefined;
  return { fit, ...(crop === undefined ? {} : { crop }) };
}

function readStyle(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  shadowTokens: ReadonlySet<string>,
): ElementStyle | undefined {
  const record = readObject(ctx, value, path, 'element.style', CODES.STYLE_INVALID);
  if (!record) return undefined;

  const fill = record['fill'] === undefined ? undefined : readColor(ctx, record['fill'], `${path}.fill`, 'style.fill');
  const stroke = record['stroke'] === undefined ? undefined : readColor(ctx, record['stroke'], `${path}.stroke`, 'style.stroke');
  const strokeWidth = record['strokeWidth'] === undefined
    ? undefined
    : readNumber(ctx, record['strokeWidth'], `${path}.strokeWidth`, 'style.strokeWidth', { min: 0, code: CODES.STROKE_WIDTH_INVALID });
  const opacity = record['opacity'] === undefined
    ? undefined
    : readNumber(ctx, record['opacity'], `${path}.opacity`, 'style.opacity', { min: OPACITY_MIN, max: OPACITY_MAX, code: CODES.STYLE_OPACITY_INVALID });
  const radius = record['radius'] === undefined
    ? undefined
    : readNumber(ctx, record['radius'], `${path}.radius`, 'style.radius', { min: 0, code: CODES.STYLE_INVALID });
  const blendMode = record['blendMode'] === undefined
    ? undefined
    : readEnum(ctx, record['blendMode'], `${path}.blendMode`, 'style.blendMode', ['normal', 'multiply', 'screen', 'overlay'] as const, CODES.BLEND_MODE_INVALID);

  let shadowToken: string | undefined;
  if (record['shadowToken'] !== undefined) {
    shadowToken = readString(ctx, record['shadowToken'], `${path}.shadowToken`, 'style.shadowToken');
    if (shadowToken !== undefined && !shadowTokens.has(shadowToken)) {
      ctx.bag.error(CODES.SHADOW_TOKEN_NOT_FOUND, `style.shadowToken "${shadowToken}" is not declared in designTokens.shadows.`, {
        path: `${path}.shadowToken`,
        hint: `Declared shadows: ${[...shadowTokens].join(', ') || '(none)'}.`,
      });
      shadowToken = undefined;
    }
  }

  return {
    ...(fill === undefined ? {} : { fill }),
    ...(stroke === undefined ? {} : { stroke }),
    ...(strokeWidth === undefined ? {} : { strokeWidth }),
    ...(opacity === undefined ? {} : { opacity }),
    ...(radius === undefined ? {} : { radius }),
    ...(shadowToken === undefined ? {} : { shadowToken }),
    ...(blendMode === undefined ? {} : { blendMode }),
  };
}

function readMetadata(
  ctx: ReaderContext,
  value: unknown,
  path: string,
): Record<string, string | number | boolean> | undefined {
  if (value === undefined) return undefined;
  const record = readObject(ctx, value, path, 'element.metadata');
  if (!record) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === 'string' || typeof entry === 'boolean' || isFiniteNumber(entry)) {
      out[key] = entry;
      continue;
    }
    ctx.bag.warning(CODES.UNEXPECTED_VALUE, `metadata["${key}"] must be a string, number or boolean; the entry was dropped.`, {
      path: `${path}.${key}`,
    });
  }
  return out;
}

/**
 * Applies the canvas/safe-area bounds policy to one node.
 *
 * A node may opt into intentional bleed with `metadata.intentionalBleed === true`
 * or `metadata.essential === false`. Essential text outside the canvas or safe
 * area is an error per `DESIGN_QUALITY_METRICS.md` §4 (layout failure).
 */
function applyBoundsPolicy(
  ctx: ReaderContext,
  node: { id: string; type: SceneNodeType; geometry: SceneGeometry; transform: SceneTransform; metadata: unknown },
  path: string,
  context: SceneValidationContext,
): void {
  const canvas = context.canvas;
  if (!canvas) return;

  const { x, y } = node.transform;
  const scaledWidth = node.geometry.width * Math.abs(node.transform.scaleX);
  const scaledHeight = node.geometry.height * Math.abs(node.transform.scaleY);
  const right = x + scaledWidth;
  const bottom = y + scaledHeight;
  const tolerance = 1e-6;

  const metadata = isRecord(node.metadata) ? node.metadata : {};
  const intentionalBleed = metadata['intentionalBleed'] === true;
  const essential = node.type === 'text' ? metadata['essential'] !== false : metadata['essential'] === true;

  const outsideCanvas =
    x < -tolerance || y < -tolerance || right > canvas.width + tolerance || bottom > canvas.height + tolerance;
  const safe = canvas.safeArea;
  const outsideSafe =
    safe !== undefined &&
    (x < safe.left - tolerance ||
      y < safe.top - tolerance ||
      right > canvas.width - safe.right + tolerance ||
      bottom > canvas.height - safe.bottom + tolerance);

  if (outsideCanvas) {
    const message = `element "${node.id}" bounds (${round(x)}, ${round(y)}) → (${round(right)}, ${round(bottom)}) extend outside the canvas (${canvas.width}×${canvas.height} ${canvas.unit}).`;
    if (intentionalBleed) {
      ctx.bag.warning(CODES.BOUNDS_OUTSIDE_CANVAS, `${message} Declared as intentional bleed.`, { path });
    } else if (essential) {
      ctx.bag.error(CODES.BOUNDS_OUTSIDE_CANVAS, `${message} Essential content is clipped.`, {
        path,
        hint: 'Move the element inside the canvas, or mark metadata.intentionalBleed when cropping is deliberate.',
      });
    } else {
      ctx.bag.warning(CODES.BOUNDS_OUTSIDE_CANVAS, `${message} Not declared as intentional.`, {
        path,
        hint: 'Set metadata.intentionalBleed = true for deliberate cropping.',
      });
    }
    return;
  }

  if (outsideSafe) {
    if (intentionalBleed) return;
    if (essential) {
      ctx.bag.error(
        CODES.BOUNDS_OUTSIDE_SAFE_AREA,
        `element "${node.id}" leaves the declared safe area (${safe?.top}/${safe?.right}/${safe?.bottom}/${safe?.left} ${canvas.unit}).`,
        { path, hint: 'Essential content must stay inside the safe area.' },
      );
    } else {
      ctx.bag.warning(CODES.BOUNDS_OUTSIDE_SAFE_AREA, `element "${node.id}" extends into the safe-area margin.`, { path });
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Re-exported for the document validator. */
export { describeType, noteUnknownKeys };
