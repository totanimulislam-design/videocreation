/**
 * Quality Engine public surface.
 *
 * Implements DESIGN_QUALITY_METRICS.md: deterministic validators, weighted
 * scoring, AI-assisted visual critique, targeted revision and quality reports.
 */

export type {
  AssetInfo,
  AssetRegistry,
  CategoryId,
  CategoryResult,
  ContentRequirement,
  DeliveryStatus,
  DesignBriefContext,
  EvaluationInput,
  ExportArtifact,
  ExportSpec,
  FontFaceInfo,
  FontRegistry,
  ImprovementAction,
  ImprovementPriority,
  IssueCategory,
  IssueSeverity,
  Measurement,
  QualityContext,
  QualityIssue,
  QualityLevel,
  RenderEvidence,
  RevisionActionType,
  RevisionHint,
  SubCriterionResult,
  TextBlock,
  TextMeasurer,
  TextMeasurement,
} from "./types.ts";

export {
  analyzeDocument,
  backgroundForElement,
  unitsPerInch,
  type BackgroundResolution,
  type ContrastSample,
  type DocumentAnalysis,
  type FocalCandidate,
  type ImageAnalysis,
  type PaletteEntry,
} from "./analysis.ts";

export {
  createAssetRegistry,
  createFontRegistry,
  availableAsset,
  MapAssetRegistry,
  MapFontRegistry,
  STUDIO_FONT_LIBRARY,
} from "./registries.ts";

export { ApproximateTextMeasurer, defaultTextMeasurer, detectScripts, wrapText } from "./text/measure.ts";

export {
  LATEST_SCORING_RULES,
  SCORING_RULES_V1,
  findCategoryDefinition,
  getScoringRules,
  registerScoringRules,
  totalPossiblePoints,
  type CategoryDefinition,
  type ScoringRules,
  type SubCriterionDefinition,
} from "./evaluator/scoring-rules.ts";

export { qualityLevelFor, QUALITY_LEVEL_BANDS } from "./evaluator/quality-level.ts";

export {
  assessCategory,
  deterministicSubCriteria,
  evaluateCategories,
  isCategoryId,
  type ScoreContext,
} from "./evaluator/category-evaluator.ts";

export {
  calculateScore,
  categoryScore,
  flattenSubCriteria,
  type ScoreCoverage,
  type ScoreSummary,
} from "./evaluator/score-calculator.ts";

export {
  VALIDATORS,
  SEVERITY_ORDER,
  runValidators,
  type ValidationRunResult,
  type ValidatorDefinition,
} from "./validators/index.ts";

export { createIssue, type IssueSeed } from "./validators/issue.ts";
export { validateAssets } from "./validators/asset-validator.ts";
export { validateBounds } from "./validators/bounds-validator.ts";
export { validateContent } from "./validators/content-validator.ts";
export { validateContrast } from "./validators/contrast-validator.ts";
export { validateDocument } from "./validators/document-validator.ts";
export { validateExport } from "./validators/export-validator.ts";
export { validateFonts } from "./validators/font-validator.ts";
export { validateLayout } from "./validators/layout-validator.ts";
export { validateSpacing } from "./validators/spacing-validator.ts";
export { validateTextOverflow } from "./validators/text-overflow.ts";
export { validateTypography } from "./validators/typography-validator.ts";

export {
  applyVisualCritique,
  buildCriticPrompt,
  LlmVisualCritic,
  StaticVisualCritic,
  type CriticInput,
  type LlmCriticOptions,
  type VisualCritic,
} from "./visual/visual-critic.ts";

export {
  parseCritiqueJson,
  validateVisualCritique,
  type CritiqueValidationOptions,
  type CritiqueValidationResult,
  type VisualCritique,
  type VisualSubCriterionScore,
} from "./visual/critique-schema.ts";

export { generatePreview, type GeneratedPreview, type PreviewOptions } from "./visual/preview-generator.ts";

export {
  issuePriority,
  prioritizeIssues,
  summarizeIssues,
  PRIORITY_ORDER,
  type IssueSummary,
} from "./revision/issue-prioritizer.ts";

export {
  planRevisions,
  type PlannedRevision,
  type RevisionPlan,
  type RevisionPlanOptions,
} from "./revision/revision-planner.ts";

export {
  applyMechanicalRevisions,
  type AppliedRevision,
  type MechanicalExecutorOptions,
  type MechanicalRevisionResult,
  type UnresolvedRevision,
} from "./revision/mechanical-executor.ts";

export {
  DEFAULT_MAX_REVISION_ROUNDS,
  runRevisionLoop,
  type RevisionLoopOptions,
  type RevisionLoopResult,
  type RevisionStopReason,
} from "./revision/revision-controller.ts";

export {
  buildQualityReport,
  determineDeliveryStatus,
  renderMarkdownReport,
  roundCategoryScores,
  type DecisionEvaluation,
  type ReportInput,
} from "./reports/report-generator.ts";

export type {
  DeliveryDecision,
  InspectionEvidence,
  QualityReport,
  RevisionRoundSummary,
} from "./reports/report-schema.ts";

export {
  evaluateDesign,
  evaluateVariants,
  runQualityPipeline,
  type QualityEvaluation,
  type QualityPipelineOptions,
  type QualityRunResult,
} from "./pipeline.ts";
