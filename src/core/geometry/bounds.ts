import type { DesignElement, Transform } from "../design-document/types.ts";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Axis-aligned bounding box of a transform in document space.
 * Rotation is expanded to the enclosing axis-aligned box; scale is applied
 * around the element origin, matching the renderer contract.
 */
export function boundsOf(transform: Transform): Rect {
  const width = Math.abs(transform.width * transform.scaleX);
  const height = Math.abs(transform.height * transform.scaleY);
  if (!transform.rotation) {
    return { x: transform.x, y: transform.y, width, height };
  }
  const radians = (transform.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const rotatedWidth = width * cos + height * sin;
  const rotatedHeight = width * sin + height * cos;
  const centerX = transform.x + width / 2;
  const centerY = transform.y + height / 2;
  return {
    x: centerX - rotatedWidth / 2,
    y: centerY - rotatedHeight / 2,
    width: rotatedWidth,
    height: rotatedHeight,
  };
}

export function elementBounds(element: DesignElement): Rect {
  return boundsOf(element.transform);
}

export function right(rect: Rect): number {
  return rect.x + rect.width;
}

export function bottom(rect: Rect): number {
  return rect.y + rect.height;
}

export function area(rect: Rect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

export function isEmpty(rect: Rect): boolean {
  return rect.width <= 0 || rect.height <= 0;
}

export function containsPoint(rect: Rect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function containsRect(outer: Rect, inner: Rect, tolerance = 0): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    right(inner) <= right(outer) + tolerance &&
    bottom(inner) <= bottom(outer) + tolerance
  );
}

export function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(right(a), right(b));
  const y2 = Math.min(bottom(a), bottom(b));
  if (x2 <= x || y2 <= y) return null;
  return { x, y, width: x2 - x, height: y2 - y };
}

export function intersectionArea(a: Rect, b: Rect): number {
  const overlap = intersection(a, b);
  return overlap ? area(overlap) : 0;
}

export function inset(rect: Rect, amount: number): Rect {
  return {
    x: rect.x + amount,
    y: rect.y + amount,
    width: rect.width - amount * 2,
    height: rect.height - amount * 2,
  };
}

export function expand(rect: Rect, amount: number): Rect {
  return inset(rect, -amount);
}

export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(right(a), right(b)) - x,
    height: Math.max(bottom(a), bottom(b)) - y,
  };
}

export function center(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Shortest distance from a point to the rect boundary (0 when inside). */
export function distanceToRect(rect: Rect, point: { x: number; y: number }): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - right(rect));
  const dy = Math.max(rect.y - point.y, 0, point.y - bottom(rect));
  return Math.hypot(dx, dy);
}

export function rectsEqual(a: Rect, b: Rect, tolerance = 0.5): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

/** Overlap along a single axis, used for baseline/edge alignment detection. */
export function overlapRatio(a: Rect, b: Rect): number {
  const smaller = Math.min(area(a), area(b));
  if (smaller <= 0) return 0;
  return intersectionArea(a, b) / smaller;
}
