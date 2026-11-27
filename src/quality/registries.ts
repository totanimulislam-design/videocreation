import type {
  AssetInfo,
  AssetRegistry,
  FontFaceInfo,
  FontRegistry,
} from "./types.ts";

/**
 * Registries for the resources a design depends on.
 *
 * A design document references fonts and assets by name, it never embeds
 * binary data. Availability therefore has to be resolved against the running
 * studio's resource inventory — treating an unknown family as "installed"
 * would let the engine approve artwork that cannot be rendered (quality metrics
 * §4 "Missing fonts" / "Missing images").
 */

export class MapFontRegistry implements FontRegistry {
  private readonly map: Map<string, FontFaceInfo>;

  constructor(faces: readonly Partial<FontFaceInfo>[] = []) {
    this.map = new Map(
      faces.map((face) => {
        const info: FontFaceInfo = {
          family: face.family ?? "",
          scripts: (face.scripts ?? ["latin"]).map((script) => script.toLowerCase()),
          weights: face.weights ?? [400],
          available: face.available ?? true,
          style: face.style ?? "normal",
          ...(face.source ? { source: face.source } : {}),
        };
        return [info.family.toLowerCase(), info];
      }),
    );
  }

  get(family: string): FontFaceInfo | undefined {
    return this.map.get(family.trim().toLowerCase());
  }

  has(family: string): boolean {
    return this.get(family)?.available === true;
  }

  families(): string[] {
    return [...this.map.values()].map((face) => face.family);
  }
}

export class MapAssetRegistry implements AssetRegistry {
  private readonly map: Map<string, AssetInfo>;

  constructor(assets: readonly AssetInfo[] = []) {
    this.map = new Map(assets.map((asset) => [asset.id, asset]));
  }

  get(assetId: string): AssetInfo | undefined {
    return this.map.get(assetId);
  }

  has(assetId: string): boolean {
    return this.get(assetId)?.available === true;
  }

  ids(): string[] {
    return [...this.map.keys()];
  }
}

/**
 * The studio's declared font library (README.md §4.3). Every face listed here
 * ships with the platform or is loaded from the documented provider, and its
 * script coverage is what multilingual validation checks against.
 */
export const STUDIO_FONT_LIBRARY: FontFaceInfo[] = [
  { family: "Inter", scripts: ["latin"], weights: [300, 400, 500, 600, 700, 800, 900], available: true, source: "google" },
  { family: "Roboto", scripts: ["latin"], weights: [300, 400, 500, 700, 900], available: true, source: "google" },
  { family: "Montserrat", scripts: ["latin"], weights: [300, 400, 500, 600, 700, 800, 900], available: true, source: "google" },
  { family: "Poppins", scripts: ["latin"], weights: [300, 400, 500, 600, 700, 800], available: true, source: "google" },
  { family: "DM Sans", scripts: ["latin"], weights: [400, 500, 700], available: true, source: "google" },
  { family: "Space Grotesk", scripts: ["latin"], weights: [300, 400, 500, 700], available: true, source: "google" },
  { family: "Playfair Display", scripts: ["latin"], weights: [400, 500, 600, 700, 800, 900], available: true, source: "google" },
  { family: "Lora", scripts: ["latin"], weights: [400, 500, 600, 700], available: true, source: "google" },
  { family: "Merriweather", scripts: ["latin"], weights: [300, 400, 700, 900], available: true, source: "google" },
  { family: "Oswald", scripts: ["latin"], weights: [300, 400, 500, 600, 700], available: true, source: "google" },
  { family: "Bebas Neue", scripts: ["latin"], weights: [400], available: true, source: "google" },
  { family: "Noto Sans Bengali", scripts: ["latin", "bengali"], weights: [300, 400, 500, 600, 700], available: true, source: "google" },
  { family: "Hind Siliguri", scripts: ["latin", "bengali"], weights: [300, 400, 500, 600, 700], available: true, source: "google" },
  { family: "Baloo Da 2", scripts: ["latin", "bengali"], weights: [400, 500, 600, 700, 800], available: true, source: "google" },
  { family: "Noto Naskh Arabic", scripts: ["arabic"], weights: [400, 500, 700], available: true, source: "google" },
  { family: "Noto Sans Arabic", scripts: ["arabic", "latin"], weights: [300, 400, 500, 600, 700], available: true, source: "google" },
  { family: "Cairo", scripts: ["arabic", "latin"], weights: [300, 400, 600, 700, 900], available: true, source: "google" },
  { family: "Amiri", scripts: ["arabic"], weights: [400, 700], available: true, source: "google" },
];

export function createFontRegistry(
  faces: readonly Partial<FontFaceInfo>[] = STUDIO_FONT_LIBRARY,
): FontRegistry {
  return new MapFontRegistry(faces);
}

export function createAssetRegistry(assets: readonly AssetInfo[] = []): AssetRegistry {
  return new MapAssetRegistry(assets);
}

/** Convenience helper for tests and fixtures: a fully available placeholder asset. */
export function availableAsset(
  id: string,
  width: number,
  height: number,
  extra: Partial<AssetInfo> = {},
): AssetInfo {
  return {
    id,
    available: true,
    width,
    height,
    mimeType: "image/jpeg",
    ...extra,
  };
}
