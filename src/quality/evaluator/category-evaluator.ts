import type { DocumentAnalysis } from "../analysis.ts";
import { parseColor, relativeLuminance, toHsl } from "../../core/color/color.ts";
import type {
  AssessmentMethod,
  CategoryId,
  CategoryResult,
  QualityIssue,
  RenderEvidence,
  SubCriterionResult,
} from "../types.ts";
import type {
  CategoryDefinition,
  ScoringRules,
} from "./scoring-rules.ts";
import { LATEST_SCORING_RULES } from "./scoring-rules.ts";

/**
 * Deterministic category evaluation.
 *
 * Only criteria that can be justified from measurements or explicit heuristics
 * are scored here. Everything that genuinely requires looking at the artwork is
 * left unassessed (`points: null`) for the visual critic. A report that is
 * missing criteria is reported as such — the engine never fills gaps with
 * invented numbers (DESIGN_QUALITY_METRICS.md §5, §13).
 */

export interface ScoreContext {
  analysis: DocumentAnalysis;
  issues: QualityIssue[];
  /** Preview/render evidence produced from the same document, when available. */
  render?: RenderEvidence;
}

export interface SubCriterionAssessment {
  points: number | null;
  evidence: string[];
  deductions: string[];
  method: AssessmentMethod;
}

type Assessor = (context: ScoreContext) => SubCriterionAssessment;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const round2 = (value: number): number => Math.round(value * 100) / 100;

function issuesWith(context: ScoreContext, codes: string[]): QualityIssue[] {
  const set = new Set(codes);
  return context.issues.filter((issue) => set.has(issue.code));
}

function describeIssue(issue: QualityIssue): string {
  return `${issue.code}: ${issue.message}`;
}

/**
 * Deducts a fixed amount per issue, capped at `max`. Each assessment states the
 * amount so the report can explain every lost point.
 */
function deductFor(
  context: ScoreContext,
  codes: string[],
  amounts: { critical: number; high: number; medium: number; low: number },
): { amount: number; evidence: string[]; deductions: string[] } {
  const found = issuesWith(context, codes);
  let amount = 0;
  const deductions: string[] = [];
  for (const issue of found) {
    const cost = amounts[issue.severity];
    if (cost <= 0) continue;
    amount += cost;
    deductions.push(`−${round2(cost)} ${describeIssue(issue)}`);
  }
  return { amount, evidence: found.map(describeIssue), deductions };
}

function textLevels(analysis: DocumentAnalysis): { levels: number; ratio: number; headline?: number; bodyMax?: number } {
  const essential = analysis.texts.filter((block) => block.essential);
  if (essential.length === 0) return { levels: 0, ratio: 0 };
  const sizes = new Set(essential.map((block) => round2(block.typography.fontSize)));
  const headlineBlock = essential.find((block) => block.role === "headline");
  const headline = headlineBlock?.typography.fontSize ?? Math.max(...essential.map((block) => block.typography.fontSize));
  const bodyCandidates = essential.filter((block) => block.role !== "headline");
  const bodyMax = bodyCandidates.length > 0 ? Math.max(...bodyCandidates.map((block) => block.typography.fontSize)) : undefined;
  const ratio = bodyMax && bodyMax > 0 ? headline / bodyMax : 0;
  return { levels: sizes.size, ratio, headline, bodyMax };
}

const assessors: Record<string, Assessor> = {
  /* ---------------------------------------------------------------- composition */
  "composition.balance": ({ analysis }) => {
    // Balance is about the centre of visual mass sitting in a deliberate place,
    // not equal quadrant fill: intentional asymmetry is a valid composition.
    const { x, y } = analysis.layout.centerOfMass;
    const distance = Math.hypot(x - 0.5, y - 0.5);
    const points = 3 * (1 - clamp01((distance - 0.05) / 0.25));
    return {
      points,
      evidence: [
        `Centre of visual mass at ${round2(x)}/${round2(y)} of the canvas (${round2(distance)} from centre); quadrant distribution ${round2(analysis.layout.quadrantBalance)}.`,
      ],
      deductions:
        distance > 0.15
          ? ["Visual weight pulls noticeably off-centre without a compensating mass."]
          : [],
      method: "measured",
    };
  },

  "composition.focalPoint": ({ analysis }) => {
    const [first, second] = analysis.focalCandidates;
    if (!first) {
      return { points: 0, evidence: ["No visible content to establish a focal point."], deductions: ["Composition has no focal point."], method: "heuristic" };
    }
    const dominance = second && second.salience > 0 ? first.salience / second.salience : 2;
    let points: number;
    if (first.role === "decoration") points = 1;
    else if (dominance >= 1.6) points = 3;
    else if (dominance >= 1.25) points = 2.5;
    else if (dominance >= 1.05) points = 2;
    else points = 1.25;
    return {
      points,
      evidence: [
        `Strongest visual candidate is "${first.elementId}" (role ${first.role}) with ${round2(dominance)}× the salience of the next element.`,
      ],
      deductions:
        points < 2
          ? ["Competing elements split attention, so the focal point is ambiguous."]
          : [],
      method: "heuristic",
    };
  },

  "composition.negativeSpace": ({ analysis }) => {
    const coverage = analysis.layout.coverage;
    let points: number;
    if (coverage < 0.02) points = 0.5;
    else if (coverage <= 0.55) points = 2;
    else if (coverage <= 0.72) points = 1.2;
    else points = 0.5;
    const deductions: string[] = [];
    if (coverage >= 0.72) deductions.push("Too much of the canvas is occupied; negative space no longer frames the message.");
    if (coverage < 0.02) deductions.push("The canvas is effectively empty.");
    return {
      points,
      evidence: [`Occupied canvas share ${round2(coverage)} (remaining area is negative space).`],
      deductions,
      method: "measured",
    };
  },

  "composition.spatial": ({ analysis }) => {
    const collisions = analysis.layout.overlaps.length;
    const obscured = analysis.layout.hiddenEssential.length;
    const points = obscured > 0 ? 0 : collisions > 0 ? 0.5 : 1;
    return {
      points,
      evidence: [`${collisions} unintended text collision(s), ${obscured} obscured essential element(s).`],
      deductions:
        obscured > 0
          ? ["Essential content is painted underneath another object."]
          : collisions > 0
            ? ["Elements overlap without an intentional layering decision."]
            : [],
      method: "measured",
    };
  },

  /* ------------------------------------------------------------------ hierarchy */
  "hierarchy.primaryFocalPoint": ({ analysis }) => {
    const top = analysis.focalCandidates[0];
    if (!top) {
      return { points: 0, evidence: ["No visible content."], deductions: ["No focal point exists."], method: "heuristic" };
    }
    const primaryRoles = new Set(["headline", "cta", "image"]);
    const topTwo = analysis.focalCandidates.slice(0, 2).map((candidate) => candidate.role);
    const points = topTwo.some((role) => primaryRoles.has(role)) ? 3 : top.role === "subheadline" ? 2 : 1;
    return {
      points,
      evidence: [`Highest-salience elements: ${topTwo.join(", ")}.`],
      deductions: points < 3 ? ["The strongest element is not the primary message carrier."] : [],
      method: "heuristic",
    };
  },

  "hierarchy.headline": ({ analysis, issues }) => {
    const headlineBlock = analysis.texts.find((block) => block.role === "headline");
    const { ratio } = textLevels(analysis);
    if (!headlineBlock) {
      const largest = [...analysis.texts].sort((a, b) => b.typography.fontSize - a.typography.fontSize)[0];
      const points = largest ? 1 : 0;
      return {
        points,
        evidence: largest
          ? [`No explicit headline role; largest text "${largest.element.name}" is ${round2(largest.typography.fontSize)} units.`]
          : ["No text elements."],
        deductions: ["Headline prominence cannot be validated without a headline."],
        method: "measured",
      };
    }
    let points: number;
    if (ratio >= 2) points = 3;
    else if (ratio >= 1.6) points = 2.5;
    else if (ratio >= 1.35) points = 2;
    else if (ratio >= 1.1) points = 1;
    else points = 0.5;
    const weak = issuesWith({ analysis, issues }, ["WEAK_TYPE_HIERARCHY"]);
    if (weak.length > 0) points = Math.min(points, 1.5);
    return {
      points,
      evidence: [`Headline is ${ratio > 0 ? round2(ratio) : "n/a"}× the largest supporting text.`],
      deductions: weak.map(describeIssue),
      method: "measured",
    };
  },

  "hierarchy.secondary": ({ analysis }) => {
    const { levels } = textLevels(analysis);
    const points = levels >= 3 ? 2 : levels === 2 ? 1.5 : levels === 1 ? 0.75 : 0;
    return {
      points,
      evidence: [`${levels} distinct type size level(s) across essential text.`],
      deductions: levels < 2 ? ["There is no secondary information level; all copy reads as one rank."] : [],
      method: "measured",
    };
  },

  "hierarchy.contrastLevels": ({ analysis }) => {
    const essential = analysis.texts.filter((block) => block.essential);
    const signatures = new Set(
      essential.map(
        (block) => `${round2(block.typography.fontSize)}|${block.typography.fontWeight}|${block.element.style.fill ?? "default"}`,
      ),
    );
    const points = signatures.size >= 3 ? 2 : signatures.size === 2 ? 1.5 : signatures.size === 1 ? 0.75 : 0;
    return {
      points,
      evidence: [`${signatures.size} distinct size/weight/colour combination(s) separate information ranks.`],
      deductions:
        signatures.size <= 1 && essential.length > 1
          ? ["All information is styled identically, so hierarchy relies on position alone."]
          : [],
      method: "measured",
    };
  },

  /* ----------------------------------------------------------------- typography */
  "typography.hierarchy": ({ analysis, issues }) => {
    if (analysis.texts.length === 0) {
      return { points: 0, evidence: ["No text in the composition."], deductions: ["Typography cannot be assessed without text."], method: "measured" };
    }
    const { levels, ratio } = textLevels(analysis);
    let points = 3;
    const deductions: string[] = [];
    const weak = issuesWith({ analysis, issues }, ["WEAK_TYPE_HIERARCHY"]);
    for (const issue of weak) {
      const cost = issue.severity === "high" ? 1.5 : 0.75;
      points -= cost;
      deductions.push(`−${cost} ${describeIssue(issue)}`);
    }
    const noHeadline = issuesWith({ analysis, issues }, ["NO_HEADLINE_ROLE"]);
    if (noHeadline.length > 0) {
      points -= 0.5;
      deductions.push("−0.5 No headline role is declared.");
    }
    if (levels >= 3) {
      deductions.length === 0 && (deductions.push(`Three or more type levels with a ${ratio > 0 ? round2(ratio) : "clear"} headline ratio.`));
    } else if (levels === 2) {
      points = Math.min(points, 1.5);
      deductions.push("Only two type levels exist, limiting hierarchy depth.");
    } else if (levels <= 1) {
      points = Math.min(points, 0.5);
      deductions.push("A single type level cannot express hierarchy.");
    }
    return {
      points,
      evidence: [`${levels} type level(s), headline-to-supporting ratio ${ratio > 0 ? round2(ratio) : "n/a"}.`],
      deductions,
      method: "measured",
    };
  },

  "typography.spacing": ({ issues, analysis }) => {
    if (analysis.texts.length === 0) {
      return { points: 0, evidence: ["No text."], deductions: ["Line spacing cannot be assessed."], method: "measured" };
    }
    const penalty = deductFor({ analysis, issues }, ["LINE_HEIGHT_COLLISION", "LINE_HEIGHT_TIGHT", "LINE_HEIGHT_LOOSE", "LETTER_SPACING_CRAMPED"], {
      critical: 2,
      high: 1,
      medium: 0.5,
      low: 0.2,
    });
    const points = Math.max(0, 2 - penalty.amount);
    return {
      points,
      evidence: [`${analysis.texts.length} text block(s) checked for leading and tracking.`],
      deductions: penalty.deductions,
      method: "measured",
    };
  },

  "typography.readability": ({ issues, analysis }) => {
    if (analysis.texts.length === 0) {
      return { points: 0, evidence: ["No text."], deductions: ["Readability cannot be assessed."], method: "measured" };
    }
    const penalty = deductFor({ analysis, issues }, [
      "TEXT_TOO_SMALL",
      "BODY_TEXT_BELOW_MINIMUM",
      "TEXT_OVERFLOW_FRAME",
      "TEXT_EXCEEDS_MAX_LINES",
      "TEXT_LINE_TOO_LONG",
      "EMPTY_TEXT",
    ], {
      critical: 2,
      high: 1,
      medium: 0.5,
      low: 0.2,
    });
    return {
      points: Math.max(0, 2 - penalty.amount),
      evidence: [`Readability checks ran on ${analysis.texts.length} text block(s).`],
      deductions: penalty.deductions,
      method: "measured",
    };
  },

  "typography.language": ({ analysis, issues }) => {
    if (analysis.texts.length === 0) {
      return { points: 1, evidence: ["No text; language rendering not applicable."], deductions: [], method: "measured" };
    }
    const glyph = issuesWith({ analysis, issues }, ["GLYPH_UNSUPPORTED"]);
    const font = issuesWith({ analysis, issues }, ["FONT_UNAVAILABLE"]);
    if (glyph.length > 0) {
      return {
        points: 0,
        evidence: glyph.map(describeIssue),
        deductions: ["Required script coverage is missing; characters would break."],
        method: "measured",
      };
    }
    return {
      points: font.length > 0 ? 0.5 : 1,
      evidence: [`Scripts used: ${analysis.scriptsUsed.join(", ") || "latin"}.`],
      deductions: font.length > 0 ? font.map(describeIssue) : [],
      method: "measured",
    };
  },

  /* ----------------------------------------------------------------------- color */
  "color.harmony": ({ analysis }) => {
    const colorful = analysis.palette.filter((entry) => entry.rgba.a > 0.05);
    const hues = new Set<number>();
    for (const entry of colorful) {
      const hsl = toHsl(entry.rgba);
      if (hsl.s < 0.12) continue;
      hues.add(Math.round(hsl.h / 15) * 15);
    }
    let points = 2;
    const deductions: string[] = [];
    if (colorful.length > 8) {
      points -= 1;
      deductions.push(`${colorful.length} distinct colours fragment the palette.`);
    } else if (colorful.length > 6) {
      points -= 0.5;
      deductions.push(`${colorful.length} distinct colours exceed a disciplined palette.`);
    }
    if (hues.size > 4) {
      points -= 0.5;
      deductions.push(`${hues.size} hue families compete without a dominant temperature.`);
    }
    return {
      points: Math.max(0, points),
      evidence: [
        `${colorful.length} palette colour(s) across ${hues.size} hue family(ies)${hues.size ? ` (${[...hues].join("°, ")}°)` : ""}.`,
      ],
      deductions,
      method: "heuristic",
    };
  },

  "color.contrast": ({ analysis, issues }) => {
    const essential = analysis.texts.filter((block) => block.essential);
    if (essential.length === 0) {
      return { points: 2, evidence: ["No text; contrast between type and ground is not applicable."], deductions: [], method: "measured" };
    }
    const samples = analysis.contrastSamples.filter((sample) =>
      essential.some((block) => block.element.id === sample.elementId),
    );
    const verifiable = samples.filter((sample) => sample.verifiable && sample.ratio !== null);
    if (verifiable.length === 0) {
      const unverified = issuesWith({ analysis, issues }, ["CONTRAST_UNVERIFIED"]);
      return {
        points: null,
        evidence: unverified.map(describeIssue),
        deductions: [],
        method: "measured",
      };
    }
    const passes = verifiable.filter((sample) => sample.passes).length;
    const ratio = passes / verifiable.length;
    const critical = issuesWith({ analysis, issues }, ["CONTRAST_INSUFFICIENT"]).filter(
      (issue) => issue.severity === "critical",
    );
    const points = Math.max(0, 2 * ratio);
    return {
      points,
      evidence: [`${passes}/${verifiable.length} text sample(s) meet the WCAG threshold at their size.`],
      deductions:
        critical.length > 0
          ? [critical.length + " text sample(s) fail contrast critically."]
          : ratio < 1
            ? ["At least one text sample is below the required contrast ratio."]
            : [],
      method: "measured",
    };
  },

  "color.accent": ({ analysis }) => {
    const entries = analysis.palette.filter((entry) => entry.rgba.a > 0.2 && entry.roles[0] !== "background");
    const vivid = entries.filter((entry) => entry.hsl.s >= 0.35 && entry.hsl.l > 0.15 && entry.hsl.l < 0.9);
    if (vivid.length === 0) {
      return {
        points: 1,
        evidence: ["Palette is restrained to neutrals; a disciplined accent-free treatment is valid."],
        deductions: [],
        method: "heuristic",
      };
    }
    const totalUses = entries.reduce((sum, entry) => sum + entry.count, 0) || 1;
    const accentUses = Math.max(...vivid.map((entry) => entry.count));
    const share = accentUses / totalUses;
    const points = share >= 0.03 && share <= 0.4 ? 1 : share <= 0.6 ? 0.75 : 0.5;
    return {
      points,
      evidence: [`Dominant accent accounts for ${round2(share * 100)}% of colour usage.`],
      deductions: share > 0.6 ? ["The accent has become a second dominant colour."] : [],
      method: "heuristic",
    };
  },

  "color.backgroundForeground": ({ analysis, issues }) => {
    const essential = analysis.texts.filter((block) => block.essential);
    if (essential.length === 0) {
      return { points: 1, evidence: ["No text; ground/foreground relationship not applicable."], deductions: [], method: "measured" };
    }
    const backgroundLuminance = relativeLuminance(analysis.background);
    const deltas = essential.map((block) => {
      const fill = parseColor(block.element.style.fill) ?? { r: 0, g: 0, b: 0, a: 1 };
      return Math.abs(relativeLuminance(fill) - backgroundLuminance);
    });
    const average = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
    const points = average >= 0.35 ? 2 : average >= 0.2 ? 1.5 : average >= 0.1 ? 1 : 0.5;
    const contrastIssues = issuesWith({ analysis, issues }, ["CONTRAST_INSUFFICIENT"]);
    return {
      points,
      evidence: [`Average ground/foreground luminance separation ${round2(average)}.`],
      deductions:
        contrastIssues.length > 0
          ? contrastIssues.map(describeIssue)
          : points < 1
            ? ["Foreground and ground sit too close in value to separate cleanly."]
            : [],
      method: "measured",
    };
  },

  /* --------------------------------------------------------------------- spacing */
  "spacing.margins": ({ analysis, issues }) => {
    const content = analysis.visible.filter((element) => element.meta?.role !== "background").length;
    if (content < 3) {
      return { points: 2, evidence: ["Fewer than three content elements; margin consistency is not applicable."], deductions: [], method: "measured" };
    }
    const penalty = deductFor({ analysis, issues }, ["MARGIN_INCONSISTENT"], { critical: 2, high: 1, medium: 0.5, low: 0.2 });
    const deviation = analysis.margins.deviation;
    return {
      points: Math.max(0, 2 - penalty.amount),
      evidence: [`Margin spread ${round2(deviation)} units across the four canvas edges.`],
      deductions: penalty.deductions,
      method: "measured",
    };
  },

  "spacing.alignment": ({ analysis }) => {
    const content = analysis.visible.filter((element) => element.meta?.role !== "background");
    if (content.length < 3) {
      return { points: 2, evidence: ["Too few elements to assess a shared alignment system."], deductions: [], method: "measured" };
    }
    const share = analysis.alignment.alignedShare;
    const points = share >= 0.75 ? 2 : share >= 0.6 ? 1.75 : share >= 0.45 ? 1.5 : share >= 0.3 ? 1 : 0.5;
    return {
      points,
      evidence: [`${round2(share * 100)}% of elements share an alignment edge with another element.`],
      deductions: share < 0.45 ? ["Too few shared alignment axes; the layout reads as loosely placed."] : [],
      method: "measured",
    };
  },

  "spacing.relationships": ({ analysis, issues }) => {
    const blocks = analysis.texts.filter((block) => block.essential);
    if (blocks.length < 3) {
      return { points: 2, evidence: ["Fewer than three text blocks; gap rhythm is not applicable."], deductions: [], method: "measured" };
    }
    const ratio = analysis.spacing.meanGap > 0 ? analysis.spacing.deviation / analysis.spacing.meanGap : 0;
    const base = ratio <= 0.25 ? 2 : ratio <= 0.5 ? 1.75 : ratio <= 0.75 ? 1.4 : ratio <= 1.1 ? 1 : 0.6;
    const penalty = deductFor({ analysis, issues }, ["SPACING_INCONSISTENT"], { critical: 2, high: 1, medium: 0.5, low: 0.2 });
    return {
      points: Math.max(0, Math.min(base, 2 - penalty.amount)),
      evidence: [`Gap deviation is ${round2(ratio)}× the mean gap across ${analysis.spacing.gaps.length} measured gap(s).`],
      deductions: penalty.deductions,
      method: "measured",
    };
  },

  "spacing.padding": ({ analysis }) => {
    if (analysis.texts.length === 0) {
      return { points: 1, evidence: ["No text blocks; internal padding not applicable."], deductions: [], method: "measured" };
    }
    const tight = analysis.texts.filter((block) => {
      const fill = block.frameHeight > 0 ? block.measurement.height / block.frameHeight : 1;
      return fill > 1.02 || fill < 0.2;
    });
    const badFraction = tight.length / analysis.texts.length;
    return {
      points: Math.max(0.5, 1 - badFraction * 0.5),
      evidence: [
        `${tight.length}/${analysis.texts.length} text frame(s) clip content or leave more than 80% empty space.`,
      ],
      deductions: badFraction > 0.5 ? ["Text frames are not sized to their content, breaking internal spacing."] : [],
      method: "measured",
    };
  },

  /* --------------------------------------------------------------------- imagery */
  "imagery.quality": ({ analysis, issues }) => {
    if (analysis.images.length === 0) {
      return { points: 1, evidence: ["No raster imagery; image quality not applicable."], deductions: [], method: "measured" };
    }
    const penalty = deductFor({ analysis, issues }, ["ASSET_LOW_RESOLUTION", "ASSET_RESOLUTION_MARGINAL", "ASSET_UNSUPPORTED_TYPE"], {
      critical: 1,
      high: 1,
      medium: 0.4,
      low: 0.1,
    });
    return {
      points: Math.max(0, 1 - penalty.amount),
      evidence: [`${analysis.images.length} image element(s) checked against ${analysis.targetAssetDpi} DPI target.`],
      deductions: penalty.deductions,
      method: "measured",
    };
  },

  "imagery.placement": ({ analysis, issues }) => {
    if (analysis.images.length === 0) {
      return { points: 2, evidence: ["No imagery; placement not applicable."], deductions: [], method: "measured" };
    }
    const penalty = deductFor({ analysis, issues }, ["ASSET_MISSING", "IMAGE_DISTORTED", "IMAGE_NON_UNIFORM_SCALE"], {
      critical: 2,
      high: 1,
      medium: 0.5,
      low: 0.2,
    });
    return {
      points: Math.max(0, 2 - penalty.amount),
      evidence: [`Image placement, cropping mode and scale checked for ${analysis.images.length} image(s).`],
      deductions: penalty.deductions,
      method: "measured",
    };
  },

  "imagery.illustrationConsistency": ({ analysis }) => {
    if (analysis.images.length < 2) {
      return { points: 1, evidence: ["Fewer than two images; consistency not applicable."], deductions: [], method: "heuristic" };
    }
    const fits = new Set(analysis.images.map((entry) => entry.fit));
    return {
      points: fits.size === 1 ? 1 : 0.5,
      evidence: [`Images use ${fits.size} different crop mode(s): ${[...fits].join(", ")}.`],
      deductions: fits.size > 1 ? ["Mixed crop behaviour makes imagery feel inconsistently treated."] : [],
      method: "heuristic",
    };
  },

  "imagery.shapeIntegration": ({ analysis }) => {
    if (analysis.shapes.length === 0) {
      return {
        points: 2,
        evidence: ["No graphic shapes; a typography-led composition is evaluated on its own terms."],
        deductions: [],
        method: "heuristic",
      };
    }
    const unlabelled = analysis.shapes.filter(
      (element) => !element.meta?.role && element.meta?.decorative !== true,
    );
    const share = unlabelled.length / analysis.shapes.length;
    const points = share > 0.5 ? 1.5 : 2;
    return {
      points,
      evidence: [`${analysis.shapes.length} shape(s), ${unlabelled.length} without a declared role.`],
      deductions: share > 0.5 ? ["Most graphic shapes have no declared purpose, which reads as random decoration."] : [],
      method: "heuristic",
    };
  },

  /* --------------------------------------------------------------------- effects */
  "effects.layering": ({ analysis }) => {
    let points = 2;
    const deductions: string[] = [];
    if (analysis.duplicateZIndices.length > 0) {
      points -= 0.5;
      deductions.push(`${analysis.duplicateZIndices.length} z-index value(s) are shared, making paint order ambiguous.`);
    }
    if (analysis.layout.hiddenEssential.length > 0) {
      points -= 1;
      deductions.push("Essential content is hidden by a higher layer.");
    }
    return {
      points: Math.max(0, points),
      evidence: [`${analysis.visible.length} visible layers; z-index conflicts: ${analysis.duplicateZIndices.length}.`],
      deductions,
      method: "measured",
    };
  },

  "effects.discipline": ({ analysis }) => {
    if (analysis.effectCount === 0) {
      return { points: 1, evidence: ["No effects used; clean flat artwork is a valid professional treatment."], deductions: [], method: "measured" };
    }
    let points = 1;
    const deductions: string[] = [];
    if (analysis.maxEffectsPerElement > 2) {
      points -= 0.5;
      deductions.push(`One element stacks ${analysis.maxEffectsPerElement} effects.`);
    }
    if (analysis.effectCount > Math.max(2, analysis.visible.length * 0.75)) {
      points -= 0.5;
      deductions.push(`${analysis.effectCount} effects are applied across ${analysis.visible.length} elements.`);
    }
    return {
      points: Math.max(0, points),
      evidence: [`${analysis.effectCount} effect(s) across ${analysis.visible.length} element(s).`],
      deductions,
      method: "measured",
    };
  },

  /* --------------------------------------------------------------- communication */
  "communication.accuracy": ({ analysis, issues }) => {
    const missing = issuesWith({ analysis, issues }, ["CONTENT_MISSING", "MESSAGE_ABSENT"]);
    const placeholders = issuesWith({ analysis, issues }, ["PLACEHOLDER_CONTENT", "EMPTY_TEXT"]);
    if (missing.length > 0 || placeholders.length > 0) {
      const points = 0;
      return {
        points,
        evidence: [...missing, ...placeholders].map(describeIssue),
        deductions: ["Supplied information is missing or placeholder content remains."],
        method: "measured",
      };
    }
    return {
      points: 2,
      evidence:
        analysis.requirements.length > 0
          ? [`All ${analysis.requirements.length} required content item(s) found in the document text.`]
          : ["No explicit content requirements were supplied; only placeholder and empty-content checks could be applied."],
      deductions: [],
      method: "measured",
    };
  },

  "communication.comfort": ({ issues }) => {
    const critical = issues.filter(
      (issue) =>
        issue.severity === "critical" &&
        (issue.category === "typography" || issue.category === "color"),
    );
    const high = issues.filter(
      (issue) => issue.severity === "high" && (issue.category === "typography" || issue.category === "color"),
    );
    const points = critical.length > 0 ? 0 : high.length > 0 ? 0.5 : 1;
    return {
      points,
      evidence: [`${critical.length} critical and ${high.length} high-severity readability issue(s).`],
      deductions: critical.length > 0 ? ["Essential text is unreadable as rendered."] : [],
      method: "measured",
    };
  },

  "communication.cta": ({ analysis }) => {
    const cta = analysis.texts.find((block) => block.role === "cta");
    if (analysis.brief.requiresCallToAction) {
      return {
        points: cta ? (cta.typography.fontSize >= 12 ? 1 : 0.5) : 0,
        evidence: cta ? [`CTA "${cta.element.name}" is present.`] : ["The brief requires a CTA but none exists."],
        deductions: cta ? [] : ["No call to action."],
        method: "heuristic",
      };
    }
    return {
      points: 1,
      evidence: cta ? [`CTA "${cta.element.name}" is present.`] : ["No CTA required by the brief."],
      deductions: [],
      method: "heuristic",
    };
  },

  /* ------------------------------------------------------------------- technical */
  "technical.dimensions": ({ analysis, issues }) => {
    const invalid = issuesWith({ analysis, issues }, ["SCHEMA_INVALID"]);
    const aspect = issuesWith({ analysis, issues }, ["EXPORT_ASPECT_MISMATCH"]);
    if (invalid.length > 0) {
      return { points: 0, evidence: invalid.map(describeIssue), deductions: ["Canvas dimensions are invalid."], method: "measured" };
    }
    return {
      points: aspect.length > 0 ? 0.5 : 1,
      evidence: [`Canvas ${analysis.canvas.width}×${analysis.canvas.height} ${analysis.canvas.unit}.`],
      deductions: aspect.map(describeIssue),
      method: "measured",
    };
  },

  "technical.structure": ({ analysis, issues }) => {
    const invalid = issuesWith({ analysis, issues }, ["SCHEMA_INVALID", "DOCUMENT_EMPTY"]);
    const warnings = issuesWith({ analysis, issues }, ["SCHEMA_WARNING"]);
    if (invalid.length > 0) {
      return { points: 0, evidence: invalid.map(describeIssue), deductions: ["The document does not satisfy the schema."], method: "measured" };
    }
    return {
      points: warnings.length > 0 ? 0.5 : 1,
      evidence: ["Document validated against the canonical DesignElement schema."],
      deductions: warnings.map(describeIssue),
      method: "measured",
    };
  },

  "technical.editability": ({ analysis, issues }) => {
    const flattened = issuesWith({ analysis, issues }, ["DOCUMENT_FLATTENED"]);
    if (flattened.length > 0) {
      return { points: 0, evidence: flattened.map(describeIssue), deductions: ["The design is not editable."], method: "measured" };
    }
    const editable = analysis.visible.filter((element) => element.type !== "image").length;
    const share = analysis.visible.length > 0 ? editable / analysis.visible.length : 0;
    return {
      points: share >= 0.4 ? 1 : 0.5,
      evidence: [`${editable}/${analysis.visible.length} visible elements are vector or text objects.`],
      deductions: share < 0.4 ? ["Most of the composition is raster imagery rather than editable objects."] : [],
      method: "measured",
    };
  },

  "technical.resources": ({ analysis, issues }) => {
    const missing = issuesWith({ analysis, issues }, ["ASSET_MISSING", "FONT_UNAVAILABLE", "GLYPH_UNSUPPORTED"]);
    const partial = issuesWith({ analysis, issues }, ["ASSET_RESOLUTION_MARGINAL", "FONT_WEIGHT_UNAVAILABLE", "ASSET_UNSUPPORTED_TYPE"]);
    if (missing.length > 0) {
      return { points: 0, evidence: missing.map(describeIssue), deductions: ["Required fonts or assets are unavailable."], method: "measured" };
    }
    return {
      points: partial.length > 0 ? 0.5 : 1,
      evidence: ["All referenced fonts and assets resolved against the studio registries."],
      deductions: partial.map(describeIssue),
      method: "measured",
    };
  },

  "technical.rendering": ({ analysis, issues, render }) => {
    const mismatch = issuesWith({ analysis, issues }, ["RENDER_NOT_FROM_DOCUMENT", "RENDER_DIMENSION_MISMATCH"]);
    if (mismatch.length > 0) {
      return { points: 0, evidence: mismatch.map(describeIssue), deductions: ["Preview and document disagree."], method: "measured" };
    }
    if (!render) {
      return {
        points: null,
        evidence: ["No render evidence supplied; preview/export consistency cannot be verified."],
        deductions: [],
        method: "measured",
      };
    }
    return {
      points: 1,
      evidence: [`Preview rendered from this document at ${render.width ?? analysis.canvas.width}×${render.height ?? analysis.canvas.height}.`],
      deductions: [],
      method: "measured",
    };
  },

  "technical.export": ({ analysis, issues }) => {
    const configured = issuesWith({ analysis, issues }, ["EXPORT_NOT_CONFIGURED"]);
    if (configured.length > 0) {
      return { points: null, evidence: configured.map(describeIssue), deductions: [], method: "measured" };
    }
    const exportIssues = issues.filter((issue) => issue.category === "export");
    if (exportIssues.some((issue) => issue.severity === "critical")) {
      return { points: 0, evidence: exportIssues.map(describeIssue), deductions: ["The export artifact is unusable."], method: "measured" };
    }
    if (exportIssues.some((issue) => issue.severity === "high")) {
      return { points: 0.5, evidence: exportIssues.map(describeIssue), deductions: ["The export has a production defect."], method: "measured" };
    }
    if (exportIssues.length > 0) {
      return { points: 0.75, evidence: exportIssues.map(describeIssue), deductions: ["Export specifications need refinement."], method: "measured" };
    }
    return { points: 1, evidence: ["All declared exports verified for dimensions, DPI and artifact integrity."], deductions: [], method: "measured" };
  },

  "technical.print": ({ analysis, issues }) => {
    const print = analysis.canvas.unit !== "px";
    if (!print) {
      return { points: 1, evidence: ["Digital document; print specifications not applicable."], deductions: [], method: "measured" };
    }
    const penalty = deductFor({ analysis, issues }, [
      "PRINT_DPI_UNDECLARED",
      "PRINT_BLEED_MISSING",
      "EXPORT_DPI_LOW",
      "EXPORT_DPI_MARGINAL",
      "EXPORT_BLEED_DISABLED",
      "EXPORT_COLOR_PROFILE_MISSING",
    ], {
      critical: 1,
      high: 0.5,
      medium: 0.25,
      low: 0.1,
    });
    return {
      points: Math.max(0, 1 - penalty.amount),
      evidence: [
        `Print document: ${analysis.canvas.dpi ?? "no"} DPI declared, bleed ${analysis.canvas.bleed ?? 0} ${analysis.canvas.unit}.`,
      ],
      deductions: penalty.deductions,
      method: "measured",
    };
  },
};

export function assessCategory(
  definition: CategoryDefinition,
  context: ScoreContext,
): CategoryResult {
  const subCriteria: SubCriterionResult[] = definition.subCriteria.map((sub) => {
    const assessor = assessors[`${definition.id}.${sub.id}`];
    const base = {
      id: sub.id,
      label: sub.label,
      maxPoints: sub.maxPoints,
    };
    if (!assessor) {
      return {
        ...base,
        points: null,
        method: "visual" as AssessmentMethod,
        assessed: false,
        evidence: [],
        deductions: [],
      };
    }
    const result = assessor(context);
    const points =
      result.points === null
        ? null
        : Math.max(0, Math.min(sub.maxPoints, Math.round(result.points * 100) / 100));
    return {
      ...base,
      points,
      method: result.method,
      assessed: points !== null,
      evidence: result.evidence,
      deductions: result.deductions,
    };
  });

  const assessedPoints = subCriteria.reduce((sum, sub) => sum + (sub.assessed ? sub.maxPoints : 0), 0);
  const points = subCriteria.reduce((sum, sub) => sum + (sub.points ?? 0), 0);
  const coverage = definition.maxPoints > 0 ? assessedPoints / definition.maxPoints : 1;
  const methods = new Set(subCriteria.filter((sub) => sub.assessed).map((sub) => sub.method));

  return {
    id: definition.id,
    label: definition.label,
    maxPoints: definition.maxPoints,
    points: Math.round(points * 100) / 100,
    assessed: assessedPoints === definition.maxPoints,
    coverage: Math.round(coverage * 1000) / 1000,
    method: methods.size === 1 ? [...methods][0]! : "mixed",
    subCriteria,
  };
}

export function evaluateCategories(
  context: ScoreContext,
  rules: ScoringRules = LATEST_SCORING_RULES,
): CategoryResult[] {
  return rules.categories.map((definition) => assessCategory(definition, context));
}

/**
 * Categories with nothing assessed. Used when a document fails the schema gate
 * before it can be analysed: the report must still exist, but it can never
 * imply that anything was measured or inspected.
 */
export function emptyCategories(
  rules: ScoringRules = LATEST_SCORING_RULES,
): CategoryResult[] {
  return rules.categories.map((definition) => ({
    id: definition.id,
    label: definition.label,
    maxPoints: definition.maxPoints,
    points: 0,
    assessed: false,
    coverage: 0,
    method: "visual" as const,
    subCriteria: definition.subCriteria.map((sub) => ({
      id: sub.id,
      label: sub.label,
      maxPoints: sub.maxPoints,
      points: null,
      method: (sub.deterministic === null ? "visual" : sub.deterministic) as AssessmentMethod,
      assessed: false,
      evidence: [],
      deductions: [],
    })),
  }));
}

/** Exposed for tests: which sub-criteria have a deterministic assessor. */
export function deterministicSubCriteria(): string[] {
  return Object.keys(assessors);
}

export function isCategoryId(value: string): value is CategoryId {
  return LATEST_SCORING_RULES.categories.some((category) => category.id === value);
}
