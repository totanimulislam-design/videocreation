/**
 * Creative Studio — Design Intelligence Foundation.
 *
 * Public surface for Phase 1 of the design platform (Task 03). Everything below
 * is implemented and covered by tests; nothing here renders, lays out, calls a
 * model, or certifies design quality.
 *
 * Layers and their boundaries (see `docs/ARCHITECTURE.md`):
 *
 *   src/schema        canonical contract + versioning + units + factories
 *   src/knowledge     stable IDs and pattern metadata compiled from the docs
 *   src/brief         deterministic natural-language brief parsing
 *   src/validation    schema/plan validation (the gate before any renderer)
 *   src/core          shared primitives (diagnostics, ids, color, script)
 */

// ---- Canonical contract ----------------------------------------------------
export type {
  DesignBrief,
  DesignDocument,
  DesignPlan,
  CanvasConfig,
  CanvasBackground,
  BoxInset,
  DesignTokens,
  TypographyToken,
  TypographyScale,
  ShadowToken,
  ArtDirection,
  CompositionPlan,
  CompositionZone,
  CompositionConstraints,
  DesignConstraints,
  HierarchyItem,
  GridConfiguration,
  DesignAsset,
  DesignGuide,
  DesignSettings,
  SceneNode,
  SceneNodeType,
  SceneTransform,
  SceneGeometry,
  SceneText,
  ImagePlacement,
  ElementStyle,
  Rect,
  Unit,
  Medium,
  OutputFormat,
  LanguageTag,
  ReadingFlow,
  TextDirection,
  VisualDensity,
  ComplexityLevel,
} from './schema/types.ts';

export {
  OUTPUT_FORMATS,
  MEDIUMS,
  READING_FLOWS,
  VISUAL_DENSITIES,
  COMPLEXITY_LEVELS,
  GRID_TYPES,
  SCENE_NODE_TYPES,
} from './schema/types.ts';

export { SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS, compareSchemaVersions, isSupportedSchemaVersion, latestSupportedSchemaVersion, parseSchemaVersion } from './schema/version.ts';

export {
  UNITS,
  DEFAULT_DPI,
  MIN_DPI,
  MAX_DPI,
  isUnit,
  convertPhysical,
  toMillimetres,
  fromMillimetres,
  canvasMillimetres,
  formatLength,
} from './schema/units.ts';

export {
  CANVAS_MIN_SIZE,
  CANVAS_MAX_SIZE,
  CANVAS_MAX_ASPECT_RATIO,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  MIN_LEGIBLE_MM,
  MAX_ELEMENTS,
  MAX_GROUP_DEPTH,
  MAX_SUPPORTING_PATTERNS,
} from './schema/limits.ts';

export {
  createDesignDocument,
  createDesignTokens,
  createCanvas,
  createGrid,
  createTypographyToken,
  createTypographyScale,
  createShadowToken,
  createDocumentIdFactory,
  DEFAULT_SPACING_SCALE,
  NEUTRAL_FONT_STACK,
} from './schema/factories.ts';

// ---- Knowledge (stable IDs from the design documents) ---------------------
export {
  DESIGN_CATEGORY_IDS,
  ART_DIRECTION_STYLE_IDS,
  PRIMARY_STYLE_IDS,
  ADDITIONAL_STYLE_IDS,
  COLOR_STRATEGY_IDS,
  COLOR_ROLE_IDS,
  CONTENT_SLOT_IDS,
  HIERARCHY_ROLES,
  PATTERN_CATEGORY_IDS,
  PATTERN_CATEGORY_FIT,
  DOCUMENTED_SCRIPTS,
  SCRIPT_DIRECTIONS,
  isDesignCategoryId,
  isArtDirectionStyleId,
  isColorStrategyId,
  isColorRoleId,
  isHierarchyRole,
} from './knowledge/ids.ts';
export type { DesignCategoryId, PatternCategory, ColorStrategyId, ColorRoleId, HierarchyRole, ArtDirectionStyleId } from './knowledge/ids.ts';

export {
  ALL_PATTERN_IDS,
  RECOMMENDED_COMBINATIONS,
  hasPattern,
  isPatternIdSyntax,
  isRecommendedCombination,
  lookupPattern,
  patternCategoryFitsDesignCategory,
  patternsForCategory,
  patternsInCategory,
} from './knowledge/patterns.ts';
export type { PatternRecord, PatternMetadataCompleteness, RecommendedCombination } from './knowledge/patterns.ts';

export {
  SELECTION_ROUTING,
  PATTERN_DECISION_CONTRACT,
  SELECTION_REQUIREMENTS,
  COMBINATION_RESTRICTIONS,
  SELECTION_CHECKLIST,
  assessPatternSelection,
  derivePatternCharacteristics,
  selectionGuidanceFor,
} from './knowledge/selection-guidance.ts';
export type {
  CombinationRestriction,
  CombinationRestrictionId,
  DerivedPatternCharacteristics,
  GuidanceProvenance,
  OrientationFit,
  PatternSelectionAssessment,
  PatternSelectionRule,
  SelectionRoutingRule,
  AssessSelectionOptions,
} from './knowledge/selection-guidance.ts';

// ---- Brief intelligence ---------------------------------------------------
export { parseDesignBrief, parseDesignBriefOrThrow, BriefParseError } from './brief/parse.ts';
export { estimateHeadlineCapacity } from './brief/capacity.ts';
export type { FitAssessment, HeadlineCapacityInput, HeadlineCapacityResult } from './brief/capacity.ts';
export type {
  BriefAnalysis,
  BriefConstraint,
  BriefConflict,
  BriefHints,
  BriefParseResult,
  ContentClass,
  EvidenceKind,
  FieldEvidence,
  OpenQuestion,
  ParseBriefOptions,
  RecordedAssumption,
  RequiredAssetRequest,
  ScriptAnalysis,
} from './brief/types.ts';

// ---- Validation -----------------------------------------------------------
export { validateDesignPlan, assertValidDesignPlan, validateDesignBriefDocument, deriveContentSlots, DesignPlanValidationError } from './validation/design-plan.ts';
export type { DesignPlanValidationReport, ValidatePlanOptions } from './validation/design-plan.ts';
export { validateDesignDocument } from './validation/document.ts';

// ---- AI provider boundary (interface only; no provider is implemented) -----
export {
  NoAiProvider,
  NoAiProviderError,
  isNoAiProviderError,
  PROPOSAL_FIELDS,
} from './ai/types.ts';
export type {
  AiBriefProvider,
  AiBriefProposal,
  AiBriefRequest,
  AiProviderCallOptions,
  FieldProposal,
  ProposalEvidenceKind,
  ProposalField,
} from './ai/types.ts';
export { validateAiBriefProposal } from './ai/proposal.ts';
export type { AiProposalValidationReport, ValidateProposalOptions } from './ai/proposal.ts';
export { requestBriefProposal, AiProviderTimeoutError, DEFAULT_PROVIDER_TIMEOUT_MS } from './ai/request.ts';
export type { AiProposalOutcome, RequestProposalOptions } from './ai/request.ts';

// ---- Diagnostics ----------------------------------------------------------
export { CODES, DiagnosticBag, formatDiagnostic, formatDiagnostics, path as diagnosticPath, toResult } from './core/diagnostics.ts';
export type { Diagnostic, DiagnosticCode, Severity, ValidationError, ValidationResult, ValidationWarning } from './core/diagnostics.ts';

// ---- Shared primitives ----------------------------------------------------
export { isValidId, slugify, findDuplicateIds, createIdFactory, randomId } from './core/ids.ts';
export {
  parseHexColor,
  normalizeHexColor,
  isHexColor,
  relativeLuminance,
  contrastRatio,
  compositeOver,
  meetsWcagAa,
  CONTRAST_AA_NORMAL,
  CONTRAST_AA_LARGE,
} from './core/color.ts';
export type { Rgba } from './core/color.ts';
export {
  detectScripts,
  isMixedScript,
  scriptForLanguage,
  isSupportedLanguage,
  dominantDirection,
  normalizeLanguageTag,
  isRtlScript,
} from './core/script.ts';
export type { ScriptId, TextDirection as ScriptTextDirection } from './core/script.ts';

// ---- Typography engine (Task 04) ------------------------------------------
//
// Real shaping and measurement through HarfBuzz WebAssembly. The WASM module is
// loaded lazily by `createTypographyEngine`, so importing this entry point and
// validating a document never instantiates it. See `docs/TYPOGRAPHY.md`.

export { createTypographyEngine, loadHarfBuzz } from './typography/engine.ts';
export type { TypographyEngine } from './typography/engine.ts';

export { layoutText, measureText, shapeText, wrapText, splitParagraphs, resolveFontWeight, invalidLayout } from './typography/layout.ts';
export type { LayoutContext, ParagraphRange } from './typography/layout.ts';
export { fitText, layoutFits } from './typography/fit.ts';
export { detectOverflow, widestLine } from './typography/overflow.ts';
export type { OverflowInput, OverflowResult } from './typography/overflow.ts';
export { wrapParagraph } from './typography/wrap.ts';
export type { WrappedLine, WrappedParagraph, WrapParagraphInput } from './typography/wrap.ts';

export {
  FontRegistry,
  GENERIC_FAMILIES,
  coverageCodepoints,
  duplicateFontDiagnostic,
  familyKey,
  isGenericFamilyName,
  parseFontStack,
} from './typography/font-registry.ts';
export type { FontCandidate, FontRegistryOptions, RegistryLookupOptions } from './typography/font-registry.ts';
export { DEFAULT_FONT_WEIGHT, fontIdFor, loadFont, measureCoverage } from './typography/font-record.ts';
export type { HarfBuzzApi, LoadFontResult, LoadedFont } from './typography/font-record.ts';
export {
  MAX_FONT_BYTES,
  decodeWoffToSfnt,
  detectFontFormat,
  loadFontSource,
  toSfntBytes,
} from './typography/font-format.ts';
export type { DecodedFont, FontLoadIssue, LoadedFontBytes } from './typography/font-format.ts';

export {
  SCRIPT_CAPABILITIES,
  classifyCodePoint,
  isSupportedScript,
  resolveBaseDirection,
  scriptDirection,
  scriptTag,
  segmentByScript,
  unsupportedScriptCodePoints,
} from './typography/script-runs.ts';
export type { ScriptSegment } from './typography/script-runs.ts';

export { ShapeCache, shapeRun, shapeRunRaw, shapingCacheKey, toFeatures } from './typography/shaper.ts';
export type { RawShapedGlyph, RawShapedRun, ShapeOptions, ShapingContext } from './typography/shaper.ts';
export { advanceBefore, buildRunMeasure, buildShapedRun, clusterSpanEnd } from './typography/measure.ts';
export type { BuildRunInput, RunMeasure } from './typography/measure.ts';
export {
  allowsBreakBetween,
  breakOpportunities,
  classifyLineBreakChar,
  graphemeSegments,
  isMandatoryBreak,
  isWhitespaceGrapheme,
} from './typography/line-break.ts';
export type { BreakOpportunity, GraphemeSegment, LineBreakClass } from './typography/line-break.ts';

export type {
  FitStatus,
  FitTextRequest,
  FontFormat,
  FontLicensing,
  FontMetadata,
  FontRegistrationResult,
  FontRequest,
  FontResolveResult,
  FontResolution,
  FontResolutionKind,
  FontResolutionStatus,
  FontShapingCapabilities,
  FontSource,
  FontSourceKind,
  FontStyle,
  FontVerticalMetrics,
  LayoutSceneTextRequest,
  LayoutTextRequest,
  MeasureTextResult,
  OverflowPolicy,
  OverflowReport,
  OverflowWrap,
  RegisterFontInput,
  ResolvedFontInfo,
  ResolvedTypographyMetrics,
  RunScript,
  ScriptSupportReport,
  ShapedGlyph,
  ShapedText,
  ShapedTextRun,
  SupportedScript,
  TextBoxConstraint,
  TextFitResult,
  TextLayoutResult,
  TextLine,
  TextLineRun,
  TextOverflowRequest,
  TextOverflowResult,
  TextRequest,
  TypographyCacheStats,
  TypographyEngineOptions,
  WrapTextRequest,
  WrapTextResult,
} from './typography/types.ts';
