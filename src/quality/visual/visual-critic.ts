import type { DesignDocument } from "../../core/design-document/types.ts";
import type {
  CategoryResult,
  DesignBriefContext,
  QualityIssue,
  RenderEvidence,
  SubCriterionResult,
} from "../types.ts";
import { LATEST_SCORING_RULES, type ScoringRules } from "../evaluator/scoring-rules.ts";
import {
  parseCritiqueJson,
  validateVisualCritique,
  type VisualCritique,
} from "./critique-schema.ts";

/**
 * The AI Design Critic adapter (DESIGN_QUALITY_METRICS.md §7, §13).
 *
 * The critic is advisory and replaceable: it is an interface, not a provider
 * dependency. Deterministic measurements remain authoritative, and the critic
 * is only allowed to supply the judgements that require seeing the artwork.
 */

export interface CriticInput {
  document: DesignDocument;
  brief: DesignBriefContext;
  render?: RenderEvidence;
  issues: QualityIssue[];
  rules?: ScoringRules;
}

export interface VisualCritic {
  readonly name: string;
  critique(input: CriticInput): Promise<VisualCritique>;
}

/** Recomputes category aggregates after visual scores are merged in. */
function recompute(category: CategoryResult): CategoryResult {
  const subCriteria: SubCriterionResult[] = category.subCriteria.map((sub) => ({ ...sub }));
  const assessedPoints = subCriteria.reduce((sum, sub) => sum + (sub.assessed ? sub.maxPoints : 0), 0);
  const points = subCriteria.reduce((sum, sub) => sum + (sub.points ?? 0), 0);
  const methods = new Set(subCriteria.filter((sub) => sub.assessed).map((sub) => sub.method));
  return {
    ...category,
    subCriteria,
    points: Math.round(points * 100) / 100,
    assessed: assessedPoints === category.maxPoints,
    coverage: category.maxPoints > 0 ? Math.round((assessedPoints / category.maxPoints) * 1000) / 1000 : 1,
    method: methods.size === 1 ? [...methods][0]! : "mixed",
  };
}

/**
 * Applies only legal visual scores. Sub-criteria that the engine measured are
 * never overwritten; illegal entries are ignored and reported by the caller
 * through critique validation.
 */
export function applyVisualCritique(
  categories: CategoryResult[],
  critique: VisualCritique,
  rules: ScoringRules = LATEST_SCORING_RULES,
): { categories: CategoryResult[]; applied: string[] } {
  const applied: string[] = [];
  const updated = categories.map((category) => {
    const scores = critique.categories[category.id];
    const definition = rules.categories.find((candidate) => candidate.id === category.id);
    if (!scores || !definition) return category;

    const subCriteria = category.subCriteria.map((sub) => {
      const visual = scores[sub.id];
      const subDefinition = definition.subCriteria.find((candidate) => candidate.id === sub.id);
      if (!visual || !subDefinition || subDefinition.deterministic !== null) return sub;
      const points = Math.max(0, Math.min(sub.maxPoints, Math.round(visual.points * 100) / 100));
      applied.push(`${category.id}.${sub.id}`);
      return {
        ...sub,
        points,
        method: "visual" as const,
        assessed: true,
        evidence: [...sub.evidence, ...visual.evidence],
        deductions:
          points < sub.maxPoints
            ? [...sub.deductions, `Critic scored ${points}/${sub.maxPoints}: ${visual.evidence[0] ?? "see critique"}`]
            : sub.deductions,
      };
    });

    return recompute({ ...category, subCriteria });
  });

  return { categories: updated, applied };
}

export class StaticVisualCritic implements VisualCritic {
  readonly name: string;
  private readonly value: VisualCritique;

  constructor(value: VisualCritique, name = "static-critic") {
    this.value = value;
    this.name = name;
  }

  async critique(): Promise<VisualCritique> {
    return this.value;
  }
}

export interface LlmCriticOptions {
  /** Provider adapter: takes the prompt, returns the model's raw text. */
  complete: (prompt: string) => Promise<string>;
  name?: string;
  rules?: ScoringRules;
}

/**
 * Provider-agnostic critic. Any model can be plugged in through `complete`;
 * the adapter owns prompt construction, JSON extraction and schema validation,
 * so swapping providers never changes the quality pipeline.
 */
export class LlmVisualCritic implements VisualCritic {
  readonly name: string;
  private readonly complete: (prompt: string) => Promise<string>;
  private readonly rules: ScoringRules;

  constructor(options: LlmCriticOptions) {
    this.complete = options.complete;
    this.name = options.name ?? "llm-critic";
    this.rules = options.rules ?? LATEST_SCORING_RULES;
  }

  async critique(input: CriticInput): Promise<VisualCritique> {
    const prompt = buildCriticPrompt({ ...input, rules: this.rules });
    const raw = await this.complete(prompt);
    const parsed = parseCritiqueJson(raw);
    if (parsed === null) {
      throw new Error("Design critic returned a response that is not valid JSON.");
    }
    const validation = validateVisualCritique(parsed, {
      document: input.document,
      rules: this.rules,
      issues: input.issues,
      render: input.render,
      requirePreview: true,
    });
    if (!validation.valid || !validation.critique) {
      throw new Error(`Design critique rejected: ${validation.errors.join(" ")}`);
    }
    return validation.critique;
  }
}

/**
 * Builds the mandatory critic prompt (DESIGN_QUALITY_METRICS.md §13) together
 * with the exact JSON contract and only the criteria the critic is allowed to
 * score.
 */
export function buildCriticPrompt(input: CriticInput): string {
  const rules = input.rules ?? LATEST_SCORING_RULES;
  const visualCriteria = rules.categories
    .map((category) => {
      const visual = category.subCriteria.filter((sub) => sub.deterministic === null);
      if (visual.length === 0) return null;
      return `${category.id} (${category.label}, ${category.maxPoints} pts):\n${visual
        .map((sub) => `  - ${sub.id} (max ${sub.maxPoints}) ${sub.label}`)
        .join("\n")}`;
    })
    .filter(Boolean)
    .join("\n");

  const issueSummary =
    input.issues.length > 0
      ? input.issues
          .slice(0, 40)
          .map((issue) => `- [${issue.severity}] ${issue.code}: ${issue.message}`)
          .join("\n")
      : "- No deterministic issues were found.";

  const preview = input.render?.preview
    ? input.render.preview.length > 60_000
      ? `${input.render.preview.slice(0, 60_000)}\n<!-- preview truncated -->`
      : input.render.preview
    : "NO PREVIEW SUPPLIED";

  return `You are an independent senior graphic design quality evaluator and creative art director.

Your task is to evaluate a completed graphic design against the DESIGN_SYSTEM.md and DESIGN_QUALITY_METRICS.md standards.

Do not approve a design simply because it renders successfully. Inspect the rendered artwork below.

Evaluate: creative direction and originality, composition and visual balance, visual hierarchy, typography, color harmony, spacing and alignment, imagery and graphic elements, depth and effects, communication and readability, and technical finish.

Rules:
- Never invent a score. Score only the criteria you were given, within their stated maximum.
- Every score needs concrete evidence tied to what you can see or to a named element id.
- Never re-score a measured criterion; contrast, overflow, bounds, fonts and assets are measured deterministically elsewhere.
- Identify critical failures explicitly and be specific.
- Do not give generic feedback such as "make it more attractive". Name the weakness, the affected elements, and the exact correction.
- Preserve successful creative decisions and recommend targeted revisions, not a rebuild.
- A design can only be approved when it satisfies every critical acceptance requirement and reaches the configured minimum score.

Criteria you may score (id, maximum points, criterion):
${visualCriteria}

Deterministic findings (already measured, do not re-score):
${issueSummary}

Design brief: ${JSON.stringify(input.brief)}

Design document (structured JSON):
${JSON.stringify(input.document)}

Rendered preview (${input.render?.format ?? "none"}, ${input.render?.width ?? "?"}×${input.render?.height ?? "?"}):
${preview}

Respond with a single JSON object and nothing else:
{
  "critic": "${thisSafeName(input)}",
  "inspectedPreview": true,
  "categories": {
    "creativeDirection": {
      "concept": { "points": 0, "evidence": ["specific observation"] }
    }
  },
  "strengths": ["specific strength"],
  "weaknesses": ["specific weakness"],
  "improvementPlan": [
    {
      "priority": "critical | high | medium | low",
      "affectedElementIds": ["element-id"],
      "problem": "specific problem",
      "recommendedCorrection": "specific correction"
    }
  ],
  "inspectionNotes": "how the rendered output was inspected"
}`;
}

function thisSafeName(input: CriticInput): string {
  return `critic:${input.document.id}`;
}
