import type { DesignDocument, DesignElement } from "./types.ts";

/**
 * Depth-first traversal of the document element tree in z-order.
 * Children inherit the paint order of their parent group.
 */
export function walkElements(
  elements: readonly DesignElement[],
  visit: (element: DesignElement, parent: DesignElement | undefined, depth: number) => void,
  parent?: DesignElement,
  depth = 0,
): void {
  const ordered = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  for (const element of ordered) {
    visit(element, parent, depth);
    if (element.children && element.children.length > 0) {
      walkElements(element.children, visit, element, depth + 1);
    }
  }
}

export function allElements(document: DesignDocument): DesignElement[] {
  const result: DesignElement[] = [];
  walkElements(document.elements, (element) => result.push(element));
  return result;
}

export function findElement(
  document: DesignDocument,
  id: string,
): DesignElement | undefined {
  return allElements(document).find((element) => element.id === id);
}

export function isTextElement(element: DesignElement): element is Extract<DesignElement, { type: "text" }> {
  return element.type === "text";
}

export function isImageElement(element: DesignElement): element is Extract<DesignElement, { type: "image" }> {
  return element.type === "image";
}

export function isShapeElement(element: DesignElement): boolean {
  return (
    element.type === "rectangle" ||
    element.type === "circle" ||
    element.type === "ellipse" ||
    element.type === "polygon" ||
    element.type === "decoration" ||
    element.type === "frame"
  );
}

/** Flattened z-order, matching paint order across groups. */
export function paintOrder(document: DesignDocument): DesignElement[] {
  return allElements(document);
}
