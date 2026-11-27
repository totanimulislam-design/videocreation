import test from "node:test";
import assert from "node:assert/strict";
import { generatePreview } from "../src/quality/visual/preview-generator.ts";
import { document as doc, group, image, shape, text } from "../src/core/design-document/factory.ts";
import { strongPoster } from "./helpers.ts";

test("preview is valid-looking SVG at document size", () => {
  const preview = generatePreview(strongPoster());
  assert.equal(preview.format, "svg");
  assert.equal(preview.width, 1080);
  assert.equal(preview.height, 1350);
  assert.ok(preview.preview.startsWith("<svg"));
  assert.ok(preview.preview.trimEnd().endsWith("</svg>"));
  assert.ok(preview.preview.includes('viewBox="0 0 1080 1350"'));
  assert.equal(preview.fromSameDocument, true);
  assert.equal(preview.approximateTextMetrics, true);
});

test("preview reports the elements it painted", () => {
  const document = strongPoster();
  const preview = generatePreview(document);
  const visible = document.elements.filter((element) => element.visible).map((element) => element.id);
  for (const id of visible) {
    assert.ok(preview.elementIds?.includes(id), `preview should include ${id}`);
  }
});

test("text is escaped and clipped to its frame", () => {
  const document = doc({
    id: "escape",
    canvas: { width: 300, height: 200 },
    elements: [
      text({
        id: "t",
        x: 10,
        y: 10,
        width: 200,
        height: 60,
        text: 'Fish & chips <script>alert("x")</script>',
        typography: { fontFamily: "Inter", fontSize: 16, lineHeight: 1.4 },
      }),
    ],
  });
  const preview = generatePreview(document);
  assert.ok(preview.preview.includes("Fish &amp; chips"));
  assert.equal(preview.preview.includes("<script>"), false);
  assert.ok(preview.preview.includes('clip-path="url(#clip-t)"'));
});

test("shapes, paths, groups and image placeholders render", () => {
  const document = doc({
    id: "shapes",
    canvas: { width: 400, height: 400 },
    assets: [{ id: "hero" }],
    elements: [
      shape({ id: "rect", x: 0, y: 0, width: 400, height: 400, style: { fill: "#101010" } }),
      { ...shape({ id: "circle", type: "circle", x: 10, y: 10, width: 100, height: 100 }), type: "circle" },
      {
        id: "path",
        type: "path",
        name: "Path",
        transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        style: { stroke: "#fff", strokeWidth: 2 },
        visible: true,
        locked: false,
        zIndex: 3,
        pathData: "M0 0 L100 100",
      },
      image({ id: "img", x: 200, y: 200, width: 200, height: 200, assetId: "hero", zIndex: 4 }),
      group({ id: "grp", x: 0, y: 0, width: 50, height: 50, zIndex: 5 }, [
        shape({ id: "child", x: 0, y: 0, width: 20, height: 20, zIndex: 1 }),
      ]),
    ],
  });
  const preview = generatePreview(document);
  assert.ok(preview.preview.includes("<ellipse"));
  assert.ok(preview.preview.includes('<path d="M0 0 L100 100"'));
  assert.ok(preview.preview.includes("hero"));
  assert.ok(preview.preview.includes('id="child"') === false); // ids are not emitted as attributes
  assert.ok(preview.preview.includes("<rect"));
});

test("effects become SVG filters", () => {
  const document = doc({
    id: "fx",
    canvas: { width: 200, height: 200 },
    elements: [
      {
        ...shape({ id: "card", x: 20, y: 20, width: 100, height: 100 }),
        effects: [
          { type: "shadow", dx: 0, dy: 6, blur: 12, color: "rgba(0,0,0,0.3)" },
          { type: "glow", radius: 8 },
        ],
      },
    ],
  });
  const preview = generatePreview(document);
  assert.ok(preview.preview.includes("feDropShadow"));
  assert.ok(preview.preview.includes("feGaussianBlur"));
  assert.ok(preview.preview.includes('filter="url(#fx-card)"'));
});

test("hidden elements are not rendered", () => {
  const document = doc({
    id: "hidden",
    canvas: { width: 100, height: 100 },
    elements: [shape({ id: "ghost", x: 0, y: 0, width: 50, height: 50, visible: false })],
  });
  const preview = generatePreview(document);
  assert.equal(preview.elementIds?.includes("ghost"), false);
  assert.equal(preview.preview.includes("ghost"), false);
});
