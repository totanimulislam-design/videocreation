import test from "node:test";
import assert from "node:assert/strict";
import {
  composite,
  contrastRatio,
  hueDistance,
  parseColor,
  readableTextColor,
  relativeLuminance,
  toHex,
  toHsl,
} from "../src/core/color/color.ts";

test("parses hex, rgb, hsl and named colours", () => {
  assert.deepEqual(parseColor("#000"), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor("#ffffff"), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor("#f5c54280"), { r: 245, g: 197, b: 66, a: 128 / 255 });
  assert.deepEqual(parseColor("rgb(10, 20, 30)"), { r: 10, g: 20, b: 30, a: 1 });
  assert.deepEqual(parseColor("rgba(10, 20, 30, 0.5)"), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseColor("black"), { r: 0, g: 0, b: 0, a: 1 });
  assert.equal(parseColor("transparent")?.a, 0);
  assert.equal(parseColor("none")?.a, 0);
  const hsl = parseColor("hsl(0, 100%, 50%)");
  assert.equal(hsl?.r, 255);
  assert.equal(hsl?.g, 0);
  assert.equal(hsl?.b, 0);
});

test("does not guess unparseable paints", () => {
  assert.equal(parseColor("url(#gradient)"), null);
  assert.equal(parseColor("linear-gradient(90deg, #000, #fff)"), null);
  assert.equal(parseColor(""), null);
  assert.equal(parseColor(undefined), null);
});

test("red is not treated as a hex value by accident", () => {
  // 'red' must resolve through keywords, not hex parsing.
  assert.deepEqual(parseColor("red"), { r: 255, g: 0, b: 0, a: 1 });
  assert.equal(toHex(parseColor("redex") ?? { r: 0, g: 0, b: 0, a: 1 }), "#000000");
  assert.equal(parseColor("redex"), null);
});

test("WCAG contrast extremes and symmetry", () => {
  const black = parseColor("#000000")!;
  const white = parseColor("#ffffff")!;
  assert.equal(Math.round(contrastRatio(black, white) * 100) / 100, 21);
  assert.equal(contrastRatio(black, white), contrastRatio(white, black));
  assert.equal(relativeLuminance(white), 1);
  assert.equal(relativeLuminance(black), 0);
});

test("alpha compositing follows source-over", () => {
  const half = composite(
    { r: 255, g: 255, b: 255, a: 0.5 },
    { r: 0, g: 0, b: 0, a: 1 },
  );
  assert.equal(half.r, 128);
  assert.equal(half.a, 1);
  const fullyTransparent = composite(
    { r: 255, g: 0, b: 0, a: 0 },
    { r: 10, g: 10, b: 10, a: 1 },
  );
  assert.deepEqual(fullyTransparent, { r: 10, g: 10, b: 10, a: 1 });
});

test("readable text colour picks the higher contrast option", () => {
  assert.equal(toHex(readableTextColor(parseColor("#111111")!)), "#ffffff");
  assert.equal(toHex(readableTextColor(parseColor("#f5f5f5")!)), "#000000");
});

test("HSL conversion and hue distance", () => {
  const hsl = toHsl(parseColor("#ff0000")!);
  assert.equal(Math.round(hsl.h), 0);
  assert.equal(Math.round(hsl.s), 1);
  assert.equal(hueDistance(350, 10), 20);
  assert.equal(hueDistance(10, 350), 20);
});
