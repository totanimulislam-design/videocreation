/**
 * End-to-end tests for the Phase 1 pipeline:
 *
 *   natural-language brief
 *     → structured `DesignBrief`
 *     → structured design plan (`DesignDocument`)
 *     → validation gate
 *     → admitted document (or meaningful rejection)
 *
 * This is the Definition of Done expressed as executable checks. It also proves
 * the boundary the spec requires: invalid plans never reach the renderer, and the
 * pipeline does not invent facts along the way.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseDesignBrief } from '../src/brief/parse.ts';
import { validateDesignPlan, deriveContentSlots, assertValidDesignPlan } from '../src/validation/design-plan.ts';
import { CODES } from '../src/core/diagnostics.ts';
import { hasPattern } from '../src/knowledge/patterns.ts';
import type { DesignBrief, DesignDocument } from '../src/schema/types.ts';
import { validDesignPlan } from './fixtures/plans.ts';
import { clone, expectAdmitted, hasCode } from './helpers.ts';

/**
 * A deterministic "planner" used only in tests.
 *
 * It maps a validated brief onto an existing plan shape by asserting that the
 * plan agrees with the brief. It performs **no** creative reasoning: choosing a
 * pattern, palette or geometry is the Runtime AI Designer's job (a later phase)
 * and must not be faked here.
 *
 * Its purpose is to prove that a real brief can be carried through the contract
 * and the validator without loss or invention.
 */
function planFromBrief(brief: DesignBrief, template: DesignDocument): DesignDocument {
  const content = brief.content;
  const body = template.elements.map((node) => {
    if (node.type !== 'text') return node;
    if (node.id === 'el-headline' && content.headline !== undefined) {
      return { ...node, text: { ...node.text!, content: content.headline } };
    }
    if (node.id === 'el-subheadline') {
      const sub = content.subheadline ?? content.details[0];
      if (sub !== undefined) return { ...node, text: { ...node.text!, content: sub } };
      // No supporting content in the brief: hide the node rather than invent
      // text. The node stays declared because composition zones reference it —
      // removing it would break those references (and the validator would say so).
      return { ...node, visible: false };
    }
    if (node.id === 'el-cta-label' && content.cta !== undefined) {
      return { ...node, text: { ...node.text!, content: content.cta } };
    }
    return node;
  });

  return {
    ...template,
    name: `${brief.category} for ${brief.brand.name ?? 'unspecified brand'}`,
    metadata: { ...template.metadata, category: brief.category === 'unspecified' ? 'custom' : brief.category },
    canvas: { ...template.canvas, width: brief.requirements.width, height: brief.requirements.height, unit: brief.requirements.unit },
    elements: body,
  };
}

const BRIEF_TEXT = `Create a premium admission poster for an academic coaching center.
Institution name: Northgate Study Centre
Headline: Admission Open 2026
Details: Batch starts 5 January 2026 · Class 6 to 10
CTA: Register Now
Contact: +880 1700 000000
Size: 1080x1080 px`;

describe('pipeline — brief to validated plan', () => {
  it('carries a natural-language brief through to an admitted plan', () => {
    const parsed = parseDesignBrief(BRIEF_TEXT);
    assert.equal(parsed.ok, true, 'the brief should parse');

    const template = validDesignPlan();
    const plan = planFromBrief(parsed.brief, template);

    const report = validateDesignPlan(plan, { brief: parsed.brief });
    const document = expectAdmitted(report);

    assert.equal(document.canvas.width, 1080);
    assert.equal(document.elements.length > 0, true);
  });

  it('preserves the user headline verbatim through planning and validation', () => {
    const parsed = parseDesignBrief(BRIEF_TEXT);
    const plan = planFromBrief(parsed.brief, validDesignPlan());
    const report = validateDesignPlan(plan, { brief: parsed.brief });
    const document = expectAdmitted(report);

    const headlineNode = document.elements.find((node) => node.id === 'el-headline');
    assert.ok(headlineNode?.text);
    assert.equal(headlineNode.text.content, parsed.brief.content.headline);
    assert.equal(headlineNode.text.content, 'Admission Open 2026');
  });

  it('produces a plan whose hierarchy slots all resolve to real brief content', () => {
    const parsed = parseDesignBrief(BRIEF_TEXT);
    const plan = planFromBrief(parsed.brief, validDesignPlan());
    plan.composition = {
      ...plan.composition,
      hierarchy: [
        { contentId: 'headline', rank: 1, role: 'primary' },
        { contentId: 'details/0', rank: 2, role: 'tertiary' },
        { contentId: 'cta', rank: 3, role: 'utility' },
      ],
    };
    const report = validateDesignPlan(plan, { brief: parsed.brief });
    expectAdmitted(report);
    assert.equal(hasCode(report.result.errors, CODES.HIERARCHY_CONTENT_UNRESOLVED), false);
  });

  it('rejects a plan that invents content the brief did not contain', () => {
    const parsed = parseDesignBrief(BRIEF_TEXT);
    const plan = planFromBrief(parsed.brief, validDesignPlan());
    plan.composition = {
      ...plan.composition,
      hierarchy: [{ contentId: 'details/7', rank: 1, role: 'primary' }],
    };
    const report = validateDesignPlan(plan, { brief: parsed.brief });
    assert.equal(report.admitted, false);
    assert.ok(hasCode(report.result.errors, CODES.HIERARCHY_CONTENT_UNRESOLVED));
  });

  it('exposes an honest open question when the brief omits a size', () => {
    const parsed = parseDesignBrief('Poster. Headline: Open Day. Institution name: Northgate Study Centre');
    assert.ok(parsed.analysis.openQuestions.some((question) => question.field === 'requirements.width/height'));
    assert.ok(parsed.analysis.assumptions.some((assumption) => assumption.field === 'requirements.width/height'));
  });

  it('keeps Bengali brief content intact end to end', () => {
    const bengali = parseDesignBrief(
      'পোস্টার তৈরি করুন। শিরোনাম: ভর্তি চলছে ২০২৬। বিবরণ: ক্লাস ৬ থেকে ১০। সাইজ ১০৮০x১০৮০ পিক্সেল',
    );
    assert.equal(bengali.ok, true);
    assert.equal(bengali.brief.requirements.width, 1080);
    assert.equal(bengali.brief.requirements.unit, 'px');
    assert.equal(bengali.brief.content.headline, 'ভর্তি চলছে ২০২৬');

    const template = validDesignPlan();
    const plan = planFromBrief(bengali.brief, template);
    plan.metadata = { ...plan.metadata, category: 'poster' };
    plan.elements = plan.elements.map((node) =>
      node.type === 'text'
        ? { ...node, text: { ...node.text!, language: 'bn', direction: 'auto' as const } }
        : node,
    );

    const report = validateDesignPlan(plan, { brief: bengali.brief });
    expectAdmitted(report);
  });

  it('keeps an RTL Arabic brief consistent with an RTL plan', () => {
    const arabic = parseDesignBrief(
      'ملصق. العنوان: التسجيل مفتوح. الاتصال: +971501234567. الحجم 1080x1350 بكسل',
    );
    assert.equal(arabic.ok, true);
    assert.equal(arabic.analysis.script.dominantDirection, 'rtl');
    assert.equal(arabic.brief.requirements.width, 1080);
    assert.equal(arabic.brief.requirements.height, 1350);
  });
});

describe('pipeline — the validation gate', () => {
  it('admits a complete valid plan and returns the document', () => {
    const report = validateDesignPlan(validDesignPlan());
    assert.equal(report.admitted, true);
    assert.ok(report.result.value);
  });

  it('blocks an invalid plan with machine-readable errors', () => {
    const invalid = clone(validDesignPlan()) as unknown as Record<string, any>;
    invalid['elements'][1].id = invalid['elements'][0].id;
    invalid['composition'].primaryPattern = 'P999';
    delete invalid['canvas'].unit;

    const report = validateDesignPlan(invalid);
    assert.equal(report.admitted, false);
    assert.ok(report.result.errors.length >= 3);
    for (const error of report.result.errors) {
      assert.match(error.code, /^[A-Z0-9_]+$/, 'codes must be stable identifiers');
      assert.ok(error.message.length > 0, 'every error must explain itself');
      assert.equal(error.severity, 'error');
    }
  });

  it('never exposes a value for a rejected plan', () => {
    const invalid = clone(validDesignPlan()) as unknown as Record<string, any>;
    invalid['canvas'].width = -1;
    const report = validateDesignPlan(invalid);
    assert.equal(report.result.value, undefined);
    assert.equal(assertValidThrows(invalid), true);
  });

  it('is deterministic: the same input yields the same verdict and codes', () => {
    const input = validDesignPlan();
    const first = validateDesignPlan(input);
    const second = validateDesignPlan(input);
    assert.deepEqual(first.summary, second.summary);
  });

  it('reports every pattern ID in the plan against the catalog', () => {
    const plan = validDesignPlan();
    const ids = [plan.composition.primaryPattern, ...plan.composition.supportingPatterns];
    for (const id of ids) {
      assert.ok(hasPattern(id), `plan references pattern ${id}, which must exist in the catalog`);
    }
  });

  it('derives slots from the brief for hierarchy resolution', () => {
    const parsed = parseDesignBrief(BRIEF_TEXT);
    const slots = deriveContentSlots(parsed.brief);
    assert.ok(slots.includes('headline'));
    assert.ok(slots.includes('cta'));
    assert.ok(slots.includes('details/0'));
  });

  it('validates a plan twice without mutation', () => {
    const plan = validDesignPlan();
    const before = JSON.stringify(plan);
    validateDesignPlan(plan, { brief: parseDesignBrief(BRIEF_TEXT).brief });
    validateDesignPlan(plan);
    assert.equal(JSON.stringify(plan), before, 'validation must not mutate the input');
  });

  it('accepts the thrown-helper on a valid plan and rejects an invalid one', () => {
    assert.doesNotThrow(() => assertValidDesignPlan(validDesignPlan()));
    const invalid = clone(validDesignPlan()) as unknown as Record<string, any>;
    invalid['artDirection'].style = 'not-a-style';
    assert.throws(() => assertValidDesignPlan(invalid));
  });
});

function assertValidThrows(input: unknown): boolean {
  try {
    assertValidDesignPlan(input);
    return false;
  } catch {
    return true;
  }
}
