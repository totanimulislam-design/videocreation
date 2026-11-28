/**
 * Brief Intelligence Parser.
 *
 * Converts free-form user instructions into the canonical `DesignBrief`
 * (spec §4.2) plus an evidence/assumption report.
 *
 * WHAT THIS DOES — deterministic analysis only:
 *   - recognises category, dimensions, unit, medium, languages and formats
 *   - separates labelled content into the brief's content slots, verbatim
 *   - classifies content types (spec §4.3) and records stated constraints
 *   - records what is unknown or assumed instead of inventing it
 *
 * WHAT THIS DOES NOT DO:
 *   - no language model, no network, no provider calls
 *   - no copywriting: nothing is generated, translated, reworded or completed
 *   - no style decision beyond recording the user's stated preferences
 *   - no geometry, measurement, or claim that text will fit
 *
 * FACTUAL SAFETY RULES enforced below:
 *   1. Every value placed in `content`, `brand` and `objective` is a verbatim
 *      substring of the user's input (or a caller-supplied hint).
 *   2. Contact details, prices, dates and names are only taken when the user
 *      wrote them. Absent facts produce open questions, never placeholders.
 *   3. Assumptions are limited to reversible presentation defaults (canvas size,
 *      medium, unit) and each one is recorded with a question for the user.
 *   4. Contradictions are reported, not resolved silently.
 */

import { CODES, DiagnosticBag, formatDiagnostics, type Diagnostic } from '../core/diagnostics.ts';
import { isHexColor } from '../core/color.ts';
import {
  detectScripts,
  dominantDirection,
  isSupportedLanguage,
  normalizeLanguageTag,
  scriptForLanguage,
} from '../core/script.ts';
import type { DesignBrief, LanguageTag, Medium, OutputFormat, Unit } from '../schema/types.ts';
import { isDesignCategoryId } from '../knowledge/ids.ts';
import { estimateHeadlineCapacity } from './capacity.ts';
import {
  collapseWhitespace,
  detectCategory,
  detectColorPreferences,
  detectMedia,
  detectMoods,
  detectOutputFormats,
  detectStatedLanguages,
  detectStyles,
  detectUnsupportedRequests,
  extractAudience,
  extractDimensions,
  extractInlineFacts,
  extractLabelledValues,
  extractObjective,
  extractQuotedSpans,
  hasLabelPrefix,
  isInstructionSentence,
  splitSentences,
  type DetectedDimensions,
  type InlineFacts,
  type LabelledValue,
} from './extract.ts';
import {
  CONFIDENCE,
  type BriefAnalysis,
  type BriefConflict,
  type BriefConstraint,
  type BriefHints,
  type BriefParseResult,
  type ContentClass,
  type EvidenceKind,
  type FieldEvidence,
  type OpenQuestion,
  type ParseBriefOptions,
  type RecordedAssumption,
  type RequiredAssetRequest,
  type ScriptAnalysis,
} from './types.ts';

/** Falls back to a common digital square when the brief states nothing. */
const ASSUMED_DIGITAL_SIZE = { width: 1080, height: 1080, unit: 'px' as Unit };
/** Falls back to an A5-ish handbill when the brief implies print with no size. */
const ASSUMED_PRINT_SIZE = { width: 148, height: 210, unit: 'mm' as Unit };

const DEFAULT_OUTPUT_FOR_PRINT: OutputFormat[] = ['pdf'];
const DEFAULT_OUTPUT_FOR_DIGITAL: OutputFormat[] = ['png'];

/** Internal mutable accumulator; converted to the readonly contract at the end. */
interface Draft {
  category?: string;
  categoryEvidence?: FieldEvidence;
  objective?: string;
  audience: string[];
  brandName?: string;
  brandColors: string[];
  brandIdentity?: string;
  headline?: string;
  subheadline?: string;
  body: string[];
  details: string[];
  cta?: string;
  date?: string;
  time?: string;
  location?: string;
  price?: string;
  contact: string[];
  legal: string[];
  moods: string[];
  styles: string[];
  preferredColors: string[];
  imageDirection?: string;
  width?: number;
  height?: number;
  unit?: Unit;
  languages: string[];
  outputFormats: OutputFormat[];
  medium?: Medium;
  constraints: BriefConstraint[];
  unassigned: string[];
}

/**
 * Parses a natural-language brief.
 *
 * @param input Raw user text. Must be a string; it is treated as untrusted.
 * @param hints Optional structured facts from the caller (e.g. a form field).
 * @param options Parser behaviour for strict/lenient flows.
 */
export function parseDesignBrief(
  input: string,
  hints: BriefHints = {},
  options: ParseBriefOptions = {},
): BriefParseResult {
  const bag = new DiagnosticBag();
  const evidence: FieldEvidence[] = [];
  const assumptions: RecordedAssumption[] = [];
  const openQuestions: OpenQuestion[] = [];
  const conflicts: BriefConflict[] = [];
  const requiredAssets: RequiredAssetRequest[] = [];
  const draft: Draft = {
    audience: [],
    brandColors: [],
    body: [],
    details: [],
    contact: [],
    legal: [],
    moods: [],
    styles: [],
    preferredColors: [],
    languages: [],
    outputFormats: [],
    constraints: [],
    unassigned: [],
  };

  if (typeof input !== 'string') {
    bag.error(CODES.BRIEF_INPUT_INVALID, `Brief must be a string, received ${input === null ? 'null' : typeof input}.`, {
      path: 'input',
    });
    return finalize(draft, bag, evidence, assumptions, openQuestions, conflicts, requiredAssets, hints, options);
  }

  const text = input.trim();
  if (text.length === 0) {
    bag.error(CODES.BRIEF_INPUT_EMPTY, 'Brief is empty; no design can be derived from it.', {
      path: 'input',
      hint: 'Provide at least the content to place (headline, details) or the design category.',
    });
    return finalize(draft, bag, evidence, assumptions, openQuestions, conflicts, requiredAssets, hints, options);
  }

  // ---- Structural facts ---------------------------------------------------
  const dimensions = extractDimensions(text);
  const categoryDetection = detectCategory(text);
  const media = detectMedia(text);
  const statedLanguages = detectStatedLanguages(text);
  const outputFormats = detectOutputFormats(text);
  const inlineFacts = extractInlineFacts(text);
  const labelled = extractLabelledValues(text);
  const quoted = extractQuotedSpans(text);

  // ---- Category -----------------------------------------------------------
  resolveCategory(draft, categoryDetection, hints, evidence, openQuestions, bag);

  // ---- Dimensions & unit --------------------------------------------------
  resolveDimensions(draft, dimensions, text, hints, evidence, assumptions, openQuestions, conflicts, bag, options);

  // ---- Medium -------------------------------------------------------------
  resolveMedium(draft, media, hints, evidence, assumptions, bag);

  // ---- Output formats -----------------------------------------------------
  resolveOutputFormats(draft, outputFormats, hints, evidence, assumptions);

  // ---- Languages ----------------------------------------------------------
  const scriptAnalysis = resolveLanguages(draft, text, statedLanguages, hints, evidence, assumptions, openQuestions, bag);

  // ---- Content ------------------------------------------------------------
  applyLabelledContent(draft, labelled);
  applyQuotedHeadline(draft, quoted);
  applyInlineFacts(draft, inlineFacts);
  applySentenceFallbacks(draft, text);
  resolveHeadline(draft, text, evidence, openQuestions, bag, options);

  // ---- Objective & audience ----------------------------------------------
  const objectiveText = extractObjective(text);
  if (objectiveText) {
    draft.objective = objectiveText;
    evidence.push(field('objective', 'explicit', `Stated in the brief: "${objectiveText}"`, CONFIDENCE.explicit));
  }
  draft.audience = unique([...draft.audience, ...extractAudience(text)]);

  // ---- Visual direction ---------------------------------------------------
  draft.moods = unique([...draft.moods, ...detectMoods(text)]);
  draft.styles = unique([...draft.styles, ...detectStyles(text)]);
  const colors = detectColorPreferences(text);
  for (const hex of colors.hexes) {
    if (isHexColor(hex)) draft.preferredColors.push(hex);
  }
  draft.preferredColors = unique(draft.preferredColors);
  const imageDirection = extractImageDirection(text);
  if (imageDirection) draft.imageDirection = imageDirection;

  // ---- Constraints --------------------------------------------------------
  collectConstraints(draft, text, inlineFacts, bag);

  // ---- Unsupported requests ----------------------------------------------
  for (const request of detectUnsupportedRequests(text)) {
    bag.warning(
      CODES.BRIEF_UNSUPPORTED_CONSTRAINT,
      `The brief asks for ${request.feature} ("${request.quote}"), which this phase does not implement.`,
      {
        path: 'requirements',
        hint: 'Recorded as a known gap; do not claim this capability to the user.',
      },
    );
  }

  // ---- Asset requests ----------------------------------------------------
  if (/\b(?:no images?|text[- ]only|without images?)\b/i.test(text)) {
    draft.constraints.push({ kind: 'text-only', quote: matchQuote(text, /\b(?:no images?|text[- ]only|without images?)\b/i) });
  } else if (draft.imageDirection || /\b(?:image|photo|picture|illustration|logo)\b/i.test(text)) {
    requiredAssets.push({
      id: 'asset-request-image-1',
      kind: 'image',
      purpose: draft.imageDirection ?? 'Visual intended by the brief',
      supplied: false,
    });
  }

  // ---- Residual content safety net ---------------------------------------
  // Anything the user wrote that is neither an instruction nor a labelled value
  // must not vanish. It is recorded as unassigned so a human can place it,
  // rather than being appended to artwork copy on a guess.
  collectUnassigned(draft, text);

  // ---- Caller-supplied brand claims --------------------------------------
  if (draft.brandName && hints.categoryLabel === undefined) {
    bag.warning(
      CODES.BRIEF_BRAND_CLAIM_UNVERIFIED,
      `Brand name "${draft.brandName}" was taken verbatim from the brief. The platform does not verify brand claims or trademarks.`,
      { path: 'brand.name' },
    );
  }

  return finalize(
    draft,
    bag,
    evidence,
    assumptions,
    openQuestions,
    conflicts,
    requiredAssets,
    hints,
    options,
    scriptAnalysis,
    inlineFacts,
  );
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

function resolveCategory(
  draft: Draft,
  detection: ReturnType<typeof detectCategory>,
  hints: BriefHints,
  evidence: FieldEvidence[],
  openQuestions: OpenQuestion[],
  bag: DiagnosticBag,
): void {
  if (hints.category !== undefined) {
    if (isDesignCategoryId(hints.category)) {
      draft.category = hints.category;
      evidence.push(field('category', 'caller-supplied', `Caller hint: "${hints.category}"`, CONFIDENCE.callerSupplied));
      return;
    }
    bag.warning(CODES.BRIEF_CATEGORY_AMBIGUOUS, `Caller hint category "${hints.category}" is not a documented category ID; it was kept as-is.`, {
      path: 'category',
      hint: 'Use a documented design category ID or a free-form custom label.',
    });
    draft.category = hints.category;
    evidence.push(field('category', 'caller-supplied', `Caller hint: "${hints.category}"`, CONFIDENCE.derivedMedium));
    return;
  }

  if (detection) {
    draft.category = detection.category;
    evidence.push(
      field('category', 'explicit', `Brief names "${detection.term}"`, CONFIDENCE.explicit),
    );
    if (detection.ambiguous) {
      bag.warning(
        CODES.BRIEF_CATEGORY_AMBIGUOUS,
        `The brief mentions several design types (${detection.all.join(', ')}); "${detection.category}" was chosen as the most specific match.`,
        {
          path: 'category',
          hint: 'Confirm the intended output type before planning composition.',
        },
      );
      openQuestions.push({
        field: 'category',
        question: `Which output type is the deliverable: ${detection.all.join(', ')}?`,
        blocking: false,
      });
    }
    return;
  }

  draft.category = 'unspecified';
  evidence.push(field('category', 'unknown', 'No design type is named in the brief or hints', CONFIDENCE.unknown));
  bag.warning(CODES.BRIEF_CATEGORY_AMBIGUOUS, 'The brief does not state a design category; recorded as "unspecified".', {
    path: 'category',
    hint: 'Ask which output type is needed (poster, banner, flyer, business card, social post…).',
  });
  openQuestions.push({
    field: 'category',
    question: 'What kind of design is this (poster, banner, flyer, brochure, business card, social post)?',
    blocking: true,
  });
}

function resolveDimensions(
  draft: Draft,
  dimensions: DetectedDimensions[],
  text: string,
  hints: BriefHints,
  evidence: FieldEvidence[],
  assumptions: RecordedAssumption[],
  openQuestions: OpenQuestion[],
  conflicts: BriefConflict[],
  bag: DiagnosticBag,
  options: ParseBriefOptions,
): void {
  const hintedWidth = hints.width;
  const hintedHeight = hints.height;

  if (hintedWidth !== undefined && hintedHeight !== undefined) {
    draft.width = hintedWidth;
    draft.height = hintedHeight;
    draft.unit = hints.unit ?? 'px';
    evidence.push(
      field(
        'requirements.width/height',
        'caller-supplied',
        `Caller hint: ${hintedWidth} × ${hintedHeight} ${draft.unit}`,
        CONFIDENCE.callerSupplied,
      ),
    );
  } else if (dimensions.length > 0) {
    const first = dimensions[0] as DetectedDimensions;
    draft.width = first.width;
    draft.height = first.height;
    if (first.unit) {
      draft.unit = first.unit;
      evidence.push(field('requirements.unit', 'explicit', `Brief states "${first.raw}"`, CONFIDENCE.explicit));
    } else {
      draft.unit = 'px';
      evidence.push(
        field('requirements.unit', 'assumed', '"px" assumed because the brief gives numbers without a unit', CONFIDENCE.assumed),
      );
      assumptions.push({
        field: 'requirements.unit',
        value: 'px',
        reason: 'The brief states a size but no unit; pixels are the reversible default.',
        question: 'Are those dimensions in pixels, millimetres, or inches?',
      });
    }
    evidence.push(field('requirements.width/height', 'explicit', `Brief states "${first.raw}"`, CONFIDENCE.explicit));

    const distinct = uniqueNumbers(dimensions.map((entry) => `${entry.width}x${entry.height}`));
    const isRange = distinct.length === 2 && /\d\s*[x×*]\s*\d[^\n]{0,12}?(?:-|–|to)\s*\d+\s*[x×*]\s*\d/i.test(text);
    if (distinct.length > 1 && !isRange) {
      const kept = `${first.width}x${first.height}`;
      conflicts.push({
        field: 'requirements.width/height',
        description: `The brief states more than one size: ${distinct.join(', ')}.`,
        resolution: `The first stated size (${kept}) was kept; the others were not applied.`,
      });
      bag.error(
        CODES.BRIEF_DIMENSIONS_AMBIGUOUS,
        `The brief contains conflicting canvas sizes (${distinct.join(', ')}); a plan cannot satisfy both.`,
        {
          path: 'requirements',
          hint: `Confirm the single deliverable size. Kept: ${kept}.`,
        },
      );
      openQuestions.push({
        field: 'requirements.width/height',
        question: `Which size should the design use: ${distinct.join(' or ')}?`,
        blocking: true,
      });
    }
  } else {
    const mediumHint = hints.medium ?? (draft.medium ?? 'digital');
    const fallback = mediumHint === 'print' ? ASSUMED_PRINT_SIZE : ASSUMED_DIGITAL_SIZE;
    draft.width = fallback.width;
    draft.height = fallback.height;
    draft.unit = fallback.unit;
    const sizeLabel = `${fallback.width}×${fallback.height}${fallback.unit}`;
    evidence.push(
      field('requirements.width/height', 'assumed', `No size stated; assumed the common ${sizeLabel} default`, CONFIDENCE.assumed),
    );
    assumptions.push({
      field: 'requirements.width/height',
      value: sizeLabel,
      reason: 'The brief states no dimensions and none were supplied by the caller.',
      question: 'What exact size should the design be?',
    });
    if (options.requireDimensions === true) {
      bag.error(CODES.BRIEF_DIMENSIONS_UNKNOWN, 'The brief states no canvas dimensions and strict mode forbids assuming one.', {
        path: 'requirements',
        hint: 'Ask the user for exact width, height and unit.',
      });
    } else {
      bag.warning(CODES.BRIEF_DIMENSIONS_UNKNOWN, `The brief states no canvas size; the ${sizeLabel} default was assumed and must be confirmed.`, {
        path: 'requirements',
        hint: 'Confirm dimensions with the user before export.',
      });
    }
    openQuestions.push({
      field: 'requirements.width/height',
      question: 'What exact width, height and unit should the design use?',
      blocking: true,
    });
  }
}

function resolveMedium(
  draft: Draft,
  media: Array<'digital' | 'print' | 'both'>,
  hints: BriefHints,
  evidence: FieldEvidence[],
  assumptions: RecordedAssumption[],
  bag: DiagnosticBag,
): void {
  if (hints.medium !== undefined) {
    draft.medium = hints.medium;
    evidence.push(field('requirements.medium', 'caller-supplied', `Caller hint: "${hints.medium}"`, CONFIDENCE.callerSupplied));
    return;
  }
  if (media.length === 1) {
    draft.medium = media[0];
    evidence.push(field('requirements.medium', 'explicit', `Brief mentions "${media[0]}"`, CONFIDENCE.explicit));
    return;
  }
  if (media.length > 1) {
    draft.medium = 'both';
    evidence.push(field('requirements.medium', 'explicit', 'Brief mentions both print and digital', CONFIDENCE.explicit));
    return;
  }

  // Only a *physical* unit or an inherently digital medium is decisive. A pixel
  // canvas is NOT evidence of digital: print work is routinely specified in px.
  const category = draft.category;
  if (category === 'social_media' || category === 'advertising_banner') {
    draft.medium = 'digital';
    evidence.push(field('requirements.medium', 'derived', `Derived from category "${category}"`, CONFIDENCE.derivedHigh));
    return;
  }
  if (
    category === 'business_card' ||
    category === 'flyer' ||
    category === 'brochure' ||
    draft.unit === 'mm' ||
    draft.unit === 'cm' ||
    draft.unit === 'in'
  ) {
    draft.medium = 'print';
    evidence.push(field('requirements.medium', 'derived', 'Derived from the design category and physical unit', CONFIDENCE.derivedMedium));
    return;
  }

  draft.medium = 'unspecified';
  evidence.push(field('requirements.medium', 'unknown', 'The brief does not state print or digital', CONFIDENCE.unknown));
  assumptions.push({
    field: 'requirements.medium',
    value: 'unspecified',
    reason: 'Medium affects colour profile, DPI and export formats, so it was left unspecified rather than guessed.',
    question: 'Is this for print, digital, or both?',
  });
  bag.warning(CODES.BRIEF_MEDIUM_UNSPECIFIED, 'The brief does not say whether the design is for print or digital; recorded as "unspecified".', {
    path: 'requirements.medium',
    hint: 'Medium determines DPI, bleed and export format; confirm before planning output.',
  });
}

function resolveOutputFormats(
  draft: Draft,
  formats: OutputFormat[],
  hints: BriefHints,
  evidence: FieldEvidence[],
  assumptions: RecordedAssumption[],
): void {
  if (hints.outputFormats && hints.outputFormats.length > 0) {
    draft.outputFormats = unique(hints.outputFormats);
    evidence.push(field('requirements.outputFormats', 'caller-supplied', 'Caller hint', CONFIDENCE.callerSupplied));
    return;
  }
  if (formats.length > 0) {
    draft.outputFormats = unique(formats);
    evidence.push(field('requirements.outputFormats', 'explicit', `Brief names ${formats.join(', ')}`, CONFIDENCE.explicit));
    return;
  }
  // Deferred: format default depends on medium, resolved in finalize().
  evidence.push(field('requirements.outputFormats', 'assumed', 'No format stated; a medium-appropriate default applies', CONFIDENCE.assumed));
  assumptions.push({
    field: 'requirements.outputFormats',
    value: 'PDF for print, PNG for digital',
    reason: 'The brief names no export format.',
    question: 'Which format(s) do you need (PDF, PNG, JPEG, SVG)?',
  });
}

function resolveLanguages(
  draft: Draft,
  text: string,
  statedLanguages: string[],
  hints: BriefHints,
  evidence: FieldEvidence[],
  assumptions: RecordedAssumption[],
  openQuestions: OpenQuestion[],
  bag: DiagnosticBag,
): ScriptAnalysis {
  const detected = detectScripts(text);
  const languages: string[] = [];

  for (const language of hints.languages ?? []) {
    const normalized = normalizeLanguageTag(language);
    if (normalized.length > 0) languages.push(normalized);
  }
  const fromHints = languages.length > 0;

  for (const tag of statedLanguages) {
    if (!languages.includes(tag)) languages.push(tag);
  }
  const fromStatement = statedLanguages.length > 0;

  // Script presence is direct evidence of the language actually used in content.
  if (!fromHints && !fromStatement) {
    if (detected.includes('bengali')) languages.push('bn');
    if (detected.includes('arabic')) languages.push('ar');
    if (detected.includes('latin') || detected.length === 0) languages.push('en');
  }

  draft.languages = unique(languages);

  const kind: EvidenceKind = fromHints ? 'caller-supplied' : fromStatement || detected.length > 0 ? 'explicit' : 'assumed';
  const basis = fromStatement
    ? `Brief names ${statedLanguages.join(', ')}`
    : detected.length > 0
      ? `Script detected in the supplied content: ${detected.join(', ')}`
      : 'No language evidence; English assumed';
  evidence.push(field('requirements.languages', kind, basis, kind === 'assumed' ? CONFIDENCE.assumed : CONFIDENCE.explicit));

  if (draft.languages.length === 0) {
    draft.languages = ['en'];
    assumptions.push({
      field: 'requirements.languages',
      value: 'en',
      reason: 'No language could be determined from the brief.',
      question: 'Which language(s) should the design use?',
    });
    bag.warning(CODES.BRIEF_LANGUAGE_UNKNOWN, 'No language could be determined; English is assumed.', {
      path: 'requirements.languages',
    });
  }

  const unsupported = draft.languages.filter((language) => !isSupportedLanguage(language));
  for (const language of unsupported) {
    bag.warning(
      CODES.BRIEF_SCRIPT_UNSUPPORTED,
      `Language "${language}" is not in the documented supported set (English, Bengali, Arabic, Urdu). Shaping support is unverified.`,
      {
        path: 'requirements.languages',
        hint: 'Do not claim correct rendering for this script; flag it for Human Review.',
      },
    );
  }

  const scripts = unique(draft.languages.flatMap((language) => scriptForLanguage(language)?.script ?? ['unknown']));
  const direction = dominantDirection(draft.languages);
  const mixedDirection = direction === 'mixed';

  if (mixedDirection) {
    bag.warning(
      CODES.BRIEF_MIXED_DIRECTION,
      `The brief mixes left-to-right and right-to-left languages (${draft.languages.join(', ')}). Each text run must keep its own direction; the canvas is not mirrored.`,
      {
        path: 'requirements.languages',
        hint: 'Require bidirectional shaping and per-run direction in the typography plan.',
      },
    );
  }

  return {
    languages: draft.languages as LanguageTag[],
    scripts,
    dominantDirection: direction,
    mixedDirection,
    unsupportedLanguages: unsupported,
  };
}

function applyLabelledContent(draft: Draft, labelled: LabelledValue[]): void {
  for (const entry of labelled) {
    switch (entry.field) {
      case 'headline':
        if (!draft.headline) draft.headline = entry.value;
        break;
      case 'subheadline':
        if (!draft.subheadline) draft.subheadline = entry.value;
        break;
      case 'cta':
        if (!draft.cta) draft.cta = entry.value;
        break;
      case 'brand':
        if (!draft.brandName) draft.brandName = entry.value;
        break;
      case 'date':
        if (!draft.date) draft.date = entry.value;
        else draft.details.push(entry.value);
        break;
      case 'time':
        if (!draft.time) draft.time = entry.value;
        else draft.details.push(entry.value);
        break;
      case 'location':
        if (!draft.location) draft.location = entry.value;
        else draft.details.push(entry.value);
        break;
      case 'price':
        if (!draft.price) draft.price = entry.value;
        else draft.details.push(entry.value);
        break;
      case 'contact':
        draft.contact.push(entry.value);
        break;
      case 'audience':
        draft.audience.push(entry.value);
        break;
      case 'objective':
        if (!draft.objective) draft.objective = entry.value;
        break;
      case 'legal':
        draft.legal.push(entry.value);
        break;
      case 'body':
        draft.body.push(entry.value);
        break;
      case 'detail':
        draft.details.push(entry.value);
        break;
    }
  }
}

function applyQuotedHeadline(draft: Draft, quoted: Array<{ span: { start: number; end: number }; text: string }>): void {
  if (draft.headline || quoted.length === 0) return;
  const first = quoted[0];
  if (first) draft.headline = first.text.trim();
}

function applyInlineFacts(draft: Draft, facts: InlineFacts): void {
  // Contact facts are preserved only; they are never synthesised.
  for (const value of [...facts.phones, ...facts.emails, ...facts.urls]) {
    if (!draft.contact.includes(value)) draft.contact.push(value);
  }

  /**
   * A bare date/time/price token is only promoted to its own slot when the same
   * fact is not already inside a captured sentence. Otherwise the canvas would
   * show the fact twice (once in the detail line, once standalone).
   */
  const alreadyContained = (token: string): boolean =>
    [...draft.details, ...draft.body, ...draft.contact].some((entry) => entry.includes(token) && entry !== token);

  if (facts.dates[0] && !draft.date && !alreadyContained(facts.dates[0])) draft.date = facts.dates[0];
  if (facts.times[0] && !draft.time && !alreadyContained(facts.times[0])) draft.time = facts.times[0];
  if (facts.prices[0] && !draft.price && !alreadyContained(facts.prices[0])) draft.price = facts.prices[0];
}

/**
 * Fallback extraction from ordinary sentences.
 *
 * Only used when labelled content did not already supply a slot. Values are
 * whole sentences from the user's text — never trimmed down to fragments, which
 * could change their meaning.
 */
function applySentenceFallbacks(draft: Draft, text: string): void {
  // Instructions to the tool ("Create a poster…", "Include the name…") describe
  // the deliverable; they are never rendered as artwork content.
  const sentences = splitSentences(text).filter(
    (sentence) => !isInstructionSentence(sentence) && !hasLabelPrefix(sentence),
  );

  if (!draft.brandName) {
    const brandMatch = /\b(?:at|from|by)\s+([A-Z][\p{L}\p{N}&.'’ -]{2,60})/u.exec(text);
    const candidate = brandMatch?.[1]?.trim();
    // Only accept when the sentence clearly introduces an organisation and the
    // candidate is not a generic word.
    if (candidate && /\b(?:academy|school|college|institute|university|center|centre|company|studio|foundation|society|clinic|hospital|ltd|limited|inc)\b/i.test(candidate)) {
      draft.brandName = candidate;
    }
  }

  if (draft.details.length === 0) {
    const detailSentences = sentences.filter((sentence) =>
      /\b(?:class|classes|batch|batches|session|sessions|schedule|program|programme|course|courses|subject|subjects|benefit|benefits|offer|offers|discount|scholarship|free|include|includes|available|starting|admission|admissions)\b/i.test(
        sentence,
      ),
    );
    for (const sentence of detailSentences.slice(0, 6)) {
      if (!draft.details.includes(sentence)) draft.details.push(sentence);
    }
  }

  if (draft.body.length === 0) {
    const bodySentences = sentences.filter((sentence) => sentence.length > 40 && !draft.details.includes(sentence));
    for (const sentence of bodySentences.slice(0, 4)) {
      if (sentence !== draft.headline && !draft.body.includes(sentence)) draft.body.push(sentence);
    }
  }
}

function resolveHeadline(
  draft: Draft,
  text: string,
  evidence: FieldEvidence[],
  openQuestions: OpenQuestion[],
  bag: DiagnosticBag,
  options: ParseBriefOptions,
): void {
  if (draft.headline) {
    evidence.push(field('content.headline', 'explicit', 'Provided by the brief', CONFIDENCE.explicit));
    return;
  }

  // A very short standalone first line often *is* the headline.
  const firstLine = splitSentences(text).find(
    (sentence) => !isInstructionSentence(sentence) && !hasLabelPrefix(sentence),
  );
  if (firstLine && firstLine.length <= 80 && !/[।॥.!?]$/.test(firstLine)) {
    draft.headline = firstLine;
    evidence.push(
      field('content.headline', 'derived', `Short leading phrase treated as the headline: "${firstLine}"`, CONFIDENCE.derivedMedium),
    );
    return;
  }

  const detail = options.lenient === true ? bag.warning : bag.error;
  detail.call(
    bag,
    CODES.BRIEF_HEADLINE_MISSING,
    'The brief supplies no primary headline and no short leading phrase could serve as one.',
    {
      path: 'content.headline',
      hint: 'Ask the user for the single most important line. The platform must not write it.',
    },
  );
  openQuestions.push({
    field: 'content.headline',
    question: 'What exact headline text should appear?',
    blocking: true,
  });
}

function collectConstraints(draft: Draft, text: string, facts: InlineFacts, bag: DiagnosticBag): void {
  const add = (kind: BriefConstraint['kind'], re: RegExp, value?: string): void => {
    const match = re.exec(text);
    if (!match) return;
    draft.constraints.push({ kind, quote: match[0], ...(value === undefined ? {} : { value }) });
  };

  add('bleed', /\bbleed\b[^.\n]{0,40}/i);
  add('safe-area', /\bsafe\s*(?:area|zone|margin)s?\b[^.\n]{0,40}/i);
  add('no-images', /\b(?:no images?|without images?|text[- ]only)\b/i);
  add('monochrome', /\b(?:monochrome|black and white|grayscale|greyscale|একরঙা)\b/i);
  add('minimal-text', /\b(?:minimal text|less text|short copy|concise)\b/i);
  add('large-text', /\b(?:large (?:text|print|type)|big text|readable from (?:far|a distance))\b/i);
  add('accessibility', /\b(?:accessible|accessibility|high contrast|visually impaired|dyslexi\w*)\b/i);
  add('legal', /\b(?:terms and conditions|conditions apply|disclaimer|legal)\b/i);
  add('brand-guideline', /\b(?:brand guide(?:line)?s?|brand colors?|brand colours?|use our (?:brand|logo))\b/i);

  const bleedValue = /(\d+(?:\.\d+)?)\s*(mm|cm|in)\s*bleed/i.exec(text);
  if (bleedValue) {
    draft.constraints.push({ kind: 'bleed', quote: bleedValue[0], value: `${bleedValue[1]}${bleedValue[2]}` });
  }

  if (facts.phones.length > 1) {
    bag.warning(
      CODES.BRIEF_CONTACT_UNVERIFIED,
      `The brief contains ${facts.phones.length} phone numbers (${facts.phones.join(', ')}). All are preserved verbatim; none is chosen as "the" contact number.`,
      { path: 'content', hint: 'Ask which number should be primary if the hierarchy needs one.' },
    );
  }
}

// ---------------------------------------------------------------------------
// Finalisation
// ---------------------------------------------------------------------------

function finalize(
  draft: Draft,
  bag: DiagnosticBag,
  evidence: FieldEvidence[],
  assumptions: RecordedAssumption[],
  openQuestions: OpenQuestion[],
  conflicts: BriefConflict[],
  requiredAssets: RequiredAssetRequest[],
  hints: BriefHints,
  options: ParseBriefOptions,
  scriptAnalysis?: ScriptAnalysis,
  inlineFacts?: InlineFacts,
): BriefParseResult {
  const medium: Medium = draft.medium ?? hints.medium ?? 'unspecified';
  const outputFormats = unique(
    draft.outputFormats.length > 0
      ? draft.outputFormats
      : medium === 'print'
        ? DEFAULT_OUTPUT_FOR_PRINT
        : medium === 'digital'
          ? DEFAULT_OUTPUT_FOR_DIGITAL
          : [...DEFAULT_OUTPUT_FOR_PRINT, ...DEFAULT_OUTPUT_FOR_DIGITAL],
  );

  /**
   * Date/time/location/price are "important information" per spec §4.3, and the
   * brief contract has no dedicated slot for them, so they belong in `details`
   * verbatim (never with an added label or reformatted value).
   */
  const details = unique([...draft.details, ...compact([draft.date, draft.time, draft.location, draft.price])]);
  const contactLine = draft.contact.length > 0 ? [draft.contact.join(' · ')] : [];
  const body = unique([...draft.body, ...contactLine, ...draft.legal]);

  const headline = draft.headline;
  const frozenAudience = freeze(unique(draft.audience));
  const frozenBody = freeze(body);
  const frozenDetails = freeze(details);
  const frozenLanguages = freeze(unique(draft.languages) as LanguageTag[]);
  const frozenFormats = freeze(outputFormats);

  const brief: DesignBrief = {
    category: draft.category ?? 'unspecified',
    objective: draft.objective ?? '',
    audience: frozenAudience,
    brand: {
      ...(draft.brandName === undefined ? {} : { name: draft.brandName }),
      ...(draft.brandIdentity === undefined ? {} : { identity: draft.brandIdentity }),
      ...(draft.brandColors.length === 0 ? {} : { colors: freeze(draft.brandColors) }),
    },
    content: {
      ...(headline === undefined ? {} : { headline }),
      ...(draft.subheadline === undefined ? {} : { subheadline: draft.subheadline }),
      body: frozenBody,
      details: frozenDetails,
      ...(draft.cta === undefined ? {} : { cta: draft.cta }),
    },
    visualDirection: {
      mood: freeze(unique(draft.moods)),
      style: freeze(unique(draft.styles)),
      ...(draft.preferredColors.length === 0 ? {} : { preferredColors: freeze(draft.preferredColors) }),
      ...(draft.imageDirection === undefined ? {} : { imageDirection: draft.imageDirection }),
    },
    requirements: {
      width: draft.width ?? ASSUMED_DIGITAL_SIZE.width,
      height: draft.height ?? ASSUMED_DIGITAL_SIZE.height,
      unit: draft.unit ?? 'px',
      languages: frozenLanguages,
      outputFormats: frozenFormats,
      medium,
    },
  };

  // ---- Essential-content check -------------------------------------------
  const hasAnyContent =
    headline !== undefined || draft.subheadline !== undefined || body.length > 0 || details.length > 0 || draft.cta !== undefined;
  if (!hasAnyContent) {
    const report = options.lenient === true ? bag.warning : bag.error;
    report.call(
      bag,
      CODES.BRIEF_CONTENT_MISSING,
      'The brief contains no usable design content (no headline, subheadline, body, details or CTA).',
      {
        path: 'content',
        hint: 'A design cannot be built without content. Ask the user to supply the exact text.',
      },
    );
  }

  // ---- Objective requirement --------------------------------------------
  if (brief.objective.trim().length === 0) {
    // Objective may be legitimately inferred from category later; never invented here.
    openQuestions.push({
      field: 'objective',
      question: 'What should the viewer do or understand after seeing this design?',
      blocking: false,
    });
  }

  // ---- Audience ----------------------------------------------------------
  if (brief.audience.length === 0) {
    openQuestions.push({
      field: 'audience',
      question: 'Who is this design for?',
      blocking: false,
    });
  }

  // ---- Capacity screening (not measurement) ------------------------------
  if (headline !== undefined) {
    const capacity = estimateHeadlineCapacity({
      headline,
      canvasWidth: brief.requirements.width,
      canvasHeight: brief.requirements.height,
      unit: brief.requirements.unit,
    });
    if (capacity.assessment === 'capacity_warning') {
      bag.warning(CODES.BRIEF_FIELD_INVALID, `Headline length may not fit: ${capacity.reason ?? ''}`, {
        path: 'content.headline',
        hint: 'This is a character-count estimate, not measurement; confirm with the typography engine later.',
      });
    }
  }

  // ---- Content classification -------------------------------------------
  const contentClasses: ContentClass[] = [];
  if (headline !== undefined) contentClasses.push('primary-headline');
  if (brief.content.subheadline !== undefined) contentClasses.push('secondary-headline');
  if (draft.date !== undefined) contentClasses.push('date-time');
  if (draft.location !== undefined) contentClasses.push('location');
  if (draft.price !== undefined) contentClasses.push('price');
  if (brief.content.cta !== undefined) contentClasses.push('cta');
  if (brief.brand.name !== undefined) contentClasses.push('brand-information');
  if (draft.contact.length > 0) contentClasses.push('contact-information');
  if (draft.legal.length > 0) contentClasses.push('legal-information');
  if (details.length > 0) contentClasses.push('important-information');
  if (body.length > 0) contentClasses.push('main-body');

  const analysis: BriefAnalysis = {
    evidence: freeze([...evidence]),
    assumptions: freeze([...assumptions]),
    openQuestions: freeze(dedupeQuestions(openQuestions)),
    conflicts: freeze([...conflicts]),
    requiredAssets: freeze([...requiredAssets]),
    script:
      scriptAnalysis ??
      ({
        languages: brief.requirements.languages,
        scripts: freeze(['unknown']),
        dominantDirection: 'unknown',
        mixedDirection: false,
        unsupportedLanguages: freeze([] as string[]),
      } satisfies ScriptAnalysis),
    unassignedContent: freeze(unique(draft.unassigned)),
    constraints: freeze(dedupeConstraints(draft.constraints)),
    contentClasses: freeze(unique(contentClasses)),
    confidence: computeConfidence(evidence),
  };

  // ---- Unassigned-content notice ----------------------------------------
  if (analysis.unassignedContent.length > 0) {
    bag.warning(
      CODES.BRIEF_UNKNOWN_RECORDED,
      `${analysis.unassignedContent.length} piece(s) of content could not be assigned to a slot and were preserved for review.`,
      { path: 'content', hint: 'Review unassignedContent in the analysis before planning.' },
    );
  }

  const diagnostics: readonly Diagnostic[] = bag.all;
  return Object.freeze({
    brief,
    analysis,
    diagnostics,
    ok: !bag.hasErrors,
  });
}

/**
 * Records user prose that was not captured by any content slot.
 *
 * Deliberately conservative: unrecognised prose is *not* pushed onto the canvas
 * (that would invent hierarchy), and it is *not* discarded (that would lose user
 * content). It is surfaced in `analysis.unassignedContent` with a warning.
 */
/** Statements that describe requirements rather than artwork copy. */
const REQUIREMENT_STATEMENT = /\b(?:size|dimensions?|dpi|resolution|format|export|bleed|safe\s*area|print|digital|unit|output|pixels?|mm|cm|inches?)\b|\d+\s*[x×*]\s*\d+/i;

function collectUnassigned(draft: Draft, text: string): void {
  const captured = [
    draft.headline,
    draft.subheadline,
    draft.cta,
    draft.brandName,
    draft.date,
    draft.time,
    draft.location,
    draft.price,
    ...draft.body,
    ...draft.details,
    ...draft.contact,
    ...draft.legal,
    ...draft.audience,
    draft.objective,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();
  const capturedBlob = captured.map(normalize).join(' \u0000 ');

  for (const sentence of splitSentences(text)) {
    const candidate = sentence.trim();
    if (candidate.length < 8) continue;
    if (isInstructionSentence(candidate)) continue;
    if (hasLabelPrefix(candidate)) continue;
    if (REQUIREMENT_STATEMENT.test(candidate)) continue;
    const needle = normalize(candidate);
    if (capturedBlob.includes(needle)) continue;
    // A sentence may be captured as part of a longer labelled value.
    if (captured.some((value) => normalize(value).includes(needle))) continue;
    if (!draft.unassigned.includes(candidate)) draft.unassigned.push(candidate);
  }
}

function computeConfidence(evidence: readonly FieldEvidence[]): number {
  if (evidence.length === 0) return 0;
  const total = evidence.reduce((sum, entry) => sum + entry.confidence, 0);
  return Number((total / evidence.length).toFixed(3));
}

function extractImageDirection(text: string): string | undefined {
  const match = /\b(?:image|photo|photograph|picture|illustration|visual)\s+(?:of|showing|with|should be|:)\s*([^.\n]{3,120})/i.exec(text);
  return match?.[1]?.trim();
}

function matchQuote(text: string, re: RegExp): string {
  return re.exec(text)?.[0] ?? '';
}

function field(fieldName: string, kind: EvidenceKind, basis: string, confidence: number): FieldEvidence {
  return { field: fieldName, kind, basis, confidence };
}

/** Freezes an array of unique values without mutating the caller's array. */
function freeze<T>(values: readonly T[]): T[] {
  return Object.freeze([...values]) as T[];
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function uniqueNumbers(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function compact(values: ReadonlyArray<string | undefined>): string[] {
  return values.filter((value): value is string => value !== undefined && value.trim().length > 0);
}

function dedupeQuestions(questions: readonly OpenQuestion[]): OpenQuestion[] {
  const seen = new Set<string>();
  return questions.filter((question) => {
    if (seen.has(question.field)) return false;
    seen.add(question.field);
    return true;
  });
}

function dedupeConstraints(constraints: readonly BriefConstraint[]): BriefConstraint[] {
  const seen = new Set<string>();
  return constraints.filter((constraint) => {
    const key = `${constraint.kind}:${constraint.quote}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Convenience: parse and throw when the brief has blocking errors. */
export function parseDesignBriefOrThrow(input: string, hints: BriefHints = {}, options: ParseBriefOptions = {}): DesignBrief {
  const result = parseDesignBrief(input, hints, options);
  if (!result.ok) {
    throw new BriefParseError(result);
  }
  return result.brief;
}

/** Thrown by `parseDesignBriefOrThrow`; carries the full result for inspection. */
export class BriefParseError extends Error {
  readonly result: BriefParseResult;
  constructor(result: BriefParseResult) {
    super(`Brief could not be parsed:\n${formatDiagnostics(result.diagnostics)}`);
    this.name = 'BriefParseError';
    this.result = result;
  }
}
