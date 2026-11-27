import test from "node:test";
import assert from "node:assert/strict";
import { validateDesignDocument } from "../src/core/design-document/validation.ts";
import { allElements, paintOrder } from "../src/core/design-document/traverse.ts";
import { document as doc, image, shape, text } from "../src/core/design-document/factory.ts";
import { miniDocument, strongPoster } from "./helpers.ts";

test("factory documents are structurally valid", () => {
  const result = validateDesignDocument(strongPoster());
  assert.deepEqual(result.problems.filter((problem) => problem.severity === "critical"), []);
  assert.equal(result.valid, true);
});

test("rejects non-objects and invalid canvases", () => {
  assert.equal(validateDesignDocument(null).valid, false);
  const invalid = miniDocument({ canvas: { width: 0, height: -10, unit: "px" } });
  const result = validateDesignDocument(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.path === "$.canvas.width"));
  assert.ok(result.problems.some((problem) => problem.path === "$.canvas.height"));
});

test("rejects duplicate ids and empty documents", () => {
  const duplicate = miniDocument({}, [
    text({ id: "a", x: 0, y: 0, width: 10, height: 10, text: "x", typography: { fontFamily: "Inter", fontSize: 12 } }),
    shape({ id: "a", x: 0, y: 0, width: 10, height: 10 }),
  ]);
  assert.ok(validateDesignDocument(duplicate).problems.some((problem) => problem.message.includes("Duplicate element id")));

  const empty = miniDocument({}, []);
  assert.ok(validateDesignDocument(empty).problems.some((problem) => problem.message.includes("no elements")));
});

test("rejects invalid transforms and undeclared assets", () => {
  const bad = miniDocument({ assets: [{ id: "declared" }] }, [
    image({ id: "img", x: 0, y: 0, width: 100, height: 100, assetId: "undeclared", scaleX: 0 }),
    image({ id: "ok", x: 0, y: 0, width: 100, height: 100, assetId: "declared" }),
  ]);
  const result = validateDesignDocument(bad);
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.message.includes("undeclared asset")));
  assert.ok(result.problems.some((problem) => problem.path.includes("scaleX")));
});

test("rejects malformed path data and missing typography", () => {
  const document = miniDocument({}, [
    {
      id: "path",
      type: "path",
      name: "Path",
      transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0, scaleX: 1, scaleY: 1 },
      style: {},
      visible: true,
      locked: false,
      zIndex: 1,
      pathData: "<script>alert(1)</script>",
    },
    {
      id: "broken-text",
      type: "text",
      name: "Broken",
      transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0, scaleX: 1, scaleY: 1 },
      style: {},
      visible: true,
      locked: false,
      zIndex: 2,
      text: "hello",
    } as unknown as ReturnType<typeof shape>,
  ]);
  const result = validateDesignDocument(document);
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.message.includes("unsupported characters")));
  assert.ok(result.problems.some((problem) => problem.message.includes("typography")));
});

test("traversal is depth-first in z-order", () => {
  const document = doc({
    id: "nesting",
    canvas: { width: 200, height: 200 },
    elements: [
      shape({ id: "back", x: 0, y: 0, width: 10, height: 10, zIndex: 1 }),
      {
        ...shape({ id: "group", x: 0, y: 0, width: 10, height: 10, zIndex: 2 }),
        type: "group",
        children: [
          shape({ id: "child-b", x: 0, y: 0, width: 5, height: 5, zIndex: 9 }),
          shape({ id: "child-a", x: 0, y: 0, width: 5, height: 5, zIndex: 3 }),
        ],
      },
    ],
  });
  assert.deepEqual(
    paintOrder(document).map((element) => element.id),
    ["back", "group", "child-a", "child-b"],
  );
  assert.equal(allElements(document).length, 4);
});
