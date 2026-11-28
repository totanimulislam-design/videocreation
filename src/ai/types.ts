/**
 * AI provider boundary — types only, no provider implementation.
 *
 * WHY THIS FILE EXISTS
 * The deterministic brief parser (`src/brief/`) is deliberately not a language
 * model and must never pretend to be one. Richer interpretation (free-form
 * prose, ambiguous intent, rarer scripts) is a *future* capability that belongs
 * to a model, not to the parser. Rather than entangle that future work with the
 * deterministic path — or quietly add network calls to the parser — the seam is
 * declared here as an interface that nothing in this repository implements.
 *
 * HONESTY CONTRACT (this is the whole point of the boundary):
 *   1. A provider may only *propose*. It never mutates a `DesignBrief` directly,
 *      never produces a `DesignDocument`, and never emits code or markup.
 *   2. Every proposed value is data that must pass `validateAiBriefProposal`
 *      before a caller may use it, exactly as plan validation gates a renderer.
 *   3. Proposals carry per-field provenance. A proposed *fact* must quote text
 *      that actually appears in the user's brief; the validator rejects
 *      unsourced facts. A model therefore cannot invent a date, price, name or
 *      contact detail and have it accepted.
 *   4. The provider is treated as untrusted and fallible: it can be missing,
 *      throw, time out, or return malformed output, and all four are ordinary
 *      outcomes the caller must handle.
 *
 * No network client, API key handling, prompt text or vendor SDK exists in this
 * module. `NoAiProvider` is the default and refuses to answer, so the repository
 * behaviour remains exactly deterministic.
 */

import type { DesignBrief } from '../schema/types.ts';

/**
 * Proposal provenance, reusing the deterministic parser's vocabulary so both
 * paths produce comparable evidence (`src/brief/types.ts` `EvidenceKind`).
 *
 * `explicit` and `derived` are *its* only claimable facts here; anything the
 * model adds from prior knowledge is `assumed` or `unknown` and must be
 * surfaced to a human, never silently applied.
 */
export type ProposalEvidenceKind = 'explicit' | 'derived' | 'assumed' | 'unknown';

/** Fields a provider may propose. A narrow, additive subset of `DesignBrief`. */
export type ProposalField =
  | 'category'
  | 'objective'
  | 'audience'
  | 'brand.name'
  | 'brand.identity'
  | 'content.headline'
  | 'content.subheadline'
  | 'content.body'
  | 'content.details'
  | 'content.cta'
  | 'visualDirection.mood'
  | 'visualDirection.style'
  | 'visualDirection.imageDirection';

export const PROPOSAL_FIELDS: readonly ProposalField[] = Object.freeze([
  'category',
  'objective',
  'audience',
  'brand.name',
  'brand.identity',
  'content.headline',
  'content.subheadline',
  'content.body',
  'content.details',
  'content.cta',
  'visualDirection.mood',
  'visualDirection.style',
  'visualDirection.imageDirection',
]);

/** One proposed field value with its provenance. */
export interface FieldProposal {
  readonly field: ProposalField;
  /** Proposed value. Arrays for collection fields, strings otherwise. */
  readonly value: string | readonly string[];
  readonly evidence: ProposalEvidenceKind;
  /**
   * The user's own words that justify this value, when `evidence` is
   * `explicit` or `derived`. The validator requires this to be a verbatim
   * substring of the original brief for factual fields.
   */
  readonly quote?: string;
  /** 0–1. Values above the configured ceiling are rejected, not clamped. */
  readonly confidence: number;
  /** Human-readable rationale, for review. Never used to justify a fact. */
  readonly rationale?: string;
}

/**
 * A model's complete answer. Deliberately NOT a `DesignBrief`: it is a set of
 * candidate field values plus the model's own open questions, which a caller
 * must reconcile against the deterministic parse.
 */
export interface AiBriefProposal {
  readonly fields: readonly FieldProposal[];
  /** Ambiguities the model could not resolve. Informational only. */
  readonly openQuestions?: readonly string[];
}

/** Request handed to a provider. Contains no credentials. */
export interface AiBriefRequest {
  /** The original user text, unmodified. Providers must not rewrite it. */
  readonly text: string;
  /** The deterministic parse, so the model can refine rather than restart. */
  readonly deterministicBrief: DesignBrief;
  /** Scripts/languages already detected, as a hint. */
  readonly languages?: readonly string[];
  /** Cooperative cancellation. */
  readonly signal?: AbortSignal;
}

/** Context about the call, for timeouts and logging. No secrets. */
export interface AiProviderCallOptions {
  readonly timeoutMs?: number;
}

/**
 * The single seam a future model integration implements.
 *
 * Implementations must be prepared to be called with untrusted text and must
 * not be trusted in return. `proposeBrief` resolving is not acceptance.
 */
export interface AiBriefProvider {
  /** Stable provider identifier, e.g. `noop` or a vendor name. */
  readonly id: string;
  /** `true` when this provider performs real inference. `false` for the no-op. */
  readonly available: boolean;
  proposeBrief(request: AiBriefRequest, options?: AiProviderCallOptions): Promise<AiBriefProposal>;
}

/**
 * Default provider: refuses every request.
 *
 * This is the shipped behaviour. It exists so call sites can depend on the
 * interface today without any claim that AI interpretation is available, and so
 * "no provider configured" is a typed, testable outcome instead of a crash.
 */
export class NoAiProvider implements AiBriefProvider {
  readonly id = 'none';
  readonly available = false;

  proposeBrief(_request: AiBriefRequest, _options?: AiProviderCallOptions): Promise<AiBriefProposal> {
    return Promise.reject(new NoAiProviderError());
  }
}

/** Raised by `NoAiProvider`. Callers detect it with `instanceof` or `isNoAiProviderError`. */
export class NoAiProviderError extends Error {
  readonly code = 'AI_PROVIDER_MISSING' as const;

  constructor(message = 'No AI provider is configured; deterministic parsing is the only available path.') {
    super(message);
    this.name = 'NoAiProviderError';
  }
}

export function isNoAiProviderError(value: unknown): value is NoAiProviderError {
  return value instanceof NoAiProviderError;
}
