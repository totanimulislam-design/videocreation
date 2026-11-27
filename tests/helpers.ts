import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DesignDocument, DesignElement } from "../src/core/design-document/types.ts";
import type { QualityContext } from "../src/quality/types.ts";
import { createAssetRegistry, createFontRegistry, availableAsset } from "../src/quality/registries.ts";
import type { VisualCritique } from "../src/quality/visual/critique-schema.ts";

export function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

export function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(fixturePath(name), "utf8")) as T;
}

export function strongPoster(): DesignDocument {
  return readFixture<DesignDocument>("poster-strong.json");
}

export function weakPoster(): DesignDocument {
  return readFixture<DesignDocument>("poster-weak.json");
}

export function strongCritique(): VisualCritique {
  return readFixture<VisualCritique>("critique-strong.json");
}

export const strongAssets = () => createAssetRegistry([availableAsset("studio-portrait", 1400, 2100)]);
export const studioFonts = () => createFontRegistry();

export function strongContext(): QualityContext {
  return {
    document: strongPoster(),
    fonts: studioFonts(),
    assets: strongAssets(),
    brief: {
      category: "poster",
      requiresCallToAction: true,
      contentRequirements: [
        { id: "title", label: "Title", value: "FORM FUNCTION", kind: "text" },
        { id: "date", label: "Date", value: "14–16 Dec 2026", kind: "date" },
      ],
    },
    exportSpecs: [{ format: "png", width: 1080, height: 1350 }],
  };
}

export const strongPipelineOptions = () => ({
  ...strongContext(),
  critique: strongCritique(),
});

export function findElement(document: DesignDocument, id: string): DesignElement | undefined {
  const visit = (elements: DesignElement[]): DesignElement | undefined => {
    for (const element of elements) {
      if (element.id === id) return element;
      if (element.children) {
        const found = visit(element.children);
        if (found) return found;
      }
    }
    return undefined;
  };
  return visit(document.elements);
}

/** Minimal valid one-element document for focused validator tests. */
export function miniDocument(
  overrides: Partial<DesignDocument> = {},
  elements: DesignElement[] = [],
): DesignDocument {
  return {
    id: "mini",
    name: "Mini",
    canvas: { width: 400, height: 500, unit: "px", background: "#ffffff" },
    elements,
    ...overrides,
  };
}
