/**
 * Pattern selection guidance.
 *
 * Two things are checked here:
 *   1. Behaviour — advisory assessment, derived characteristics, honest gaps.
 *   2. Fidelity — the transcribed §2.2 and §16.2 rules still match
 *      `DESIGN_PATTERNS_LIBRARY.md`. Like the pattern-catalogue drift test, this
 *      fails if the document changes and the code is not updated, so the
 *      machine-readable guidance cannot quietly become wrong.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  SELECTION_ROUTING,
  SELECTION_REQUIREMENTS,
  PATTERN_DECISION_CONTRACT,
  COMBINATION_RESTRICTIONS,
  SELECTION_CHECKLIST,
  assessPatternSelection,
  derivePatternCharacteristics,
} from '../src/knowledge/selection-guidance.ts';
import { RECOMMENDED_COMBINATIONS, ALL_PATTERN_IDS } from '../src/knowledge/patterns.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const LIBRARY = readFileSync(join(REPO_ROOT, 'DESIGN_PATTERNS_LIBRARY.md'), 'utf8');

/** Extracts a `# n. Title` section body up to the next top-level heading. */
function section(number: number): string {
  const pattern = new RegExp(`\\n# ${number}\\. [^\\n]*\\n([\\s\\S]*?)(?=\\n# |$)`);
  const match = pattern.exec(LIBRARY);
  assert.ok(match, `could not find section ${number} in the patterns library`);
  return match[1] ?? '';
}

describe('pattern selection guidance — fidelity with the library', () => {
  it('transcribes every §2.2 routing row exactly', () => {
    const rows = section(2)
      .split('\n')
      .filter((line) => line.trim().startsWith('|') && !/^\|[\s\-|]+\|$/.test(line.trim()))
      .filter((line) => !/Design requirement/i.test(line))
      .map((line) => line.split('|').map((cell) => cell.trim()).filter(Boolean))
      .filter((cells) => cells.length >= 2);

    assert.equal(rows.length, SELECTION_ROUTING.length, '§2.2 row count changed; update SELECTION_ROUTING');

    for (const [index, row] of rows.entries()) {
      const expected = SELECTION_ROUTING[index];
      assert.ok(expected);
      assert.equal(row[0], expected.requirement);
      assert.equal(row[1], expected.recommendedDirection);
      assert.equal(expected.section, '§2.2');
    }
  });

  it('transcribes every §16.2 restriction', () => {
    const bullets = section(16)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .slice(0, COMBINATION_RESTRICTIONS.length);

    assert.equal(bullets.length, COMBINATION_RESTRICTIONS.length);
    for (const [index, bullet] of bullets.entries()) {
      assert.equal(bullet.slice(2), COMBINATION_RESTRICTIONS[index]?.statement);
    }
  });

  it('records the five §1.1 decision-contract items', () => {
    assert.equal(PATTERN_DECISION_CONTRACT.length, 5);
    const text = PATTERN_DECISION_CONTRACT.map((item) => item.statement).join(' ');
    for (const term of ['meaning', 'appropriate use', 'implementation', 'common mistakes', 'validation']) {
      assert.match(text, new RegExp(term, 'i'));
    }
  });

  it('records the §24 checklist items that the document actually lists', () => {
    const documented = section(24)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- [ ]'));

    assert.equal(SELECTION_CHECKLIST.length, documented.length, '§24 checklist changed; update SELECTION_CHECKLIST');
    for (const [index, line] of documented.entries()) {
      assert.equal(line.replace('- [ ]', '').trim(), SELECTION_CHECKLIST[index]);
    }
  });

  it('keeps §2.3 requirements non-empty and section-tagged', () => {
    assert.ok(SELECTION_REQUIREMENTS.length >= 6);
    for (const rule of SELECTION_REQUIREMENTS) {
      assert.equal(rule.section, '§2.3');
      assert.ok(rule.statement.length > 0);
      assert.equal(rule.provenance, 'documented');
    }
  });

  it('does not let a routing rule point at a pattern family with no patterns', () => {
    const usedCategories = new Set(SELECTION_ROUTING.flatMap((entry) => entry.patternCategories));
    for (const category of usedCategories) {
      assert.ok(
        ALL_PATTERN_IDS.some((id) => id.startsWith('P')),
        `${category} routing exists but the catalogue is empty`,
      );
    }
  });
});

describe('pattern selection guidance — derived characteristics', () => {
  it('derives orientation from the pattern name vocabulary', () => {
    assert.equal(derivePatternCharacteristics('P47')?.orientationFit, 'landscape');
    assert.equal(derivePatternCharacteristics('P89')?.orientationFit, 'portrait');
    assert.equal(derivePatternCharacteristics('P92')?.orientationFit, 'square');
  });

  it('reports "any" when the name does not commit to an orientation', () => {
    const derived = derivePatternCharacteristics('P01');
    assert.equal(derived?.orientationFit, 'any');
  });

  it('flags multi-panel and multi-page patterns from their names', () => {
    assert.equal(derivePatternCharacteristics('P71')?.multiPageOrPanel, true);
    assert.equal(derivePatternCharacteristics('P94')?.multiPageOrPanel, true);
    assert.equal(derivePatternCharacteristics('P01')?.multiPageOrPanel, false);
  });

  it('marks derived data as derived, never documented', () => {
    assert.equal(derivePatternCharacteristics('P47')?.provenance, 'derived');
  });

  it('returns undefined for an unknown pattern rather than guessing', () => {
    assert.equal(derivePatternCharacteristics('P999'), undefined);
    assert.equal(derivePatternCharacteristics('nope'), undefined);
  });
});

describe('pattern selection guidance — advisory assessment', () => {
  it('returns no notes for a plain, sane single-pattern choice', () => {
    const assessment = assessPatternSelection({ primaryPattern: 'P01' });
    assert.deepEqual(assessment.notes, []);
    assert.equal(assessment.primaryPattern, 'P01');
  });

  it('flags more than two supporting patterns against §2.3', () => {
    const assessment = assessPatternSelection({ primaryPattern: 'P01', supportingPatterns: ['P06', 'P25', 'P31'] });
    assert.ok(assessment.notes.some((note) => note.includes('§2.3')));
  });

  it('flags an orientation disagreement between primary and supporting', () => {
    const assessment = assessPatternSelection({ primaryPattern: 'P47', supportingPatterns: ['P89'] });
    assert.ok(assessment.notes.some((note) => note.includes('orientation')));
  });

  it('selects routing rules that match the chosen pattern family', () => {
    const assessment = assessPatternSelection({ primaryPattern: 'P01', designCategory: 'poster' });
    assert.ok(assessment.routing.length > 0);
    for (const entry of assessment.routing) {
      assert.equal(entry.section, '§2.2');
    }
  });

  it('reports the §1.1 contract items the catalogue cannot supply', () => {
    const assessment = assessPatternSelection({ primaryPattern: 'P01' });
    assert.ok(assessment.unmetDecisionContractItems.length > 0);
    assert.ok(assessment.unmetDecisionContractItems.some((item) => item.includes('common mistakes')));
  });

  it('handles an unknown pattern without throwing or inventing guidance', () => {
    const assessment = assessPatternSelection({ primaryPattern: 'P999' });
    assert.equal(assessment.primaryCharacteristics, undefined);
    assert.equal(assessment.notes.length, 1);
    assert.match(assessment.notes[0] ?? '', /not in the catalogue/);
  });

  it('never errors — it is advisory only, so plan validation stays the single gate', () => {
    const assessment = assessPatternSelection({
      primaryPattern: 'P47',
      supportingPatterns: ['P89', 'P92', 'P01'],
    });
    assert.ok(Array.isArray(assessment.notes));
    // No verdict field exists anywhere on the assessment.
    assert.equal('admitted' in assessment, false);
    assert.equal('ok' in assessment, false);
  });

  it('covers every documented recommended combination with known patterns', () => {
    for (const combination of RECOMMENDED_COMBINATIONS) {
      assert.ok(derivePatternCharacteristics(combination.primary));
      assert.ok(derivePatternCharacteristics(combination.supporting));
    }
  });
});
