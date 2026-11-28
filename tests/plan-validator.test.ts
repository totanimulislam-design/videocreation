/**
 * Design plan validator tests.
 *
 * Covers the required scenarios: a valid complete plan, invalid dimensions,
 * invalid pattern ID, duplicate element IDs, missing asset references, invalid
 * typography configuration, plus schema versioning, units, references, layer
 * relationships, constraint consistency and the "invalid plans never reach the
 * renderer" boundary.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CODES } from '../src/core/diagnostics.ts';
import { validateDesignPlan, assertValidDesignPlan, DesignPlanValidationError, deriveContentSlots } from '../src/validation/design-plan.ts';
import { parseDesignBrief } from '../src/brief/parse.ts';
import { SCHEMA_VERSION } from '../src/schema/version.ts';
import { validDesignPlan, validPrintPlan, validArabicPlan, validMixedLanguagePlan } from './fixtures/plans.ts';
import { clone, expectAdmitted, hasCode } from './helpers.ts';

/** Mutates a fresh clone of the canonical plan; returns plain `unknown`. */
function brokenPlan(change: (draft: Record<string, any>) => void): unknown {
  const draft = clone(validDesignPlan()) as unknown as Record<string, any>;
  change(draft);
  return draft;
}

describe('plan validator — valid complete plan', () => {
  it('admits the canonical square digital plan with no errors', () => {
    const report = validateDesignPlan(validDesignPlan());
    const document = expectAdmitted(report);
    assert.equal(report.result.errors.length, 0);
    assert.equal(document.schemaVersion, SCHEMA_VERSION);
    assert.equal(document.elements.length, 6);
  });

  it('admits a physical print plan with bleed and safe area', () => {
    const report = validateDesignPlan(validPrintPlan());
    expectAdmitted(report);
    assert.equal(report.result.errors.length, 0);
  });

  it('admits an RTL Arabic plan', () => {
    const report = validateDesignPlan(validArabicPlan());
    expectAdmitted(report);
  });

  it('admits a mixed Bengali/English plan with an image asset', () => {
    const report = validateDesignPlan(validMixedLanguagePlan());
    expectAdmitted(report);
  });

  it('returns the validated document, not the raw input', () => {
    const report = validateDesignPlan(validDesignPlan());
    assert.ok(report.result.value);
    assert.equal(report.result.value?.id, 'design-tuition-advert');
  });

  it('reports warnings without blocking admission', () => {
    const report = validateDesignPlan(validDesignPlan());
    assert.ok(report.summary.warningCount > 0, 'advisory warnings are expected for this fixture');
    assert.equal(report.admitted, true, 'warnings alone must not block a plan');
  });

  it('summarises diagnostic codes for logging', () => {
    const report = validateDesignPlan(validDesignPlan());
    assert.equal(typeof report.summary.codes, 'object');
    assert.ok(Object.keys(report.summary.codes).length > 0);
  });
});

describe('plan validator — non-object and malformed input', () => {
  for (const [label, input] of [
    ['null', null],
    ['a string', 'not a plan'],
    ['an array', [1, 2, 3]],
    ['a number', 42],
  ] as const) {
    it(`rejects ${label} without throwing`, () => {
      const report = validateDesignPlan(input);
      assert.equal(report.admitted, false);
      assert.ok(report.result.errors.length > 0);
    });
  }

  it('reports every missing top-level section at once', () => {
    const report = validateDesignPlan({});
    assert.equal(report.admitted, false);
    assert.ok(report.result.errors.length >= 9, `expected many missing-field errors, got ${report.result.errors.length}`);
    assert.ok(hasCode(report.result.errors, CODES.REQUIRED));
  });
});

describe('plan validator — invalid dimensions', () => {
  it('rejects a zero width', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['canvas'].width = 0; }));
    assert.equal(report.admitted, false);
    assert.ok(hasCode(report.result.errors, CODES.CANVAS_DIMENSION_INVALID));
  });

  it('rejects a negative height', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['canvas'].height = -100; }));
    assert.ok(hasCode(report.result.errors, CODES.CANVAS_DIMENSION_INVALID));
  });

  it('rejects NaN and Infinity', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const report = validateDesignPlan(brokenPlan((draft) => { draft['canvas'].width = value; }));
      assert.ok(hasCode(report.result.errors, CODES.CANVAS_DIMENSION_INVALID));
    }
  });

  it('rejects an unknown unit', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['canvas'].unit = 'pt'; }));
    assert.ok(hasCode(report.result.errors, CODES.UNIT_INVALID));
  });

  it('rejects a missing unit rather than assuming pixels', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { delete draft['canvas'].unit; }));
    assert.ok(hasCode(report.result.errors, CODES.REQUIRED));
  });

  it('rejects a canvas larger than the supported maximum', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['canvas'].width = 999_999; }));
    assert.ok(hasCode(report.result.errors, CODES.CANVAS_DIMENSION_INVALID));
  });

  it('rejects insets that consume the whole canvas', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['canvas'].safeArea = { top: 0, right: 600, bottom: 0, left: 600 };
    }));
    assert.ok(hasCode(report.result.errors, CODES.SAFE_AREA_INVALID));
  });

  it('warns about an extreme aspect ratio', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['canvas'].width = 10_000;
      draft['canvas'].height = 20;
    }));
    assert.ok(hasCode(report.result.warnings, CODES.CANVAS_ASPECT_UNUSUAL));
  });
});

describe('plan validator — invalid pattern ID', () => {
  it('rejects a well-formed but unknown pattern ID', () => {
    // P99 exists, P99x does not; "P1000" is well-formed but beyond the catalogue.
    const report = validateDesignPlan(brokenPlan((draft) => { draft['composition'].primaryPattern = 'P999'; }));
    assert.equal(report.admitted, false);
    assert.ok(
      hasCode(report.result.errors, CODES.PATTERN_ID_INVALID) || hasCode(report.result.errors, CODES.PATTERN_UNKNOWN),
      'an ID outside the catalogue must be rejected',
    );
  });

  it('rejects a malformed pattern ID', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['composition'].primaryPattern = 'central-hero'; }));
    assert.ok(hasCode(report.result.errors, CODES.PATTERN_ID_INVALID));
  });

  it('rejects a missing primary pattern', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { delete draft['composition'].primaryPattern; }));
    assert.ok(hasCode(report.result.errors, CODES.REQUIRED));
  });

  it('rejects an unknown supporting pattern', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['composition'].supportingPatterns = ['P07x']; }));
    assert.ok(hasCode(report.result.errors, CODES.PATTERN_ID_INVALID));
  });

  it('rejects too many supporting patterns', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].supportingPatterns = ['P12', 'P13', 'P14'];
    }));
    assert.ok(hasCode(report.result.errors, CODES.SUPPORTING_PATTERNS_EXCESSIVE));
  });

  it('rejects a supporting pattern equal to the primary', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].supportingPatterns = ['P19'];
    }));
    assert.ok(hasCode(report.result.errors, CODES.PATTERN_DUPLICATE));
  });

  it('accepts a pattern from a mismatched catalogue category with a warning', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['composition'].primaryPattern = 'P81'; }));
    assert.ok(hasCode(report.result.warnings, CODES.PATTERN_CATEGORY_MISMATCH));
  });
});

describe('plan validator — duplicate element IDs', () => {
  it('rejects two elements sharing an ID', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['elements'][1].id = draft['elements'][0].id;
    }));
    assert.equal(report.admitted, false);
    assert.ok(hasCode(report.result.errors, CODES.ID_NOT_UNIQUE));
  });

  it('rejects a duplicated ID nested inside a group', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['elements'][5].children[0].id = 'el-headline';
    }));
    assert.ok(hasCode(report.result.errors, CODES.ID_NOT_UNIQUE));
  });

  it('rejects duplicate asset IDs', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['assets'] = [draft['assets'][0], { ...draft['assets'][0] }];
    }));
    assert.ok(hasCode(report.result.errors, CODES.ID_NOT_UNIQUE));
  });

  it('rejects duplicate zone IDs', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].zones[1].id = draft['composition'].zones[0].id;
    }));
    assert.ok(hasCode(report.result.errors, CODES.ID_NOT_UNIQUE));
  });

  it('rejects an invalid element ID shape', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['elements'][1].id = 'has spaces'; }));
    assert.ok(hasCode(report.result.errors, CODES.ID_INVALID));
  });
});

describe('plan validator — missing asset references', () => {
  it('rejects a node referencing an undeclared asset', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['elements'][1].assetId = 'asset-does-not-exist'; }));
    assert.equal(report.admitted, false);
    assert.ok(hasCode(report.result.errors, CODES.ASSET_NOT_FOUND));
  });

  it('rejects an image node with no asset', () => {
    const plan = validMixedLanguagePlan();
    const draft = clone(plan) as unknown as Record<string, any>;
    delete draft['elements'][0].assetId;
    draft['assets'] = [];
    const report = validateDesignPlan(draft);
    assert.ok(hasCode(report.result.errors, CODES.ASSET_NOT_FOUND));
  });

  it('rejects a canvas background image that references nothing', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['canvas'].background = { type: 'image', assetId: 'asset-missing' };
    }));
    assert.ok(hasCode(report.result.errors, CODES.ASSET_NOT_FOUND));
  });

  it('rejects an image node pointing at a non-image asset kind', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['elements'].push({
        id: 'el-bad-image',
        type: 'image',
        name: 'Bad image',
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0 },
        geometry: { width: 100, height: 100 },
        assetId: 'asset-font-body',
        imagePlacement: { fit: 'cover' },
        visible: true,
        locked: false,
      });
    }));
    assert.ok(hasCode(report.result.errors, CODES.ASSET_KIND_MISMATCH));
  });

  it('rejects an unsupported asset URI scheme', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['assets'][0].uri = 'javascript:alert(1)';
    }));
    assert.ok(hasCode(report.result.errors, CODES.ASSET_URI_SCHEME_UNSUPPORTED));
  });

  it('warns when an image asset has no licensing usage', () => {
    const plan = validMixedLanguagePlan();
    const draft = clone(plan) as unknown as Record<string, any>;
    delete draft['assets'][0].licensing;
    const report = validateDesignPlan(draft);
    assert.ok(hasCode(report.result.warnings, CODES.ASSET_LICENSING_MISSING));
  });

  it('warns about declared but unused assets', () => {
    const report = validateDesignPlan(validDesignPlan());
    assert.ok(hasCode(report.result.warnings, CODES.ASSET_UNUSED));
  });
});

describe('plan validator — invalid typography configuration', () => {
  it('rejects a missing typography role in the token scale', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { delete draft['designTokens'].typography.body; }));
    assert.ok(hasCode(report.result.errors, CODES.TYPOGRAPHY_TOKEN_MISSING));
  });

  it('rejects a negative font size', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['elements'][1].text.typography.fontSize = -4; }));
    assert.ok(hasCode(report.result.errors, CODES.FONT_SIZE_INVALID));
  });

  it('rejects a font size larger than the canvas', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['elements'][1].text.typography.fontSize = 4000; }));
    assert.ok(hasCode(report.result.errors, CODES.FONT_SIZE_IMPLAUSIBLE));
  });

  it('rejects an invalid font weight type', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['elements'][1].text.typography.fontWeight = { weight: 700 }; }));
    assert.ok(hasCode(report.result.errors, CODES.FONT_WEIGHT_INVALID));
  });

  it('rejects an unsupported text alignment', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['elements'][1].text.typography.textAlign = 'middle'; }));
    assert.ok(hasCode(report.result.errors, CODES.TEXT_ALIGN_INVALID));
  });

  it('rejects a missing font family', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['elements'][1].text.typography.fontFamily = '  '; }));
    assert.ok(hasCode(report.result.errors, CODES.FONT_FAMILY_EMPTY));
  });

  it('warns about an overlapping line height below 1.0', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['elements'][1].text.typography.lineHeight = 0.9; }));
    assert.ok(hasCode(report.result.warnings, CODES.LINE_HEIGHT_INVALID));
  });

  it('rejects a text node with no typography', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { delete draft['elements'][1].text.typography; }));
    assert.ok(hasCode(report.result.errors, CODES.REQUIRED));
  });

  it('rejects a text node with empty content', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['elements'][1].text.content = '   '; }));
    assert.ok(hasCode(report.result.errors, CODES.TEXT_CONTENT_EMPTY));
  });
});

describe('plan validator — schema validity and versioning', () => {
  it('rejects a missing schema version', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { delete draft['schemaVersion']; }));
    assert.ok(hasCode(report.result.errors, CODES.SCHEMA_VERSION_MISSING));
  });

  it('rejects a malformed schema version', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['schemaVersion'] = '1.0'; }));
    assert.ok(hasCode(report.result.errors, CODES.SCHEMA_VERSION_MALFORMED));
  });

  it('rejects an unsupported future schema version', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['schemaVersion'] = '2.0.0'; }));
    assert.ok(hasCode(report.result.errors, CODES.SCHEMA_VERSION_UNSUPPORTED));
  });

  it('warns when an unsupported version is allowed explicitly', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['schemaVersion'] = '1.1.0'; }), {
      allowUnknownSchemaVersion: true,
    });
    assert.ok(hasCode(report.result.warnings, CODES.SCHEMA_VERSION_UNSUPPORTED));
  });

  it('rejects a non-positive document revision', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['version'] = 0; }));
    assert.ok(hasCode(report.result.errors, CODES.DOCUMENT_VERSION_INVALID));
  });

  it('rejects updatedAt earlier than createdAt', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['metadata'].updatedAt = '2000-01-01T00:00:00Z'; }));
    assert.ok(hasCode(report.result.errors, CODES.METADATA_TIMESTAMP_ORDER));
  });

  it('rejects a non-ISO timestamp', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['metadata'].createdAt = 'yesterday'; }));
    assert.ok(hasCode(report.result.errors, CODES.METADATA_TIMESTAMP_INVALID));
  });

  it('warns about an unrecognised top-level field', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['mystery'] = true; }));
    assert.ok(hasCode(report.result.warnings, CODES.UNEXPECTED_VALUE));
  });
});

describe('plan validator — valid object references and layers', () => {
  it('rejects a zone that references an unknown element', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].zones[0].elementIds.push('el-ghost');
    }));
    assert.ok(hasCode(report.result.errors, CODES.ZONE_ELEMENT_NOT_FOUND));
  });

  it('rejects a shadow token that is not declared', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['elements'][3].style.shadowToken = 'shadow-missing';
    }));
    assert.ok(hasCode(report.result.errors, CODES.SHADOW_TOKEN_NOT_FOUND));
  });

  it('rejects children on a non-group node', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['elements'][1].children = [{ id: 'el-child', type: 'shape', name: 'x' }];
    }));
    assert.ok(hasCode(report.result.errors, CODES.CHILDREN_NOT_ALLOWED));
  });

  it('rejects a group with no children', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { delete draft['elements'][5].children; }));
    assert.ok(hasCode(report.result.errors, CODES.GROUP_CHILDREN_MISSING));
  });

  it('rejects a zero scale', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['elements'][1].transform.scaleX = 0; }));
    assert.ok(hasCode(report.result.errors, CODES.SCALE_ZERO));
  });

  it('rejects geometry with a non-positive size', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['elements'][1].geometry.width = 0; }));
    assert.ok(hasCode(report.result.errors, CODES.GEOMETRY_INVALID));
  });

  it('rejects unsafe SVG path data', () => {
    for (const pathData of ['M0 0 <script>', 'M0 0 url(#x)', 'M0 0 "evil"', 'L10 10']) {
      const report = validateDesignPlan(brokenPlan((draft) => {
        draft['elements'].push({
          id: 'el-path',
          type: 'path',
          name: 'Path',
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
          geometry: { width: 100, height: 100, pathData },
          visible: true,
          locked: false,
        });
      }));
      assert.ok(
        hasCode(report.result.errors, CODES.PATH_DATA_INVALID),
        `path data ${JSON.stringify(pathData)} should be rejected`,
      );
    }
  });

  it('accepts valid SVG path data', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['elements'].push({
        id: 'el-path-ok',
        type: 'path',
        name: 'Valid path',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        geometry: { width: 100, height: 100, pathData: 'M0 0 L50 0 L50 50 Z' },
        visible: true,
        locked: false,
      });
    }));
    assert.equal(hasCode(report.result.errors, CODES.PATH_DATA_INVALID), false);
  });

  it('rejects a text direction that contradicts its language', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['elements'][1].text.language = 'ar';
      draft['elements'][1].text.direction = 'ltr';
    }));
    assert.ok(hasCode(report.result.errors, CODES.TEXT_DIRECTION_CONFLICT));
  });

  it('flags essential content outside the canvas as an error', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['elements'][1].transform.x = 2000; }));
    assert.ok(hasCode(report.result.errors, CODES.BOUNDS_OUTSIDE_CANVAS));
  });

  it('does not raise a bleed warning when no element leaves the canvas', () => {
    const report = validateDesignPlan(validDesignPlan());
    assert.equal(
      hasCode(report.result.warnings, CODES.BOUNDS_OUTSIDE_CANVAS),
      false,
      'a fully contained document must not produce bounds noise',
    );
  });

  it('downgrades declared intentional bleed to a warning', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      // The background panel is already marked intentionalBleed; make it
      // genuinely extend past the canvas to prove the declaration is honoured.
      draft['elements'][0].geometry.width = 1400;
      draft['elements'][0].geometry.height = 1400;
    }));
    const bleedWarnings = report.result.warnings.filter((warning) => warning.code === CODES.BOUNDS_OUTSIDE_CANVAS);
    assert.equal(report.result.errors.filter((error) => error.code === CODES.BOUNDS_OUTSIDE_CANVAS).length, 0);
    assert.ok(bleedWarnings.some((warning) => warning.message.includes('intentional bleed')));
  });

  it('warns about undeclared non-essential overflow', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['elements'][3].transform.x = 2000;
    }));
    const boundsIssue = [...report.result.errors, ...report.result.warnings].find(
      (diagnostic) => diagnostic.code === CODES.BOUNDS_OUTSIDE_CANVAS,
    );
    assert.ok(boundsIssue);
    assert.equal(boundsIssue.severity, 'warning', 'non-essential overflow is reported, not rejected');
  });

  it('rejects essential content that leaves the safe area', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['canvas'].safeArea = { top: 300, right: 300, bottom: 300, left: 300 };
    }));
    assert.ok(hasCode(report.result.errors, CODES.BOUNDS_OUTSIDE_SAFE_AREA));
  });
});

describe('plan validator — composition structure', () => {
  it('rejects a focal point outside the canvas', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].focalPoint.x = 5000;
    }));
    assert.ok(hasCode(report.result.errors, CODES.FOCAL_POINT_OUTSIDE_CANVAS));
  });

  it('rejects a focal strength outside 0..1', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].focalPoint.strength = 1.4;
    }));
    assert.ok(hasCode(report.result.errors, CODES.FOCAL_STRENGTH_INVALID));
  });

  it('rejects duplicate hierarchy ranks', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].hierarchy[1].rank = 1;
    }));
    assert.ok(hasCode(report.result.errors, CODES.HIERARCHY_RANK_DUPLICATE));
  });

  it('rejects an empty hierarchy', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['composition'].hierarchy = []; }));
    assert.ok(hasCode(report.result.errors, CODES.HIERARCHY_EMPTY));
  });

  it('rejects an invalid hierarchy role', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].hierarchy[0].role = 'decorative';
    }));
    assert.ok(hasCode(report.result.errors, CODES.HIERARCHY_ROLE_INVALID));
  });

  it('rejects an invalid reading flow', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].readingFlow = 'top-to-bottom';
    }));
    assert.ok(hasCode(report.result.errors, CODES.READING_FLOW_INVALID));
  });

  it('warns when reading flow contradicts the document languages', () => {
    const plan = validDesignPlan();
    const draft = clone(plan) as unknown as Record<string, any>;
    draft['composition'].readingFlow = 'rtl';
    const report = validateDesignPlan(draft, {
      brief: parseDesignBrief('Poster. Headline: Open Day. Size: 1080x1080 px').brief,
    });
    assert.ok(hasCode(report.result.warnings, CODES.READING_FLOW_INVALID));
  });

  it('rejects a zone outside the canvas', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].zones[0].bounds = { x: 900, y: 900, width: 500, height: 500 };
    }));
    assert.ok(hasCode(report.result.errors, CODES.ZONE_OUTSIDE_CANVAS));
  });

  it('warns about overlapping zones', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].zones[1].bounds = { x: 80, y: 120, width: 400, height: 120 };
    }));
    assert.ok(hasCode(report.result.warnings, CODES.ZONE_OVERLAP_UNSTATED));
  });

  it('rejects an invalid grid type', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['composition'].grid.type = 'hex'; }));
    assert.ok(hasCode(report.result.errors, CODES.GRID_TYPE_INVALID));
  });

  it('rejects zero grid columns', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['composition'].grid.columns = 0; }));
    assert.ok(hasCode(report.result.errors, CODES.GRID_COLUMNS_INVALID));
  });
});

describe('plan validator — constraint consistency', () => {
  it('rejects preserveContent: false', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].constraints.preserveContent = false;
    }));
    assert.ok(hasCode(report.result.errors, CODES.PRESERVE_CONTENT_DISABLED));
  });

  it('rejects a self-referential overlap pair', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].constraints.allowedOverlapPairs = [['el-headline', 'el-headline']];
    }));
    assert.ok(hasCode(report.result.errors, CODES.OVERLAP_PAIR_SELF));
  });

  it('rejects a malformed overlap pair', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].constraints.allowedOverlapPairs = [['el-headline']];
    }));
    assert.ok(hasCode(report.result.errors, CODES.OVERLAP_PAIR_UNUSABLE));
  });

  it('warns when overlap is allowed but no pairs are declared', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].constraints.allowedOverlapPairs = [];
    }));
    assert.ok(hasCode(report.result.warnings, CODES.OVERLAP_NOT_DECLARED));
  });

  it('warns when pairs are declared but overlap is disallowed', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['composition'].constraints.allowOverlap = false;
    }));
    assert.ok(hasCode(report.result.warnings, CODES.OVERLAP_PAIRS_CONTRADICT));
  });
});

describe('plan validator — art direction integration', () => {
  it('rejects an undocumented style ID', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['artDirection'].style = 'vaporwave-plus'; }));
    assert.ok(hasCode(report.result.errors, CODES.ART_DIRECTION_STYLE_UNKNOWN));
  });

  it('accepts every documented style ID', () => {
    for (const style of ['swiss-international', 'luxury', 'neo-brutalism', 'contemporary-japanese-editorial']) {
      const report = validateDesignPlan(brokenPlan((draft) => { draft['artDirection'].style = style; }));
      assert.equal(
        hasCode(report.result.errors, CODES.ART_DIRECTION_STYLE_UNKNOWN),
        false,
        `style "${style}" should be recognised`,
      );
    }
  });

  it('rejects an undocumented colour strategy', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['artDirection'].colorStrategy = 'rainbow'; }));
    assert.ok(hasCode(report.result.errors, CODES.COLOR_STRATEGY_UNKNOWN));
  });

  it('rejects empty mood', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['artDirection'].mood = []; }));
    assert.ok(hasCode(report.result.errors, CODES.MOOD_EMPTY));
  });

  it('rejects an invalid visual density', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['artDirection'].visualDensity = 'sparse'; }));
    assert.ok(hasCode(report.result.errors, CODES.VISUAL_DENSITY_INVALID));
  });
});

describe('plan validator — colours', () => {
  it('rejects an invalid background colour', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['canvas'].background.color = 'not-a-colour'; }));
    assert.ok(hasCode(report.result.errors, CODES.COLOR_INVALID));
  });

  it('rejects named colours instead of accepting ambiguous input', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['canvas'].background.color = 'red'; }));
    assert.ok(hasCode(report.result.errors, CODES.COLOR_INVALID));
  });

  it('rejects unsorted gradient stops', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['canvas'].background = {
        type: 'gradient',
        kind: 'linear',
        stops: [{ offset: 0.8, color: '#000000' }, { offset: 0.2, color: '#ffffff' }],
      };
    }));
    assert.ok(hasCode(report.result.errors, CODES.GRADIENT_STOP_ORDER));
  });

  it('rejects gradient stop offsets outside 0..1', () => {
    const report = validateDesignPlan(brokenPlan((draft) => {
      draft['canvas'].background = {
        type: 'gradient',
        kind: 'linear',
        stops: [{ offset: 0, color: '#000000' }, { offset: 4, color: '#ffffff' }],
      };
    }));
    assert.ok(hasCode(report.result.errors, CODES.GRADIENT_STOP_OFFSET));
  });
});

describe('plan validator — brief consistency', () => {
  const brief = parseDesignBrief(
    'Poster. Headline: Admission Open 2026. Details: Class 6 to 10. CTA: Register Now. Size: 1080x1080 px',
  ).brief;

  it('rejects a plan whose canvas contradicts the brief', () => {
    const draft = clone(validDesignPlan()) as unknown as Record<string, any>;
    draft['metadata'].category = 'poster';
    draft['canvas'].width = 1200;
    const report = validateDesignPlan(draft, { brief });
    assert.ok(hasCode(report.result.errors, CODES.BRIEF_CANVAS_MISMATCH));
  });

  it('rejects a plan whose category contradicts the brief', () => {
    const draft = clone(validDesignPlan()) as unknown as Record<string, any>;
    const report = validateDesignPlan(draft, { brief });
    assert.ok(hasCode(report.result.errors, CODES.BRIEF_CATEGORY_MISMATCH));
  });

  it('rejects a hierarchy that references content the brief does not contain', () => {
    const draft = clone(validDesignPlan()) as unknown as Record<string, any>;
    draft['metadata'].category = 'poster';
    draft['composition'].hierarchy = [{ contentId: 'details/9', rank: 1, role: 'primary' }];
    const report = validateDesignPlan(draft, { brief });
    assert.ok(hasCode(report.result.errors, CODES.HIERARCHY_CONTENT_UNRESOLVED));
  });

  it('warns when no brief is supplied so content preservation is unverified', () => {
    const report = validateDesignPlan(clone(validDesignPlan()) as unknown);
    assert.ok(hasCode(report.result.warnings, CODES.BRIEF_CONTENT_MISSING));
  });

  it('derives addressable content slots from a brief', () => {
    const slots = deriveContentSlots(brief);
    assert.ok(slots.includes('headline'));
    assert.ok(slots.includes('cta'));
    assert.ok(slots.includes('details/0'));
  });
});

describe('plan validator — renderer boundary', () => {
  it('refuses an invalid plan through the throwing helper', () => {
    const invalid = brokenPlan((draft) => { delete draft['canvas']; });
    assert.throws(() => assertValidDesignPlan(invalid), (error: unknown) => {
      assert.ok(error instanceof DesignPlanValidationError);
      assert.equal(error.report.admitted, false);
      assert.ok(error.report.result.errors.length > 0);
      return true;
    });
  });

  it('returns a validated document through the throwing helper when valid', () => {
    const document = assertValidDesignPlan(validDesignPlan());
    assert.equal(document.elements.length, 6);
  });

  it('does not admit a plan with any error, even when warnings are present', () => {
    const report = validateDesignPlan(brokenPlan((draft) => { draft['canvas'].width = 0; }));
    assert.equal(report.result.value, undefined, 'no value may be exposed for a rejected plan');
  });
});
