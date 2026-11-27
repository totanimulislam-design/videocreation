import type { DesignDocument } from "../../core/design-document/types.ts";
import type { QualityReport } from "../reports/report-schema.ts";
import { planRevisions, type RevisionPlan } from "./revision-planner.ts";
import type { MechanicalRevisionResult } from "./mechanical-executor.ts";
import type { RevisionRoundSummary } from "../reports/report-schema.ts";

/**
 * Bounded revision loop (DESIGN_QUALITY_METRICS.md §8, README §7.5).
 *
 * The controller never loops indefinitely: it stops when the design is
 * approved, when no safe automatic correction remains, or when the revision
 * budget is exhausted — in which case the design is handed back for user
 * review with a complete history.
 */

export const DEFAULT_MAX_REVISION_ROUNDS = 3;

export type RevisionStopReason =
  | "approved"
  | "rejected"
  | "no_automatic_fix"
  | "budget_exhausted"
  | "revision_required";

export interface RevisionLoopOptions {
  document: DesignDocument;
  evaluate: (document: DesignDocument, round: number) => Promise<QualityReport> | QualityReport;
  revise: (document: DesignDocument, plan: RevisionPlan) => MechanicalRevisionResult;
  maxRounds?: number;
}

export interface RevisionLoopResult {
  document: DesignDocument;
  report: QualityReport;
  rounds: RevisionRoundSummary[];
  budgetExhausted: boolean;
  stoppedBecause: RevisionStopReason;
  history: QualityReport[];
}

function describeApplied(result: MechanicalRevisionResult): string[] {
  return result.applied.map(
    (entry) => `${entry.action}(${entry.elementIds.join(", ")}): ${entry.detail}`,
  );
}

export async function runRevisionLoop(options: RevisionLoopOptions): Promise<RevisionLoopResult> {
  const maxRounds = Math.max(0, options.maxRounds ?? DEFAULT_MAX_REVISION_ROUNDS);
  const history: QualityReport[] = [];
  const rounds: RevisionRoundSummary[] = [];

  let document = options.document;
  let report = await options.evaluate(document, 0);
  history.push(report);
  let budgetExhausted = false;
  let stoppedBecause: RevisionStopReason =
    report.deliveryStatus === "approved"
      ? "approved"
      : report.deliveryStatus === "rejected"
        ? "rejected"
        : "budget_exhausted";

  for (let round = 1; round <= maxRounds; round += 1) {
    if (report.deliveryStatus === "approved") {
      stoppedBecause = "approved";
      break;
    }

    const plan = planRevisions(report.issues);
    if (plan.autoFixable.length === 0) {
      stoppedBecause = report.deliveryStatus === "rejected" ? "rejected" : "no_automatic_fix";
      break;
    }

    const revision = options.revise(document, plan);
    if (revision.applied.length === 0) {
      stoppedBecause = report.deliveryStatus === "rejected" ? "rejected" : "no_automatic_fix";
      break;
    }

    const beforeScore = report.totalScore;
    const issuesBefore = report.issues.length;
    const nextReport = await options.evaluate(revision.document, round);
    history.push(nextReport);
    rounds.push({
      round,
      action: plan.summary,
      beforeScore,
      afterScore: nextReport.totalScore,
      appliedActions: describeApplied(revision),
      unresolvedActions: revision.unresolved.map((entry) =>
        `${entry.action}(${entry.elementIds.join(", ")}): ${entry.reason}`,
      ),
      issuesBefore,
      issuesAfter: nextReport.issues.length,
    });

    document = revision.document;
    report = nextReport;

    if (report.deliveryStatus === "approved") {
      stoppedBecause = "approved";
      break;
    }
    stoppedBecause = report.deliveryStatus === "rejected" ? "rejected" : "revision_required";
    if (round === maxRounds) {
      // Reaching the budget without approval requires user review.
      budgetExhausted = true;
      stoppedBecause = "budget_exhausted";
    }
  }

  const finalReport: QualityReport = {
    ...report,
    revision: {
      rounds,
      roundsUsed: rounds.length,
      maxRounds,
      budgetExhausted,
    },
    notes: [
      ...report.notes,
      ...(budgetExhausted
        ? [`Revision budget of ${maxRounds} round(s) exhausted; remaining issues require user review.`]
        : []),
      ...(stoppedBecause === "no_automatic_fix"
        ? ["Remaining issues require content, asset or art-direction decisions and were not changed automatically."]
        : []),
    ],
  };

  return {
    document,
    report: finalReport,
    rounds,
    budgetExhausted,
    stoppedBecause,
    history,
  };
}
