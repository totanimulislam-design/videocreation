import type { DocumentAnalysis } from "../analysis.ts";
import type { QualityContext, QualityIssue, IssueSeverity } from "../types.ts";
import { validateAssets } from "./asset-validator.ts";
import { validateBounds } from "./bounds-validator.ts";
import { validateContent } from "./content-validator.ts";
import { validateContrast } from "./contrast-validator.ts";
import { validateDocument } from "./document-validator.ts";
import { validateExport } from "./export-validator.ts";
import { validateFonts } from "./font-validator.ts";
import { validateLayout } from "./layout-validator.ts";
import { validateSpacing } from "./spacing-validator.ts";
import { validateTextOverflow } from "./text-overflow.ts";
import { validateTypography } from "./typography-validator.ts";

export const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface ValidatorDefinition {
  id: string;
  description: string;
  run: (analysis: DocumentAnalysis, context: QualityContext) => QualityIssue[];
}

/**
 * The deterministic validator suite (DESIGN_QUALITY_METRICS.md §6 step 3).
 *
 * Validators are pure functions of the analysis and context: they never mutate
 * the document and never call an AI provider, which makes their findings
 * reproducible and testable.
 */
export const VALIDATORS: ValidatorDefinition[] = [
  {
    id: "document-validator",
    description: "Schema, dimensions, flattened-document and preview consistency checks.",
    run: validateDocument,
  },
  {
    id: "bounds-validator",
    description: "Canvas bounds, zero-size elements, safe area and rotation checks.",
    run: validateBounds,
  },
  {
    id: "text-overflow",
    description: "Text fitting, clipping, max lines and line-length checks.",
    run: validateTextOverflow,
  },
  {
    id: "typography-validator",
    description: "Readable sizes, leading, family count and placeholder content checks.",
    run: validateTypography,
  },
  {
    id: "font-validator",
    description: "Font availability, weights and multilingual script coverage.",
    run: validateFonts,
  },
  {
    id: "asset-validator",
    description: "Missing assets, effective resolution, distortion and asset types.",
    run: validateAssets,
  },
  {
    id: "contrast-validator",
    description: "WCAG contrast against the resolved paint stack.",
    run: validateContrast,
  },
  {
    id: "layout-validator",
    description: "Text collisions, obscured content and overcrowding.",
    run: validateLayout,
  },
  {
    id: "spacing-validator",
    description: "Margin, alignment and spacing consistency.",
    run: validateSpacing,
  },
  {
    id: "content-validator",
    description: "Preservation of required content and presence of the call to action.",
    run: validateContent,
  },
  {
    id: "export-validator",
    description: "Export dimensions, DPI, bleed, profiles and artifact integrity.",
    run: validateExport,
  },
];

export interface ValidationRunResult {
  issues: QualityIssue[];
  validatorsRun: string[];
  /** Validators that threw; these make a report untrustworthy for approval. */
  validatorErrors: Array<{ validator: string; message: string }>;
}

export function runValidators(analysis: DocumentAnalysis, context: QualityContext): ValidationRunResult {
  const issues: QualityIssue[] = [];
  const validatorsRun: string[] = [];
  const validatorErrors: Array<{ validator: string; message: string }> = [];

  for (const validator of VALIDATORS) {
    validatorsRun.push(validator.id);
    try {
      issues.push(...validator.run(analysis, context));
    } catch (error) {
      validatorErrors.push({
        validator: validator.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  issues.sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severity !== 0) return severity;
    return a.code.localeCompare(b.code);
  });

  return { issues, validatorsRun, validatorErrors };
}
