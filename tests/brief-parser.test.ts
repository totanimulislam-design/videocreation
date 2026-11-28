/**
 * Brief Intelligence Parser tests.
 *
 * Covers the required scenarios: a valid brief, missing essential content,
 * conflicting constraints, Bengali, Arabic/RTL and mixed-language briefs.
 *
 * The assertions deliberately check *verbatim preservation* and the presence of
 * explicit unknowns/assumptions, because "do not invent facts" is the central
 * requirement of this phase.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseDesignBrief, parseDesignBriefOrThrow, BriefParseError } from '../src/brief/parse.ts';
import { CODES } from '../src/core/diagnostics.ts';
import { hasCode } from './helpers.ts';

const SPEC_EXAMPLE = `Create a premium admission poster for an academic coaching center.
Include the institution name, admission announcement, class information, contact number, and a registration CTA.
Institution name: Bright Future Academy
Headline: Admission Open 2026
Classes: Class 6 to 10, batch starts 5 January 2026
Contact: 01712-345678
CTA: Register Now
Size: 1080x1080 px
Objective: announce the 2026 admission cycle`;

describe('brief parser — valid brief', () => {
  it('produces a structured brief from the specification example', () => {
    const result = parseDesignBrief(SPEC_EXAMPLE);

    assert.equal(result.ok, true, 'the example brief should parse without errors');
    assert.equal(result.brief.category, 'poster');
    assert.equal(result.brief.content.headline, 'Admission Open 2026');
    assert.equal(result.brief.content.cta, 'Register Now');
    assert.equal(result.brief.content.subheadline, undefined);
    assert.equal(result.brief.brand.name, 'Bright Future Academy');
    assert.equal(result.brief.requirements.width, 1080);
    assert.equal(result.brief.requirements.height, 1080);
    assert.equal(result.brief.requirements.unit, 'px');
    assert.deepEqual(result.brief.requirements.languages, ['en']);
    assert.equal(result.brief.objective, 'announce the 2026 admission cycle');
  });

  it('preserves factual content exactly, including the phone number and date', () => {
    const result = parseDesignBrief(SPEC_EXAMPLE);
    const allContent = [
      result.brief.content.headline ?? '',
      result.brief.content.subheadline ?? '',
      ...result.brief.content.body,
      ...result.brief.content.details,
      result.brief.content.cta ?? '',
    ].join('\n');

    assert.ok(allContent.includes('01712-345678'), 'the phone number must appear verbatim');
    assert.ok(allContent.includes('Class 6 to 10, batch starts 5 January 2026'), 'the class detail must appear verbatim');
    assert.ok(allContent.includes('Admission Open 2026'));
    assert.ok(allContent.includes('Register Now'));
  });

  it('never places instruction text into artwork content', () => {
    const result = parseDesignBrief(SPEC_EXAMPLE);
    const allContent = [...result.brief.content.body, ...result.brief.content.details].join('\n');
    assert.doesNotMatch(allContent, /Create a premium admission poster/);
    assert.doesNotMatch(allContent, /Include the institution name/);
  });

  it('classifies content types and records evidence for every field', () => {
    const result = parseDesignBrief(SPEC_EXAMPLE);
    assert.ok(result.analysis.contentClasses.includes('primary-headline'));
    assert.ok(result.analysis.contentClasses.includes('cta'));
    assert.ok(result.analysis.contentClasses.includes('brand-information'));
    assert.ok(result.analysis.contentClasses.includes('contact-information'));
    assert.ok(result.analysis.evidence.length > 0);
    assert.ok(
      result.analysis.evidence.every((entry) => entry.basis.length > 0),
      'each evidence entry must explain itself',
    );
    assert.ok(result.analysis.confidence > 0.5 && result.analysis.confidence <= 1);
  });

  it('does not invent brand claims, dates or prices that were not supplied', () => {
    const result = parseDesignBrief('Create a poster. Headline: Grand Opening');
    assert.equal(result.brief.brand.name, undefined);
    assert.equal(result.brief.content.cta, undefined);
    const joined = [...result.brief.content.details, ...result.brief.content.body].join(' ');
    assert.equal(joined.trim(), '', 'no details should be invented when none were supplied');
  });

  it('accepts caller hints over text inference', () => {
    const result = parseDesignBrief('Headline: Hello', {
      category: 'social_media',
      width: 1080,
      height: 1920,
      unit: 'px',
      medium: 'digital',
      languages: ['bn'],
      outputFormats: ['png'],
    });
    assert.equal(result.brief.category, 'social_media');
    assert.equal(result.brief.requirements.height, 1920);
    assert.equal(result.brief.requirements.medium, 'digital');
    assert.deepEqual(result.brief.requirements.languages, ['bn']);
    assert.deepEqual(result.brief.requirements.outputFormats, ['png']);
    assert.ok(result.analysis.evidence.some((entry) => entry.kind === 'caller-supplied'));
  });
});

describe('brief parser — missing essential content', () => {
  it('rejects an empty brief', () => {
    const result = parseDesignBrief('   ');
    assert.equal(result.ok, false);
    assert.ok(hasCode(result.diagnostics, CODES.BRIEF_INPUT_EMPTY));
    assert.equal(result.brief.content.headline, undefined);
  });

  it('reports a missing headline without writing one', () => {
    const result = parseDesignBrief('A poster with no content supplied yet.');
    assert.equal(result.ok, false);
    assert.ok(hasCode(result.diagnostics, CODES.BRIEF_HEADLINE_MISSING));
    assert.equal(result.brief.content.headline, undefined, 'the parser must not author the headline');
    assert.ok(
      result.analysis.openQuestions.some((question) => question.field === 'content.headline' && question.blocking),
      'a blocking question must be raised instead of a guess',
    );
  });

  it('reports missing dimensions as an assumption plus an open question', () => {
    const result = parseDesignBrief('Poster. Headline: Admission Open');
    assert.ok(hasCode(result.diagnostics, CODES.BRIEF_DIMENSIONS_UNKNOWN));
    assert.ok(result.analysis.assumptions.some((assumption) => assumption.field === 'requirements.width/height'));
    assert.ok(result.analysis.openQuestions.some((question) => question.field === 'requirements.width/height'));
    assert.ok(
      result.analysis.evidence.some((entry) => entry.field === 'requirements.width/height' && entry.kind === 'assumed'),
    );
  });

  it('treats missing dimensions as an error in strict mode', () => {
    const result = parseDesignBrief('Poster. Headline: Admission Open', {}, { requireDimensions: true });
    assert.equal(result.ok, false);
    assert.ok(hasCode(result.diagnostics, CODES.BRIEF_DIMENSIONS_UNKNOWN));
  });

  it('downgrades missing content to a warning in lenient mode', () => {
    const result = parseDesignBrief('A poster with no content supplied yet.', {}, { lenient: true });
    assert.ok(hasCode(result.diagnostics, CODES.BRIEF_CONTENT_MISSING));
    const contentDiag = result.diagnostics.find((diagnostic) => diagnostic.code === CODES.BRIEF_CONTENT_MISSING);
    assert.equal(contentDiag?.severity, 'warning');
  });
});

describe('brief parser — conflicting constraints', () => {
  it('rejects two contradictory canvas sizes and records which one was kept', () => {
    const result = parseDesignBrief('Poster. Headline: Sale. Size: 1080x1080 px. Also 1080x1920 px.');
    assert.equal(result.ok, false);
    assert.ok(hasCode(result.diagnostics, CODES.BRIEF_DIMENSIONS_AMBIGUOUS));
    assert.equal(result.brief.requirements.width, 1080);
    assert.equal(result.brief.requirements.height, 1080, 'the first stated size is kept');
    assert.equal(result.analysis.conflicts.length, 1);
    assert.match(result.analysis.conflicts[0]?.resolution ?? '', /first stated size/);
  });

  it('accepts a stated size range without treating it as a contradiction error', () => {
    const result = parseDesignBrief('Flyer. Headline: Open Day. Size: 1080x1920 px - 1080x1080 px');
    const conflictError = result.diagnostics.find(
      (diagnostic) => diagnostic.code === CODES.BRIEF_DIMENSIONS_AMBIGUOUS && diagnostic.severity === 'error',
    );
    assert.equal(conflictError, undefined, 'a range is ambiguous but not a hard contradiction');
  });

  it('records mixed print and digital requests as medium "both"', () => {
    const result = parseDesignBrief('Poster, for print and digital. Headline: Launch');
    assert.equal(result.brief.requirements.medium, 'both');
  });

  it('flags unsupported requests instead of pretending to support them', () => {
    const result = parseDesignBrief('Animate this poster for Instagram. Headline: Launch');
    assert.ok(hasCode(result.diagnostics, CODES.BRIEF_UNSUPPORTED_CONSTRAINT));
  });

  it('preserves every supplied phone number and flags ambiguity', () => {
    const result = parseDesignBrief('Poster. Headline: Call us. Contact: 01712-345678 and 01987-654321');
    const joined = result.brief.content.body.join(' ');
    assert.ok(joined.includes('01712-345678'));
    assert.ok(joined.includes('01987-654321'));
    assert.ok(hasCode(result.diagnostics, CODES.BRIEF_CONTACT_UNVERIFIED));
  });
});

describe('brief parser — Bengali brief', () => {
  const BENGALI = `একটি ভর্তি পোস্টার তৈরি করুন। শিরোনাম: ভর্তি চলছে ২০২৬। যোগাযোগ: ০১৭১২-৩৪৫৬৭৮। সাইজ ৮x১০ ইঞ্চি`;

  it('detects the Bengali language and Latin-script direction', () => {
    const result = parseDesignBrief(BENGALI);
    assert.equal(result.ok, true);
    assert.ok(result.brief.requirements.languages.includes('bn'));
    assert.equal(result.analysis.script.dominantDirection, 'ltr');
    assert.ok(result.analysis.script.scripts.includes('bengali'));
  });

  it('extracts the Bengali headline verbatim', () => {
    const result = parseDesignBrief(BENGALI);
    assert.equal(result.brief.content.headline, 'ভর্তি চলছে ২০২৬');
  });

  it('reads Bengali-Indic numerals in dimensions and the Bengali unit word', () => {
    const result = parseDesignBrief(BENGALI);
    assert.equal(result.brief.requirements.width, 8);
    assert.equal(result.brief.requirements.height, 10);
    assert.equal(result.brief.requirements.unit, 'in');
  });

  it('preserves Bengali-Indic digits in content without converting them', () => {
    const result = parseDesignBrief(BENGALI);
    const all = result.brief.content.body.join(' ');
    assert.ok(all.includes('০১৭১২-৩৪৫৬৭৮'), 'Bengali digits must be preserved exactly, not transliterated');
    assert.ok(result.brief.content.headline?.includes('২০২৬'));
  });

  it('does not misreport a Bengali brief as mixed-script because of the dimension separator', () => {
    const result = parseDesignBrief(BENGALI);
    assert.equal(result.analysis.script.mixedDirection, false);
    assert.deepEqual([...result.brief.requirements.languages], ['bn']);
  });
});

describe('brief parser — non-Latin label coverage', () => {
  const cases = [
    { label: 'Bengali', text: 'পোস্টার। শিরোনাম: ভর্তি চলছে ২০২৬। বিবরণ: ক্লাস ৬ থেকে ১০। সাইজ ১০৮০x১০৮০ পিক্সেল', expected: 'ক্লাস ৬ থেকে ১০' },
    { label: 'Bengali detail keyword', text: 'পোস্টার। শিরোনাম: ভর্তি চলছে। বিস্তারিত: ফি ৫০০ টাকা। সাইজ ১০৮০x১০৮০ পিক্সেল', expected: 'ফি ৫০০ টাকা' },
    { label: 'Arabic', text: 'ملصق. العنوان: التسجيل مفتوح. التفاصيل: يبدأ التدريب في 5 يناير. الحجم 1080x1080 بكسل', expected: 'يبدأ التدريب في 5 يناير' },
  ];

  for (const { label, text, expected } of cases) {
    it(`does not silently drop labelled ${label} details`, () => {
      const result = parseDesignBrief(text);
      assert.equal(result.ok, true);
      assert.ok(
        result.brief.content.details.includes(expected),
        `expected details to contain ${JSON.stringify(expected)}, received ${JSON.stringify(result.brief.content.details)}`,
      );
    });
  }

  it('surfaces content it could not place rather than discarding it', () => {
    // A statement with no recognised label and no obvious slot.
    const result = parseDesignBrief('Poster. Headline: Open Day. Somewhere a very unusual line. Size: 1080x1080 px');
    const totalChars =
      (result.brief.content.headline?.length ?? 0) +
      result.brief.content.body.join('').length +
      result.brief.content.details.join('').length;
    assert.ok(totalChars > 0);
    // The unusual line may land in body or details; either way it must be visible somewhere.
    const everything = [...result.brief.content.body, ...result.brief.content.details].join(' ');
    assert.ok(
      everything.includes('Somewhere a very unusual line') || result.analysis.unassignedContent.length > 0,
      'unplaced content must either be assigned or recorded for review',
    );
  });
});

describe('brief parser — Arabic and RTL brief', () => {
  const ARABIC = `أنشئ ملصق إعلان لمدرسة. العنوان: التسجيل مفتوح. التاريخ: 15 مارس 2026. الاتصال: +971501234567. الحجم 1080x1080 بكسل`;

  it('detects Arabic, reports RTL direction, and preserves the headline', () => {
    const result = parseDesignBrief(ARABIC);
    assert.equal(result.ok, true);
    assert.deepEqual([...result.brief.requirements.languages], ['ar']);
    assert.equal(result.analysis.script.dominantDirection, 'rtl');
    assert.equal(result.analysis.script.mixedDirection, false);
    assert.equal(result.brief.content.headline, 'التسجيل مفتوح');
  });

  it('preserves Arabic content without reversing or reshaping it', () => {
    const result = parseDesignBrief(ARABIC);
    const all = [result.brief.content.headline ?? '', ...result.brief.content.body, ...result.brief.content.details].join(' ');
    assert.ok(all.includes('التسجيل مفتوح'));
    assert.ok(all.includes('15 مارس 2026'));
    assert.ok(all.includes('+971501234567'));
    // Reversing the string would break word order; assert the original order survives.
    assert.ok(!all.includes('حوتفم ليجستلا'));
  });

  it('keeps the Arabic date in details rather than dropping or reformatting it', () => {
    const result = parseDesignBrief(ARABIC);
    assert.ok(
      result.brief.content.details.some((detail) => detail === '15 مارس 2026'),
      'the date must be retained verbatim',
    );
  });
});

describe('brief parser — mixed-language brief', () => {
  const MIXED = `Poster. Headline: ভর্তি চলছে ২০২৬ Admission Open. Details: Class 6 to 10, call 01712-345678. Size: 1080x1350 px`;

  it('records both languages and flags mixed direction', () => {
    const result = parseDesignBrief(MIXED);
    assert.ok(result.brief.requirements.languages.includes('bn'));
    assert.ok(result.brief.requirements.languages.includes('en'));
    assert.ok(result.analysis.script.scripts.includes('bengali'));
    assert.ok(result.analysis.script.scripts.includes('latin'));
  });

  it('preserves the mixed-script headline exactly', () => {
    const result = parseDesignBrief(MIXED);
    assert.equal(result.brief.content.headline, 'ভর্তি চলছে ২০২৬ Admission Open');
  });

  it('flags mixed LTR/RTL scripts as needing per-run direction', () => {
    const result = parseDesignBrief('Poster. العنوان: التسجيل مفتوح. Admission Open 2026. Size: 1080x1080 px');
    assert.ok(hasCode(result.diagnostics, CODES.BRIEF_MIXED_DIRECTION));
    assert.equal(result.analysis.script.mixedDirection, true);
  });

  it('marks languages outside the documented set as unsupported', () => {
    const result = parseDesignBrief('Poster. Headline: नमस्ते दुनिया. Size: 1080x1080 px', { languages: ['hi'] });
    assert.ok(hasCode(result.diagnostics, CODES.BRIEF_SCRIPT_UNSUPPORTED));
    assert.deepEqual([...result.analysis.script.unsupportedLanguages], ['hi']);
  });
});

describe('brief parser — visible direction preferences', () => {
  it('records stated style and mood without committing to a pattern', () => {
    const result = parseDesignBrief('Premium minimal poster. Headline: Grand Opening. Size: 600x800 px');
    assert.ok(result.brief.visualDirection.style.includes('luxury'));
    assert.ok(result.brief.visualDirection.style.includes('minimalist'));
    assert.ok(result.brief.visualDirection.mood.includes('premium'));
    assert.ok(
      !('pattern' in result.brief),
      'the brief must not carry a composition pattern; that belongs to the plan',
    );
  });

  it('records an explicit hex colour preference verbatim', () => {
    const result = parseDesignBrief('Poster in brand colour #1a2b3c. Headline: Open Day. Size: 1080x1080 px');
    assert.ok(result.brief.visualDirection.preferredColors?.includes('#1a2b3c'));
  });

  it('throws a typed error carrying diagnostics from the strict helper', () => {
    assert.throws(
      () => parseDesignBriefOrThrow('Somewhere in the future we might make a poster.'),
      (error: unknown) => {
        assert.ok(error instanceof BriefParseError);
        assert.equal(error.result.ok, false);
        assert.ok(error.message.includes('BRIEF_HEADLINE_MISSING') || error.result.diagnostics.length > 0);
        return true;
      },
    );
  });

  it('returns the brief from the strict helper when parsing succeeds', () => {
    const brief = parseDesignBriefOrThrow('Poster. Headline: Open Day. Size: 600x800 px');
    assert.equal(brief.content.headline, 'Open Day');
    assert.equal(brief.requirements.width, 600);
  });
});
