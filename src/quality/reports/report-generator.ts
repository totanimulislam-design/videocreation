import type {
  CategoryId,
  CategoryResult,
  DeliveryStatus,
  ImprovementAction,
  QualityIssue,
  RenderEvidence,
} from "../types.ts";
import type { ScoreSummary } from "../evaluator/score-calculator.ts";
import type { ScoringRules } from "../evaluator/scoring-rules.ts";
import { LATEST_SCORING_RULES } from "../evaluator/scoring-rules.ts";
import type { InspectionEvidence, QualityReport, RevisionRoundSummary } from "./report-schema.ts";
import { issuePriority } from "../revision/issue-prioritizer.ts";

/**
 * Report assembly and the final quality gate (DESIGN_QUALITY_METRICS.md §6,
 * §12, §15).
 */

export interface ReportInput {
  designId: string;
  designName?: string;
  category?: string;
  summary: ScoreSummary;
  issues: QualityIssue[];
  rules?: ScoringRules;
  render?: RenderEvidence;
  critic?: { name: string; notes?: string };
  visualApplied?: string[];
  revision?: {
    rounds: RevisionRoundSummary[];
    roundsUsed: number;
    maxRounds: number;
    budgetExhausted: boolean;
  };
  validatorsRun: string[];
  validatorErrors: Array<{ validator: string; message: string }>;
  approximateTextMetrics?: boolean;
  extraImprovements?: ImprovementAction[];
  notes?: string[];
}

export interface DecisionEvaluation {
  status: DeliveryStatus;
  approved: boolean;
  reasons: string[];
  blockingIssueCodes: string[];
  missingCriteria: string[];
}

/**
 * The single place that decides whether a design may be delivered.
 *
 * Order matters: a critical failure or an incomplete validation always wins
 * over a high score (DESIGN_QUALITY_METRICS.md §2 "Minimum Acceptance
 * Standard", §4 "Critical Gate Rule", §15).
 */
export function determineDeliveryStatus(input: {
  summary: ScoreSummary;
  issues: QualityIssue[];
  validatorErrors: Array<{ validator: string; message: string }>;
  rules: ScoringRules;
}): DecisionEvaluation {
  const { summary, issues, validatorErrors, rules } = input;
  const blocking = issues.filter((issue) => issue.blocksDelivery);
  const blockingIssueCodes = [...new Set(blocking.map((issue) => issue.code))];
  const missingCriteria = summary.coverage.missingCriteria;
  const reasons: string[] = [];

  if (validatorErrors.length > 0) {
    reasons.push(
      `Validation could not complete (${validatorErrors.map((error) => error.validator).join(", ")}); an unverified design cannot be approved.`,
    );
    return { status: "rejected", approved: false, reasons, blockingIssueCodes, missingCriteria };
  }

  if (blocking.length > 0) {
    reasons.push(
      `${blocking.length} critical failure(s) block delivery: ${blockingIssueCodes.join(", ")}.`,
    );
    return { status: "rejected", approved: false, reasons, blockingIssueCodes, missingCriteria };
  }

  if (summary.coverage.complete && summary.totalScore < rules.majorRedesignScore) {
    reasons.push(
      `Score ${summary.totalScore}/100 is below the ${rules.majorRedesignScore}-point redesign threshold.`,
    );
    return { status: "rejected", approved: false, reasons, blockingIssueCodes, missingCriteria };
  }

  if (!summary.coverage.complete) {
    reasons.push(
      `Visual inspection is incomplete: ${missingCriteria.length} criterion/criteria have not been assessed (${missingCriteria.slice(0, 8).join(", ")}${missingCriteria.length > 8 ? ", …" : ""}). A design cannot be approved without inspecting the rendered artwork.`,
    );
    // A provisional total is not comparable to the absolute thresholds; judge
    // only the quality of what was actually measured.
    if (summary.coverage.earnedRatio < 0.5) {
      reasons.push(
        `${Math.round(summary.coverage.earnedRatio * 100)}% of the assessed points were earned, indicating major weaknesses in the measured criteria.`,
      );
      return { status: "rejected", approved: false, reasons, blockingIssueCodes, missingCriteria };
    }
    return { status: "revision_required", approved: false, reasons, blockingIssueCodes, missingCriteria };
  }

  if (summary.totalScore < rules.minimumDeliveryScore) {
    reasons.push(
      `Score ${summary.totalScore}/100 is below the ${rules.minimumDeliveryScore}-point minimum delivery threshold.`,
    );
  }

  if (reasons.length > 0) {
    return { status: "revision_required", approved: false, reasons, blockingIssueCodes, missingCriteria };
  }

  if (summary.totalScore < rules.targetScore) {
    reasons.push(
      `Approved at ${summary.totalScore}/100; the ${rules.targetScore}-point target suggests one further refinement round.`,
    );
  } else {
    reasons.push(`Approved at ${summary.totalScore}/100 with no critical failures.`);
  }

  return { status: "approved", approved: true, reasons, blockingIssueCodes, missingCriteria };
}

function issueToAction(issue: QualityIssue): ImprovementAction {
  return {
    priority: issuePriority(issue),
    affectedElementIds: issue.elementIds,
    problem: `${issue.code}: ${issue.message}`,
    recommendedCorrection: issue.recommendation,
    source: "validator",
  };
}

function dedupeActions(actions: ImprovementAction[]): ImprovementAction[] {
  const seen = new Set<string>();
  const result: ImprovementAction[] = [];
  for (const action of actions) {
    const key = `${action.priority}|${action.problem}|${action.recommendedCorrection}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action);
  }
  return result;
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export function buildQualityReport(input: ReportInput): QualityReport {
  const rules = input.rules ?? LATEST_SCORING_RULES;
  const { summary, issues } = input;
  const decision = determineDeliveryStatus({
    summary,
    issues,
    validatorErrors: input.validatorErrors,
    rules,
  });

  const criticalFailures = issues
    .filter((issue) => issue.blocksDelivery)
    .map((issue) => `${issue.code}: ${issue.message}`);

  const improvementPlan = dedupeActions([
    ...issues.filter((issue) => issue.severity !== "low").map(issueToAction),
    ...(input.extraImprovements ?? []),
  ])
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 24);

  const inspection: InspectionEvidence = {
    previewGenerated: Boolean(input.render?.preview),
    previewInspected: Boolean(input.critic),
    ...(input.critic ? { critic: input.critic.name } : {}),
    ...(input.critic?.notes ? { criticNotes: input.critic.notes } : {}),
    ...(input.render
      ? {
          render: {
            format: input.render.format ?? "unknown",
            ...(input.render.width !== undefined ? { width: input.render.width } : {}),
            ...(input.render.height !== undefined ? { height: input.render.height } : {}),
            ...(input.render.generatedAt ? { generatedAt: input.render.generatedAt } : {}),
            ...(input.render.fromSameDocument !== undefined
              ? { fromSameDocument: input.render.fromSameDocument }
              : {}),
          },
        }
      : {}),
    approximateTextMetrics: input.approximateTextMetrics !== false,
  };

  return {
    designId: input.designId,
    ...(input.designName ? { designName: input.designName } : {}),
    ...(input.category ? { category: input.category } : {}),
    rulesetVersion: rules.version,
    scoring: {
      targetScore: rules.targetScore,
      minimumDeliveryScore: rules.minimumDeliveryScore,
      majorRedesignScore: rules.majorRedesignScore,
      categoryWeights: Object.fromEntries(
        rules.categories.map((category) => [category.id, category.maxPoints]),
      ) as Record<CategoryId, number>,
    },
    generatedAt: new Date().toISOString(),
    overallScore: summary.totalScore,
    totalScore: summary.totalScore,
    qualityLevel: summary.qualityLevel,
    categoryScores: summary.categoryScores,
    categories: summary.categories,
    coverage: summary.coverage,
    criticalFailures,
    strengths: summary.strengths,
    weaknesses: summary.weaknesses,
    improvementPlan,
    deliveryStatus: decision.status,
    issues,
    decision,
    inspection,
    revision: input.revision ?? {
      rounds: [],
      roundsUsed: 0,
      maxRounds: 0,
      budgetExhausted: false,
    },
    validatorsRun: input.validatorsRun,
    validatorErrors: input.validatorErrors,
    ...(input.render ? { renderEvidence: input.render } : {}),
    notes: input.notes ?? [],
  };
}

/** Markdown rendering for human review and pull-request artifacts. */
export function renderMarkdownReport(report: QualityReport): string {
  const lines: string[] = [];
  lines.push(`# Quality Report — ${report.designName ?? report.designId}`);
  lines.push("");
  lines.push(
    `**Score:** ${report.totalScore}/100 (${report.qualityLevel})${report.coverage.complete ? "" : " — provisional"} · **Status:** ${report.deliveryStatus} · **Ruleset:** ${report.rulesetVersion}`,
  );
  lines.push("");
  lines.push(`Generated ${report.generatedAt}.`);
  lines.push("");

  lines.push("## Delivery decision");
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  if (report.decision.blockingIssueCodes.length > 0) {
    lines.push(`- Blocking codes: ${report.decision.blockingIssueCodes.join(", ")}`);
  }
  lines.push("");

  lines.push("## Category scores");
  lines.push("| Category | Score | Max | Assessed | Method |");
  lines.push("|---|---:|---:|---|---|");
  for (const category of report.categories) {
    lines.push(
      `| ${category.label} | ${category.points} | ${category.maxPoints} | ${Math.round(category.coverage * 100)}% | ${category.method} |`,
    );
  }
  lines.push("");
  lines.push(
    `**Coverage:** ${report.coverage.pointsAssessed}/${report.coverage.pointsTotal} points assessed (${Math.round(report.coverage.earnedRatio * 100)}% of assessed points earned).`,
  );
  if (report.coverage.missingCriteria.length > 0) {
    lines.push(
      `**Awaiting inspection:** ${report.coverage.missingCriteria.join(", ")}`,
    );
  }
  lines.push("");

  lines.push("## Inspection");
  lines.push(`- Preview generated: ${report.inspection.previewGenerated ? "yes" : "no"}`);
  lines.push(`- Preview inspected by critic: ${report.inspection.previewInspected ? "yes" : "no"}`);
  if (report.inspection.critic) lines.push(`- Critic: ${report.inspection.critic}`);
  if (report.inspection.render) {
    lines.push(
      `- Render: ${report.inspection.render.format} ${report.inspection.render.width ?? "?"}×${report.inspection.render.height ?? "?"}`,
    );
  }
  if (report.inspection.approximateTextMetrics) {
    lines.push("- Text metrics: approximate (no exact font metrics supplied)");
  }
  lines.push("");

  if (report.criticalFailures.length > 0) {
    lines.push("## Critical failures");
    for (const failure of report.criticalFailures) lines.push(`- ${failure}`);
    lines.push("");
  }

  if (report.issues.length > 0) {
    lines.push("## Findings");
    for (const issue of report.issues) {
      lines.push(
        `- **[${issue.severity}] ${issue.code}** — ${issue.message}${issue.elementIds.length ? ` (elements: ${issue.elementIds.join(", ")})` : ""}`,
      );
      lines.push(`  - Fix: ${issue.recommendation}`);
    }
    lines.push("");
  }

  if (report.strengths.length > 0) {
    lines.push("## Strengths");
    for (const strength of report.strengths) lines.push(`- ${strength}`);
    lines.push("");
  }

  if (report.weaknesses.length > 0) {
    lines.push("## Weaknesses");
    for (const weakness of report.weaknesses) lines.push(`- ${weakness}`);
    lines.push("");
  }

  if (report.improvementPlan.length > 0) {
    lines.push("## Improvement plan");
    for (const action of report.improvementPlan) {
      lines.push(`- **[${action.priority}]** ${action.problem}`);
      lines.push(`  - Correction: ${action.recommendedCorrection}`);
      if (action.affectedElementIds.length > 0) {
        lines.push(`  - Elements: ${action.affectedElementIds.join(", ")}`);
      }
    }
    lines.push("");
  }

  if (report.revision.rounds.length > 0) {
    lines.push("## Revision rounds");
    for (const round of report.revision.rounds) {
      lines.push(
        `- Round ${round.round}: ${round.beforeScore} → ${round.afterScore} (${round.issuesBefore} → ${round.issuesAfter} issues). Applied: ${
          round.appliedActions.length > 0 ? round.appliedActions.join("; ") : "none"
        }.`,
      );
    }
    if (report.revision.budgetExhausted) {
      lines.push("- Revision budget exhausted; remaining issues are handed back for user review.");
    }
    lines.push("");
  }

  if (report.validatorErrors.length > 0) {
    lines.push("## Validator errors");
    for (const error of report.validatorErrors) lines.push(`- ${error.validator}: ${error.message}`);
    lines.push("");
  }

  if (report.notes.length > 0) {
    lines.push("## Notes");
    for (const note of report.notes) lines.push(`- ${note}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(
    "A design that renders is not necessarily a good design. This report records what was measured, what was inspected, and what remains unverified.",
  );
  return lines.join("\n");
}

/** Rounds the numeric category map for stable report snapshots. */
export function roundCategoryScores(categories: CategoryResult[]): Record<string, number> {
  return Object.fromEntries(
    categories.map((category) => [category.id, Math.round(category.points * 100) / 100]),
  );
}
