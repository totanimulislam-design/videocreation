import { normalizeForComparison } from "../text/normalize.ts";
import type { DocumentAnalysis } from "../analysis.ts";
import type { QualityContext, QualityIssue } from "../types.ts";
import { createIssue } from "./issue.ts";

const VALIDATOR = "content-validator";

/**
 * Content preservation (quality metrics §3.9, §4 "Content Failure").
 *
 * The user's supplied information is a hard constraint: it must survive into
 * the design, and the engine must never invent or drop it. Requirements are
 * supplied explicitly by the brief; the validator never guesses facts.
 */
export function validateContent(analysis: DocumentAnalysis, _context: QualityContext): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const haystack = normalizeForComparison(analysis.allText);
  const ctaExists =
    analysis.texts.some((block) => block.role === "cta") ||
    analysis.texts.some((block) => /\b(book|buy|order|register|sign up|call|contact|learn more|shop|get started|download|apply)\b/i.test(block.text));

  for (const requirement of analysis.requirements) {
    const required = requirement.required !== false;
    if (!required) continue;

    if (requirement.kind === "cta" && !requirement.value) {
      if (!ctaExists) {
        issues.push(
          createIssue({
            code: "CTA_MISSING",
            title: "Missing call to action",
            category: "content",
            severity: "high",
            message: `The brief requires a call to action ("${requirement.label}") but no CTA text layer is present.`,
            recommendation: "Add a distinct, readable call-to-action element that matches the selected art direction.",
            validator: VALIDATOR,
          }),
        );
      }
      continue;
    }

    if (!requirement.value) continue;

    const needle = normalizeForComparison(requirement.value);
    if (needle.length === 0) continue;
    const present = haystack.includes(needle) || (requirement.kind === "contact" && haystack.replace(/\s+/g, "").includes(needle.replace(/\s+/g, "")));

    if (!present) {
      issues.push(
        createIssue({
          code: "CONTENT_MISSING",
          title: "Required information missing",
          category: "content",
          severity: "critical",
          message: `Required ${requirement.kind ?? "information"} "${requirement.label}" (${JSON.stringify(requirement.value)}) does not appear in the design.`,
          recommendation:
            "Restore the user's original information as editable text. Never shorten, translate or substitute required facts without permission.",
          validator: VALIDATOR,
        }),
      );
    }
  }

  if (analysis.brief.requiresCallToAction && !ctaExists) {
    issues.push(
      createIssue({
        code: "CTA_MISSING",
        title: "Missing call to action",
        category: "content",
        severity: "high",
        message: "The brief requires a call to action, but the composition has no CTA layer.",
        recommendation: "Add a clearly differentiated CTA element with sufficient contrast and size.",
        validator: VALIDATOR,
      }),
    );
  }

  // Decorative-only designs without any text cannot communicate a message that
  // is not carried by imagery alone.
  if (analysis.texts.length === 0 && analysis.requirements.length > 0) {
    issues.push(
      createIssue({
        code: "MESSAGE_ABSENT",
        title: "No message in composition",
        category: "content",
        severity: "critical",
        message: "The brief supplies information, but the design contains no text to communicate it.",
        recommendation: "Compose the supplied information into an editable typographic hierarchy.",
        validator: VALIDATOR,
      }),
    );
  }

  return issues;
}
