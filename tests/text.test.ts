import test from "node:test";
import assert from "node:assert/strict";
import { ApproximateTextMeasurer, defaultTextMeasurer, detectScripts, wrapText } from "../src/quality/text/measure.ts";
import { normalizeForComparison } from "../src/quality/text/normalize.ts";
import type { Typography } from "../src/core/design-document/types.ts";

const typography: Typography = {
  fontFamily: "Inter",
  fontSize: 20,
  fontWeight: 400,
  lineHeight: 1.5,
};

test("wraps text at word boundaries within the measure", () => {
  const lines = wrapText("the quick brown fox jumps over the lazy dog", typography, 120);
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(defaultTextMeasurer.measure(line, typography, {}).width <= 120 + 0.001);
  }
  assert.equal(lines.join(" "), "the quick brown fox jumps over the lazy dog");
});

test("honours explicit line breaks", () => {
  const lines = wrapText("FORM\nFUNCTION", typography, 1000);
  assert.deepEqual(lines, ["FORM", "FUNCTION"]);
});

test("hard-breaks tokens that cannot fit", () => {
  const lines = wrapText("supercalifragilisticexpialidocious", typography, 40);
  assert.ok(lines.length > 3);
  assert.equal(lines.join(""), "supercalifragilisticexpialidocious");
});

test("measurement height scales with line count and leading", () => {
  const single = defaultTextMeasurer.measure("hello", typography, { maxWidth: 200, wrap: true });
  const multi = defaultTextMeasurer.measure("hello world this is a longer line", typography, {
    maxWidth: 80,
    wrap: true,
  });
  assert.equal(single.height, 20 * 1.5);
  assert.ok(multi.lines.length > 1);
  assert.equal(multi.height, multi.lines.length * 20 * 1.5);
});

test("measurements are flagged as approximate", () => {
  assert.equal(defaultTextMeasurer.measure("abc", typography, {}).approximate, true);
  const wide = new ApproximateTextMeasurer({ widthFactor: 1.5 });
  const normal = new ApproximateTextMeasurer();
  assert.ok(wide.measure("abc", typography, {}).width > normal.measure("abc", typography, {}).width);
});

test("detects non-latin scripts", () => {
  assert.deepEqual(detectScripts("Hello"), ["latin"]);
  assert.deepEqual(detectScripts("টাইপোগ্রাফি"), ["bengali"]);
  assert.deepEqual(detectScripts("الخط العربي"), ["arabic"]);
  assert.ok(detectScripts("টাইপোগ্রাফি 2026").includes("bengali"));
});

test("normalizes user content without inventing characters", () => {
  assert.equal(normalizeForComparison("  Form   /  Function "), "form / function");
  assert.equal(normalizeForComparison("14–16 DEC"), normalizeForComparison("14-16 dec"));
  assert.equal(normalizeForComparison("‘Hello’"), "'hello'");
  assert.notEqual(normalizeForComparison("+880 1700"), normalizeForComparison("+880 1701"));
});
