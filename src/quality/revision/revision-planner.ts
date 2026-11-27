import type {
  ImprovementAction,
  QualityIssue,
  RevisionActionType,
  RevisionHint,
} from "../types.ts";
import { issuePriority, PRIORITY_ORDER, prioritizeIssues } from "./issue-prioritizer.ts";

/**
 * Revision planning (DESIGN_QUALITY_METRICS.md §8).
 *
 * Each issue is converted into a targeted correction tied to the affected
 * elements. Issues that share the same mechanical correction on the same
 * elements are grouped, so a single round fixes a defect once instead of many
 * times. Unrelated successful decisions are never touched.
 */

const MECHANICAL_ACTIONS: ReadonlySet<RevisionActionType> = new Set<RevisionActionType>([
  "nudge_into_bounds",
  "move_inside_safe_area",
  "grow_text_frame",
  "increase_font_size",
  "replace_text_color",
  "increase_line_height",
  "reduce_effects",
]);

export interface PlannedRevision extends ImprovementAction {
  issueCodes: string[];
  hints: RevisionHint[];
  mechanical: boolean;
}

export interface RevisionPlan {
  actions: PlannedRevision[];
  autoFixable: PlannedRevision[];
  manualActions: PlannedRevision[];
  blocking: QualityIssue[];
  deferredActions: number;
  summary: string;
}

export interface RevisionPlanOptions {
  /** Maximum number of actions considered in one round. */
  maxActions?: number;
}

export function planRevisions(
  issues: QualityIssue[],
  options: RevisionPlanOptions = {},
): RevisionPlan {
  const maxActions = options.maxActions ?? 12;
  const ordered = prioritizeIssues(issues);
  const groups = new Map<string, { action: PlannedRevision; priority: number }>();

  for (const issue of ordered) {
    if (issue.severity === "low" && !issue.blocksDelivery) continue;
    const hint = issue.revision;
    const elementIds = (hint?.elementIds ?? issue.elementIds).slice().sort();
    const key = hint
      ? `${hint.action}|${elementIds.join(",")}`
      : `manual|${issue.code}|${elementIds.join(",")}`;

    const existing = groups.get(key);
    if (existing) {
      existing.action.issueCodes.push(issue.code);
      continue;
    }

    groups.set(key, {
      priority: PRIORITY_ORDER[issuePriority(issue)],
      action: {
        priority: issuePriority(issue),
        affectedElementIds: elementIds,
        problem: `${issue.code}: ${issue.message}`,
        recommendedCorrection: issue.recommendation,
        source: "validator",
        issueCodes: [issue.code],
        hints: hint ? [hint] : [],
        mechanical: hint ? MECHANICAL_ACTIONS.has(hint.action) : false,
      },
    });
  }

  const sorted = [...groups.values()]
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.action.mechanical !== b.action.mechanical) return a.action.mechanical ? -1 : 1;
      return a.action.problem.localeCompare(b.action.problem);
    })
    .map((entry) => entry.action);

  const considered = sorted.slice(0, maxActions);
  const deferredActions = sorted.length - considered.length;
  const autoFixable = considered.filter((action) => action.mechanical);
  const manualActions = considered.filter((action) => !action.mechanical);
  const blocking = ordered.filter((issue) => issue.blocksDelivery);

  const summary =
    considered.length === 0
      ? "No actionable issues were found."
      : `${considered.length} action(s): ${autoFixable.length} automatically correctable, ${manualActions.length} requiring content or art-direction changes${deferredActions > 0 ? `, ${deferredActions} deferred` : ""}.`;

  return { actions: considered, autoFixable, manualActions, blocking, deferredActions, summary };
}
