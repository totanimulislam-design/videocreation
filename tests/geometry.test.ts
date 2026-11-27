import test from "node:test";
import assert from "node:assert/strict";
import {
  area,
  boundsOf,
  containsPoint,
  containsRect,
  inset,
  intersection,
  intersectionArea,
  overlapRatio,
  union,
} from "../src/core/geometry/bounds.ts";

test("bounds apply scale and rotation", () => {
  assert.deepEqual(boundsOf({ x: 10, y: 20, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1 }), {
    x: 10,
    y: 20,
    width: 100,
    height: 50,
  });
  assert.deepEqual(boundsOf({ x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 2, scaleY: 0.5 }), {
    x: 0,
    y: 0,
    width: 200,
    height: 25,
  });
  const rotated = boundsOf({ x: 0, y: 0, width: 100, height: 100, rotation: 45, scaleX: 1, scaleY: 1 });
  assert.ok(Math.abs(rotated.width - 141.42) < 0.01);
  assert.ok(Math.abs(rotated.x + 20.71) < 0.01);
});

test("intersection and containment", () => {
  const a = { x: 0, y: 0, width: 100, height: 100 };
  const b = { x: 50, y: 50, width: 100, height: 100 };
  assert.deepEqual(intersection(a, b), { x: 50, y: 50, width: 50, height: 50 });
  assert.equal(intersectionArea(a, b), 2500);
  assert.equal(area(a), 10000);
  assert.equal(overlapRatio(a, b), 0.25);
  assert.equal(intersection({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 5, height: 5 }), null);
  assert.equal(containsRect(a, { x: 10, y: 10, width: 50, height: 50 }), true);
  assert.equal(containsRect(a, { x: 10, y: 10, width: 200, height: 50 }), false);
  assert.equal(containsRect(a, { x: -1, y: 0, width: 10, height: 10 }, 1), true);
  assert.equal(containsPoint(a, { x: 0, y: 0 }), true);
  assert.equal(containsPoint(a, { x: 101, y: 0 }), false);
});

test("inset, union and empty rects", () => {
  const rect = { x: 10, y: 10, width: 100, height: 100 };
  assert.deepEqual(inset(rect, 10), { x: 20, y: 20, width: 80, height: 80 });
  assert.deepEqual(union(rect, { x: 200, y: 200, width: 10, height: 10 }), {
    x: 10,
    y: 10,
    width: 200,
    height: 200,
  });
  assert.equal(overlapRatio({ x: 0, y: 0, width: 0, height: 0 }, rect), 0);
});
