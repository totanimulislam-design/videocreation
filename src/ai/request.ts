/**
 * Orchestration for the AI provider boundary.
 *
 * Turns "call an optional provider with a timeout, then gate its output" into
 * one function with predictable outcomes, so no call site forgets validation.
 *
 * Outcome matrix (all are ordinary results, never exceptions):
 *   - no provider / unavailable      → `unavailable`  (Error: AI_PROVIDER_MISSING)
 *   - provider throws or times out   → `failed`       (Error: AI_PROVIDER_FAULT)
 *   - proposal fails validation      → `rejected`     (Error: AI_PROPOSAL_REJECTED)
 *   - proposal passes validation     → `proposed`     (warnings may accompany it)
 *
 * In every case the deterministic parse remains valid and usable. AI enrichment
 * is additive: losing it degrades quality, never correctness.
 */

import { CODES, DiagnosticBag, type Diagnostic } from '../core/diagnostics.ts';
import type { DesignBrief } from '../schema/types.ts';
import { validateAiBriefProposal, type AiProposalValidationReport } from './proposal.ts';
import {
  isNoAiProviderError,
  type AiBriefProposal,
  type AiBriefProvider,
  type AiBriefRequest,
} from './types.ts';

export type AiProposalOutcome =
  | { readonly status: 'proposed'; readonly proposal: AiBriefProposal; readonly report: AiProposalValidationReport }
  | { readonly status: 'rejected'; readonly report: AiProposalValidationReport }
  | { readonly status: 'failed'; readonly report: undefined; readonly diagnostics: readonly Diagnostic[] }
  | { readonly status: 'unavailable'; readonly report: undefined; readonly diagnostics: readonly Diagnostic[] };

export interface RequestProposalOptions {
  readonly provider: AiBriefProvider | undefined;
  readonly text: string;
  readonly deterministicBrief: DesignBrief;
  readonly languages?: readonly string[];
  readonly timeoutMs?: number;
  /** Forwarded to `validateAiBriefProposal`. */
  readonly allowUnsourcedFacts?: boolean;
  readonly maxInferredConfidence?: number;
  readonly signal?: AbortSignal;
}

/** Default timeout: models are slow, but a hung request must not hang the pipeline. */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 20_000;

export class AiProviderTimeoutError extends Error {
  readonly code = 'AI_PROVIDER_FAULT' as const;
  constructor(ms: number) {
    super(`AI provider did not respond within ${ms}ms.`);
    this.name = 'AiProviderTimeoutError';
  }
}

/**
 * Calls a provider and validates its proposal.
 *
 * Never throws. A missing provider is reported as `unavailable` rather than
 * silently skipped, so callers cannot mistake "no model" for "model agreed".
 */
export async function requestBriefProposal(options: RequestProposalOptions): Promise<AiProposalOutcome> {
  const provider = options.provider;

  if (!provider || !provider.available) {
    const bag = new DiagnosticBag();
    bag.error(CODES.AI_PROVIDER_MISSING, provider
      ? `AI provider "${provider.id}" reports itself unavailable.`
      : 'No AI provider was supplied; only deterministic parsing is available.', {
      path: 'provider',
      hint: 'This is expected: AI interpretation is not implemented in this repository.',
    });
    return Object.freeze({ status: 'unavailable', report: undefined, diagnostics: Object.freeze(bag.all) });
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const request: AiBriefRequest = Object.freeze({
    text: options.text,
    deterministicBrief: options.deterministicBrief,
    ...(options.languages === undefined ? {} : { languages: options.languages }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  let raw: unknown;
  try {
    raw = await withTimeout(provider.proposeBrief(request, { timeoutMs }), timeoutMs);
  } catch (error) {
    const bag = new DiagnosticBag();
    const detail = isNoAiProviderError(error)
      ? 'the configured provider is the no-op provider'
      : error instanceof Error
        ? error.message
        : 'the provider threw a non-Error value';
    bag.error(CODES.AI_PROVIDER_FAULT, `AI provider "${provider.id}" failed: ${detail}.`, {
      path: 'provider',
      hint: 'Continue with the deterministic parse; do not retry unboundedly.',
    });
    return Object.freeze({ status: 'failed', report: undefined, diagnostics: Object.freeze(bag.all) });
  }

  const validation = validateAiBriefProposal(raw, {
    briefText: options.text,
    ...(options.allowUnsourcedFacts === undefined ? {} : { allowUnsourcedFacts: options.allowUnsourcedFacts }),
    ...(options.maxInferredConfidence === undefined ? {} : { maxInferredConfidence: options.maxInferredConfidence }),
  });

  if (!validation.admitted || !validation.result.value) {
    return Object.freeze({ status: 'rejected', report: validation });
  }

  return Object.freeze({ status: 'proposed', proposal: validation.result.value, report: validation });
}

/** Races a promise against a timeout, clearing the timer so Node can exit. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AiProviderTimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
