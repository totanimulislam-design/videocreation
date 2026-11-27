import type { DocumentAnalysis } from "../analysis.ts";
import type { QualityContext, QualityIssue } from "../types.ts";
import { createIssue, round } from "./issue.ts";

const VALIDATOR = "asset-validator";

/**
 * Image and asset validation (README §7, quality metrics §3.7, §4).
 *
 * Missing imagery is a rendering failure and therefore critical. Resolution is
 * judged against the physical size the image occupies, not its pixel count
 * alone (quality metrics §11).
 */
export function validateAssets(analysis: DocumentAnalysis, context: QualityContext): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const seen = new Set<string>();

  for (const entry of analysis.images) {
    const { element } = entry;
    if (seen.has(element.assetId)) continue;
    seen.add(element.assetId);

    if (!entry.available) {
      const declared = (context.document.assets ?? []).find((asset) => asset.id === element.assetId);
      issues.push(
        createIssue({
          code: "ASSET_MISSING",
          title: "Missing image asset",
          category: "asset",
          severity: "critical",
          message: declared
            ? `Asset "${element.assetId}" is declared in the document but is not available to the renderer.`
            : `Image element references asset "${element.assetId}", which is not part of the document or the asset store.`,
          elementIds: [element.id],
          recommendation:
            "Upload or restore the asset before rendering; a preview with placeholder rectangles cannot be delivered.",
          revision: {
            action: "provide_asset",
            elementIds: [element.id],
            parameters: { assetId: element.assetId },
          },
          validator: VALIDATOR,
        }),
      );
      continue;
    }

    if (entry.fit === "fill" && (entry.stretchRatio < 0.95 || entry.stretchRatio > 1.05)) {
      issues.push(
        createIssue({
          code: "IMAGE_DISTORTED",
          title: "Distorted image",
          category: "asset",
          severity: "high",
          measured: { value: round(entry.stretchRatio, 2), expected: 1, unit: "intrinsic:frame aspect ratio" },
          message: `Image "${element.name}" is stretched by ${round((entry.stretchRatio - 1) * 100, 0)}% because it uses fit="fill" against a different aspect ratio.`,
          elementIds: [element.id],
          recommendation: "Use cover or contain cropping instead of stretching the artwork.",
          validator: VALIDATOR,
        }),
      );
    }

    if (Math.abs(element.transform.scaleX - element.transform.scaleY) > 0.02) {
      issues.push(
        createIssue({
          code: "IMAGE_NON_UNIFORM_SCALE",
          title: "Non-uniform image scale",
          category: "asset",
          severity: "high",
          measured: {
            value: round(element.transform.scaleX / element.transform.scaleY, 2),
            expected: 1,
            unit: "scale ratio",
          },
          message: `Image "${element.name}" has different horizontal and vertical scale (${round(element.transform.scaleX, 2)} vs ${round(element.transform.scaleY, 2)}).`,
          elementIds: [element.id],
          recommendation: "Scale imagery uniformly and crop to fit the frame.",
          validator: VALIDATOR,
        }),
      );
    }

    if (entry.effectiveDpi !== null) {
      const target = analysis.targetAssetDpi;
      if (entry.effectiveDpi < target * 0.6) {
        issues.push(
          createIssue({
            code: "ASSET_LOW_RESOLUTION",
            title: "Low-resolution image",
            category: "asset",
            severity: "high",
            measured: {
              value: round(entry.effectiveDpi, 1),
              expected: target,
              unit: "effective DPI",
            },
            message: `Image "${element.name}" renders at ${round(entry.effectiveDpi, 1)} DPI at this size; ${target} DPI is required for ${analysis.canvas.unit === "px" ? "crisp digital output" : "print"}.`,
            elementIds: [element.id],
            recommendation: "Use a higher-resolution source image or reduce the displayed size.",
            revision: { action: "provide_asset", elementIds: [element.id] },
            validator: VALIDATOR,
          }),
        );
      } else if (entry.effectiveDpi < target) {
        issues.push(
          createIssue({
            code: "ASSET_RESOLUTION_MARGINAL",
            title: "Marginal image resolution",
            category: "asset",
            severity: "medium",
            measured: {
              value: round(entry.effectiveDpi, 1),
              expected: target,
              unit: "effective DPI",
            },
            message: `Image "${element.name}" renders at ${round(entry.effectiveDpi, 1)} DPI, slightly below the ${target} DPI target.`,
            elementIds: [element.id],
            recommendation: "Prefer a larger source image, especially when the design will be printed.",
            validator: VALIDATOR,
          }),
        );
      }
    }

    const mimeType = entry.asset?.mimeType;
    if (mimeType && !/^image\/(png|jpeg|jpg|webp|avif|svg\+xml|gif)$/i.test(mimeType)) {
      issues.push(
        createIssue({
          code: "ASSET_UNSUPPORTED_TYPE",
          title: "Unsupported image type",
          category: "asset",
          severity: "high",
          message: `Asset "${element.assetId}" uses unsupported MIME type "${mimeType}".`,
          elementIds: [element.id],
          recommendation: "Convert the asset to PNG, JPEG, WebP, AVIF or SVG before rendering.",
          validator: VALIDATOR,
        }),
      );
    }

    if (!element.alt && element.meta?.decorative !== true) {
      issues.push(
        createIssue({
          code: "IMAGE_ALT_MISSING",
          title: "Missing alt description",
          category: "asset",
          severity: "low",
          message: `Image element "${element.name}" has no alt description.`,
          elementIds: [element.id],
          recommendation:
            "Add a concise alt description for content imagery, or mark purely decorative imagery with meta.decorative.",
          validator: VALIDATOR,
        }),
      );
    }
  }

  return issues;
}
