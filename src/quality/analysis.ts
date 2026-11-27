import type {
  CanvasSpec,
  DesignDocument,
  DesignElement,
} from "../core/design-document/types.ts";
import {
  area,
  center,
  containsPoint,
  elementBounds,
  intersectionArea,
  type Rect,
} from "../core/geometry/bounds.ts";
import {
  composite,
  contrastRatio,
  parseColor,
  toHsl,
  type RGBA,
} from "../core/color/color.ts";
import { paintOrder } from "../core/design-document/traverse.ts";
import { detectScripts, defaultTextMeasurer } from "./text/measure.ts";
import type {
  AssetInfo,
  AssetRegistry,
  ContentRequirement,
  DesignBriefContext,
  QualityContext,
  TextBlock,
  TextMeasurement,
} from "./types.ts";

/**
 * A single deterministic read of the document.
 *
 * Every validator and score category consumes this analysis instead of
 * re-deriving geometry, so measurements are consistent across the report and
 * cannot drift between the validator that finds a problem and the category
 * that scores it.
 */

export type BackgroundResolution = {
  color: RGBA | null;
  overImage: boolean;
  approximate: boolean;
  sources: string[];
};

export interface ImageAnalysis {
  element: Extract<DesignElement, { type: "image" }>;
  asset: AssetInfo | undefined;
  available: boolean;
  fit: "cover" | "contain" | "fill";
  effectiveDpi: number | null;
  stretchRatio: number;
}

export interface ContrastSample {
  elementId: string;
  fontSize: number;
  fontSizePx: number;
  required: number;
  ratio: number | null;
  passes: boolean;
  verifiable: boolean;
  reason?: string;
  foreground: string;
  background: string | null;
  overImage: boolean;
}

export interface FocalCandidate {
  elementId: string;
  role: string;
  salience: number;
  bounds: Rect;
}

export interface MarginStats {
  left: number;
  right: number;
  top: number;
  bottom: number;
  min: number;
  max: number;
  average: number;
  deviation: number;
  recommended: number;
}

export interface AlignmentStats {
  /** 0..1 — share of content elements whose edge aligns with another element. */
  alignedShare: number;
  groups: number;
  edges: number;
}

export interface SpacingStats {
  gaps: number[];
  meanGap: number;
  deviation: number;
}

export interface LayoutStats {
  coverage: number;
  quadrantBalance: number;
  centerOfMass: { x: number; y: number };
  emptyBands: { top: number; bottom: number; left: number; right: number };
  overlaps: Array<{ a: string; b: string; ratio: number }>;
  hiddenEssential: Array<{ id: string; by: string }>;
}

export interface PaletteEntry {
  color: string;
  rgba: RGBA;
  count: number;
  roles: string[];
  hsl: { h: number; s: number; l: number };
}

export interface DocumentAnalysis {
  document: DesignDocument;
  canvas: CanvasSpec;
  brief: DesignBriefContext;
  unitsPerInch: number;
  targetAssetDpi: number;
  targetExportDpi: number;
  paintOrder: DesignElement[];
  visible: DesignElement[];
  texts: TextBlock[];
  images: ImageAnalysis[];
  shapes: DesignElement[];
  margins: MarginStats;
  alignment: AlignmentStats;
  spacing: SpacingStats;
  layout: LayoutStats;
  palette: PaletteEntry[];
  background: RGBA;
  contrastSamples: ContrastSample[];
  focalCandidates: FocalCandidate[];
  effectCount: number;
  maxEffectsPerElement: number;
  duplicateZIndices: number[];
  missingAssets: string[];
  fonts: Array<{ family: string; elementIds: string[]; scripts: string[] }>;
  scriptsUsed: string[];
  requirements: ContentRequirement[];
  allText: string;
}

function isVisible(element: DesignElement): boolean {
  return element.visible !== false;
}

export function unitsPerInch(canvas: CanvasSpec): number {
  switch (canvas.unit) {
    case "mm":
      return 25.4;
    case "in":
      return 1;
    default:
      return canvas.dpi ?? 96;
  }
}

function resolveBackground(
  document: DesignDocument,
  order: DesignElement[],
  target: DesignElement,
  assets: AssetRegistry | undefined,
): BackgroundResolution {
  const targetIndex = order.indexOf(target);
  const canvas = document.canvas;
  const sources: string[] = [];
  let color: RGBA | null = parseColor(canvas.background ?? "#ffffff");
  if (!color) color = { r: 255, g: 255, b: 255, a: 1 };
  sources.push("canvas");
  let overImage = false;
  let approximate = false;
  const point = center(elementBounds(target));

  for (let index = 0; index < targetIndex; index += 1) {
    const candidate = order[index]!;
    if (!isVisible(candidate)) continue;
    if (candidate.type === "text") continue;
    if (!containsPoint(elementBounds(candidate), point)) continue;

    if (candidate.type === "image") {
      const info = candidate.assetId ? assets?.get(candidate.assetId) : undefined;
      if (info?.dominantColor) {
        const dominant = parseColor(info.dominantColor);
        if (dominant) {
          color = composite(dominant, color);
          sources.push(candidate.id);
          approximate = true;
          continue;
        }
      }
      overImage = true;
      return { color: null, overImage, approximate, sources };
    }

    const fill = candidate.style?.fill;
    if (!fill || fill === "none") continue;
    const parsed = parseColor(fill);
    if (!parsed) {
      // Gradient, pattern or asset paint: the resolved color is unknown.
      return { color: null, overImage, approximate: true, sources };
    }
    const opacity = candidate.style?.opacity ?? 1;
    color = composite({ ...parsed, a: parsed.a * opacity }, color);
    sources.push(candidate.id);
  }

  return { color, overImage, approximate, sources };
}

function requiredContrast(fontSizePx: number, fontWeight: number): number {
  const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
  return large ? 3 : 4.5;
}

/** Samples a 32×32 grid to estimate occupied area, balance and empty bands. */
function sampleLayout(canvas: CanvasSpec, visible: DesignElement[]): LayoutStats {
  const grid = 32;
  const cellWidth = canvas.width / grid;
  const cellHeight = canvas.height / grid;
  const inked: boolean[] = new Array(grid * grid).fill(false);

  const content = visible.filter((element) => {
    const role = element.meta?.role;
    if (role === "background") return false;
    const bounds = elementBounds(element);
    return area(bounds) < area({ x: 0, y: 0, width: canvas.width, height: canvas.height }) * 0.98;
  });

  for (const element of content) {
    const bounds = elementBounds(element);
    const x0 = Math.max(0, Math.floor(bounds.x / cellWidth));
    const x1 = Math.min(grid - 1, Math.ceil((bounds.x + bounds.width) / cellWidth) - 1);
    const y0 = Math.max(0, Math.floor(bounds.y / cellHeight));
    const y1 = Math.min(grid - 1, Math.ceil((bounds.y + bounds.height) / cellHeight) - 1);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const index = y * grid + x;
        inked[index] = true;
      }
    }
  }

  const halfX = grid / 2;
  const halfY = grid / 2;
  const quadrant = { q1: 0, q2: 0, q3: 0, q4: 0 };
  let totalInk = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      if (!inked[y * grid + x]) continue;
      totalInk += 1;
      sumX += x + 0.5;
      sumY += y + 0.5;
      if (x < halfX && y < halfY) quadrant.q1 += 1;
      else if (x >= halfX && y < halfY) quadrant.q2 += 1;
      else if (x < halfX && y >= halfY) quadrant.q3 += 1;
      else quadrant.q4 += 1;
    }
  }

  const coverageRatio = totalInk / (grid * grid);
  const ideal = totalInk / 4;
  const quadrantDeviation =
    totalInk === 0
      ? 0
      : (Math.abs(quadrant.q1 - ideal) +
          Math.abs(quadrant.q2 - ideal) +
          Math.abs(quadrant.q3 - ideal) +
          Math.abs(quadrant.q4 - ideal)) /
        (totalInk * 1.5);
  const quadrantBalance = Math.max(0, 1 - quadrantDeviation);

  const emptyRows = (from: number, to: number): number => {
    let empty = 0;
    const step = to > from ? 1 : -1;
    for (let y = from; y !== to + step; y += step) {
      let rowHasInk = false;
      for (let x = 0; x < grid; x += 1) {
        if (inked[y * grid + x]) {
          rowHasInk = true;
          break;
        }
      }
      if (rowHasInk) break;
      empty += 1;
    }
    return empty;
  };

  const emptyCols = (from: number, to: number): number => {
    let empty = 0;
    const step = to > from ? 1 : -1;
    for (let x = from; x !== to + step; x += step) {
      let colHasInk = false;
      for (let y = 0; y < grid; y += 1) {
        if (inked[y * grid + x]) {
          colHasInk = true;
          break;
        }
      }
      if (colHasInk) break;
      empty += 1;
    }
    return empty;
  };

  return {
    coverage: coverageRatio,
    quadrantBalance,
    centerOfMass:
      totalInk === 0
        ? { x: 0.5, y: 0.5 }
        : { x: sumX / totalInk / grid, y: sumY / totalInk / grid },
    emptyBands: {
      top: emptyRows(0, grid - 1) / grid,
      bottom: emptyRows(grid - 1, 0) / grid,
      left: emptyCols(0, grid - 1) / grid,
      right: emptyCols(grid - 1, 0) / grid,
    },
    overlaps: [],
    hiddenEssential: [],
  };
}

function computeOverlaps(visible: DesignElement[]): Array<{ a: string; b: string; ratio: number }> {
  const texts = visible.filter((element) => element.type === "text");
  const overlaps: Array<{ a: string; b: string; ratio: number }> = [];
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = texts[i]!;
      const b = texts[j]!;
      if (a.meta?.intentionalOverlap || b.meta?.intentionalOverlap) continue;
      if (a.type !== "text" || b.type !== "text") continue;
      const boundsA = elementBounds(a);
      const boundsB = elementBounds(b);
      const overlap = intersectionArea(boundsA, boundsB);
      if (overlap <= 0) continue;
      const smaller = Math.min(area(boundsA), area(boundsB));
      const ratio = smaller === 0 ? 0 : overlap / smaller;
      if (ratio > 0.12) overlaps.push({ a: a.id, b: b.id, ratio });
    }
  }
  return overlaps;
}

function computeHiddenEssential(visible: DesignElement[], order: DesignElement[]): Array<{ id: string; by: string }> {
  const hidden: Array<{ id: string; by: string }> = [];
  visible.forEach((element) => {
    if (element.meta?.decorative) return;
    if (element.meta?.role === "background") return;
    if (element.type === "text" || element.type === "image") {
      const bounds = elementBounds(element);
      const centerPoint = center(bounds);
      const paintIndex = order.indexOf(element);
      for (let i = paintIndex + 1; i < order.length; i += 1) {
        const above = order[i]!;
        if (!isVisible(above)) continue;
        if (above.type !== "rectangle" && above.type !== "frame" && above.type !== "decoration") continue;
        const aboveBounds = elementBounds(above);
        const fill = above.style?.fill;
        const parsed = fill ? parseColor(fill) : null;
        if (!parsed || parsed.a < 0.85) continue;
        if (!containsPoint(aboveBounds, centerPoint)) continue;
        const covers = intersectionArea(bounds, aboveBounds) / Math.max(1, area(bounds));
        if (covers > 0.9) {
          hidden.push({ id: element.id, by: above.id });
          break;
        }
      }
    }
  });
  return hidden;
}

function computeMargins(
  canvas: CanvasSpec,
  visible: DesignElement[],
  recommended: number,
): MarginStats {
  const content = visible.filter((element) => {
    const role = element.meta?.role;
    if (role === "background") return false;
    const bounds = elementBounds(element);
    return area(bounds) < area({ x: 0, y: 0, width: canvas.width, height: canvas.height }) * 0.98;
  });
  if (content.length === 0) {
    return { left: 0, right: 0, top: 0, bottom: 0, min: 0, max: 0, average: 0, deviation: 0, recommended };
  }
  // The nearest content on each edge defines that margin, so a full-width
  // element does not inflate the reported right/bottom margin.
  const left = Math.min(...content.map((element) => elementBounds(element).x));
  const top = Math.min(...content.map((element) => elementBounds(element).y));
  const right = Math.min(
    ...content.map((element) => canvas.width - (elementBounds(element).x + elementBounds(element).width)),
  );
  const bottom = Math.min(
    ...content.map((element) => canvas.height - (elementBounds(element).y + elementBounds(element).height)),
  );
  const values = [left, right, top, bottom].map((value) => Math.max(0, Math.round(value * 10) / 10));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.max(...values) - Math.min(...values);
  return { left, right, top, bottom, min: Math.min(...values), max: Math.max(...values), average, deviation, recommended };
}

function computeSpacing(visible: DesignElement[]): SpacingStats {
  const textBlocks = visible.filter((element) => element.type === "text");
  const gaps: number[] = [];
  for (let i = 0; i < textBlocks.length; i += 1) {
    for (let j = i + 1; j < textBlocks.length; j += 1) {
      const a = elementBounds(textBlocks[i]!);
      const b = elementBounds(textBlocks[j]!);
      const verticalGap =
        b.y >= a.y + a.height ? b.y - (a.y + a.height) : a.y >= b.y + b.height ? a.y - (b.y + b.height) : -1;
      const horizontalGap =
        b.x >= a.x + a.width ? b.x - (a.x + a.width) : a.x >= b.x + b.width ? a.x - (b.x + b.width) : -1;
      if (verticalGap >= 0 && horizontalGap < Math.min(a.width, b.width) * 0.5) gaps.push(verticalGap);
    }
  }
  if (gaps.length === 0) return { gaps, meanGap: 0, deviation: 0 };
  const meanGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const variance = gaps.reduce((sum, gap) => sum + (gap - meanGap) ** 2, 0) / gaps.length;
  return { gaps, meanGap, deviation: Math.sqrt(variance) };
}

function computeAlignment(visible: DesignElement[]): AlignmentStats {
  const content = visible.filter((element) => element.meta?.role !== "background");
  if (content.length < 2) return { alignedShare: 0, groups: 0, edges: content.length * 2 };
  const tolerance = 1.5;
  const edges: Array<{ axis: "x" | "y"; value: number; id: string }> = [];
  for (const element of content) {
    const bounds = elementBounds(element);
    edges.push({ axis: "x", value: bounds.x, id: element.id });
    edges.push({ axis: "x", value: bounds.x + bounds.width, id: element.id });
    edges.push({ axis: "y", value: bounds.y, id: element.id });
    edges.push({ axis: "y", value: bounds.y + bounds.height, id: element.id });
  }
  const aligned = new Set<string>();
  let groups = 0;
  for (let i = 0; i < edges.length; i += 1) {
    const a = edges[i]!;
    for (let j = i + 1; j < edges.length; j += 1) {
      const b = edges[j]!;
      if (a.axis !== b.axis || a.id === b.id) continue;
      if (Math.abs(a.value - b.value) <= tolerance) {
        aligned.add(a.id);
        aligned.add(b.id);
      }
    }
  }
  for (let i = 0; i < edges.length; i += 1) {
    const left = edges[i]!;
    if (left.axis !== "x") continue;
    const lower = edges
      .slice(i + 1)
      .filter((edge) => edge.axis === "x" && Math.abs(edge.value - left.value) <= tolerance);
    if (lower.length > 0) groups += 1;
  }
  return { alignedShare: aligned.size / content.length, groups, edges: edges.length };
}

function buildPalette(visible: DesignElement[], background: string | undefined): PaletteEntry[] {
  const map = new Map<string, { rgba: RGBA; count: number; roles: Set<string> }>();
  const record = (value: string | undefined, role: string) => {
    if (!value) return;
    const parsed = parseColor(value);
    if (!parsed || parsed.a === 0) return;
    const key = `${parsed.r},${parsed.g},${parsed.b},${Math.round(parsed.a * 100) / 100}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.roles.add(role);
      return;
    }
    map.set(key, { rgba: parsed, count: 1, roles: new Set([role]) });
  };
  record(background ?? "#ffffff", "background");
  for (const element of visible) {
    const role = element.meta?.role ?? element.type;
    record(element.style?.fill, role);
    record(element.style?.stroke, role);
  }
  return [...map.entries()].map(([key, value]) => ({
    color: `rgba(${key})`,
    rgba: value.rgba,
    count: value.count,
    roles: [...value.roles],
    hsl: toHsl(value.rgba),
  }));
}

export function analyzeDocument(context: QualityContext): DocumentAnalysis {
  const document = context.document;
  const canvas = document.canvas;
  const brief = context.brief ?? {};
  const order = paintOrder(document);
  const visible = order.filter(isVisible);
  const measurer = context.textMeasurer ?? defaultTextMeasurer;
  const ppi = unitsPerInch(canvas);
  const targetAssetDpi = brief.targetAssetDpi ?? (canvas.unit === "px" ? 150 : 300);
  const targetExportDpi = brief.targetExportDpi ?? (canvas.unit === "px" ? 96 : 300);

  const texts: TextBlock[] = [];
  const images: ImageAnalysis[] = [];
  const shapes: DesignElement[] = [];

  for (const element of visible) {
    if (element.type === "text") {
      if (!element.typography) continue;
      const bounds = elementBounds(element);
      const wrap = element.typography.wrap !== false;
      const measurement: TextMeasurement = measurer.measure(element.text ?? "", element.typography, {
        maxWidth: wrap ? bounds.width : undefined,
        wrap,
      });
      const overflowX = wrap ? 0 : Math.max(0, measurement.width - bounds.width);
      const overflowY = Math.max(0, measurement.height - bounds.height);
      texts.push({
        element,
        typography: element.typography,
        text: element.text,
        role: element.meta?.role ?? "unassigned",
        essential: element.meta?.decorative !== true && element.meta?.role !== "decoration",
        measurement,
        frameWidth: bounds.width,
        frameHeight: bounds.height,
        overflowX,
        overflowY,
        lines: measurement.lines.length,
      });
    } else if (element.type === "image") {
      const asset = element.assetId ? context.assets?.get(element.assetId) : undefined;
      const bounds = elementBounds(element);
      const displayedInches = bounds.width / ppi;
      const effectiveDpi =
        asset?.width && displayedInches > 0 ? asset.width / displayedInches : null;
      let stretchRatio = 1;
      if (asset?.width && asset.height && bounds.width > 0 && bounds.height > 0) {
        const intrinsicAspect = asset.width / asset.height;
        const frameAspect = bounds.width / bounds.height;
        stretchRatio = intrinsicAspect / frameAspect;
      }
      images.push({
        element,
        asset,
        available: asset?.available === true,
        fit: element.fit ?? "cover",
        effectiveDpi,
        stretchRatio,
      });
    } else if (
      element.type === "rectangle" ||
      element.type === "circle" ||
      element.type === "ellipse" ||
      element.type === "polygon" ||
      element.type === "frame" ||
      element.type === "decoration" ||
      element.type === "path" ||
      element.type === "line"
    ) {
      shapes.push(element);
    }
  }

  const backgroundResolution = parseColor(canvas.background ?? "#ffffff") ?? { r: 255, g: 255, b: 255, a: 1 };

  const contrastSamples: ContrastSample[] = [];
  const fontsMap = new Map<string, { family: string; elementIds: string[]; scripts: Set<string> }>();
  const scriptsUsed = new Set<string>();

  for (const block of texts) {
    const target = block.element;
    const resolution = resolveBackground(document, order, target, context.assets);
    const foreground = target.style?.fill ?? "#000000";
    const parsedForeground = parseColor(foreground);
    const fontPx = canvas.unit === "px" ? block.typography.fontSize : (block.typography.fontSize / ppi) * 96;
    const required = requiredContrast(fontPx, block.typography.fontWeight);
    const scripts = detectScripts(block.text);
    scripts.forEach((script) => scriptsUsed.add(script));

    const family = block.typography.fontFamily;
    const fontEntry = fontsMap.get(family);
    if (fontEntry) {
      fontEntry.elementIds.push(target.id);
      scripts.forEach((script) => fontEntry.scripts.add(script));
    } else {
      fontsMap.set(family, {
        family,
        elementIds: [target.id],
        scripts: new Set(scripts),
      });
    }

    let ratio: number | null = null;
    let reason: string | undefined;
    if (!parsedForeground) {
      reason = "Foreground paint is not a resolvable solid color.";
    } else if (!resolution.color) {
      reason = resolution.overImage
        ? "Text sits over imagery; contrast cannot be verified without image analysis."
        : "Background paint is not a resolvable solid color.";
    } else {
      ratio = contrastRatio(parsedForeground, resolution.color);
    }
    const verifiable = ratio !== null;
    contrastSamples.push({
      elementId: target.id,
      fontSize: block.typography.fontSize,
      fontSizePx: Math.round(fontPx * 10) / 10,
      required,
      ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
      passes: ratio === null ? true : ratio >= required,
      verifiable,
      ...(reason ? { reason } : {}),
      foreground,
      background: resolution.color ? `rgb(${resolution.color.r}, ${resolution.color.g}, ${resolution.color.b})` : null,
      overImage: resolution.overImage,
    });
  }

  const recommendedMargin = Math.round(Math.min(canvas.width, canvas.height) * 0.04 * 10) / 10;
  const margins = computeMargins(canvas, visible, recommendedMargin);
  const alignment = computeAlignment(visible);
  const spacing = computeSpacing(visible);
  const layout = sampleLayout(canvas, visible);
  layout.overlaps = computeOverlaps(visible);
  layout.hiddenEssential = computeHiddenEssential(visible, order);

  const background = composite(backgroundResolution, { r: 255, g: 255, b: 255, a: 1 });
  const palette = buildPalette(visible, canvas.background ?? "#ffffff");

  const maxFontSize = Math.max(1, ...texts.map((block) => block.typography.fontSize));
  const canvasArea = canvas.width * canvas.height;
  const focalCandidates: FocalCandidate[] = visible
    .filter((element) => element.meta?.role !== "background")
    .map((element) => {
      const bounds = elementBounds(element);
      const areaRatio = Math.min(1, area(bounds) / canvasArea);
      const role = element.meta?.role ?? element.type;
      const roleWeight =
        role === "headline"
          ? 1.8
          : role === "cta"
            ? 1.5
            : role === "image"
              ? 1.3
              : role === "subheadline"
                ? 1.1
                : role === "decoration" || element.meta?.decorative
                  ? 0.35
                  : 0.8;
      const textBlock = texts.find((block) => block.element.id === element.id);
      const typeWeight = textBlock ? 0.6 + (textBlock.typography.fontSize / maxFontSize) * 1.4 : 1;
      const contrastWeight =
        element.type === "image" ? 1 : Math.min(1.4, 0.5 + Math.log2(1 + areaRatio * 20) * 0.25);
      const salience = Math.sqrt(areaRatio) * roleWeight * typeWeight * contrastWeight;
      return { elementId: element.id, role, salience, bounds };
    })
    .sort((a, b) => b.salience - a.salience);

  const zCounts = new Map<number, number>();
  for (const element of visible) {
    zCounts.set(element.zIndex, (zCounts.get(element.zIndex) ?? 0) + 1);
  }
  const duplicateZIndices = [...zCounts.entries()].filter(([, count]) => count > 1).map(([z]) => z);

  const effectCount = visible.reduce((sum, element) => sum + (element.effects?.length ?? 0), 0);
  const maxEffectsPerElement = visible.reduce(
    (max, element) => Math.max(max, element.effects?.length ?? 0),
    0,
  );

  const missingAssets = [
    ...new Set(
      [
        ...images.filter((entry) => !entry.available).map((entry) => entry.asset?.id ?? entry.element.assetId),
        ...(document.assets ?? [])
          .filter((asset) => context.assets !== undefined && context.assets.get(asset.id) === undefined)
          .map((asset) => asset.id),
      ].filter(Boolean),
    ),
  ];

  const requirements = [...(brief.contentRequirements ?? [])];
  const allText = texts.map((block) => block.text).join("\n");

  return {
    document,
    canvas,
    brief,
    unitsPerInch: ppi,
    targetAssetDpi,
    targetExportDpi,
    paintOrder: order,
    visible,
    texts,
    images,
    shapes,
    margins,
    alignment,
    spacing,
    layout,
    palette,
    background,
    contrastSamples,
    focalCandidates,
    effectCount,
    maxEffectsPerElement,
    duplicateZIndices,
    missingAssets: missingAssets as string[],
    fonts: [...fontsMap.values()].map((entry) => ({
      family: entry.family,
      elementIds: entry.elementIds,
      scripts: [...entry.scripts],
    })),
    scriptsUsed: [...scriptsUsed],
    requirements,
    allText,
  };
}

export function backgroundForElement(
  analysis: DocumentAnalysis,
  element: DesignElement,
  assets: AssetRegistry | undefined,
): BackgroundResolution {
  return resolveBackground(analysis.document, analysis.paintOrder, element, assets);
}
