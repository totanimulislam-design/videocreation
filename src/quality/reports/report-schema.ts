import type {
  CategoryId,
  CategoryResult,
  DeliveryStatus,
  ImprovementAction,
  QualityIssue,
  QualityLevel,
  RenderEvidence,
} from "../types.ts";
import type { ScoreCoverage } from "../evaluator/score-calculator.ts";

/**
 * Machine-readable quality report (DESIGN_QUALITY_METRICS.md §7, §12).
 *
 * The report is designed to be stored next to the design document for version
 * history and debugging: it records the ruleset version, the exact evidence for
 * every score, the inspection that was performed, and why the delivery decision
 * was made.
 */

export interface RevisionRoundSummary {
  round: number;
  action: string;
  beforeScore: number;
  afterScore: number;
  appliedActions: string[];
  unresolvedActions: string[];
  issuesBefore: number;
  issuesAfter: number;
}

export interface InspectionEvidence {
  previewGenerated: boolean;
  previewInspected: boolean;
  critic?: string;
  criticNotes?: string;
  render?: {
    format: string;
    width?: number;
    height?: number;
    generatedAt?: string;
    fromSameDocument?: boolean;
  };
  /** True when text metrics came from approximation rather than real fonts. */
  approximateTextMetrics: boolean;
}

export interface DeliveryDecision {
  approved: boolean;
  status: DeliveryStatus;
  reasons: string[];
  blockingIssueCodes: string[];
  missingCriteria: string[];
}

export interface QualityReport {
  designId: string;
  designName?: string;
  category?: string;

  /** Score totals, per DESIGN_QUALITY_METRICS.md §2. */
  rulesetVersion: string;
  /** Snapshot of the rules used, so a stored report is self-describing. */
  scoring: {
    targetScore: number;
    minimumDeliveryScore: number;
    majorRedesignScore: number;
    categoryWeights: Record<CategoryId, number>;
  };
  generatedAt: string;
  overallScore: number;
  totalScore: number;
  qualityLevel: QualityLevel;

  /** Category scores keyed exactly as in the critic schema (§7). */
  categoryScores: Record<CategoryId, number>;
  categories: CategoryResult[];
  coverage: ScoreCoverage;

  /** Human-readable critical failures (§7/§12). */
  criticalFailures: string[];
  strengths: string[];
  weaknesses: string[];
  improvementPlan: ImprovementAction[];
  deliveryStatus: DeliveryStatus;

  issues: QualityIssue[];
  decision: DeliveryDecision;
  inspection: InspectionEvidence;
  revision: {
    rounds: RevisionRoundSummary[];
    roundsUsed: number;
    maxRounds: number;
    budgetExhausted: boolean;
  };

  validatorsRun: string[];
  validatorErrors: Array<{ validator: string; message: string }>;
  renderEvidence?: RenderEvidence;
  notes: string[];
}
