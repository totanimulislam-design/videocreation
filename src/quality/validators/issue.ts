import type {
  IssueCategory,
  IssueSeverity,
  Measurement,
  QualityIssue,
  RevisionHint,
} from "../types.ts";

export interface IssueSeed {
  code: string;
  title: string;
  category: IssueCategory;
  severity: IssueSeverity;
  message: string;
  elementIds?: string[];
  measured?: Measurement;
  recommendation: string;
  revision?: RevisionHint;
  validator: string;
  /** Defaults to true for `critical`, false otherwise (DESIGN_QUALITY_METRICS.md §4). */
  blocksDelivery?: boolean;
}

/**
 * Severity is mapped to the critical gate in exactly one place so that every
 * validator follows the same rule as DESIGN_QUALITY_METRICS.md §4.
 */
export function createIssue(seed: IssueSeed): QualityIssue {
  return {
    code: seed.code,
    title: seed.title,
    category: seed.category,
    severity: seed.severity,
    blocksDelivery: seed.blocksDelivery ?? seed.severity === "critical",
    message: seed.message,
    elementIds: [...new Set(seed.elementIds ?? [])],
    ...(seed.measured ? { measured: seed.measured } : {}),
    recommendation: seed.recommendation,
    ...(seed.revision ? { revision: seed.revision } : {}),
    validator: seed.validator,
  };
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
