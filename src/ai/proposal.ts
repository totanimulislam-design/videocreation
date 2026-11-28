/**
 * Validation for untrusted AI brief proposals — the gate before a proposal may
 * influence a `DesignBrief`.
 *
 * Mirrors `src/validation/design-plan.ts`: it accepts `unknown`, never throws,
 * and returns an explicit error/warning split with stable codes. A proposal that
 * fails is rejected whole; it is not partially applied.
 *
 * The dangerous failure mode this module exists to stop is a model inventing a
 * fact (a date, price, name, phone number) and having it reach the canvas. The
 * rule is therefore: a *factual* field claimed as `explicit` or `derived` must
 * quote text that is a verbatim, case-folded substring of the original brief.
 * Anything the model supplies from prior knowledge must be `assumed` or
 * `unknown`, which produces a warning that a human must review.
 */

import { CODES, DiagnosticBag, toResult, type ValidationResult } from '../core/diagnostics.ts';
import type {
  AiBriefProposal,
  FieldProposal,
  ProposalEvidenceKind,
  ProposalField,
} from './types.ts';
import { PROPOSAL_FIELDS } from './types.ts';

/** Fields whose value is a user fact rather than a creative judgement. */
const FACTUAL_FIELDS: ReadonlySet<ProposalField> = new Set<ProposalField>([
  'brand.name',
  'content.headline',
  'content.subheadline',
  'content.body',
  'content.details',
  'content.cta',
]);

/** Fields whose value is a list. */
const COLLECTION_FIELDS: ReadonlySet<ProposalField> = new Set<ProposalField>([
  'audience',
  'content.body',
  'content.details',
  'visualDirection.mood',
  'visualDirection.style',
]);

const EVIDENCE_KINDS: readonly ProposalEvidenceKind[] = Object.freeze(['explicit', 'derived', 'assumed', 'unknown']);

export interface ValidateProposalOptions {
  /** The original user text the proposal claims to interpret. Required for fact checks. */
  readonly briefText: string;
  /**
   * Highest confidence accepted without review. Default `0.9`.
   *
   * A model asserting near-certainty about inference is a signal of fabrication,
   * so excessive confidence on a non-explicit field is an error rather than a
   * cosmetic warning.
   */
  readonly maxInferredConfidence?: number;
  /**
   * Accept proposals even when a factual field has no verbatim quote. Default
   * `false`. When `true` a `AI_PROPOSAL_FACT_UNSOURCED` *warning* is recorded and
   * the proposal is admitted for human review — never for automatic use.
   */
  readonly allowUnsourcedFacts?: boolean;
}

export interface AiProposalValidationReport {
  readonly result: ValidationResult<AiBriefProposal>;
  /**
   * `true` when the proposal may be shown to a reviewer. Never means "apply
   * automatically": every admitted proposal still requires human acceptance for
   * `assumed`/`unknown` fields, which are reported as warnings.
   */
  readonly admitted: boolean;
  readonly summary: {
    readonly errorCount: number;
    readonly warningCount: number;
    readonly codes: Readonly<Record<string, number>>;
    readonly fieldCount: number;
  };
}

/** Case-folds and collapses whitespace so quoting is not defeated by spacing. */
function normalizeForMatch(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}

function isProposalField(value: unknown): value is ProposalField {
  return typeof value === 'string' && (PROPOSAL_FIELDS as readonly string[]).includes(value);
}

function isEvidenceKind(value: unknown): value is ProposalEvidenceKind {
  return typeof value === 'string' && (EVIDENCE_KINDS as readonly string[]).includes(value);
}

/** Validates one proposed value against its declared shape. */
function readProposedValue(bag: DiagnosticBag, raw: unknown, field: ProposalField, path: string): void {
  if (COLLECTION_FIELDS.has(field)) {
    if (!Array.isArray(raw)) {
      bag.error(CODES.AI_PROPOSAL_MALFORMED, `${path} must be an array of strings for field "${field}".`, { path });
      return;
    }
    for (const [index, item] of raw.entries()) {
      if (typeof item !== 'string' || item.trim().length === 0) {
        bag.error(CODES.AI_PROPOSAL_MALFORMED, `${path}[${index}] must be a non-empty string.`, {
          path: `${path}[${index}]`,
        });
      }
    }
    return;
  }

  if (typeof raw !== 'string' || raw.trim().length === 0) {
    bag.error(CODES.AI_PROPOSAL_MALFORMED, `${path} must be a non-empty string for field "${field}".`, { path });
  }
}

/**
 * Checks that every factual value is traceable to the user's own words.
 *
 * Returns `true` when the value is sourced. A multi-part value (array) is
 * sourced only when *every* element is.
 */
function isFactSourced(briefText: string, proposal: FieldProposal): boolean {
  const haystack = normalizeForMatch(briefText);
  if (!normalizeForMatch(proposal.quote ?? '') || !haystack.includes(normalizeForMatch(proposal.quote ?? ''))) {
    return false;
  }
  const values = typeof proposal.value === 'string' ? [proposal.value] : proposal.value;
  return values.length > 0 && values.every((value) => haystack.includes(normalizeForMatch(value)));
}

/**
 * Validates an untrusted AI proposal. Never throws for malformed input.
 *
 * Structural problems (wrong types, unknown fields, out-of-range confidence) are
 * errors. Epistemic problems (an assumption, an unresolved unknown) are
 * warnings, because they are legitimate as long as a human sees them.
 */
export function validateAiBriefProposal(
  input: unknown,
  options: ValidateProposalOptions,
): AiProposalValidationReport {
  const bag = new DiagnosticBag();
  const maxInferred = options.maxInferredConfidence ?? 0.9;

  const record = typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined;

  if (!record) {
    bag.error(CODES.AI_PROPOSAL_MALFORMED, `Proposal must be an object, received ${input === null ? 'null' : typeof input}.`, {
      path: '',
    });
    return report(bag, 0);
  }

  if (typeof options.briefText !== 'string') {
    bag.error(CODES.AI_PROPOSAL_MALFORMED, 'validateAiBriefProposal requires the original brief text.', {
      path: 'briefText',
      hint: 'Factual fields cannot be verified without the text they claim to quote.',
    });
    return report(bag, 0);
  }

  const fields = record['fields'];
  if (!Array.isArray(fields)) {
    bag.error(CODES.AI_PROPOSAL_MALFORMED, 'Proposal must contain a "fields" array.', { path: 'fields' });
    return report(bag, 0);
  }

  const seen = new Set<ProposalField>();

  for (const [index, entry] of fields.entries()) {
    const path = `fields[${index}]`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      bag.error(CODES.AI_PROPOSAL_MALFORMED, `${path} must be an object.`, { path });
      continue;
    }

    const proposal = entry as Record<string, unknown>;
    const field = proposal['field'];

    if (!isProposalField(field)) {
      bag.error(CODES.AI_PROPOSAL_MALFORMED, `${path}.field is not a proposable field.`, {
        path: `${path}.field`,
        hint: `Proposable fields: ${PROPOSAL_FIELDS.join(', ')}.`,
      });
      continue;
    }

    if (seen.has(field)) {
      bag.error(CODES.AI_PROPOSAL_MALFORMED, `${path}.field "${field}" is proposed more than once.`, {
        path: `${path}.field`,
        hint: 'A field may be proposed once; conflicting values must be surfaced as questions instead.',
      });
      continue;
    }
    seen.add(field);

    const evidence = proposal['evidence'];
    if (!isEvidenceKind(evidence)) {
      bag.error(CODES.AI_PROPOSAL_EVIDENCE_MISSING, `${path}.evidence must be one of ${EVIDENCE_KINDS.join(', ')}.`, {
        path: `${path}.evidence`,
        hint: 'Every proposed value must declare how it was established.',
      });
      continue;
    }

    const confidence = proposal['confidence'];
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      bag.error(CODES.AI_PROPOSAL_MALFORMED, `${path}.confidence must be a finite number between 0 and 1.`, {
        path: `${path}.confidence`,
      });
      continue;
    }

    readProposedValue(bag, proposal['value'], field, `${path}.value`);

    const quote = proposal['quote'];
    if (quote !== undefined && typeof quote !== 'string') {
      bag.error(CODES.AI_PROPOSAL_MALFORMED, `${path}.quote must be a string when present.`, { path: `${path}.quote` });
    }

    // Confidence must match the strength of evidence claimed.
    if (evidence !== 'explicit' && confidence > maxInferred) {
      bag.error(
        CODES.AI_PROPOSAL_CONFIDENCE_EXCESSIVE,
        `${path}.confidence ${confidence} is above the ${maxInferred} ceiling for "${evidence}" evidence.`,
        {
          path: `${path}.confidence`,
          hint: 'Inference is not certainty; over-confidence is treated as a fabrication signal.',
        },
      );
    }

    const isFact = FACTUAL_FIELDS.has(field);
    if (isFact && (evidence === 'explicit' || evidence === 'derived')) {
      if (!isFactSourced(options.briefText, entry as unknown as FieldProposal)) {
        if (options.allowUnsourcedFacts === true) {
          bag.warning(
            CODES.AI_PROPOSAL_FACT_UNSOURCED,
            `${path} claims "${field}" is ${evidence} but it is not quoted from the brief; needs human verification.`,
            { path, hint: 'Send this to review; do not apply it automatically.' },
          );
        } else {
          bag.error(
            CODES.AI_PROPOSAL_FACT_UNSOURCED,
            `${path} claims "${field}" is ${evidence} but the value is not traceable to the user's text.`,
            {
              path: `${path}.value`,
              hint: 'Proposed facts must quote the brief. Supply a verbatim quote, or mark the field "assumed".',
            },
          );
        }
      }
    }

    if (evidence === 'assumed' || evidence === 'unknown') {
      bag.warning(
        CODES.AI_PROPOSAL_EVIDENCE_MISSING,
        `${path} supplies "${field}" as "${evidence}"; it is not established by the brief and requires review.`,
        { path: `${path}.evidence`, hint: 'Surfaced assumptions are acceptable; silent ones are not.' },
      );
    }
  }

  if (fields.length === 0) {
    bag.warning(CODES.AI_PROPOSAL_MALFORMED, 'Proposal contains no field values; nothing to review.', {
      path: 'fields',
    });
  }

  const value = forResult(record);
  return report(bag, fields.length, value);
}

/** Narrows the untrusted record to the proposal shape once it has been validated. */
function forResult(record: Record<string, unknown>): AiBriefProposal {
  return record as unknown as AiBriefProposal;
}

function report(
  bag: DiagnosticBag,
  fieldCount: number,
  value?: AiBriefProposal,
): AiProposalValidationReport {
  const result = toResult<AiBriefProposal>(bag, value);
  const codes: Record<string, number> = {};
  for (const diagnostic of [...result.errors, ...result.warnings]) {
    codes[diagnostic.code] = (codes[diagnostic.code] ?? 0) + 1;
  }
  return Object.freeze({
    result,
    admitted: result.ok,
    summary: Object.freeze({
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      codes: Object.freeze(codes),
      fieldCount,
    }),
  });
}
