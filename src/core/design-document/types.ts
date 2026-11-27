/**
 * Canonical structured design document model.
 *
 * This is the single source of truth for the object graph described in
 * README.md ("5.1 Use a Structured Vector-Based Design Document") and in
 * AGENTS.md §2.4. It is renderer-independent, serializable JSON, and is the
 * only interchange format between the intelligence, graphics, rendering,
 * export, and quality layers.
 *
 * Extensions to the README interface are additive and optional, so older
 * documents remain valid.
 */

export type ElementType =
  | "text"
  | "rectangle"
  | "circle"
  | "ellipse"
  | "polygon"
  | "path"
  | "image"
  | "svg"
  | "group"
  | "frame"
  | "line"
  | "gradient"
  | "pattern"
  | "mask"
  | "clipPath"
  | "decoration";

export const ELEMENT_TYPES: readonly ElementType[] = [
  "text",
  "rectangle",
  "circle",
  "ellipse",
  "polygon",
  "path",
  "image",
  "svg",
  "group",
  "frame",
  "line",
  "gradient",
  "pattern",
  "mask",
  "clipPath",
  "decoration",
];

export interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export interface ElementStyle {
  /** Fill color, gradient reference, pattern reference or `none`. */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  blendMode?: BlendMode;
  strokeLinecap?: "butt" | "round" | "square";
  strokeLinejoin?: "miter" | "round" | "bevel";
}

export interface DesignEffect {
  type: "shadow" | "blur" | "glow" | "texture" | "noise" | "inner-shadow" | (string & {});
  /** Effect parameters are renderer-specific but must be JSON-serializable. */
  [parameter: string]: unknown;
}

/**
 * Semantic role metadata. Roles make hierarchy, content and quality checks
 * deterministic instead of inferred from visual appearance only.
 */
export type ElementRole =
  | "background"
  | "headline"
  | "subheadline"
  | "subheading"
  | "body"
  | "caption"
  | "label"
  | "cta"
  | "logo"
  | "image"
  | "decoration"
  | "divider"
  | "frame"
  | "contact"
  | (string & {});

export interface ElementMeta {
  /** Semantic role used by hierarchy, spacing and content validators. */
  role?: ElementRole;
  /** Decorative elements are allowed to have no informational purpose. */
  decorative?: boolean;
  /**
   * Explicit, art-directed overlap. Layout validation must not report
   * intentional layering (DESIGN_SYSTEM.md §17, quality metrics §4).
   */
  intentionalOverlap?: boolean;
  /** BCP-47 language tag for text elements. */
  language?: string;
  /** Free-form art-direction note carried with the element. */
  note?: string;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  name: string;
  transform: Transform;
  style: ElementStyle;
  effects?: DesignEffect[];
  visible: boolean;
  locked: boolean;
  zIndex: number;
  children?: DesignElement[];
  meta?: ElementMeta;
}

export type TextAlign = "left" | "center" | "right" | "justify";

export type TextRole =
  | "headline"
  | "subheadline"
  | "subheading"
  | "body"
  | "caption"
  | "label"
  | "cta"
  | (string & {});

export interface Typography {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle?: "normal" | "italic";
  /** Multiple of fontSize. Leading below 1.0 is always a typographic defect. */
  lineHeight: number;
  letterSpacing?: number;
  wordSpacing?: number;
  textAlign?: TextAlign;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  /** When set, text must not exceed this many wrapped lines. */
  maxLines?: number;
  /** Whether the renderer may wrap to the frame width. */
  wrap?: boolean;
  language?: string;
  direction?: "ltr" | "rtl";
  /** Optical letter-spacing in points; kept explicit for editorial work. */
  tracking?: number;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  typography: Typography;
  /** Text may overflow its frame by design for expressive typography. */
  allowOverflow?: boolean;
}

export interface ImageElement extends BaseElement {
  type: "image";
  assetId: string;
  /** Object-fit behaviour. `fill` stretches and is treated as distortion. */
  fit?: "cover" | "contain" | "fill";
  crop?: { x: number; y: number; width: number; height: number };
  alt?: string;
}

export interface ShapeElement extends BaseElement {
  type: "rectangle" | "circle" | "ellipse" | "polygon" | "decoration" | "frame";
  /** Polygon/decoration point list in local coordinates. */
  points?: Array<{ x: number; y: number }>;
}

export interface PathElement extends BaseElement {
  type: "path";
  /** SVG path data. Validated for structural integrity. */
  pathData: string;
}

export interface LineElement extends BaseElement {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GroupElement extends BaseElement {
  type: "group" | "clipPath" | "mask";
  children: DesignElement[];
}

export interface GenericElement extends BaseElement {
  type: "svg" | "gradient" | "pattern";
  /** Embedded SVG markup or definition payload. */
  content?: string;
}

export type DesignElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | PathElement
  | LineElement
  | GroupElement
  | GenericElement;

export interface CanvasSpec {
  width: number;
  height: number;
  unit: "px" | "mm" | "in";
  /** Raster resolution for print artwork. Digital-only documents may omit it. */
  dpi?: number;
  background?: string;
  /** Bleed in document units (print production). */
  bleed?: number;
  /** Safe margin in document units. */
  safeMargin?: number;
  colorMode?: "rgb" | "cmyk";
}

export type DesignCategory =
  | "poster"
  | "banner"
  | "flyer"
  | "brochure"
  | "business-card"
  | "social-media"
  | "magazine-cover"
  | "presentation"
  | "infographic"
  | (string & {});

export interface AssetDefinition {
  id: string;
  name?: string;
  mimeType?: string;
  /** Intrinsic pixel dimensions, used for effective-resolution checks. */
  width?: number;
  height?: number;
  /** Storage key/URL. Availability itself is resolved through an AssetRegistry. */
  src?: string;
}

export interface FontDefinition {
  family: string;
  /** Scripts the font can actually render, e.g. `["latin", "bengali"]`. */
  scripts?: string[];
  weights?: number[];
  style?: "normal" | "italic";
  source?: "system" | "google" | "upload" | (string & {});
}

export interface DocumentMeta {
  createdWith?: string;
  brief?: string;
  artDirection?: string;
  language?: string;
  locale?: string;
  [key: string]: unknown;
}

export interface DesignDocument {
  id: string;
  name?: string;
  /** Schema version of the document itself. */
  schemaVersion?: string;
  canvas: CanvasSpec;
  category?: DesignCategory;
  elements: DesignElement[];
  /** Declared assets; availability is verified through an AssetRegistry. */
  assets?: AssetDefinition[];
  /** Declared fonts; availability is verified through a FontRegistry. */
  fonts?: FontDefinition[];
  metadata?: DocumentMeta;
}
