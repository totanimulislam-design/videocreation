#!/usr/bin/env node
/**
 * End-to-end example: the Definition of Done, runnable.
 *
 *   npm run example
 *
 * Demonstrates, against the real modules (no mocks):
 *   1. A sample brief normalized into a structured `DesignBrief`.
 *   2. A valid design plan passing runtime validation.
 *   3. An invalid design plan failing with meaningful, coded errors.
 *   4. The machine-readable pattern registry and its selection guidance.
 *   5. The AI boundary reporting that no provider is configured.
 *
 * Exit code is 0 only when every expectation below actually holds, so this file
 * doubles as a smoke test rather than a demo that always prints "OK".
 */

import { parseDesignBrief } from '../src/brief/parse.ts';
import { validateDesignPlan } from '../src/validation/design-plan.ts';
import { lookupPattern, patternsForCategory } from '../src/knowledge/patterns.ts';
import { assessPatternSelection } from '../src/knowledge/selection-guidance.ts';
import { requestBriefProposal } from '../src/ai/request.ts';
import { createCanvas, createDesignDocument, createDesignTokens, createGrid, createTypographyScale } from '../src/schema/factories.ts';
import { SCHEMA_VERSION } from '../src/schema/version.ts';
import { formatDiagnostic } from '../src/core/diagnostics.ts';
import type { DesignDocument } from '../src/schema/types.ts';

const failures: string[] = [];
function check(label: string, condition: boolean): void {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures.push(label);
}

const heading = (text: string): void => console.log(`\n${text}\n${'-'.repeat(text.length)}`);

// ---------------------------------------------------------------------------
// 1. Brief normalization
// ---------------------------------------------------------------------------
heading('1. Brief normalization (deterministic, no model)');

const SAMPLE_BRIEF = [
  'Create a square social media post for Bright Future Academy.',
  'Headline: Admission Open 2026',
  'Subheadline: Classes 6 to 12, English and Bengali medium',
  'Register Now',
  'Call 01712345678',
  'Size 1080 x 1080 px, bold and energetic mood.',
].join('\n');

const parsed = parseDesignBrief(SAMPLE_BRIEF);

console.log(`category:     ${parsed.brief.category}`);
console.log(`objective:    ${parsed.brief.objective || '(not stated)'}`);
console.log(`headline:     ${parsed.brief.content.headline ?? '(unknown)'}`);
console.log(`subheadline:  ${parsed.brief.content.subheadline ?? '(unknown)'}`);
console.log(`cta:          ${parsed.brief.content.cta ?? '(unknown)'}`);
console.log(`canvas:       ${parsed.brief.requirements.width} x ${parsed.brief.requirements.height} ${parsed.brief.requirements.unit}`);
console.log(`languages:    ${parsed.brief.requirements.languages.join(', ') || '(unknown)'}`);
console.log(`mood:         ${parsed.brief.visualDirection.mood.join(', ') || '(not stated)'}`);
console.log(`assumptions:  ${parsed.analysis.assumptions.length}`);
console.log(`open questions:`);
for (const question of parsed.analysis.openQuestions) {
  console.log(`  - [${question.blocking ? 'blocking' : 'non-blocking'}] ${question.field}: ${question.question}`);
}

check('sample brief parses without errors', parsed.ok);
check('headline is preserved verbatim', parsed.brief.content.headline === 'Admission Open 2026');
check('contact number is not invented but preserved when supplied', JSON.stringify(parsed.brief).includes('01712345678'));
check('dimensions come from the brief, not a default', parsed.brief.requirements.width === 1080);

// ---------------------------------------------------------------------------
// 2. A valid plan passes
// ---------------------------------------------------------------------------
heading('2. Valid design plan passes runtime validation');

/**
 * Minimal but complete document: every required section is present.
 *
 * The composition is authored, not generated: pattern choice, focal point and
 * hierarchy are creative decisions this repository does not make on the user's
 * behalf (no pattern-selection engine exists yet).
 */
function buildPlan(): DesignDocument {
  return createDesignDocument({
    id: 'example-admission-post',
    name: 'Admission Open 2026 social post',
    category: 'social_media',
    canvas: createCanvas({ width: 1080, height: 1080, unit: 'px' }),
    designTokens: createDesignTokens({
      colors: {
        primary: '#0d2b52',
        secondary: '#123f73',
        accent: '#c9a227',
        background: '#ffffff',
        surface: '#f7f5f0',
        text_primary: '#101010',
        text_secondary: '#4a4a4a',
        border: '#d8d4cc',
        decorative: '#e8e2d6',
      },
    }),
    artDirection: {
      style: 'modern-corporate',
      mood: parsed.brief.visualDirection.mood.length > 0 ? parsed.brief.visualDirection.mood : ['trustworthy'],
      colorStrategy: 'brand-driven',
      typographyStrategy: 'Clear size and weight hierarchy with one accent colour',
      imageStrategy: 'Typographic focus; no photography supplied',
      shapeLanguage: 'Rectilinear blocks with one circular accent',
      visualDensity: 'balanced',
      complexity: 'medium',
    },
    composition: {
      primaryPattern: 'P92',
      supportingPatterns: ['P19'],
      focalPoint: { x: 540, y: 480, strength: 0.85 },
      readingFlow: 'ltr',
      hierarchy: [
        { contentId: 'headline', rank: 1, role: 'primary' },
        { contentId: 'subheadline', rank: 2, role: 'secondary' },
        { contentId: 'cta', rank: 3, role: 'utility' },
      ],
      zones: [
        {
          id: 'zone-headline',
          purpose: 'headline',
          priority: 1,
          bounds: { x: 80, y: 160, width: 920, height: 300 },
          elementIds: [],
        },
      ],
      grid: createGrid({ columns: 12, gutter: 24, margin: { top: 80, right: 80, bottom: 80, left: 80 } }),
      constraints: { preserveContent: true, allowOverlap: false, allowedOverlapPairs: [] },
    },
    settings: { colorProfile: 'srgb', exportScale: 2 },
    now: '2026-01-05T09:30:00Z',
  });
}

const validPlan = buildPlan();
console.log(`schemaVersion: ${validPlan.schemaVersion}`);
console.log(`canvas:        ${validPlan.canvas.width} x ${validPlan.canvas.height} ${validPlan.canvas.unit}`);

const validReport = validateDesignPlan(validPlan, { brief: parsed.brief });
console.log(`admitted:      ${validReport.admitted}`);
console.log(`errors:        ${validReport.summary.errorCount}`);
console.log(`warnings:      ${validReport.summary.warningCount}`);
for (const warning of validReport.result.warnings.slice(0, 5)) {
  console.log(`  warning: ${formatDiagnostic(warning)}`);
}

check('a structurally valid plan is admitted', validReport.admitted);

// ---------------------------------------------------------------------------
// 3. Invalid plans fail with meaningful errors
// ---------------------------------------------------------------------------
heading('3. Invalid design plans are rejected with coded errors');

const invalidPlans: ReadonlyArray<readonly [string, unknown, string]> = [
  [
    'zero-width canvas',
    { ...buildPlan(), canvas: { ...buildPlan().canvas, width: 0 } },
    'CANVAS_DIMENSION_INVALID',
  ],
  [
    'negative canvas height',
    { ...buildPlan(), canvas: { ...buildPlan().canvas, height: -10 } },
    'CANVAS_DIMENSION_INVALID',
  ],
  [
    'unsupported schema version',
    { ...buildPlan(), schemaVersion: '0.0.1' },
    'SCHEMA_VERSION_UNSUPPORTED',
  ],
  [
    // A missing unit is REQUIRED: an absent explicit unit must never be read as px.
    'missing canvas unit',
    (() => {
      const plan = buildPlan() as unknown as Record<string, unknown>;
      const canvas = { ...(plan['canvas'] as Record<string, unknown>) };
      delete canvas['unit'];
      return { ...plan, canvas };
    })(),
    'REQUIRED',
  ],
  [
    'implausible canvas unit',
    { ...buildPlan(), canvas: { ...buildPlan().canvas, unit: 'pt' as never } },
    'UNIT_INVALID',
  ],
  [
    'missing required section',
    (() => {
      const plan = buildPlan() as unknown as Record<string, unknown>;
      delete plan['designTokens'];
      return plan;
    })(),
    'REQUIRED',
  ],
  [
    'unknown pattern ID',
    { ...buildPlan(), composition: { ...buildPlan().composition, primaryPattern: 'P999' } },
    'PATTERN_ID_INVALID',
  ],
  [
    'duplicate element IDs',
    (() => {
      const plan = buildPlan();
      const node = {
        id: 'dup',
        name: 'Panel',
        type: 'shape' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        geometry: { width: 100, height: 100, shape: 'rect' as const },
        visible: true,
        locked: false,
      };
      return { ...plan, elements: [node, { ...node, name: 'Panel copy' }] };
    })(),
    'ID_NOT_UNIQUE',
  ],
];

for (const [label, candidate, expectedCode] of invalidPlans) {
  const report = validateDesignPlan(candidate, { brief: parsed.brief });
  const codes = report.result.errors.map((error) => error.code);
  const first = report.result.errors[0];
  const rejectedForRightReason = !report.admitted && codes.includes(expectedCode);

  console.log(`${rejectedForRightReason ? 'REJECTED' : 'UNEXPECTED'}  ${label} (expects ${expectedCode})`);
  if (first) console.log(`    ${formatDiagnostic(first)}`);
  check(`invalid plan rejected for the expected reason: ${label}`, rejectedForRightReason);
}

// ---------------------------------------------------------------------------
// 4. Pattern registry and selection guidance
// ---------------------------------------------------------------------------
heading('4. Machine-readable pattern registry');

const pattern = lookupPattern('P01');
check('P01 resolves to a named, categorised record', pattern !== undefined && pattern.category === 'poster');
if (pattern) {
  console.log(`id:         ${pattern.id}`);
  console.log(`name:       ${pattern.name}`);
  console.log(`category:   ${pattern.category}`);
  console.log(`meaning:    ${pattern.meaning}`);
  console.log(`use cases:  ${pattern.useCases.join(' / ')}`);
}

const socialPatterns = patternsForCategory('social_media');
console.log(`patterns documented for social_media: ${socialPatterns.length}`);

const assessment = assessPatternSelection({ primaryPattern: 'P01', designCategory: 'social_media' });
console.log(`routing entries: ${assessment.routing.length}`);
console.log(`advisory notes:  ${assessment.notes.length === 0 ? '(none)' : assessment.notes.join(' | ')}`);
console.log(`unmet §1.1 items: ${assessment.unmetDecisionContractItems.join(', ') || '(none)'}`);

check('registry exposes category metadata for social media', socialPatterns.length > 0);
check('selection guidance is advisory and reports unmet contract items', assessment.unmetDecisionContractItems.length > 0);

// ---------------------------------------------------------------------------
// 5. AI boundary is honestly unavailable
// ---------------------------------------------------------------------------
heading('5. AI provider boundary');

const aiOutcome = await requestBriefProposal({
  provider: undefined, // No provider exists in this repository.
  text: SAMPLE_BRIEF,
  deterministicBrief: parsed.brief,
});

console.log(`status: ${aiOutcome.status}`);
for (const diagnostic of aiOutcome.diagnostics ?? []) {
  console.log(`  ${formatDiagnostic(diagnostic)}`);
}

check('AI boundary reports "unavailable" instead of pretending to work', aiOutcome.status === 'unavailable');
check('deterministic brief remains usable without any AI provider', parsed.ok === true);

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------
console.log(`\nschema version in use: ${SCHEMA_VERSION}`);
console.log(`typography scale probe: ${JSON.stringify(createTypographyScale().headline ?? {})}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} expectation(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nAll expectations held.');
}
