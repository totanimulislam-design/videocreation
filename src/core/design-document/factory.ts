import type {
  BaseElement,
  CanvasSpec,
  DesignDocument,
  DesignElement,
  ElementMeta,
  ElementRole,
  ElementStyle,
  ImageElement,
  ShapeElement,
  TextElement,
  Transform,
  Typography,
} from "./types.ts";

/**
 * Small, dependency-free builders for creating design documents in code and in
 * tests. They are thin conveniences over the canonical types — not a template
 * system. Every field the model requires is given an explicit, sensible default
 * so documents stay structurally valid.
 */

export interface ElementSeed {
  id: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  style?: ElementStyle;
  zIndex?: number;
  visible?: boolean;
  locked?: boolean;
  role?: ElementRole;
  meta?: ElementMeta;
}

const DEFAULT_STYLE: ElementStyle = { fill: "#000000", opacity: 1 };

function base(seed: ElementSeed, type: BaseElement["type"]): BaseElement {
  const transform: Transform = {
    x: seed.x,
    y: seed.y,
    width: seed.width,
    height: seed.height,
    rotation: seed.rotation ?? 0,
    scaleX: seed.scaleX ?? 1,
    scaleY: seed.scaleY ?? 1,
  };
  return {
    id: seed.id,
    type,
    name: seed.name ?? seed.id,
    transform,
    style: { ...DEFAULT_STYLE, ...(seed.style ?? {}) },
    visible: seed.visible ?? true,
    locked: seed.locked ?? false,
    zIndex: seed.zIndex ?? 0,
    meta: { ...(seed.meta ?? {}), ...(seed.role ? { role: seed.role } : {}) },
  };
}

export interface TextSeed extends ElementSeed {
  text: string;
  typography: Partial<Typography> & { fontFamily: string; fontSize: number };
  role?: ElementRole;
  allowOverflow?: boolean;
}

export function text(seed: TextSeed): TextElement {
  const typography: Typography = {
    fontWeight: 400,
    lineHeight: 1.4,
    textAlign: "left",
    ...seed.typography,
    fontFamily: seed.typography.fontFamily,
    fontSize: seed.typography.fontSize,
  };
  return {
    ...(base(seed, "text") as TextElement),
    type: "text",
    text: seed.text,
    typography,
    ...(seed.allowOverflow !== undefined ? { allowOverflow: seed.allowOverflow } : {}),
  };
}

export interface ShapeSeed extends ElementSeed {
  type?: "rectangle" | "circle" | "ellipse" | "polygon" | "decoration" | "frame";
  stroke?: string;
  strokeWidth?: number;
}

export function shape(seed: ShapeSeed): ShapeElement {
  return {
    ...(base(seed, seed.type ?? "rectangle") as ShapeElement),
    type: seed.type ?? "rectangle",
    ...(seed.stroke !== undefined ? { stroke: seed.stroke } : {}),
    ...(seed.strokeWidth !== undefined ? { strokeWidth: seed.strokeWidth } : {}),
  };
}

export interface ImageSeed extends ElementSeed {
  assetId: string;
  fit?: "cover" | "contain" | "fill";
  alt?: string;
}

export function image(seed: ImageSeed): ImageElement {
  return {
    ...(base(seed, "image") as ImageElement),
    type: "image",
    assetId: seed.assetId,
    fit: seed.fit ?? "cover",
    ...(seed.alt !== undefined ? { alt: seed.alt } : {}),
  };
}

export function group(seed: ElementSeed, children: DesignElement[]): DesignElement {
  return {
    ...base(seed, "group"),
    type: "group",
    children,
  };
}

export interface DocumentSeed {
  id: string;
  name?: string;
  canvas: Partial<CanvasSpec> & { width: number; height: number };
  category?: DesignDocument["category"];
  elements?: DesignElement[];
  assets?: DesignDocument["assets"];
  fonts?: DesignDocument["fonts"];
  metadata?: DesignDocument["metadata"];
}

export function document(seed: DocumentSeed): DesignDocument {
  return {
    id: seed.id,
    name: seed.name ?? seed.id,
    schemaVersion: "1.0.0",
    canvas: {
      unit: "px",
      background: "#ffffff",
      ...seed.canvas,
      width: seed.canvas.width,
      height: seed.canvas.height,
    },
    ...(seed.category ? { category: seed.category } : {}),
    elements: seed.elements ?? [],
    ...(seed.assets ? { assets: seed.assets } : {}),
    ...(seed.fonts ? { fonts: seed.fonts } : {}),
    ...(seed.metadata ? { metadata: seed.metadata } : {}),
  };
}
