import type { DesignDocument } from "../core/design-document/types.ts";
import { validateDesignDocument } from "../core/design-document/validation.ts";
import { createIssue } from "./validators/issue.ts";
import { analyzeDocument, type DocumentAnalysis } from "./analysis.ts";
import { emptyCategories, evaluateCategories } from "./evaluator/category-evaluator.ts";
import { calculateScore } from "./evaluator/score-calculator.ts";
import { LATEST_SCORING_RULES, type ScoringRules } from "./evaluator/scoring-rules.ts";
import { buildQualityReport } from "./reports/report-generator.ts";
import { runValidators } from "./validators/index.ts";
import { applyMechanicalRevisions } from "./revision/mechanical-executor.ts";
import {
  DEFAULT_MAX_REVISION_ROUNDS,
  runRevisionLoop,
  type RevisionStopReason,
} from "./revision/revision-controller.ts";
import { planRevisions } from "./revision/revision-planner.ts";
import { generatePreview, type GeneratedPreview } from "./visual/preview-generator.ts";
import {
  applyVisualCritique,
  type VisualCritic,
} from "./visual/visual-critic.ts";
import {
  validateVisualCritique,
  type VisualCritique,
} from "./visual/critique-schema.ts";
import type {
  AssetRegistry,
  DesignBriefContext,
  ExportSpec,
  FontRegistry,
  QualityContext,
  QualityIssue,
  TextMeasurer,
} from "./types.ts";
import type { QualityReport, RevisionRoundSummary } from "./reports/report-schema.ts";

/**
 * The automated quality pipeline (DESIGN_QUALITY_METRICS.md §6).
 *
 *   document → preview → deterministic validation → scoring → visual critique
 *            → report/gate → targeted revision → re-render → re-evaluate
 *
 * Everything is pure and provider-agnostic: rendering is local SVG, validation
 * is deterministic, and the critic is an injected adapter.
 */

export interface QualityPipelineOptions {
  document: DesignDocument;
  fonts?: FontRegistry;
  assets?: AssetRegistry;
  textMeasurer?: TextMeasurer;
  brief?: DesignBriefContext;
  exportSpecs?: ExportSpec[];
  rules?: ScoringRules;
  /** Visual critic adapter. Without one, visual criteria remain unassessed. */
  critic?: VisualCritic;
  /** Pre-computed critique (e.g. from a stored review or a human art director). */
  critique?: VisualCritique;
  /** Set to false to skip preview generation (not recommended). */
  renderPreview?: boolean;
  /** Automated revision rounds; defaults to 3. */
  maxRevisionRounds?: number;
  /** Disable the revision loop and evaluate a single pass. */
  autoRevise?: boolean;
}

export interface QualityEvaluation {
  document: DesignDocument;
  report: QualityReport;
  /** Absent only when the document failed the schema gate before analysis. */
  analysis?: DocumentAnalysis;
  issues: QualityIssue[];
  preview?: GeneratedPreview;
  critique?: VisualCritique;
  critiqueErrors: string[];
  critiqueWarnings: string[];
  visualApplied: string[];
}

function buildContext(
  document: DesignDocument,
  options: QualityPipelineOptions,
  preview: GeneratedPreview | undefined,
): QualityContext {
  return {
    document,
    ...(options.fonts ? { fonts: options.fonts } : {}),
    ...(options.assets ? { assets: options.assets } : {}),
    ...(options.textMeasurer ? { textMeasurer: options.textMeasurer } : {}),
    ...(options.brief ? { brief: options.brief } : {}),
    ...(options.exportSpecs ? { exportSpecs: options.exportSpecs } : {}),
    ...(preview ? { render: preview } : {}),
  };
}

interface CritiqueResolution {
  critique?: VisualCritique;
  errors: string[];
  warnings: string[];
}

async function resolveCritique(
  options: QualityPipelineOptions,
  document: DesignDocument,
  issues: QualityIssue[],
  preview: GeneratedPreview | undefined,
  rules: ScoringRules,
): Promise<CritiqueResolution> {
  const raw = options.critique ?? (options.critic ? await options.critic.critique({
    document,
    brief: options.brief ?? {},
    ...(preview ? { render: preview } : {}),
    issues,
    rules,
  }) : undefined);

  if (!raw) return { errors: [], warnings: [] };

  const validation = validateVisualCritique(raw, {
    document,
    rules,
    issues,
    ...(preview ? { render: preview } : {}),
    requirePreview: true,
  });

  if (!validation.valid || !validation.critique) {
    return { errors: validation.errors, warnings: validation.warnings };
  }
  return { critique: validation.critique, errors: [], warnings: validation.warnings };
}

export async function evaluateDesign(options: QualityPipelineOptions): Promise<QualityEvaluation> {
  const rules = options.rules ?? LATEST_SCORING_RULES;

  // Schema gate: nothing is rendered or measured from a document that does not
  // satisfy the canonical model (AGENTS.md §4).
  const schema = validateDesignDocument(options.document);
  if (!schema.valid) {
    const issues: QualityIssue[] = schema.problems.map((problem) =>
      createIssue({
        code: problem.severity === "critical" ? "SCHEMA_INVALID" : "SCHEMA_WARNING",
        title: "Design document structure",
        category: "document",
        severity: problem.severity === "critical" ? "critical" : "medium",
        message: `${problem.path}: ${problem.message}`,
        recommendation:
          "Correct the document structure before rendering; an invalid document cannot be measured, inspected or delivered.",
        validator: "document-validator",
      }),
    );
    const categories = emptyCategories(rules);
    const summary = calculateScore(categories, rules);
    const report = buildQualityReport({
      designId: typeof options.document?.id === "string" ? options.document.id : "unknown-document",
      ...(options.document?.name ? { designName: options.document.name } : {}),
      summary,
      issues,
      rules,
      validatorsRun: ["document-validator"],
      validatorErrors: [],
      approximateTextMetrics: true,
      notes: [
        "Schema validation failed: rendering, measurement and visual inspection were skipped.",
        "No score can be awarded to an invalid document.",
      ],
    });
    return {
      document: options.document,
      report,
      issues,
      critiqueErrors: [],
      critiqueWarnings: [],
      visualApplied: [],
    };
  }

  const preview = options.renderPreview === false
    ? undefined
    : generatePreview(options.document, {
        ...(options.textMeasurer ? { textMeasurer: options.textMeasurer } : {}),
        exactFonts: false,
      });

  const context = buildContext(options.document, options, preview);
  const analysis = analyzeDocument(context);
  const validation = runValidators(analysis, context);
  const issues = [...validation.issues];

  const critiqueResolution: CritiqueResolution = await resolveCritique(
    options,
    options.document,
    issues,
    preview,
    rules,
  ).catch((error: unknown) => ({
    errors: [error instanceof Error ? error.message : String(error)],
    warnings: [] as string[],
  }));

  const categories = evaluateCategories({ analysis, issues, ...(preview ? { render: preview } : {}) }, rules);
  const merged = critiqueResolution.critique
    ? applyVisualCritique(categories, critiqueResolution.critique, rules)
    : { categories, applied: [] };

  const summary = calculateScore(merged.categories, rules);

  const notes: string[] = [];
  if (!critiqueResolution.critique) {
    notes.push(
      "No valid visual critique was attached: criteria that require inspecting the artwork remain unassessed, so the design cannot be approved from deterministic checks alone.",
    );
  }
  if (critiqueResolution.errors.length > 0) {
    notes.push(`Visual critique rejected: ${critiqueResolution.errors.join(" ")}`);
  }
  if (validation.validatorErrors.length > 0) {
    notes.push("One or more validators failed; the report is not trustworthy for approval.");
  }
  if (options.renderPreview === false) {
    notes.push("Preview generation was skipped, so rendered output was not inspected.");
  }

  const report = buildQualityReport({
    designId: options.document.id,
    ...(options.document.name ? { designName: options.document.name } : {}),
    ...(options.document.category ? { category: options.document.category } : {}),
    summary,
    issues,
    rules,
    ...(preview ? { render: preview } : {}),
    ...(critiqueResolution.critique
      ? {
          critic: {
            name: critiqueResolution.critique.critic,
            ...(critiqueResolution.critique.inspectionNotes
              ? { notes: critiqueResolution.critique.inspectionNotes }
              : {}),
          },
        }
      : {}),
    visualApplied: merged.applied,
    validatorsRun: validation.validatorsRun,
    validatorErrors: validation.validatorErrors,
    approximateTextMetrics: preview?.approximateTextMetrics ?? true,
    extraImprovements: critiqueResolution.critique?.improvementPlan,
    notes,
  });

  return {
    document: options.document,
    report,
    analysis,
    issues,
    ...(preview ? { preview } : {}),
    ...(critiqueResolution.critique ? { critique: critiqueResolution.critique } : {}),
    critiqueErrors: critiqueResolution.errors,
    critiqueWarnings: critiqueResolution.warnings,
    visualApplied: merged.applied,
  };
}

export interface QualityRunResult {
  document: DesignDocument;
  report: QualityReport;
  evaluation: QualityEvaluation;
  history: QualityReport[];
  rounds: RevisionRoundSummary[];
  budgetExhausted: boolean;
  stoppedBecause: RevisionStopReason;
}

/**
 * Full pipeline: evaluate, then run bounded targeted revisions, re-rendering and
 * re-inspecting after each round until approval, no safe correction, or budget
 * exhaustion.
 */
export async function runQualityPipeline(options: QualityPipelineOptions): Promise<QualityRunResult> {
  const maxRounds = options.maxRevisionRounds ?? DEFAULT_MAX_REVISION_ROUNDS;
  let lastEvaluation: QualityEvaluation | undefined;

  const evaluate = async (document: DesignDocument): Promise<QualityReport> => {
    const evaluation = await evaluateDesign({
      ...options,
      document,
      autoRevise: false,
      maxRevisionRounds: 0,
    });
    lastEvaluation = evaluation;
    return evaluation.report;
  };

  const revise = (document: DesignDocument, plan: ReturnType<typeof planRevisions>) => {
    const context = buildContext(document, options, undefined);
    const analysis = analyzeDocument(context);
    return applyMechanicalRevisions(document, plan, {
      analysis,
      context,
      ...(options.textMeasurer ? { textMeasurer: options.textMeasurer } : {}),
    });
  };

  if (options.autoRevise === false || maxRounds === 0) {
    const evaluation = await evaluateDesign(options);
    lastEvaluation = evaluation;
    return {
      document: evaluation.document,
      report: evaluation.report,
      evaluation,
      history: [evaluation.report],
      rounds: [],
      budgetExhausted: false,
      stoppedBecause:
        evaluation.report.deliveryStatus === "approved"
          ? "approved"
          : evaluation.report.deliveryStatus === "rejected"
            ? "rejected"
            : "revision_required",
    };
  }

  const loop = await runRevisionLoop({
    document: options.document,
    maxRounds,
    evaluate,
    revise,
  });

  if (!lastEvaluation) {
    // Defensive: evaluate at least once even if the loop never ran.
    lastEvaluation = await evaluateDesign({ ...options, document: loop.document });
  }

  return {
    document: loop.document,
    report: loop.report,
    evaluation: { ...lastEvaluation, report: loop.report, document: loop.document },
    rounds: loop.rounds,
    budgetExhausted: loop.budgetExhausted,
    stoppedBecause: loop.stoppedBecause,
    history: loop.history,
  };
}

/** Multi-size evaluation: every adapted format is judged independently (§10). */
export async function evaluateVariants(
  documents: DesignDocument[],
  options: Omit<QualityPipelineOptions, "document">,
): Promise<QualityEvaluation[]> {
  const results: QualityEvaluation[] = [];
  for (const document of documents) {
    results.push(await evaluateDesign({ ...options, document }));
  }
  return results;
}
