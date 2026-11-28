/**
 * AI provider boundary: proposal validation and orchestration.
 *
 * What these tests prove — and, deliberately, what they do NOT prove:
 *
 *   proven:  an untrusted model answer cannot introduce an unsourced fact, an
 *            over-confident inference, a malformed value, or a duplicate field;
 *            every failure mode is a typed, non-throwing outcome.
 *   NOT proven: that any model integration exists. No provider is implemented in
 *            this repository, and these tests use hand-built fakes to exercise
 *            the seam. Passing them is not evidence of AI capability.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CODES } from '../src/core/diagnostics.ts';
import type { ValidationError, ValidationWarning } from '../src/core/diagnostics.ts';
import { validateAiBriefProposal } from '../src/ai/proposal.ts';
import type { AiProposalValidationReport } from '../src/ai/proposal.ts';
import { requestBriefProposal, AiProviderTimeoutError } from '../src/ai/request.ts';
import { NoAiProvider, isNoAiProviderError, PROPOSAL_FIELDS } from '../src/ai/types.ts';
import type { AiBriefProvider, AiBriefProposal, FieldProposal } from '../src/ai/types.ts';
import { parseDesignBrief } from '../src/brief/parse.ts';
import { hasCode } from './helpers.ts';

const BRIEF_TEXT = 'Create a poster for Bright Future Academy. Headline: Admission Open 2026. Register Now. Call 01712345678.';

/** Errors and warnings together, typed for `hasCode`. */
function diagnosticsOf(report: AiProposalValidationReport): readonly (ValidationError | ValidationWarning)[] {
  return [...report.result.errors, ...report.result.warnings];
}

function proposal(...fields: FieldProposal[]): AiBriefProposal {
  return { fields };
}

describe('AI proposal validation — accepted shapes', () => {
  it('admits a sourced factual proposal', () => {
    const report = validateAiBriefProposal(
      proposal({
        field: 'content.headline',
        value: 'Admission Open 2026',
        evidence: 'explicit',
        quote: 'Headline: Admission Open 2026',
        confidence: 1,
      }),
      { briefText: BRIEF_TEXT },
    );

    assert.equal(report.admitted, true, JSON.stringify(report.result.errors));
    assert.equal(report.summary.errorCount, 0);
    assert.equal(report.summary.fieldCount, 1);
  });

  it('admits a set of sourced values including arrays', () => {
    const report = validateAiBriefProposal(
      proposal(
        { field: 'content.headline', value: 'Admission Open 2026', evidence: 'explicit', quote: 'Admission Open 2026', confidence: 1 },
        { field: 'content.cta', value: 'Register Now', evidence: 'explicit', quote: 'Register Now', confidence: 1 },
        { field: 'audience', value: ['students'], evidence: 'assumed', confidence: 0.5 },
      ),
      { briefText: BRIEF_TEXT },
    );

    assert.equal(report.admitted, true, JSON.stringify(report.result.errors));
    // An assumption is admitted but must be visible.
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_EVIDENCE_MISSING), true);
    assert.equal(report.summary.warningCount, 1);
  });

  it('matches quotes across whitespace and case differences', () => {
    const report = validateAiBriefProposal(
      proposal({
        field: 'content.headline',
        value: 'admission open 2026',
        evidence: 'explicit',
        quote: 'HEADLINE:   admission open 2026',
        confidence: 1,
      }),
      { briefText: BRIEF_TEXT },
    );

    assert.equal(report.admitted, true, JSON.stringify(report.result.errors));
  });

  it('exposes a stable, non-empty list of proposable fields', () => {
    assert.ok(PROPOSAL_FIELDS.length > 0);
    assert.ok(PROPOSAL_FIELDS.includes('content.headline'));
    // A proposal can never target geometry, IDs or the scene graph.
    assert.equal((PROPOSAL_FIELDS as readonly string[]).includes('elements'), false);
    assert.equal((PROPOSAL_FIELDS as readonly string[]).includes('id'), false);
  });
});

describe('AI proposal validation — invented facts are rejected', () => {
  it('rejects a factual field that is not traceable to the brief', () => {
    const report = validateAiBriefProposal(
      proposal({
        field: 'content.details',
        // Neither the price nor the date appears in the brief.
        value: 'Admission fee 5000 taka. Deadline 15 January 2026.',
        evidence: 'explicit',
        quote: 'Headline: Admission Open 2026',
        confidence: 1,
      }),
      { briefText: BRIEF_TEXT },
    );

    assert.equal(report.admitted, false);
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_FACT_UNSOURCED), true);
  });

  it('rejects a factual field with no quote at all', () => {
    const report = validateAiBriefProposal(
      proposal({ field: 'content.headline', value: 'Admission Open 2026', evidence: 'explicit', confidence: 1 }),
      { briefText: BRIEF_TEXT },
    );

    assert.equal(report.admitted, false);
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_FACT_UNSOURCED), true);
  });

  it('rejects a quote that exists but does not contain the claimed value', () => {
    const report = validateAiBriefProposal(
      proposal({
        field: 'content.cta',
        value: 'Apply Today',
        evidence: 'explicit',
        quote: 'Register Now',
        confidence: 1,
      }),
      { briefText: BRIEF_TEXT },
    );

    assert.equal(report.admitted, false);
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_FACT_UNSOURCED), true);
  });

  it('rejects an array where one element is invented', () => {
    const report = validateAiBriefProposal(
      proposal({
        field: 'content.body',
        value: ['Scholarships available', 'Limited seats'],
        evidence: 'explicit',
        quote: 'Scholarships available',
        confidence: 1,
      }),
      { briefText: 'Create a flyer. Scholarships available.' },
    );

    assert.equal(report.admitted, false);
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_FACT_UNSOURCED), true);
  });

  it('only warns about an unsourced fact when the caller explicitly opts in', () => {
    const report = validateAiBriefProposal(
      proposal({ field: 'content.headline', value: 'Invented Headline', evidence: 'explicit', confidence: 1 }),
      { briefText: BRIEF_TEXT, allowUnsourcedFacts: true },
    );

    assert.equal(report.admitted, true);
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_FACT_UNSOURCED), true);
  });

  it('admits a creative (non-factual) field without requiring a quote', () => {
    const report = validateAiBriefProposal(
      proposal({ field: 'visualDirection.mood', value: ['energetic'], evidence: 'derived', confidence: 0.7 }),
      { briefText: BRIEF_TEXT },
    );

    assert.equal(report.admitted, true, JSON.stringify(report.result.errors));
  });
});

describe('AI proposal validation — malformed and over-confident input', () => {
  it('rejects a non-object proposal without throwing', () => {
    for (const bad of [null, undefined, 42, 'text', [], true]) {
      const report = validateAiBriefProposal(bad, { briefText: BRIEF_TEXT });
      assert.equal(report.admitted, false);
      assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_MALFORMED), true);
    }
  });

  it('rejects a proposal without a fields array', () => {
    const report = validateAiBriefProposal({ values: [] }, { briefText: BRIEF_TEXT });
    assert.equal(report.admitted, false);
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_MALFORMED), true);
  });

  it('requires the original brief text, because facts cannot be checked without it', () => {
    const report = validateAiBriefProposal(proposal(), { briefText: undefined as unknown as string });
    assert.equal(report.admitted, false);
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_MALFORMED), true);
  });

  it('rejects an unknown or structural field such as elements', () => {
    const report = validateAiBriefProposal(
      { fields: [{ field: 'elements', value: 'x', evidence: 'explicit', confidence: 1 }] },
      { briefText: BRIEF_TEXT },
    );

    assert.equal(report.admitted, false);
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_MALFORMED), true);
  });

  it('rejects a missing or unknown evidence kind', () => {
    for (const evidence of [undefined, 'certain', 5]) {
      const report = validateAiBriefProposal(
        { fields: [{ field: 'content.headline', value: 'Admission Open 2026', evidence, confidence: 1 }] },
        { briefText: BRIEF_TEXT },
      );
      assert.equal(report.admitted, false);
      assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_EVIDENCE_MISSING), true);
    }
  });

  it('rejects confidence outside 0..1 or non-finite', () => {
    for (const confidence of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY, '1']) {
      const report = validateAiBriefProposal(
        { fields: [{ field: 'content.headline', value: 'Admission Open 2026', evidence: 'explicit', confidence, quote: 'Admission Open 2026' }] },
        { briefText: BRIEF_TEXT },
      );
      assert.equal(report.admitted, false);
      assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_MALFORMED), true);
    }
  });

  it('rejects over-confidence on inferred evidence', () => {
    const report = validateAiBriefProposal(
      proposal({ field: 'objective', value: 'Sell tickets', evidence: 'assumed', confidence: 0.99 }),
      { briefText: BRIEF_TEXT },
    );

    assert.equal(report.admitted, false);
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_CONFIDENCE_EXCESSIVE), true);
  });

  it('respects a caller-supplied confidence ceiling', () => {
    const report = validateAiBriefProposal(
      proposal({ field: 'objective', value: 'Sell tickets', evidence: 'derived', confidence: 0.6 }),
      { briefText: BRIEF_TEXT, maxInferredConfidence: 0.5 },
    );

    assert.equal(report.admitted, false);
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_CONFIDENCE_EXCESSIVE), true);
  });

  it('rejects a duplicated field', () => {
    const report = validateAiBriefProposal(
      proposal(
        { field: 'content.headline', value: 'Admission Open 2026', evidence: 'explicit', quote: 'Admission Open 2026', confidence: 1 },
        { field: 'content.headline', value: 'Other', evidence: 'explicit', quote: 'Other', confidence: 1 },
      ),
      { briefText: BRIEF_TEXT },
    );

    assert.equal(report.admitted, false);
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_MALFORMED), true);
  });

  it('rejects a scalar where a collection field is required, and vice versa', () => {
    const scalarForArray = validateAiBriefProposal(
      proposal({ field: 'content.body', value: 'not an array', evidence: 'explicit', quote: 'not an array', confidence: 1 }),
      { briefText: BRIEF_TEXT },
    );
    assert.equal(scalarForArray.admitted, false);

    const arrayForScalar = validateAiBriefProposal(
      proposal({ field: 'content.headline', value: ['a', 'b'], evidence: 'explicit', quote: 'a', confidence: 1 }),
      { briefText: BRIEF_TEXT },
    );
    assert.equal(arrayForScalar.admitted, false);
  });

  it('rejects empty strings and empty array elements', () => {
    const emptyString = validateAiBriefProposal(
      proposal({ field: 'content.headline', value: '   ', evidence: 'explicit', quote: 'x', confidence: 1 }),
      { briefText: BRIEF_TEXT },
    );
    assert.equal(emptyString.admitted, false);

    const emptyElement = validateAiBriefProposal(
      proposal({ field: 'content.details', value: ['valid', ''], evidence: 'explicit', quote: 'valid', confidence: 1 }),
      { briefText: BRIEF_TEXT },
    );
    assert.equal(emptyElement.admitted, false);
  });

  it('rejects a non-object field entry', () => {
    const report = validateAiBriefProposal({ fields: ['nope', null] }, { briefText: BRIEF_TEXT });
    assert.equal(report.admitted, false);
    assert.equal(hasCode(diagnosticsOf(report), CODES.AI_PROPOSAL_MALFORMED), true);
  });

  it('warns rather than errors on an empty field list', () => {
    const report = validateAiBriefProposal(proposal(), { briefText: BRIEF_TEXT });
    assert.equal(report.admitted, true);
    assert.equal(report.summary.fieldCount, 0);
    assert.equal(report.summary.warningCount, 1);
  });
});

describe('AI provider orchestration', () => {
  it('reports a missing provider as unavailable, not as success', async () => {
    const deterministic = parseDesignBrief(BRIEF_TEXT).brief;
    const outcome = await requestBriefProposal({ provider: undefined, text: BRIEF_TEXT, deterministicBrief: deterministic });

    assert.equal(outcome.status, 'unavailable');
    assert.equal(outcome.diagnostics.length, 1);
    assert.equal(outcome.diagnostics[0]?.code, CODES.AI_PROVIDER_MISSING);
  });

  it('treats the shipped no-op provider as unavailable and never calls it', async () => {
    const provider = new NoAiProvider();
    assert.equal(provider.available, false);

    const deterministic = parseDesignBrief(BRIEF_TEXT).brief;
    const outcome = await requestBriefProposal({ provider, text: BRIEF_TEXT, deterministicBrief: deterministic });

    assert.equal(outcome.status, 'unavailable');
  });

  it('rejects a provider that reports itself unavailable', async () => {
    const unavailable: AiBriefProvider = {
      id: 'pretend',
      available: false,
      proposeBrief: () => {
        throw new Error('should never be called');
      },
    };
    const deterministic = parseDesignBrief(BRIEF_TEXT).brief;
    const outcome = await requestBriefProposal({ provider: unavailable, text: BRIEF_TEXT, deterministicBrief: deterministic });

    assert.equal(outcome.status, 'unavailable');
  });

  it('converts a throwing provider into a typed failure rather than propagating', async () => {
    const broken: AiBriefProvider = {
      id: 'broken',
      available: true,
      proposeBrief: () => Promise.reject(new Error('connection reset')),
    };
    const deterministic = parseDesignBrief(BRIEF_TEXT).brief;
    const outcome = await requestBriefProposal({ provider: broken, text: BRIEF_TEXT, deterministicBrief: deterministic });

    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.diagnostics[0]?.code, CODES.AI_PROVIDER_FAULT);
    assert.match(outcome.diagnostics[0]?.message ?? '', /connection reset/);
  });

  it('times out a hung provider', async () => {
    const hung: AiBriefProvider = {
      id: 'hung',
      available: true,
      proposeBrief: () => new Promise<AiBriefProposal>(() => {}),
    };
    const deterministic = parseDesignBrief(BRIEF_TEXT).brief;
    const outcome = await requestBriefProposal({
      provider: hung,
      text: BRIEF_TEXT,
      deterministicBrief: deterministic,
      timeoutMs: 25,
    });

    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.diagnostics[0]?.code, CODES.AI_PROVIDER_FAULT);
    assert.match(outcome.diagnostics[0]?.message ?? '', /did not respond/);
    assert.equal(new AiProviderTimeoutError(25).code, 'AI_PROVIDER_FAULT');
  });

  it('returns a validated proposal from a well-behaved provider', async () => {
    const good: AiBriefProvider = {
      id: 'fake',
      available: true,
      proposeBrief: () =>
        Promise.resolve(
          proposal({
            field: 'content.headline',
            value: 'Admission Open 2026',
            evidence: 'explicit',
            quote: 'Admission Open 2026',
            confidence: 1,
          }),
        ),
    };
    const deterministic = parseDesignBrief(BRIEF_TEXT).brief;
    const outcome = await requestBriefProposal({ provider: good, text: BRIEF_TEXT, deterministicBrief: deterministic });

    assert.equal(outcome.status, 'proposed');
    if (outcome.status === 'proposed') {
      assert.equal(outcome.proposal.fields.length, 1);
      assert.equal(outcome.report.admitted, true);
    }
  });

  it('rejects a provider answer that invents a fact', async () => {
    const liar: AiBriefProvider = {
      id: 'liar',
      available: true,
      proposeBrief: () =>
        Promise.resolve(proposal({ field: 'content.details', value: 'Fee 5000 taka', evidence: 'explicit', confidence: 1 })),
    };
    const deterministic = parseDesignBrief(BRIEF_TEXT).brief;
    const outcome = await requestBriefProposal({ provider: liar, text: BRIEF_TEXT, deterministicBrief: deterministic });

    assert.equal(outcome.status, 'rejected');
    if (outcome.status === 'rejected') {
      assert.equal(outcome.report.admitted, false);
      assert.equal(hasCode(diagnosticsOf(outcome.report), CODES.AI_PROPOSAL_FACT_UNSOURCED), true);
    }
  });

  it('never mutates the deterministic brief it was given', async () => {
    const deterministic = parseDesignBrief(BRIEF_TEXT).brief;
    const snapshot = JSON.stringify(deterministic);

    const liar: AiBriefProvider = {
      id: 'liar',
      available: true,
      proposeBrief: () =>
        Promise.resolve(proposal({ field: 'content.headline', value: 'Replaced', evidence: 'explicit', confidence: 1 })),
    };
    await requestBriefProposal({ provider: liar, text: BRIEF_TEXT, deterministicBrief: deterministic });

    assert.equal(JSON.stringify(deterministic), snapshot);
  });

  it('distinguishes the no-op provider error from a generic failure', async () => {
    const provider = new NoAiProvider();
    await assert.rejects(provider.proposeBrief({ text: BRIEF_TEXT, deterministicBrief: parseDesignBrief(BRIEF_TEXT).brief }), (error: unknown) => {
      if (!isNoAiProviderError(error)) return false;
      assert.equal(error.code, 'AI_PROVIDER_MISSING');
      return true;
    });
  });
});
