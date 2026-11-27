import type { DesignDocument } from "../../core/design-document/types.ts";
import type {
  CategoryId,
  ImprovementAction,
  ImprovementPriority,
  QualityIssue,
  RenderEvidence,
} from "../types.ts";
import type { ScoringRules } from "../evaluator/scoring-rules.ts";
import { LATEST_SCORING_RULES } from "../evaluator/scoring-rules.ts";

/**
 * Schema for the AI Design Critic (DESIGN_QUALITY_METRICS.md §7, §13).
 *
 * The critic only supplies judgements that require looking at the artwork. It
 * may not overrule deterministic measurements, may not score without evidence,
 * and may not give generic advice. Everything here is enforced before a
 * critique can influence a report or a revision.
 */

export interface VisualSubCriterionScore {
  points: number;
  evidence: string[];
}

export interface VisualCritique {
  /** Identifier of the critic, e.g. `claude-sonnet` or `human:art-director`. */
  critic: string;
  /** True only when the critic actually inspected the rendered artwork. */
  inspectedPreview: boolean;
  /** Category → sub-criterion → score. */
  categories: Partial<Record<CategoryId, Record<string, VisualSubCriterionScore>>>;
  strengths: string[];
  weaknesses: string[];
  improvementPlan: ImprovementAction[];
  inspectionNotes?: string;
}

export interface CritiqueValidationOptions {
  document: DesignDocument;
  rules?: ScoringRules;
  issues?: QualityIssue[];
  /** Render evidence the critic claims to have inspected. */
  render?: RenderEvidence;
  /** Require that a preview existed and was inspected. */
  requirePreview?: boolean;
}

export interface CritiqueValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  critique?: VisualCritique;
  /** Sub-criteria the critic supplied, mapped for merging. */
  scoredCriteria: string[];
}

const PRIORITIES: ImprovementPriority[] = ["critical", "high", "medium", "low"];

const GENERIC_ADVICE_PATTERNS: RegExp[] = [
  /\bmake it (more )?(attractive|beautiful|better|nicer|professional|modern|pop)\b/i,
  /\bimprove (the )?design\b/i,
  /\badd more design\b/i,
  /\bmake (it|the design) look (good|better)\b/i,
  /\bmore creative\b/i,
  /\bjust (polish|tweak) (it|the design)\b/i,
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, max = 600): boolean {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function collectElementIds(document: DesignDocument): Set<string> {
  const ids = new Set<string>();
  const visit = (elements: readonly unknown[]): void => {
    for (const element of elements) {
      if (!isPlainObject(element)) continue;
      if (typeof element.id === "string") ids.add(element.id);
      if (Array.isArray(element.children)) visit(element.children);
    }
  };
  visit(document.elements);
  return ids;
}

/**
 * Validates a raw critic response. The engine only accepts a critique that
 * passes this gate; failures are reported, never silently repaired.
 */
export function validateVisualCritique(
  input: unknown,
  options: CritiqueValidationOptions,
): CritiqueValidationResult {
  const rules = options.rules ?? LATEST_SCORING_RULES;
  const errors: string[] = [];
  const warnings: string[] = [];
  const scoredCriteria: string[] = [];

  if (!isPlainObject(input)) {
    return { valid: false, errors: ["Critique must be a JSON object."], warnings, scoredCriteria };
  }

  if (!nonEmptyString(input.critic, 120)) errors.push("critic must name the reviewing critic.");
  if (input.inspectedPreview !== true) {
    const message = "inspectedPreview must be true: a design cannot be approved without inspecting rendered artwork.";
    if (options.requirePreview === false) warnings.push(message);
    else errors.push(message);
  }
  if (options.requirePreview !== false) {
    if (!options.render?.preview) {
      errors.push("No rendered preview was supplied, so the critique cannot claim to have inspected it.");
    } else if (options.render.fromSameDocument === false) {
      errors.push("The supplied preview was not generated from the document under evaluation.");
    }
  }

  if (!Array.isArray(input.strengths) || input.strengths.some((entry) => !nonEmptyString(entry, 300))) {
    errors.push("strengths must be an array of non-empty strings.");
  }
  if (!Array.isArray(input.weaknesses) || input.weaknesses.some((entry) => !nonEmptyString(entry, 300))) {
    errors.push("weaknesses must be an array of non-empty strings.");
  }

  const rawCategories = input.categories;
  if (!isPlainObject(rawCategories)) {
    errors.push("categories must be an object keyed by category id.");
  } else {
    const elementIds = collectElementIds(options.document);

    for (const [categoryId, rawSubCriteria] of Object.entries(rawCategories)) {
      const category = rules.categories.find((candidate) => candidate.id === categoryId);
      if (!category) {
        errors.push(`Unknown score category "${categoryId}".`);
        continue;
      }
      if (!isPlainObject(rawSubCriteria)) {
        errors.push(`categories.${categoryId} must be an object of sub-criterion scores.`);
        continue;
      }
      for (const [subId, rawScore] of Object.entries(rawSubCriteria)) {
        const definition = category.subCriteria.find((candidate) => candidate.id === subId);
        if (!definition) {
          errors.push(`Unknown sub-criterion "${categoryId}.${subId}".`);
          continue;
        }
        if (definition.deterministic !== null) {
          errors.push(
            `"${categoryId}.${subId}" is a ${definition.deterministic} criterion and must not be re-scored by the critic; deterministic measurement is authoritative.`,
          );
          continue;
        }
        if (!isPlainObject(rawScore)) {
          errors.push(`${categoryId}.${subId} must be an object with points and evidence.`);
          continue;
        }
        const points = rawScore.points;
        if (typeof points !== "number" || !Number.isFinite(points) || points < 0 || points > definition.maxPoints) {
          errors.push(
            `${categoryId}.${subId}.points must be a number between 0 and ${definition.maxPoints} (received ${String(points)}).`,
          );
          continue;
        }
        if (
          !Array.isArray(rawScore.evidence) ||
          rawScore.evidence.length === 0 ||
          rawScore.evidence.some((entry) => !nonEmptyString(entry, 300))
        ) {
          errors.push(`${categoryId}.${subId}.evidence must contain at least one specific observation.`);
          continue;
        }
        if (elementIds.size > 0 && Array.isArray(rawScore.elementIds)) {
          for (const id of rawScore.elementIds) {
            if (typeof id === "string" && !elementIds.has(id)) {
              warnings.push(`${categoryId}.${subId} references unknown element "${id}".`);
            }
          }
        }
        scoredCriteria.push(`${categoryId}.${subId}`);
      }
    }

    const assessedVisual = scoredCriteria.length;
    const visualTotal = rules.categories.reduce(
      (sum, category) => sum + category.subCriteria.filter((sub) => sub.deterministic === null).length,
      0,
    );
    if (assessedVisual < visualTotal) {
      warnings.push(
        `Critique covers ${assessedVisual}/${visualTotal} visually-judged criteria; the rest remain unassessed and block approval.`,
      );
    }
  }

  if (!Array.isArray(input.improvementPlan)) {
    errors.push("improvementPlan must be an array.");
  } else {
    const elementIds = collectElementIds(options.document);
    input.improvementPlan.forEach((action, index) => {
      const path = `improvementPlan[${index}]`;
      if (!isPlainObject(action)) {
        errors.push(`${path} must be an object.`);
        return;
      }
      if (!PRIORITIES.includes(action.priority as ImprovementPriority)) {
        errors.push(`${path}.priority must be one of ${PRIORITIES.join(", ")}.`);
      }
      if (!nonEmptyString(action.problem, 400)) {
        errors.push(`${path}.problem must describe the specific problem.`);
      } else if (GENERIC_ADVICE_PATTERNS.some((pattern) => pattern.test(String(action.problem)))) {
        errors.push(`${path}.problem is generic ("${String(action.problem)}"); name the affected element and the actual defect.`);
      }
      if (!nonEmptyString(action.recommendedCorrection, 600)) {
        errors.push(`${path}.recommendedCorrection must state a concrete correction.`);
      } else if (GENERIC_ADVICE_PATTERNS.some((pattern) => pattern.test(String(action.recommendedCorrection)))) {
        errors.push(
          `${path}.recommendedCorrection is generic ("${String(action.recommendedCorrection)}"); describe the exact change to make.`,
        );
      }
      if (!Array.isArray(action.affectedElementIds)) {
        errors.push(`${path}.affectedElementIds must be an array.`);
      } else {
        for (const id of action.affectedElementIds) {
          if (typeof id !== "string" || !elementIds.has(id)) {
            errors.push(`${path}.affectedElementIds references unknown element "${String(id)}".`);
          }
        }
        if (action.affectedElementIds.length === 0) {
          warnings.push(`${path} has no affected elements; targeted revisions are preferred over global changes.`);
        }
      }
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, scoredCriteria };
  }

  const critique: VisualCritique = {
    critic: String(input.critic),
    inspectedPreview: true,
    categories: rawCategories as VisualCritique["categories"],
    strengths: (input.strengths as string[]).map((entry) => entry.trim()),
    weaknesses: (input.weaknesses as string[]).map((entry) => entry.trim()),
    improvementPlan: (input.improvementPlan as Array<Record<string, unknown>>).map((action) => ({
      priority: action.priority as ImprovementPriority,
      affectedElementIds: (action.affectedElementIds as string[]) ?? [],
      problem: String(action.problem).trim(),
      recommendedCorrection: String(action.recommendedCorrection).trim(),
      source: "critic" as const,
    })),
    ...(typeof input.inspectionNotes === "string" ? { inspectionNotes: input.inspectionNotes } : {}),
  };

  return { valid: true, errors, warnings, critique, scoredCriteria };
}

/** Strips markdown fences and extracts the first JSON object from model output. */
export function parseCritiqueJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
