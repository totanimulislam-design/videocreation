import type { ImprovementPriority, IssueSeverity, QualityIssue } from "../types.ts";

/**
 * Severity → revision priority (DESIGN_QUALITY_METRICS.md §8).
 *
 * Critical failures are corrected first, then high-priority visual weaknesses,
 * then refinement opportunities. Low-priority polish never displaces a blocking
 * defect in a revision round.
 */

export const PRIORITY_ORDER: Record<ImprovementPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEVERITY_TO_PRIORITY: Record<IssueSeverity, ImprovementPriority> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

export function issuePriority(issue: QualityIssue): ImprovementPriority {
  if (issue.blocksDelivery) return "critical";
  return SEVERITY_TO_PRIORITY[issue.severity];
}

export function prioritizeIssues(issues: QualityIssue[]): QualityIssue[] {
  return [...issues].sort((a, b) => {
    if (a.blocksDelivery !== b.blocksDelivery) return a.blocksDelivery ? -1 : 1;
    const priority = PRIORITY_ORDER[issuePriority(a)] - PRIORITY_ORDER[issuePriority(b)];
    if (priority !== 0) return priority;
    return a.code.localeCompare(b.code);
  });
}

export interface IssueSummary {
  total: number;
  blocking: number;
  bySeverity: Record<IssueSeverity, number>;
  byCategory: Record<string, number>;
  codes: string[];
}

export function summarizeIssues(issues: QualityIssue[]): IssueSummary {
  const bySeverity: Record<IssueSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const byCategory: Record<string, number> = {};
  const codes = new Set<string>();
  for (const issue of issues) {
    bySeverity[issue.severity] += 1;
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
    codes.add(issue.code);
  }
  return {
    total: issues.length,
    blocking: issues.filter((issue) => issue.blocksDelivery).length,
    bySeverity,
    byCategory,
    codes: [...codes],
  };
}
