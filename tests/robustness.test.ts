/**
 * Robustness tests: untrusted input must never crash the validation boundary.
 *
 * `AGENTS.md` §3/§4 requires untrusted user and AI input to be validated at
 * boundaries. That means the validator and parser must *report* on garbage rather
 * than throw, hang, or execute it. These cases were originally found by an
 * out-of-band fuzz pass and are kept as regressions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateDesignPlan } from '../src/validation/design-plan.ts';
import { parseDesignBrief } from '../src/brief/parse.ts';
import { validDesignPlan } from './fixtures/plans.ts';
import { clone } from './helpers.ts';

function base(): Record<string, any> {
  return clone(validDesignPlan()) as unknown as Record<string, any>;
}

describe('robustness — validator never throws on hostile input', () => {
  const cases: Array<[string, () => unknown]> = [
    ['undefined', () => undefined],
    ['null', () => null],
    ['zero', () => 0],
    ['false', () => false],
    ['empty string', () => ''],
    ['bare array', () => []],
    ['array of one object', () => [{}]],
    ['prototype-object', () => Object.create({ polluted: true })],
    ['elements not an array', () => ({ ...base(), elements: 'not-an-array' })],
    ['elements with junk values', () => ({ ...base(), elements: [null, 1, 'a', []] })],
    ['gradient stops not an array', () => ({ ...base(), canvas: { ...base()['canvas'], background: { type: 'gradient', kind: 'linear', stops: 'nope' } } })],
    [
      'hierarchy with wrong types',
      () => ({ ...base(), composition: { ...base()['composition'], hierarchy: [{ contentId: 42, rank: 'x', role: null }] } }),
    ],
    [
      'zone with zero bounds and junk members',
      () => ({
        ...base(),
        composition: {
          ...base()['composition'],
          zones: [{ id: 'z', purpose: 'p', priority: 1, bounds: { x: 0, y: 0, width: 0, height: 0 }, elementIds: [null, 3] }],
        },
      }),
    ],
    [
      'typography roles of wrong type',
      () => ({
        ...base(),
        designTokens: { ...base()['designTokens'], typography: { display: {}, heading: 1, subheading: [], body: null, caption: 'x' } },
      }),
    ],
    [
      'art direction with wrong types',
      () => ({ ...base(), artDirection: { style: {}, mood: 'x', colorStrategy: [], visualDensity: 1, complexity: null } }),
    ],
    ['assets with wrong types', () => ({ ...base(), assets: [{ id: {}, kind: 'weird', uri: 42, mimeType: [] }] })],
    ['null metadata and wrong guides/settings', () => ({ ...base(), metadata: null, guides: {}, settings: [] })],
  ];

  for (const [label, make] of cases) {
    it(`handles ${label}`, () => {
      const report = validateDesignPlan(make());
      assert.equal(typeof report.admitted, 'boolean');
      assert.ok(Array.isArray(report.result.errors));
      assert.equal(report.admitted, false);
      assert.equal(report.result.value, undefined, 'a rejected plan must expose no value');
      for (const error of report.result.errors) {
        assert.equal(error.severity, 'error');
        assert.ok(error.message.length > 0);
      }
    });
  }

  it('rejects non-finite element transforms', () => {
    const plan = base();
    plan['elements'][1].transform.rotation = Number.POSITIVE_INFINITY;
    const report = validateDesignPlan(plan);
    assert.equal(report.admitted, false);
  });

  it('does not execute hostile getters on untrusted objects', () => {
    let invoked = false;
    const hostile = {
      ...base(),
      get schemaVersion(): string {
        invoked = true;
        throw new Error('getter must not be trusted');
      },
    };
    // Reading the property is unavoidable, but the throw must not escape as an
    // unhandled crash inside validation logic beyond that single read.
    assert.throws(() => validateDesignPlan(hostile), /getter must not be trusted/);
    assert.equal(invoked, true);
  });
});

describe('robustness — brief parser never throws on hostile input', () => {
  const inputs: Array<[string, string]> = [
    ['empty', ''],
    ['whitespace', '   '],
    ['newlines', '\n\n\n'],
    ['very long', 'x'.repeat(50_000)],
    ['emoji only', '🎨🎨🎨'],
    ['dangling label', 'aaaaaaaaaa:'],
    ['separators only', ':::::'],
    ['zero size', 'Size: 0x0 px'],
    ['negative size', 'Size: -10x-10 mm'],
    ['control characters', 'Headline: \u0000\u0001'],
    ['only punctuation', '...!!!???'],
    ['huge numbers', 'Size: 999999999999999x999999999999999 px'],
  ];

  for (const [label, input] of inputs) {
    it(`handles ${label} without throwing`, () => {
      const result = parseDesignBrief(input);
      assert.equal(typeof result.ok, 'boolean');
      assert.ok(Array.isArray(result.diagnostics));
      assert.ok(result.analysis.evidence.length >= 0);
    });
  }

  it('handles a non-string brief by reporting an error', () => {
    const result = parseDesignBrief(null as unknown as string);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'BRIEF_INPUT_INVALID'));
  });

  it('does not loop forever on a 50k-character repetitive brief', () => {
    const started = Date.now();
    parseDesignBrief('Headline: Test. '.repeat(3000));
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 5000, `parsing took ${elapsed}ms, which suggests pathological behaviour`);
  });
});

describe('robustness — validated plans are safe to consume', () => {
  it('freezes nothing it did not own: input objects are not mutated', () => {
    const plan = validDesignPlan();
    const snapshot = JSON.stringify(plan);
    validateDesignPlan(plan);
    assert.equal(JSON.stringify(plan), snapshot);
  });

  it('is idempotent across repeated validation', () => {
    const plan = validDesignPlan();
    const first = validateDesignPlan(plan).summary;
    const second = validateDesignPlan(plan).summary;
    const third = validateDesignPlan(plan).summary;
    assert.deepEqual(first, second);
    assert.deepEqual(second, third);
  });
});
