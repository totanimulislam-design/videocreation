/**
 * Design plan (document) validation — the single entry point the pipeline uses.
 *
 * Contract (`DESIGN_ENGINE_SPEC.md` §21, §23.3, `AGENTS.md` §2): every AI
 * response must pass schema validation before entering the Design Engine, and
 * invalid plans must not reach the renderer. This module is that gate.
 *
 * Order of checks is deliberate:
 *   1. document envelope (id, name, schema version, revision, timestamps)
 *   2. canvas + units  (everything after this depends on the unit)
 *   3. design tokens   (typography and shadow references)
 *   4. art direction   (stable style/strategy IDs)
 *   5. assets          (declared references)
 *   6. scene graph     (nodes, transforms, geometry, asset resolution, bounds)
 *   7. composition     (patterns, hierarchy, zones → resolved against nodes/slots)
 *   8. cross-checks    (asset usage, overlap declarations, content preservation)
 *
 * Steps 6 and 7 need each other's information (zones reference node IDs; nodes
 * reference the declared overlap pairs), so node IDs are collected first and the
 * composition is validated against them.
 */

import { CODES, DiagnosticBag, toResult, type ValidationResult } from '../core/diagnostics.ts';
import { isValidId } from '../core/ids.ts';
import { isSupportedLanguage } from '../core/script.ts';
import { isDesignCategoryId, type DesignCategoryId } from '../knowledge/ids.ts';
import { latestSupportedSchemaVersion, parseSchemaVersion, SUPPORTED_SCHEMA_VERSIONS, isSupportedSchemaVersion } from '../schema/version.ts';
import { OUTPUT_FORMATS, type DesignAsset, type DesignBrief, type DesignDocument, type SceneNode, type Unit } from '../schema/types.ts';
import type { DesignConstraints } from '../schema/types.ts';
import { allOverlapPairIds, validateComposition } from './composition.ts';
import { isRecord, noteUnknownKeys, readArray, readNumber, readObject, readString, type ReaderContext } from './primitives.ts';
import { validateScene } from './scene.ts';
import {
  validateArtDirection,
  validateAssets,
  validateCanvas,
  validateDesignTokens,
  validateGuides,
  validateMetadata,
  validateSettings,
} from './structural.ts';

export type { DesignDocument };

export interface ValidatePlanOptions {
  /**
   * The brief this plan claims to implement. When supplied, cross-checks confirm
   * the plan's canvas, category and content slots agree with the brief.
   *
   * Passing the brief is strongly recommended: without it, content preservation
   * cannot be verified and the result says so through a warning.
   */
  readonly brief?: DesignBrief;
  /** Content slot paths present in the brief (defaults to being derived from `brief`). */
  readonly contentSlots?: readonly string[];
  /** Treat missing schema-version support as a warning instead of an error. Never used for parsing. */
  readonly allowUnknownSchemaVersion?: boolean;
}

export interface DesignPlanValidationReport {
  readonly result: ValidationResult<DesignDocument>;
  /**
   * `true` when the document may proceed to the Design Engine / renderer.
   * Identical to `result.ok` today; named separately so call sites express intent
   * and so future policy (e.g. blocking on unresolved critical warnings) has one
   * place to change.
   */
  readonly admitted: boolean;
  /** Machine-readable summary for logs and the quality report. */
  readonly summary: {
    readonly errorCount: number;
    readonly warningCount: number;
    readonly codes: Readonly<Record<string, number>>;
  };
}

/** Validates an untrusted design plan. Never throws for malformed input. */
export function validateDesignPlan(input: unknown, options: ValidatePlanOptions = {}): DesignPlanValidationReport {
  const bag = new DiagnosticBag();
  const ctx: ReaderContext = { bag };

  const record = readObject(ctx, input, '', 'design plan');
  if (!record) return report(bag);

  // ---- 1. Envelope -------------------------------------------------------
  const id = readString(ctx, record['id'], 'id', 'document.id', { code: CODES.DOCUMENT_ID_INVALID });
  if (id !== undefined && !isValidId(id)) {
    bag.error(CODES.DOCUMENT_ID_INVALID, `document.id ${JSON.stringify(id)} is not a valid stable ID.`, { path: 'id' });
  }
  const name = readString(ctx, record['name'], 'name', 'document.name', { code: CODES.DOCUMENT_NAME_MISSING });
  const schemaVersion = readSchemaVersion(ctx, record['schemaVersion'], options);
  const version = readNumber(ctx, record['version'], 'version', 'document.version', {
    min: 1,
    code: CODES.DOCUMENT_VERSION_INVALID,
  });
  const metadata = validateMetadata(ctx, record['metadata'], 'metadata');

  // ---- 2. Canvas ---------------------------------------------------------
  const canvas: ReturnType<typeof validateCanvas> = record['canvas'] === undefined
    ? (bag.error(CODES.REQUIRED, 'canvas is required.', { path: 'canvas' }), undefined)
    : validateCanvas(ctx, record['canvas'], 'canvas');

  // ---- 3. Tokens ---------------------------------------------------------
  const designTokens: ReturnType<typeof validateDesignTokens> = record['designTokens'] === undefined
    ? (bag.error(CODES.REQUIRED, 'designTokens is required.', { path: 'designTokens' }), undefined)
    : validateDesignTokens(ctx, record['designTokens'], 'designTokens', canvas);

  // ---- 4. Art direction --------------------------------------------------
  const artDirection: ReturnType<typeof validateArtDirection> = record['artDirection'] === undefined
    ? (bag.error(CODES.REQUIRED, 'artDirection is required.', { path: 'artDirection' }), undefined)
    : validateArtDirection(ctx, record['artDirection'], 'artDirection');

  // ---- 5. Assets ---------------------------------------------------------
  const assets: DesignAsset[] | undefined = record['assets'] === undefined
    ? (bag.error(CODES.REQUIRED, 'assets is required (use [] when none are used).', { path: 'assets' }), undefined)
    : validateAssets(ctx, record['assets'], 'assets');

  const assetById = new Map<string, DesignAsset>();
  if (assets) {
    for (const asset of assets) {
      if (assetById.has(asset.id)) {
        bag.error(CODES.ID_NOT_UNIQUE, `asset.id "${asset.id}" is declared more than once.`, { path: 'assets' });
      }
      assetById.set(asset.id, asset);
    }
  }
  const shadowTokens = new Set(Object.keys(designTokens?.shadows ?? {}));

  // A canvas background image is an asset reference like any other; it must
  // resolve, and it must point at an image (DESIGN_ENGINE_SPEC.md §3.2, §13.1).
  if (canvas && canvas.background.type === 'image') {
    const backgroundAsset = assetById.get(canvas.background.assetId);
    if (!backgroundAsset) {
      bag.error(CODES.ASSET_NOT_FOUND, `canvas.background references undeclared asset "${canvas.background.assetId}".`, {
        path: 'canvas.background.assetId',
      });
    } else if (backgroundAsset.kind !== 'image') {
      bag.error(CODES.ASSET_KIND_MISMATCH, `canvas.background must reference an image asset; "${backgroundAsset.id}" is "${backgroundAsset.kind}".`, {
        path: 'canvas.background.assetId',
      });
    }
  }

  // Composition constraints are needed before the scene walk for overlap policy,
  // so the constraint block is read once, cheaply, up front.
  const rawConstraints = isRecord(record['composition']) ? record['composition']['constraints'] : undefined;
  const allowedOverlapIds = readOverlapIds(rawConstraints);

  // ---- 6. Scene ----------------------------------------------------------
  const sceneCtx = {
    canvas,
    assets: assets ?? [],
    assetById,
    shadowTokens,
    allowedOverlapIds,
    nodeIds: new Set<string>(),
    allNodeIds: [] as string[],
  };
  const scene = record['elements'] === undefined
    ? (bag.error(CODES.REQUIRED, 'elements is required (use [] for an empty document).', { path: 'elements' }), undefined)
    : validateScene(ctx, record['elements'], 'elements', sceneCtx);

  // ---- 7. Composition ----------------------------------------------------
  const contentSlots = new Set<string>(options.contentSlots ?? deriveContentSlots(options.brief));
  const composition = record['composition'] === undefined
    ? (bag.error(CODES.REQUIRED, 'composition is required.', { path: 'composition' }), undefined)
    : validateComposition(ctx, record['composition'], 'composition', {
        canvas,
        nodeIds: sceneCtx.nodeIds,
        contentSlots,
        category: metadataCategory(metadata),
        documentLanguages: options.brief?.requirements.languages ?? [],
        zoneIds: new Set<string>(),
      });

  // ---- 8. Guides, settings, cross-checks --------------------------------
  const guides = record['guides'] === undefined
    ? (bag.error(CODES.REQUIRED, 'guides is required (use [] when none).', { path: 'guides' }), undefined)
    : validateGuides(ctx, record['guides'], 'guides');
  if (guides) {
    const seen = new Set<string>();
    for (const guide of guides) {
      if (seen.has(guide.id)) bag.error(CODES.ID_NOT_UNIQUE, `guide.id "${guide.id}" is declared more than once.`, { path: 'guides' });
      seen.add(guide.id);
    }
  }
  const settings = record['settings'] === undefined
    ? (bag.error(CODES.REQUIRED, 'settings is required (use {} when unused).', { path: 'settings' }), undefined)
    : validateSettings(ctx, record['settings'], 'settings');

  noteUnknownKeys(ctx, record, ['id', 'name', 'schemaVersion', 'version', 'metadata', 'canvas', 'designTokens', 'artDirection', 'composition', 'elements', 'assets', 'guides', 'settings'], '', 'design plan');

  if (scene && assets) checkAssetUsage(ctx, scene.nodes, assets, canvas);
  if (composition && !options.brief) {
    bag.warning(
      CODES.BRIEF_CONTENT_MISSING,
      'No brief was supplied, so content preservation could not be verified for this plan.',
      { path: '', hint: 'Validate with { brief } to confirm hierarchy slots map to real user content.' },
    );
  }
  if (options.brief) {
    checkBriefConsistency(ctx, options.brief, canvas, metadataCategory(metadata), composition?.constraints);
  }

  const complete =
    id !== undefined && name !== undefined && schemaVersion !== undefined && version !== undefined &&
    metadata !== undefined && canvas !== undefined && designTokens !== undefined && artDirection !== undefined &&
    assets !== undefined && scene !== undefined && composition !== undefined && guides !== undefined &&
    settings !== undefined;

  if (!complete) return report(bag);

  const document: DesignDocument = {
    id,
    name,
    schemaVersion,
    version,
    metadata,
    canvas,
    designTokens,
    artDirection,
    composition,
    elements: scene.nodes,
    assets,
    guides,
    settings,
  };

  return report(bag, document);
}

function report(bag: DiagnosticBag, value?: DesignDocument): DesignPlanValidationReport {
  const result = toResult(bag, value);
  const codes: Record<string, number> = {};
  for (const diagnostic of [...result.errors, ...result.warnings]) {
    codes[diagnostic.code] = (codes[diagnostic.code] ?? 0) + 1;
  }
  return Object.freeze({
    result,
    admitted: result.ok,
    summary: Object.freeze({
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      codes: Object.freeze(codes),
    }),
  });
}

function readSchemaVersion(ctx: ReaderContext, value: unknown, options: ValidatePlanOptions): string | undefined {
  const text = readString(ctx, value, 'schemaVersion', 'document.schemaVersion', { code: CODES.SCHEMA_VERSION_MISSING });
  if (text === undefined) return undefined;

  if (!parseSchemaVersion(text)) {
    ctx.bag.error(CODES.SCHEMA_VERSION_MALFORMED, `schemaVersion ${JSON.stringify(text)} is not a semantic version (expected MAJOR.MINOR.PATCH).`, {
      path: 'schemaVersion',
      hint: `Current contract version: ${latestSupportedSchemaVersion()}.`,
    });
    return undefined;
  }
  if (!isSupportedSchemaVersion(text)) {
    if (options.allowUnknownSchemaVersion === true) {
      ctx.bag.warning(CODES.SCHEMA_VERSION_UNSUPPORTED, `schemaVersion "${text}" is not in the supported set (${SUPPORTED_SCHEMA_VERSIONS.join(', ')}); validation proceeds best-effort.`, {
        path: 'schemaVersion',
      });
      return text;
    }
    ctx.bag.error(CODES.SCHEMA_VERSION_UNSUPPORTED, `schemaVersion "${text}" is not supported by this build (supported: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}).`, {
      path: 'schemaVersion',
      hint: 'Migrate the document forward rather than reading it optimistically.',
    });
    return undefined;
  }
  if (text !== latestSupportedSchemaVersion()) {
    ctx.bag.warning(CODES.SCHEMA_VERSION_OUTDATED, `schemaVersion "${text}" is supported but older than ${latestSupportedSchemaVersion()}.`, {
      path: 'schemaVersion',
      hint: 'A forward migration is available; reading still works.',
    });
  }
  return text;
}

function metadataCategory(metadata: { category: string } | undefined): DesignCategoryId | undefined {
  if (!metadata) return undefined;
  return isDesignCategoryId(metadata.category) ? metadata.category : undefined;
}

/** Derives hierarchy-addressable slot paths from a brief's content. */
export function deriveContentSlots(brief: DesignBrief | undefined): string[] {
  if (!brief) return [];
  const slots: string[] = [];
  if (brief.content.headline !== undefined) slots.push('headline');
  if (brief.content.subheadline !== undefined) slots.push('subheadline');
  brief.content.body.forEach((_, index) => slots.push(`body/${index}`));
  brief.content.details.forEach((_, index) => slots.push(`details/${index}`));
  if (brief.content.cta !== undefined) slots.push('cta');
  // Fixed slots are always addressable so a plan may rank an empty-content
  // slot for an intentional placeholder without a spurious error.
  for (const fixed of ['headline', 'subheadline', 'cta', 'body', 'details']) {
    if (!slots.includes(fixed)) slots.push(fixed);
  }
  return slots;
}

function readOverlapIds(value: unknown): ReadonlySet<string> {
  const ids = new Set<string>();
  if (!isRecord(value)) return ids;
  const pairs = value['allowedOverlapPairs'];
  if (!Array.isArray(pairs)) return ids;
  for (const pair of pairs) {
    if (Array.isArray(pair)) {
      for (const id of pair) if (typeof id === 'string') ids.add(id);
    }
  }
  return ids;
}

/**
 * Reports assets that are declared but never referenced.
 *
 * Not an error: a plan may legitimately carry a font for a fallback, or an asset
 * that a later stage will bind. It is worth surfacing because unused assets
 * usually indicate a broken reference elsewhere.
 */
function checkAssetUsage(
  ctx: ReaderContext,
  nodes: readonly SceneNode[],
  assets: readonly DesignAsset[],
  canvas: { background: { type: string; assetId?: string } } | undefined,
): void {
  const used = new Set<string>();
  const walk = (list: readonly SceneNode[]): void => {
    for (const node of list) {
      if (node.assetId !== undefined) used.add(node.assetId);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  if (canvas && canvas.background.type === 'image' && canvas.background.assetId !== undefined) {
    used.add(canvas.background.assetId);
  }

  for (const asset of assets) {
    if (!used.has(asset.id)) {
      ctx.bag.warning(CODES.ASSET_UNUSED, `asset "${asset.id}" is declared but never referenced.`, {
        path: 'assets',
        hint: 'Remove unused assets or check for a broken reference.',
      });
    }
  }

  // Font coverage: a text node whose family is not backed by a font asset is a
  // licensing/availability risk that must be visible, not assumed away.
  const fontAssets = assets.filter((asset) => asset.kind === 'font');
  const textFamilies = new Set<string>();
  const collectFamilies = (list: readonly SceneNode[]): void => {
    for (const node of list) {
      if (node.type === 'text' && node.text) textFamilies.add(node.text.typography.fontFamily);
      if (node.children) collectFamilies(node.children);
    }
  };
  collectFamilies(nodes);
  if (textFamilies.size > 0 && fontAssets.length === 0) {
    ctx.bag.warning(
      CODES.FONT_ASSET_MISSING,
      `the document uses ${textFamilies.size} font famil${textFamilies.size === 1 ? 'y' : 'ies'} (${[...textFamilies].join(', ')}) but declares no font assets.`,
      { path: 'assets', hint: 'Text measurement and export depend on resolvable font files.' },
    );
  }
}

/**
 * Cross-checks the plan against the brief it claims to implement.
 *
 * These are hard failures when the brief is authoritative: a plan for a
 * different canvas or category is not the requested design, and silently
 * shipping it would misrepresent the result.
 */
function checkBriefConsistency(
  ctx: ReaderContext,
  brief: DesignBrief,
  canvas: { width: number; height: number; unit: Unit } | undefined,
  category: DesignCategoryId | undefined,
  constraints: DesignConstraints | undefined,
): void {
  if (canvas) {
    if (
      canvas.width !== brief.requirements.width ||
      canvas.height !== brief.requirements.height ||
      canvas.unit !== brief.requirements.unit
    ) {
      ctx.bag.error(
        CODES.BRIEF_CANVAS_MISMATCH,
        `canvas is ${canvas.width}×${canvas.height}${canvas.unit} but the brief requires ${brief.requirements.width}×${brief.requirements.height}${brief.requirements.unit}.`,
        { path: 'canvas', hint: 'The plan must use the brief canvas; never convert physical size implicitly.' },
      );
    }
  }
  if (category !== undefined && brief.category !== 'unspecified' && category !== brief.category) {
    ctx.bag.error(
      CODES.BRIEF_CATEGORY_MISMATCH,
      `metadata.category "${category}" does not match the brief category "${brief.category}".`,
      { path: 'metadata.category' },
    );
  }
  if (constraints && !constraints.preserveContent) {
    ctx.bag.error(CODES.PRESERVE_CONTENT_DISABLED, 'The plan does not preserve required brief content.', {
      path: 'composition.constraints.preserveContent',
    });
  }
}

/** Validates just a brief object (structure only, no parsing). */
export function validateDesignBriefDocument(brief: DesignBrief): ValidationResult<DesignBrief> {
  const bag = new DiagnosticBag();
  const ctx: ReaderContext = { bag };
  const record = readObject(ctx, brief, '', 'design brief');
  if (!record) return toResult<DesignBrief>(bag, undefined);

  readString(ctx, record['category'], 'category', 'brief.category');
  readString(ctx, record['objective'], 'objective', 'brief.objective', { allowEmpty: true });
  readArray(ctx, record['audience'], 'audience', 'brief.audience');

  const brand = readObject(ctx, record['brand'], 'brand', 'brief.brand');
  if (brand) {
    if (brand['name'] !== undefined) readString(ctx, brand['name'], 'brand.name', 'brief.brand.name');
    if (brand['colors'] !== undefined) {
      const colors = readArray(ctx, brand['colors'], 'brand.colors', 'brief.brand.colors');
      colors?.forEach((color, index) => {
        readString(ctx, color, `brand.colors[${index}]`, 'brief.brand.colors entry');
      });
    }
  }

  const content = readObject(ctx, record['content'], 'content', 'brief.content');
  const hasContent = (() => {
    if (!content) return false;
    const headline = typeof content['headline'] === 'string' && content['headline'].trim().length > 0;
    const sub = typeof content['subheadline'] === 'string' && content['subheadline'].trim().length > 0;
    const cta = typeof content['cta'] === 'string' && content['cta'].trim().length > 0;
    const body = Array.isArray(content['body']) && content['body'].length > 0;
    const details = Array.isArray(content['details']) && content['details'].length > 0;
    return headline || sub || cta || body || details;
  })();
  if (!hasContent) {
    bag.error(CODES.BRIEF_CONTENT_MISSING, 'brief.content contains no usable content.', { path: 'content' });
  }

  const requirements = readObject(ctx, record['requirements'], 'requirements', 'brief.requirements');
  if (requirements) {
    readNumber(ctx, requirements['width'], 'requirements.width', 'brief.requirements.width', { exclusiveMin: 0 });
    readNumber(ctx, requirements['height'], 'requirements.height', 'brief.requirements.height', { exclusiveMin: 0 });
    readString(ctx, requirements['unit'], 'requirements.unit', 'brief.requirements.unit');
    const formats = readArray(ctx, requirements['outputFormats'], 'requirements.outputFormats', 'brief.requirements.outputFormats');
    formats?.forEach((format, index) => {
      if (typeof format !== 'string' || !(OUTPUT_FORMATS as readonly string[]).includes(format)) {
        bag.error(CODES.BRIEF_OUTPUT_UNSUPPORTED, `requirements.outputFormats[${index}] is not a supported format.`, {
          path: `requirements.outputFormats[${index}]`,
          hint: `Supported: ${OUTPUT_FORMATS.join(', ')}.`,
        });
      }
    });
    const languages = readArray(ctx, requirements['languages'], 'requirements.languages', 'brief.requirements.languages');
    languages?.forEach((language, index) => {
      if (typeof language !== 'string' || !isSupportedLanguage(language)) {
        bag.warning(CODES.BRIEF_SCRIPT_UNSUPPORTED, `requirements.languages[${index}] is outside the documented supported set.`, {
          path: `requirements.languages[${index}]`,
        });
      }
    });
  }

  return toResult(bag, bag.hasErrors ? undefined : brief);
}

/** Convenience: validate a plan and throw when it is not admitted. */
export function assertValidDesignPlan(input: unknown, options: ValidatePlanOptions = {}): DesignDocument {
  const report = validateDesignPlan(input, options);
  if (!report.admitted || !report.result.value) {
    const lines = report.result.errors.map((error) => `  [${error.code}] ${error.path || '<root>'}: ${error.message}`);
    throw new DesignPlanValidationError(report, `Design plan rejected with ${report.result.errors.length} error(s):\n${lines.join('\n')}`);
  }
  return report.result.value;
}

export class DesignPlanValidationError extends Error {
  readonly report: DesignPlanValidationReport;
  constructor(report: DesignPlanValidationReport, message: string) {
    super(message);
    this.name = 'DesignPlanValidationError';
    this.report = report;
  }
}

export { allOverlapPairIds, parseSchemaVersion };
