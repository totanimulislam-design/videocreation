import type {
  DesignCategory,
  DesignDocument,
  DesignElement,
  Typography,
} from "../core/design-document/types.ts";

/**
 * Shared vocabulary of the Quality Engine.
 *
 * The types here implement DESIGN_QUALITY_METRICS.md §2–§8: weighted
 * categories, sub-criteria, deterministic severity, critical failure gates and
 * the evidence a quality report must carry.
 */

export type IssueSeverity = "critical" | "high" | "medium" | "low";

export type IssueCategory =
  | "document"
  | "bounds"
  | "layout"
  | "typography"
  | "color"
  | "asset"
  | "font"
  | "export"
  | "spacing"
  | "content"
  | "hierarchy";

export interface Measurement {
  value: number;
  expected?: number;
  unit: string;
  /** True when the number comes from approximation (e.g. estimated glyph metrics). */
  approximate?: boolean;
}

export type RevisionActionType =
  | "nudge_into_bounds"
  | "move_inside_safe_area"
  | "grow_text_frame"
  | "increase_font_size"
  | "replace_text_color"
  | "increase_line_height"
  | "provide_asset"
  | "register_font"
  | "reduce_effects"
  | "manual";

export interface RevisionHint {
  action: RevisionActionType;
  elementIds: string[];
  parameters?: Record<string, number | string>;
}

export interface QualityIssue {
  /** Stable, machine-readable identifier, e.g. `TEXT_OVERFLOW_FRAME`. */
  code: string;
  title: string;
  category: IssueCategory;
  severity: IssueSeverity;
  /** Section 4 critical failure: rejects the design regardless of score. */
  blocksDelivery: boolean;
  message: string;
  elementIds: string[];
  measured?: Measurement;
  recommendation: string;
  revision?: RevisionHint;
  validator: string;
}

/** Score category identifiers, matching DESIGN_QUALITY_METRICS.md §2 exactly. */
export type CategoryId =
  | "creativeDirection"
  | "composition"
  | "hierarchy"
  | "typography"
  | "color"
  | "spacing"
  | "imagery"
  | "effects"
  | "communication"
  | "technical";

export type AssessmentMethod = "measured" | "heuristic" | "visual";

export interface SubCriterionResult {
  id: string;
  label: string;
  maxPoints: number;
  /** Null when the criterion could not be assessed. Never invented. */
  points: number | null;
  /** How the score was produced. `measured` is deterministic. */
  method: AssessmentMethod;
  assessed: boolean;
  evidence: string[];
  deductions: string[];
}

export interface CategoryResult {
  id: CategoryId;
  label: string;
  maxPoints: number;
  /** Sum of assessed sub-criteria points (not scaled up to maxPoints). */
  points: number;
  assessed: boolean;
  coverage: number;
  method: AssessmentMethod | "mixed";
  subCriteria: SubCriterionResult[];
}

export type QualityLevel =
  | "Exceptional"
  | "Excellent"
  | "Professional"
  | "Good"
  | "Acceptable"
  | "Weak"
  | "Poor"
  | "Failed";

export type DeliveryStatus = "approved" | "revision_required" | "rejected";

export interface FontFaceInfo {
  family: string;
  /** Lowercase script tags the font can render: latin, bengali, arabic, ... */
  scripts: string[];
  weights: number[];
  style?: "normal" | "italic";
  available: boolean;
  source?: string;
}

export interface AssetInfo {
  id: string;
  available: boolean;
  width?: number;
  height?: number;
  mimeType?: string;
  /** Byte size of the stored asset, when known. */
  byteSize?: number;
  /** Dominant color, used for contrast checks over images when provided. */
  dominantColor?: string;
}

export interface TextMeasurement {
  width: number;
  height: number;
  lines: string[];
  /** Measurement source: exact renderer metrics or approximation. */
  approximate: boolean;
}

export interface TextMeasurer {
  measure(
    text: string,
    typography: Typography,
    options: { maxWidth?: number; wrap?: boolean },
  ): TextMeasurement;
}

export interface ContentRequirement {
  id: string;
  label: string;
  /** Exact content that must survive into the design (never invented). */
  value?: string;
  required?: boolean;
  kind?: "text" | "contact" | "date" | "price" | "url" | "cta";
}

export interface ExportSpec {
  format: "png" | "jpeg" | "pdf" | "svg" | "webp";
  /** Requested pixel dimensions of the artifact. */
  width?: number;
  height?: number;
  dpi?: number;
  transparency?: boolean;
  colorProfile?: string;
  bleed?: boolean;
  /** Rendered artifact metadata, when the exporter already produced bytes. */
  artifact?: ExportArtifact;
}

export interface ExportArtifact {
  byteLength: number;
  /** First bytes of the file, used for signature verification. */
  signature?: Uint8Array;
  width?: number;
  height?: number;
  dpi?: number;
  transparency?: boolean;
  colorProfile?: string;
  /** True when the exporter reports missing assets/fonts at export time. */
  missingAssets?: string[];
}

export interface DesignBriefContext {
  category?: DesignCategory;
  /** Information the user supplied; validators never invent these values. */
  contentRequirements?: ContentRequirement[];
  /** Minimum readable body size in document units, if the studio requires one. */
  minimumBodyFontSize?: number;
  /** Target effective DPI for raster assets. */
  targetAssetDpi?: number;
  /** Target output DPI for print exports. */
  targetExportDpi?: number;
  /** Language tags the design must render correctly. */
  languages?: string[];
  /** Whether the brief requires a call-to-action. */
  requiresCallToAction?: boolean;
  /** Art direction selected in STEP 02, used by the critic for comparison. */
  artDirection?: string;
  /** Composition strategy the design commits to, for consistency checks. */
  compositionStrategy?: string;
}

export interface QualityContext {
  document: DesignDocument;
  fonts?: FontRegistry;
  assets?: AssetRegistry;
  textMeasurer?: TextMeasurer;
  brief?: DesignBriefContext;
  exportSpecs?: ExportSpec[];
  /** Preview/render artifact produced from the same document. */
  render?: RenderEvidence;
}

export interface RenderEvidence {
  /** SVG/text preview of the document, inspected by the critic. */
  preview?: string;
  format?: "svg" | "png" | "jpeg" | "pdf";
  width?: number;
  height?: number;
  /** True when the preview was generated from the exact document under test. */
  fromSameDocument?: boolean;
  generatedAt?: string;
  /** Ids of the visible elements the renderer actually painted. */
  elementIds?: string[];
}

export type ImprovementPriority = "critical" | "high" | "medium" | "low";

export interface ImprovementAction {
  priority: ImprovementPriority;
  affectedElementIds: string[];
  problem: string;
  recommendedCorrection: string;
  source: "validator" | "critic" | "pipeline";
}

export interface FontRegistry {
  get(family: string): FontFaceInfo | undefined;
  has(family: string): boolean;
  families(): string[];
}

export interface AssetRegistry {
  get(assetId: string): AssetInfo | undefined;
  has(assetId: string): boolean;
  ids(): string[];
}

export interface EvaluationInput {
  document: DesignDocument;
  brief: DesignBriefContext;
  context: QualityContext;
  issues: QualityIssue[];
}

export interface TextBlock {
  element: Extract<DesignElement, { type: "text" }>;
  typography: Typography;
  text: string;
  role: string;
  essential: boolean;
  measurement: TextMeasurement;
  frameWidth: number;
  frameHeight: number;
  overflowX: number;
  overflowY: number;
  lines: number;
}
