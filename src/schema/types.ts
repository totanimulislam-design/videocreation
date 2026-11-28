/**
 * Canonical design contract — TypeScript types.
 *
 * AUTHORITY: `DESIGN_ENGINE_SPEC.md` §3 (document), §4.2 (brief), §5.1 (art
 * direction), §6.1 (composition plan), §7.2 (grid), §9.2 (typography), §13.1
 * (scene node). These types mirror that contract. They are the *only* wire
 * shapes for brief, art direction, composition, document, canvas and element
 * identity in this repository; other modules must import them rather than
 * declare their own (spec: "must not define competing wire shapes").
 *
 * Collection fields are declared `readonly`, and factories freeze them at
 * construction. This does not change the wire format; it prevents a validated
 * plan from being mutated after validation, which is what lets the validator's
 * verdict remain trustworthy.
 *
 * Deliberate scope of this phase:
 * - Types only. No geometry, renderer, editor, or AI provider is implemented.
 * - Runtime validation lives in `src/schema/validate.ts` (documents) because
 *   TypeScript types are erased and cannot validate untrusted AI output.
 *
 * Conventions applied consistently:
 * - Lengths, positions, sizes, spacing and stroke widths are in
 *   `CanvasConfig.unit` for document/canvas scoped values. Typography `fontSize`
 *   and `letterSpacing` use the same canvas unit for design tokens applied to a
 *   document (spec §3.3: "Numeric token dimensions use the canvas unit").
 * - Angles are degrees unless a field says otherwise.
 * - Normalized ratios (opacity, focal strength, gradient offsets, crop) are
 *   `0..1` and are explicitly *not* canvas units.
 * - Colors are `#RGB`/`#RGBA`/`#RRGGBB`/`#RRGGBBAA` sRGB hex strings.
 * - IDs are stable, opaque, non-empty strings unique within one document.
 */

import type { Unit } from './units.ts';

export type { Unit };

/** Export formats permitted by the brief contract (spec §4.2). */
export type OutputFormat = 'svg' | 'png' | 'jpeg' | 'pdf';

export const OUTPUT_FORMATS: readonly OutputFormat[] = Object.freeze(['svg', 'png', 'jpeg', 'pdf']);

/** Output medium (spec §4.2). `unspecified` must not be silently upgraded. */
export type Medium = 'digital' | 'print' | 'both' | 'unspecified';

export const MEDIUMS: readonly Medium[] = Object.freeze(['digital', 'print', 'both', 'unspecified']);

/** Writing/reading direction used for layout flow and text runs. */
export type ReadingFlow = 'ltr' | 'rtl' | 'vertical' | 'custom';

export const READING_FLOWS: readonly ReadingFlow[] = Object.freeze(['ltr', 'rtl', 'vertical', 'custom']);

/** Text-run direction (spec §13.1). `auto` defers to script detection. */
export type TextDirection = 'ltr' | 'rtl' | 'auto';

/** Visual complexity knobs (spec §5.1). */
export type VisualDensity = 'minimal' | 'balanced' | 'dense';
export type ComplexityLevel = 'low' | 'medium' | 'high';

export const VISUAL_DENSITIES: readonly VisualDensity[] = Object.freeze(['minimal', 'balanced', 'dense']);
export const COMPLEXITY_LEVELS: readonly ComplexityLevel[] = Object.freeze(['low', 'medium', 'high']);

/**
 * BCP-47-ish language tag. Intentionally a string: the contract cannot enumerate
 * every language, and validators check shape rather than a closed list.
 */
export type LanguageTag = string;

// ---------------------------------------------------------------------------
// §3.1 Design document
// ---------------------------------------------------------------------------

/** Document metadata. `category` uses a stable category ID (see kind.ts). */
export interface DesignMetadata {
  category: string;
  description?: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** ISO-8601 timestamp. */
  updatedAt: string;
}

/**
 * A declared, resolvable asset. `uri` may be a `data:` URI or a scheme the
 * host application has explicitly allow-listed; raw remote embedding is a
 * renderer/security concern, not a schema guarantee (spec §25).
 */
export interface DesignAsset {
  id: string;
  kind: 'image' | 'font' | 'vector';
  uri: string;
  mimeType: string;
  /** Intrinsic pixel dimensions for raster assets, in asset pixels. */
  width?: number;
  height?: number;
  licensing?: { source?: string; usage?: string };
}

/** Non-printing alignment guide (spec §3.1). */
export interface DesignGuide {
  id: string;
  kind: 'line' | 'rect';
  x: number;
  y: number;
  width?: number;
  height?: number;
  visible: boolean;
}

export interface DesignSettings {
  colorProfile?: string;
  exportScale?: number;
}

/**
 * The editable design document: the single source of truth for editor,
 * renderer and export (spec §3.1).
 *
 * `schemaVersion` is the contract version (`SCHEMA_VERSION`); `version` is the
 * user's revision counter. They are independent.
 */
export interface DesignDocument {
  id: string;
  name: string;
  schemaVersion: string;
  version: number;
  metadata: DesignMetadata;
  canvas: CanvasConfig;
  designTokens: DesignTokens;
  artDirection: ArtDirection;
  composition: CompositionPlan;
  elements: readonly SceneNode[];
  assets: readonly DesignAsset[];
  guides: readonly DesignGuide[];
  settings: DesignSettings;
}

/**
 * The plan this phase validates.
 *
 * `AI_DESIGN_INTELLIGENCE.md` §11 defines `AI_DesignPlan extends DesignDocument`
 * and adds analysis-only blocks. An enriched plan is still a `DesignDocument`,
 * so validating the document validates the plan core. The extra analysis blocks
 * are not implemented here and are not required by this alias.
 */
export type DesignPlan = DesignDocument;

// ---------------------------------------------------------------------------
// §3.2 Canvas configuration
// ---------------------------------------------------------------------------

export type CanvasBackground =
  | { type: 'solid'; color: string }
  | {
      type: 'gradient';
      kind: 'linear' | 'radial';
      stops: ReadonlyArray<{ offset: number; color: string }>;
      /** Degrees; linear only. */
      angle?: number;
      /** Normalized `0..1`; radial only. */
      center?: { x: number; y: number };
    }
  | { type: 'image'; assetId: string }
  | { type: 'transparent' };

/** Four-sided inset in canvas units. */
export interface BoxInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Canvas geometry. Internal render dimensions, display dimensions, physical
 * print dimensions and export dimensions are separate concepts; this type only
 * declares the design-space size and the unit it is expressed in.
 */
export interface CanvasConfig {
  width: number;
  height: number;
  /** Declares the unit of every document-scoped length. Required. */
  unit: Unit;
  background: CanvasBackground;
  /** Dots per inch, required to relate px to physical size. */
  dpi?: number;
  bleed?: BoxInset;
  safeArea?: BoxInset;
}

// ---------------------------------------------------------------------------
// §9.2 Typography, §3.3 tokens
// ---------------------------------------------------------------------------

export interface TypographyToken {
  fontFamily: string;
  /** In canvas units. */
  fontSize: number;
  /** Numeric OpenType weight or a named keyword such as `"bold"`. */
  fontWeight: number | string;
  /** Multiple of `fontSize`, not a length. */
  lineHeight: number;
  /** In canvas units; usually small, may be negative for optical tightening. */
  letterSpacing: number;
  textTransform?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
}

export interface ShadowToken {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  /** Normalized `0..1`. */
  opacity: number;
}

/** The five typographic roles required by the token contract (spec §3.3). */
export interface TypographyScale {
  display: TypographyToken;
  heading: TypographyToken;
  subheading: TypographyToken;
  body: TypographyToken;
  caption: TypographyToken;
}

export interface DesignTokens {
  /** Role name (e.g. `primary`, `text_primary`) to hex color. */
  colors: Record<string, string>;
  typography: TypographyScale;
  /** Named spacing steps in canvas units. */
  spacing: Record<string, number>;
  /** Named corner radii in canvas units. */
  radii: Record<string, number>;
  shadows: Record<string, ShadowToken>;
}

// ---------------------------------------------------------------------------
// §5.1 Art direction
// ---------------------------------------------------------------------------

export interface ArtDirection {
  /** Stable style ID from `DESIGN_SYSTEM.md` §4 (see kind.ts). Unknown styles are rejected. */
  style: string;
  /** Mood keywords; free-form descriptors, not IDs. */
  mood: readonly string[];
  /** Stable color-strategy ID (spec §10.2 enumeration). */
  colorStrategy: string;
  typographyStrategy: string;
  imageStrategy: string;
  shapeLanguage: string;
  visualDensity: VisualDensity;
  complexity: ComplexityLevel;
  references?: readonly string[];
}

// ---------------------------------------------------------------------------
// §6.1 Composition plan, §7.2 Grid configuration
// ---------------------------------------------------------------------------

export interface HierarchyItem {
  /**
   * Stable content-slot path: `headline`, `subheadline`, `body/<index>`,
   * `details/<index>`, `cta`, or a declared user-content ID.
   */
  contentId: string;
  /** 1 is highest priority. */
  rank: number;
  role: 'primary' | 'secondary' | 'tertiary' | 'utility';
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompositionZone {
  id: string;
  purpose: string;
  priority: number;
  bounds: Rect;
  /** Refers to `SceneNode.id` values declared in the same document. */
  elementIds: readonly string[];
}

export interface CompositionConstraints {
  preserveContent: boolean;
  allowOverlap: boolean;
  /** Pairs of `SceneNode.id` values whose overlap is intentional. */
  allowedOverlapPairs: ReadonlyArray<readonly [string, string]>;
}

/**
 * Plan-level constraint set.
 *
 * This is an alias rather than a second shape: the task brief names
 * `DesignConstraints` and the spec names `CompositionConstraints`, but the
 * repository must expose one constraint contract (no competing schemas).
 * `CompositionPlan.constraints` has exactly this shape.
 */
export type DesignConstraints = CompositionConstraints;

export interface GridConfiguration {
  type: 'column' | 'modular' | 'baseline' | 'asymmetric' | 'golden-ratio' | 'thirds' | 'custom';
  columns: number;
  rows?: number;
  /** Gutter in canvas units. */
  gutter: number;
  /** Margins in canvas units. */
  margin: BoxInset;
  /** Baseline rhythm in canvas units. */
  baseline?: number;
  enabled: boolean;
}

export const GRID_TYPES: readonly GridConfiguration['type'][] = Object.freeze([
  'column',
  'modular',
  'baseline',
  'asymmetric',
  'golden-ratio',
  'thirds',
  'custom',
]);

export interface CompositionPlan {
  /** Stable pattern ID from `DESIGN_PATTERNS_LIBRARY.md` (e.g. `P11`). */
  primaryPattern: string;
  supportingPatterns: readonly string[];
  focalPoint: {
    /** Canvas units. */
    x: number;
    y: number;
    /** Normalized `0..1`. */
    strength: number;
  };
  readingFlow: ReadingFlow;
  hierarchy: readonly HierarchyItem[];
  zones: readonly CompositionZone[];
  grid: GridConfiguration;
  constraints: DesignConstraints;
}

// ---------------------------------------------------------------------------
// §13.1 Scene graph
// ---------------------------------------------------------------------------

export type ElementStyle = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Normalized `0..1`. */
  opacity?: number;
  radius?: number;
  shadowToken?: string;
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
};

export type SceneNodeType = 'text' | 'shape' | 'path' | 'image' | 'group';

export interface SceneTransform {
  /** Canvas units. */
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** Degrees. */
  rotation: number;
}

export interface SceneGeometry {
  width: number;
  height: number;
  shape?: 'rect' | 'ellipse' | 'polygon';
  /** Local geometry for polygon; coordinates in canvas units. */
  points?: ReadonlyArray<{ x: number; y: number }>;
  /** SVG path data. Data only — never executable markup (spec §25). */
  pathData?: string;
}

export interface SceneText {
  content: string;
  /** BCP-47 tag for this run. */
  language?: string;
  direction?: TextDirection;
  typography: TypographyToken;
}

export interface ImagePlacement {
  fit: 'contain' | 'cover' | 'stretch';
  /** Normalized source coordinates `0..1`. */
  crop?: { x: number; y: number; width: number; height: number };
}

export interface SceneNode {
  id: string;
  type: SceneNodeType;
  name: string;
  transform: SceneTransform;
  geometry?: SceneGeometry;
  text?: SceneText;
  imagePlacement?: ImagePlacement;
  assetId?: string;
  style?: ElementStyle;
  visible: boolean;
  locked: boolean;
  /** Permitted only when `type` is `group`. */
  children?: readonly SceneNode[];
  metadata?: Record<string, string | number | boolean>;
}

export const SCENE_NODE_TYPES: readonly SceneNodeType[] = Object.freeze([
  'text',
  'shape',
  'path',
  'image',
  'group',
]);

// ---------------------------------------------------------------------------
// §4.2 Design brief
// ---------------------------------------------------------------------------

export interface BriefBrand {
  name?: string;
  identity?: string;
  colors?: readonly string[];
}

/**
 * Exact user content, already split into slots.
 *
 * Values are preserved verbatim: the parser never rewrites, translates,
 * normalizes or invents them. An absent slot means "the user did not supply
 * this content", which the analysis records as an unknown.
 */
export interface BriefContent {
  headline?: string;
  subheadline?: string;
  body: readonly string[];
  details: readonly string[];
  cta?: string;
}

export interface BriefVisualDirection {
  mood: readonly string[];
  style: readonly string[];
  preferredColors?: readonly string[];
  imageDirection?: string;
}

export interface BriefRequirements {
  /** Canvas units, per `unit`. */
  width: number;
  height: number;
  unit: Unit;
  languages: readonly LanguageTag[];
  outputFormats: readonly OutputFormat[];
  medium: Medium;
}

/**
 * Structured design brief (spec §4.2).
 *
 * Field-level facts stay here. Assumptions, unknowns, evidence and confidence
 * produced while parsing live in the companion `BriefAnalysis`, so the contract
 * itself is never polluted with parser bookkeeping.
 */
export interface DesignBrief {
  /** Stable category ID (see kind.ts). */
  category: string;
  objective: string;
  audience: readonly string[];
  brand: BriefBrand;
  content: BriefContent;
  visualDirection: BriefVisualDirection;
  requirements: BriefRequirements;
}
