import type { DocumentAnalysis } from "../analysis.ts";
import type { ExportArtifact, ExportSpec, QualityContext, QualityIssue } from "../types.ts";
import { createIssue, round } from "./issue.ts";

const VALIDATOR = "export-validator";

const SIGNATURES: Record<ExportSpec["format"], number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47],
  jpeg: [0xff, 0xd8, 0xff],
  pdf: [0x25, 0x50, 0x44, 0x46],
  webp: [0x52, 0x49, 0x46, 0x46],
  svg: [],
};

function signatureMatches(format: ExportSpec["format"], bytes: Uint8Array): boolean {
  if (format === "svg") {
    const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 512)).trim().toLowerCase();
    return head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"));
  }
  const signature = SIGNATURES[format];
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function validateArtifact(
  spec: ExportSpec,
  artifact: ExportArtifact,
  analysis: DocumentAnalysis,
  issues: QualityIssue[],
): void {
  if (artifact.byteLength <= 0) {
    issues.push(
      createIssue({
        code: "EXPORT_EMPTY_FILE",
        title: "Empty export",
        category: "export",
        severity: "critical",
        message: `The ${spec.format.toUpperCase()} export is empty.`,
        recommendation: "Re-run the export pipeline and verify the artifact is written completely.",
        validator: VALIDATOR,
      }),
    );
    return;
  }

  if (artifact.signature && !signatureMatches(spec.format, artifact.signature)) {
    issues.push(
      createIssue({
        code: "EXPORT_CORRUPT",
        title: "Corrupted export",
        category: "export",
        severity: "critical",
        message: `The ${spec.format.toUpperCase()} artifact does not start with a valid ${spec.format.toUpperCase()} signature.`,
        recommendation: "Discard the artifact and re-export; investigate the encoder or transport step.",
        validator: VALIDATOR,
      }),
    );
  }

  if (artifact.missingAssets && artifact.missingAssets.length > 0) {
    issues.push(
      createIssue({
        code: "EXPORT_MISSING_ASSETS",
        title: "Export missing assets",
        category: "export",
        severity: "critical",
        elementIds: [],
        message: `The exporter reported ${artifact.missingAssets.length} missing asset(s): ${artifact.missingAssets.join(", ")}.`,
        recommendation: "Resolve missing assets and export again; never deliver an export with placeholders.",
        validator: VALIDATOR,
      }),
    );
  }

  if (
    artifact.width !== undefined &&
    artifact.height !== undefined &&
    (Math.abs(artifact.width - (spec.width ?? analysis.canvas.width)) > 1 ||
      Math.abs(artifact.height - (spec.height ?? analysis.canvas.height)) > 1)
  ) {
    issues.push(
      createIssue({
        code: "EXPORT_DIMENSION_MISMATCH",
        title: "Export dimensions",
        category: "export",
        severity: "high",
        measured: {
          value: artifact.width,
          expected: spec.width ?? analysis.canvas.width,
          unit: "px",
        },
        message: `The ${spec.format.toUpperCase()} artifact is ${artifact.width}×${artifact.height} instead of ${spec.width ?? analysis.canvas.width}×${spec.height ?? analysis.canvas.height}.`,
        recommendation: "Export at the document's declared dimensions, or at the exact requested scale.",
        validator: VALIDATOR,
      }),
    );
  }
}

/**
 * Export and production validation (README §7.1, quality metrics §3.10, §11).
 *
 * Only checks that can be verified from the document, the export request and
 * the produced artifact are performed. Anything the exporter must report (font
 * embedding, colour conversion) is checked through the artifact metadata rather
 * than assumed.
 */
export function validateExport(analysis: DocumentAnalysis, context: QualityContext): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const specs = context.exportSpecs ?? [];

  if (specs.length === 0) {
    issues.push(
      createIssue({
        code: "EXPORT_NOT_CONFIGURED",
        title: "No export requested",
        category: "export",
        severity: "low",
        message: "No export specification was supplied, so production quality could not be verified.",
        recommendation: "Declare the delivery formats (PNG, SVG, PDF) and validate each produced artifact.",
        validator: VALIDATOR,
      }),
    );
    return issues;
  }

  const isPrint = analysis.canvas.unit !== "px";
  const targetDpi = analysis.targetExportDpi;

  for (const spec of specs) {
    const requestedWidth = spec.width ?? analysis.canvas.width;
    const requestedHeight = spec.height ?? analysis.canvas.height;
    const canvasAspect = analysis.canvas.width / analysis.canvas.height;
    const exportAspect = requestedWidth / requestedHeight;
    const aspectDrift = Math.abs(exportAspect - canvasAspect) / canvasAspect;

    if (aspectDrift > 0.005) {
      issues.push(
        createIssue({
          code: "EXPORT_ASPECT_MISMATCH",
          title: "Export aspect ratio",
          category: "export",
          severity: "high",
          measured: { value: round(exportAspect, 3), expected: round(canvasAspect, 3), unit: "aspect ratio" },
          message: `The ${spec.format.toUpperCase()} request is ${requestedWidth}×${requestedHeight}, which does not match the document aspect ratio of ${round(canvasAspect, 3)}:1.`,
          recommendation: "Scale exports uniformly; never stretch a composition to fill a different format.",
          validator: VALIDATOR,
        }),
      );
    }

    // Compare like with like: physical documents are referenced to their
    // pixel size at the export DPI instead of their millimetre dimensions.
    const referenceWidth =
      analysis.canvas.unit === "px"
        ? analysis.canvas.width
        : (analysis.canvas.width / analysis.unitsPerInch) * (spec.dpi ?? targetDpi);
    if (referenceWidth > 0 && requestedWidth < referenceWidth * 0.5) {
      issues.push(
        createIssue({
          code: "EXPORT_TOO_SMALL",
          title: "Export resolution too low",
          category: "export",
          severity: "medium",
          measured: { value: round(requestedWidth, 0), expected: round(referenceWidth, 0), unit: "px" },
          message: `The ${spec.format.toUpperCase()} export is ${round((requestedWidth / referenceWidth) * 100, 0)}% of the required pixel size, which may be too low for the intended use.`,
          recommendation: "Export at native document size or larger for raster delivery.",
          validator: VALIDATOR,
        }),
      );
    }

    // Reduced-size delivery must stay legible (quality metrics §10).
    if (analysis.canvas.unit === "px" && analysis.canvas.width > 0) {
      const scale = requestedWidth / analysis.canvas.width;
      if (scale < 0.999) {
        const illegible = analysis.texts.filter((block) => {
          if (!block.essential) return false;
          const scaledPx = block.typography.fontSize * scale;
          return scaledPx < 9;
        });
        if (illegible.length > 0) {
          const smallest = Math.min(
            ...illegible.map((block) => Math.round(block.typography.fontSize * scale * 10) / 10),
          );
          issues.push(
            createIssue({
              code: "TEXT_ILLEGIBLE_AT_EXPORT_SCALE",
              title: "Text too small at export scale",
              category: "export",
              severity: smallest < 6 ? "high" : "medium",
              measured: { value: smallest, expected: 9, unit: "px at export size" },
              message: `${illegible.length} essential text block(s) shrink to ${smallest}px when exported at ${round(scale * 100, 0)}% of the document size.`,
              elementIds: illegible.map((block) => block.element.id),
              recommendation:
                "Increase the type size, simplify the composition for this format, or deliver a larger export; never assume a reduced-size version stays readable.",
              validator: VALIDATOR,
            }),
          );
        }
      }
    }

    if (spec.format === "jpeg" && spec.transparency) {
      issues.push(
        createIssue({
          code: "EXPORT_TRANSPARENCY_UNSUPPORTED",
          title: "Transparency in JPEG",
          category: "export",
          severity: "high",
          message: "JPEG does not support transparency; transparent areas will be flattened onto a colour.",
          recommendation: "Use PNG or WebP when transparency is required, or specify the matte colour deliberately.",
          validator: VALIDATOR,
        }),
      );
    }

    const wantsPrintQuality = isPrint || spec.format === "pdf" || spec.bleed === true;
    if (wantsPrintQuality) {
      const dpi = spec.dpi ?? analysis.canvas.dpi ?? 0;
      if (dpi < targetDpi * 0.85) {
        issues.push(
          createIssue({
            code: "EXPORT_DPI_LOW",
            title: "Print resolution too low",
            category: "export",
            severity: "high",
            measured: { value: dpi, expected: targetDpi, unit: "DPI" },
            message: `The print export is ${dpi} DPI; ${targetDpi} DPI is required for this output size.`,
            recommendation: "Export at the target print resolution, or enlarge the artwork dimensions accordingly.",
            validator: VALIDATOR,
          }),
        );
      } else if (dpi < targetDpi) {
        issues.push(
          createIssue({
            code: "EXPORT_DPI_MARGINAL",
            title: "Marginal print resolution",
            category: "export",
            severity: "medium",
            measured: { value: dpi, expected: targetDpi, unit: "DPI" },
            message: `The print export is ${dpi} DPI, just below the ${targetDpi} DPI target.`,
            recommendation: "Confirm the printer's requirement, and prefer the full target resolution.",
            validator: VALIDATOR,
          }),
        );
      }

      if (analysis.canvas.colorMode === "cmyk" && !spec.colorProfile) {
        issues.push(
          createIssue({
            code: "EXPORT_COLOR_PROFILE_MISSING",
            title: "Missing colour profile",
            category: "export",
            severity: "high",
            message: "The document is declared as CMYK but the export specifies no colour profile.",
            recommendation: "Embed the required CMYK output profile so colours match the print proof.",
            validator: VALIDATOR,
          }),
        );
      }

      if ((analysis.canvas.bleed ?? 0) > 0 && !spec.bleed && wantsPrintQuality) {
        issues.push(
          createIssue({
            code: "EXPORT_BLEED_DISABLED",
            title: "Bleed missing from export",
            category: "export",
            severity: "medium",
            measured: { value: analysis.canvas.bleed ?? 0, expected: 0, unit: "document units" },
            message: "The document declares a bleed area, but the PDF export does not include bleed.",
            recommendation: "Enable bleed in the PDF export so trimmed edges do not show white slivers.",
            validator: VALIDATOR,
          }),
        );
      }
    }

    if (spec.artifact) {
      validateArtifact(spec, spec.artifact, analysis, issues);
    }
  }

  return issues;
}
