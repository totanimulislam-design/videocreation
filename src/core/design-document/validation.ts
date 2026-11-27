import { ELEMENT_TYPES } from "./types.ts";
import type { DesignDocument, DesignElement, Typography } from "./types.ts";

/**
 * Structural validation of a design document.
 *
 * Enforces the hard requirements from README.md §7.1: valid object types,
 * valid transforms, valid dimensions, unique ids, valid references and
 * serializability. This is the schema gate that runs before any rendering or
 * scoring, per AGENTS.md §4 ("Schema validation before rendering").
 *
 * A future Zod schema can replace the hand-written checks without changing the
 * `DocumentValidationResult` contract used by the Quality Engine.
 */

export interface SchemaProblem {
  path: string;
  message: string;
  severity: "critical" | "warning";
}

export interface DocumentValidationResult {
  valid: boolean;
  problems: SchemaProblem[];
}

const TEXT_ROLES = new Set([
  "headline",
  "subheadline",
  "subheading",
  "body",
  "caption",
  "label",
  "cta",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateTypography(
  typography: Typography | undefined,
  path: string,
  problems: SchemaProblem[],
): void {
  if (!typography || typeof typography !== "object") {
    problems.push({ path, message: "Text element is missing typography settings.", severity: "critical" });
    return;
  }
  if (typeof typography.fontFamily !== "string" || typography.fontFamily.trim() === "") {
    problems.push({ path: `${path}.fontFamily`, message: "fontFamily must be a non-empty string.", severity: "critical" });
  }
  if (!isFiniteNumber(typography.fontSize) || typography.fontSize <= 0) {
    problems.push({ path: `${path}.fontSize`, message: "fontSize must be a positive number.", severity: "critical" });
  }
  if (!isFiniteNumber(typography.lineHeight) || typography.lineHeight <= 0) {
    problems.push({ path: `${path}.lineHeight`, message: "lineHeight must be a positive number.", severity: "critical" });
  }
  if (!isFiniteNumber(typography.fontWeight) || typography.fontWeight < 100 || typography.fontWeight > 1000) {
    problems.push({ path: `${path}.fontWeight`, message: "fontWeight must be between 100 and 1000.", severity: "warning" });
  }
  if (
    typography.letterSpacing !== undefined &&
    !isFiniteNumber(typography.letterSpacing)
  ) {
    problems.push({ path: `${path}.letterSpacing`, message: "letterSpacing must be a finite number.", severity: "critical" });
  }
  if (
    typography.maxLines !== undefined &&
    (!isFiniteNumber(typography.maxLines) || typography.maxLines <= 0)
  ) {
    problems.push({ path: `${path}.maxLines`, message: "maxLines must be a positive number.", severity: "critical" });
  }
}

function validateElement(
  element: DesignElement,
  path: string,
  document: DesignDocument,
  ids: Map<string, string>,
  problems: SchemaProblem[],
): void {
  if (!element || typeof element !== "object") {
    problems.push({ path, message: "Element must be an object.", severity: "critical" });
    return;
  }
  if (typeof element.id !== "string" || element.id.trim() === "") {
    problems.push({ path: `${path}.id`, message: "Element id must be a non-empty string.", severity: "critical" });
  } else if (ids.has(element.id)) {
    problems.push({
      path: `${path}.id`,
      message: `Duplicate element id "${element.id}" (also at ${ids.get(element.id)}).`,
      severity: "critical",
    });
  } else {
    ids.set(element.id, path);
  }

  if (!ELEMENT_TYPES.includes(element.type)) {
    problems.push({
      path: `${path}.type`,
      message: `Unsupported element type "${String(element.type)}".`,
      severity: "critical",
    });
  }

  if (typeof element.name !== "string") {
    problems.push({ path: `${path}.name`, message: "Element name must be a string.", severity: "warning" });
  }

  const transform = element.transform;
  if (!transform || typeof transform !== "object") {
    problems.push({ path: `${path}.transform`, message: "Element is missing a transform.", severity: "critical" });
  } else {
    for (const key of ["x", "y", "width", "height", "rotation", "scaleX", "scaleY"] as const) {
      if (!isFiniteNumber(transform[key])) {
        problems.push({
          path: `${path}.transform.${key}`,
          message: `transform.${key} must be a finite number.`,
          severity: "critical",
        });
      }
    }
    if (isFiniteNumber(transform.width) && transform.width < 0) {
      problems.push({ path: `${path}.transform.width`, message: "transform.width must not be negative.", severity: "critical" });
    }
    if (isFiniteNumber(transform.height) && transform.height < 0) {
      problems.push({ path: `${path}.transform.height`, message: "transform.height must not be negative.", severity: "critical" });
    }
    if (isFiniteNumber(transform.scaleX) && transform.scaleX === 0) {
      problems.push({ path: `${path}.transform.scaleX`, message: "transform.scaleX must not be zero.", severity: "critical" });
    }
    if (isFiniteNumber(transform.scaleY) && transform.scaleY === 0) {
      problems.push({ path: `${path}.transform.scaleY`, message: "transform.scaleY must not be zero.", severity: "critical" });
    }
  }

  if (!element.style || typeof element.style !== "object") {
    problems.push({ path: `${path}.style`, message: "Element is missing a style object.", severity: "critical" });
  } else {
    if (element.style.opacity !== undefined && (!isFiniteNumber(element.style.opacity) || element.style.opacity < 0 || element.style.opacity > 1)) {
      problems.push({ path: `${path}.style.opacity`, message: "style.opacity must be between 0 and 1.", severity: "critical" });
    }
    if (element.style.strokeWidth !== undefined && (!isFiniteNumber(element.style.strokeWidth) || element.style.strokeWidth < 0)) {
      problems.push({ path: `${path}.style.strokeWidth`, message: "style.strokeWidth must be a non-negative number.", severity: "critical" });
    }
  }

  if (typeof element.visible !== "boolean") {
    problems.push({ path: `${path}.visible`, message: "visible must be a boolean.", severity: "critical" });
  }
  if (typeof element.locked !== "boolean") {
    problems.push({ path: `${path}.locked`, message: "locked must be a boolean.", severity: "warning" });
  }
  if (!isFiniteNumber(element.zIndex)) {
    problems.push({ path: `${path}.zIndex`, message: "zIndex must be a finite number.", severity: "critical" });
  }

  if (element.type === "text") {
    if (typeof element.text !== "string" || element.text.length === 0) {
      problems.push({ path: `${path}.text`, message: "Text element has no text content.", severity: "warning" });
    }
    validateTypography(element.typography, `${path}.typography`, problems);
  }

  if (element.type === "image") {
    if (typeof element.assetId !== "string" || element.assetId.trim() === "") {
      problems.push({ path: `${path}.assetId`, message: "Image element is missing an assetId.", severity: "critical" });
    } else if (Array.isArray(document.assets) && document.assets.length > 0) {
      const declared = document.assets.some((asset) => asset.id === element.assetId);
      if (!declared) {
        problems.push({
          path: `${path}.assetId`,
          message: `Image references undeclared asset "${element.assetId}".`,
          severity: "critical",
        });
      }
    }
  }

  if (element.type === "path") {
    if (typeof element.pathData !== "string" || element.pathData.trim() === "") {
      problems.push({ path: `${path}.pathData`, message: "Path element is missing path data.", severity: "critical" });
    } else if (!/^[MmZzLlHhVvCcSsQqTtAa0-9eE.,\s+-]+$/.test(element.pathData)) {
      problems.push({ path: `${path}.pathData`, message: "Path data contains unsupported characters.", severity: "critical" });
    }
  }

  if (element.type === "line") {
    for (const key of ["x1", "y1", "x2", "y2"] as const) {
      if (!isFiniteNumber(element[key])) {
        problems.push({ path: `${path}.${key}`, message: `line ${key} must be a finite number.`, severity: "critical" });
      }
    }
  }

  if (element.meta && element.meta.role && TEXT_ROLES.has(element.meta.role) && element.type !== "text") {
    problems.push({
      path: `${path}.meta.role`,
      message: `Role "${element.meta.role}" requires a text element.`,
      severity: "warning",
    });
  }

  if (Array.isArray(element.children)) {
    element.children.forEach((child, index) => {
      validateElement(child, `${path}.children[${index}]`, document, ids, problems);
    });
  }
}

export function validateDesignDocument(input: unknown): DocumentValidationResult {
  const problems: SchemaProblem[] = [];

  if (!input || typeof input !== "object") {
    return {
      valid: false,
      problems: [{ path: "$", message: "Design document must be an object.", severity: "critical" }],
    };
  }

  const document = input as DesignDocument;

  if (typeof document.id !== "string" || document.id.trim() === "") {
    problems.push({ path: "$.id", message: "Document id must be a non-empty string.", severity: "critical" });
  }

  const canvas = document.canvas;
  if (!canvas || typeof canvas !== "object") {
    problems.push({ path: "$.canvas", message: "Document is missing canvas dimensions.", severity: "critical" });
  } else {
    if (!isFiniteNumber(canvas.width) || canvas.width <= 0) {
      problems.push({ path: "$.canvas.width", message: "canvas.width must be a positive number.", severity: "critical" });
    }
    if (!isFiniteNumber(canvas.height) || canvas.height <= 0) {
      problems.push({ path: "$.canvas.height", message: "canvas.height must be a positive number.", severity: "critical" });
    }
    if (!["px", "mm", "in"].includes(canvas.unit)) {
      problems.push({ path: "$.canvas.unit", message: "canvas.unit must be one of px, mm, in.", severity: "critical" });
    }
    if (canvas.dpi !== undefined && (!isFiniteNumber(canvas.dpi) || canvas.dpi <= 0)) {
      problems.push({ path: "$.canvas.dpi", message: "canvas.dpi must be a positive number.", severity: "critical" });
    }
    if (canvas.bleed !== undefined && (!isFiniteNumber(canvas.bleed) || canvas.bleed < 0)) {
      problems.push({ path: "$.canvas.bleed", message: "canvas.bleed must be a non-negative number.", severity: "critical" });
    }
    if (canvas.safeMargin !== undefined && (!isFiniteNumber(canvas.safeMargin) || canvas.safeMargin < 0)) {
      problems.push({ path: "$.canvas.safeMargin", message: "canvas.safeMargin must be a non-negative number.", severity: "critical" });
    }
  }

  if (!Array.isArray(document.elements)) {
    problems.push({ path: "$.elements", message: "Document elements must be an array.", severity: "critical" });
  } else {
    const ids = new Map<string, string>();
    document.elements.forEach((element, index) => {
      validateElement(element, `$.elements[${index}]`, document, ids, problems);
    });
    if (document.elements.length === 0) {
      problems.push({ path: "$.elements", message: "Document contains no elements.", severity: "critical" });
    }
  }

  if (document.assets !== undefined && !Array.isArray(document.assets)) {
    problems.push({ path: "$.assets", message: "assets must be an array.", severity: "critical" });
  }
  if (document.fonts !== undefined && !Array.isArray(document.fonts)) {
    problems.push({ path: "$.fonts", message: "fonts must be an array.", severity: "critical" });
  }

  try {
    JSON.stringify(document);
  } catch {
    problems.push({ path: "$", message: "Document is not serializable to JSON.", severity: "critical" });
  }

  const valid = !problems.some((problem) => problem.severity === "critical");
  return { valid, problems };
}
