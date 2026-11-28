/**
 * Pattern metadata integration tests.
 *
 * Verifies that the code is connected to the *documents*, not to copies of them:
 *   - the generated pattern module matches DESIGN_PATTERNS_LIBRARY.md exactly
 *     (a drift test; regenerate with `npm run generate:knowledge`)
 *   - stable IDs are the ones the documents define
 *   - recommended combinations resolve to real pattern IDs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parsePatternLibrary, renderPatternModule } from '../tools/generate-knowledge.ts';
import {
  ALL_PATTERN_IDS,
  RECOMMENDED_COMBINATIONS,
  hasPattern,
  isPatternIdSyntax,
  isRecommendedCombination,
  lookupPattern,
  patternCategoryFitsDesignCategory,
  patternsForCategory,
  patternsInCategory,
} from '../src/knowledge/patterns.ts';
import {
  ART_DIRECTION_STYLE_IDS,
  COLOR_ROLE_IDS,
  COLOR_STRATEGY_IDS,
  DESIGN_CATEGORY_IDS,
  HIERARCHY_ROLES,
  PATTERN_CATEGORY_IDS,
  isArtDirectionStyleId,
  isColorStrategyId,
  isDesignCategoryId,
  isHierarchyRole,
} from '../src/knowledge/ids.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

describe('pattern catalogue — generated from the library', () => {
  it('contains exactly 100 patterns spanning P01–P100', () => {
    assert.equal(ALL_PATTERN_IDS.length, 100);
    for (let index = 1; index <= 100; index += 1) {
      const id = `P${String(index).padStart(2, '0')}`;
      assert.ok(hasPattern(id), `pattern ${id} should exist`);
    }
  });

  it('resolves pattern metadata with no invented fields', () => {
    const pattern = lookupPattern('P11');
    assert.ok(pattern);
    assert.equal(pattern.id, 'P11');
    assert.equal(pattern.name, 'Product Hero Layout');
    assert.equal(pattern.category, 'advertising');
    assert.ok(pattern.meaning.length > 0);
    assert.ok(pattern.implementation.length > 0);
    assert.ok(pattern.useCases.length > 0);
  });

  it('reports that per-entry failure guidance is absent rather than inventing it', () => {
    const pattern = lookupPattern('P01');
    assert.ok(pattern);
    assert.equal(pattern.completeness.hasFailureGuidance, false);
    assert.equal(pattern.completeness.hasMeaning, true);
  });

  it('rejects syntactically invalid and unknown IDs', () => {
    assert.equal(isPatternIdSyntax('P1'), false);
    assert.equal(isPatternIdSyntax('P101'), false);
    assert.equal(isPatternIdSyntax('X01'), false);
    assert.equal(isPatternIdSyntax('P01'), true);
    assert.equal(hasPattern('P999'), false);
  });

  it('exposes every pattern category used by the document', () => {
    for (const category of PATTERN_CATEGORY_IDS) {
      assert.ok(patternsInCategory(category).length > 0, `category ${category} should have patterns`);
    }
  });
});

describe('pattern catalogue — no drift from DESIGN_PATTERNS_LIBRARY.md', () => {
  it('generated module matches a fresh parse of the Markdown source', async () => {
    const markdown = await readFile(join(REPO_ROOT, 'DESIGN_PATTERNS_LIBRARY.md'), 'utf8');
    const generated = await readFile(join(REPO_ROOT, 'src/knowledge/generated/patterns.generated.ts'), 'utf8');
    const expected = renderPatternModule(parsePatternLibrary(markdown));
    assert.equal(
      generated,
      expected,
      'src/knowledge/generated/patterns.generated.ts is stale; run `npm run generate:knowledge`',
    );
  });

  it('parses pattern headings, meaning and implementation notes from the document', async () => {
    const markdown = await readFile(join(REPO_ROOT, 'DESIGN_PATTERNS_LIBRARY.md'), 'utf8');
    const entries = parsePatternLibrary(markdown);
    const central = entries.find((entry) => entry.id === 'P01');
    assert.ok(central);
    assert.equal(central.name, 'Central Hero Composition');
    assert.equal(central.category, 'poster');
    assert.match(central.meaning, /dominant central subject/i);
    assert.ok(central.implementation.length >= 3);
  });
});

describe('pattern catalogue — recommended combinations', () => {
  it('resolves every documented combination to real pattern IDs', () => {
    assert.ok(RECOMMENDED_COMBINATIONS.length > 0);
    for (const combination of RECOMMENDED_COMBINATIONS) {
      assert.ok(hasPattern(combination.primary), `unknown primary ${combination.primary}`);
      assert.ok(hasPattern(combination.supporting), `unknown supporting ${combination.supporting}`);
      assert.notEqual(combination.primary, combination.supporting);
      assert.equal(combination.documentedAs.length, 2);
    }
  });

  it('recognises a documented combination', () => {
    assert.equal(isRecommendedCombination('P01', 'P06'), true);
    assert.equal(isRecommendedCombination('P06', 'P01'), true, 'order should not matter');
  });

  it('does not claim an undocumented combination is recommended', () => {
    assert.equal(isRecommendedCombination('P19', 'P12'), false);
  });
});

describe('pattern catalogue — design category fit', () => {
  it('reports a fit for social patterns on social media', () => {
    assert.equal(patternCategoryFitsDesignCategory('P93', 'social_media'), 'fits');
  });

  it('reports a mismatch for identity patterns on posters', () => {
    assert.equal(patternCategoryFitsDesignCategory('P81', 'poster'), 'mismatch');
  });

  it('reports unknown rather than throwing for an unknown pattern', () => {
    assert.equal(patternCategoryFitsDesignCategory('P999', 'poster'), 'unknown-pattern');
  });

  it('lists patterns for a design category', () => {
    const forSocial = patternsForCategory('social_media');
    assert.ok(forSocial.length > 0);
    assert.ok(forSocial.every((pattern) => pattern.category === 'digital' || pattern.category === 'advertising' || pattern.category === 'typography' || pattern.category === 'image-led' || pattern.category === 'information' || pattern.category === 'geometric' || pattern.category === 'poster'));
  });
});

describe('stable identifier catalogues', () => {
  it('exposes the documented design categories', () => {
    assert.ok(isDesignCategoryId('poster'));
    assert.ok(isDesignCategoryId('business_card'));
    assert.ok(!isDesignCategoryId('billboard'));
    assert.ok(DESIGN_CATEGORY_IDS.includes('unspecified'), 'unknown category must be explicit, not guessed');
  });

  it('exposes the art-direction styles from DESIGN_SYSTEM.md §4', () => {
    assert.ok(isArtDirectionStyleId('swiss-international'));
    assert.ok(isArtDirectionStyleId('neo-brutalism'));
    assert.ok(isArtDirectionStyleId('contemporary-japanese-editorial'));
    assert.ok(!isArtDirectionStyleId('Custom Style'));
    assert.ok(ART_DIRECTION_STYLE_IDS.length >= 28);
  });

  it('exposes colour strategies from the engine spec §10.2', () => {
    assert.ok(isColorStrategyId('monochromatic'));
    assert.ok(isColorStrategyId('brand-driven'));
    assert.ok(isColorStrategyId('image-derived'));
    assert.ok(!isColorStrategyId('random'));
    assert.ok(COLOR_STRATEGY_IDS.includes('monochromatic'));
  });

  it('exposes the functional colour roles from DESIGN_SYSTEM.md §7.2', () => {
    const documented = new Set<string>(COLOR_ROLE_IDS);
    for (const role of ['primary', 'secondary', 'accent', 'background', 'surface', 'text_primary', 'text_secondary', 'border', 'decorative']) {
      assert.ok(documented.has(role), `${role} should be a documented colour role`);
    }
  });

  it('accepts only the contract hierarchy roles', () => {
    assert.ok(isHierarchyRole('primary'));
    assert.ok(isHierarchyRole('utility'));
    assert.ok(!isHierarchyRole('decorative'), 'the hierarchy contract has no decorative role');
    assert.deepEqual([...HIERARCHY_ROLES], ['primary', 'secondary', 'tertiary', 'utility']);
  });
});
