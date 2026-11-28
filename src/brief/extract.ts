/**
 * Deterministic fact extraction from natural-language briefs.
 *
 * DESIGN PRINCIPLE — no invention:
 * Every extractor returns only substrings that appear in the *claimed* content
 * text, or values written by the caller in structured hints. Nothing is
 * generated, translated, normalized or completed. Phone numbers, dates, prices,
 * emails, links and brand names are recognised so they can be preserved and
 * classified — never so they can be rewritten. When a token could be a number of
 * several kinds (a phone number vs. a price vs. a date), the ambiguity is
 * reported rather than guessed.
 *
 * LANGUAGE COVERAGE: recognition keywords exist for the four documented
 * languages (English, Bengali, Arabic, Urdu). Keywords select *labels*; the
 * labelled value is always the user's own text.
 */

export interface Span {
  readonly start: number;
  readonly end: number;
}

/** A labelled piece of user content: the label is ours, the value is theirs. */
export interface LabelledValue {
  /** Canonical content class. */
  readonly field:
    | 'headline'
    | 'subheadline'
    | 'cta'
    | 'brand'
    | 'date'
    | 'time'
    | 'location'
    | 'price'
    | 'contact'
    | 'audience'
    | 'objective'
    | 'detail'
    | 'body'
    | 'legal';
  /** The user's text, verbatim (whitespace-trimmed at the ends only). */
  readonly value: string;
  /** The label token that triggered recognition. */
  readonly label?: string;
  readonly origin: 'labelled' | 'quoted' | 'inline' | 'structured-hint';
}

const LABEL_PATTERNS: ReadonlyArray<{ readonly field: LabelledValue['field']; readonly label: string; readonly re: RegExp }> = [
  // Headline / subheadline
  { field: 'headline', label: 'headline', re: /\b(?:headline|head line|title|heading)\b/i },
  { field: 'headline', label: 'main headline', re: /\bmain (?:headline|title|heading|message)\b/i },
  { field: 'subheadline', label: 'subheadline', re: /\b(?:subheadline|sub-headline|subhead|sub-title|subtitle|tagline|kicker)\b/i },
  // CTA
  { field: 'cta', label: 'cta', re: /\b(?:cta|call[- ]to[- ]action|button text|action text)\b/i },
  // Brand
  { field: 'brand', label: 'institution name', re: /\b(?:institution|company|organi[sz]ation|business|brand|studio|centre|center|school|college|university|academy|coaching)\s+(?:name|title)\b/i },
  // Date / time
  { field: 'date', label: 'date', re: /\b(?:date|dates|deadline|last date|starts? on|begins? on)\b/i },
  { field: 'time', label: 'time', re: /\b(?:time|timing|timings)\b/i },
  // Location
  { field: 'location', label: 'location', re: /\b(?:location|venue|address|addresses|place)\b/i },
  // Price
  { field: 'price', label: 'price', re: /\b(?:price|prices|fee|fees|cost|tuition|admission fee)\b/i },
  // Contact
  { field: 'contact', label: 'contact', re: /\b(?:contact|phone|mobile|tel|telephone|call|whatsapp|hotline|helpline|email|e-mail|website|web site|url|link|social)\b/i },
  // Audience
  { field: 'audience', label: 'audience', re: /\b(?:audience|target audience|target group|viewers|readers)\b/i },
  // Objective
  { field: 'objective', label: 'objective', re: /\b(?:objective|purpose|goal|aim|so that|in order to)\b/i },
  // Legal
  { field: 'legal', label: 'legal', re: /\b(?:terms and conditions|terms|conditions apply|disclaimer|legal)\b/i },
  // Body / details
  { field: 'body', label: 'body', re: /\b(?:body|body text|caption|description|paragraph|copy)\b/i },
  { field: 'detail', label: 'details', re: /\b(?:details|class information|classes|schedule|programs?|programmes?|requirements?|highlights?)\b/i },
];

/** Bengali / Arabic / Urdu label keywords, mapped to the same canonical fields. */
const NON_LATIN_LABEL_PATTERNS: ReadonlyArray<{ readonly field: LabelledValue['field']; readonly label: string; readonly re: RegExp }> = [
  { field: 'headline', label: 'শিরোনাম', re: /শিরোনাম|শিরোনামঃ/u },
  { field: 'headline', label: 'العنوان', re: /العنوان/u },
  { field: 'subheadline', label: 'উপশিরোনাম', re: /উপশিরোনাম/u },
  { field: 'cta', label: 'কল টু অ্যাকশন', re: /কল\s*টু\s*অ্যাকশন|অ্যাকশন/u },
  { field: 'contact', label: 'যোগাযোগ', re: /যোগাযোগ|ফোন|মোবাইল/u },
  { field: 'contact', label: 'اتصال', re: /اتصال|رابط|فون|موبائل/u },
  { field: 'date', label: 'তারিখ', re: /তারিখ/u },
  { field: 'date', label: 'التاريخ', re: /التاريخ/u },
  { field: 'time', label: 'الوقت', re: /الوقت/u },
  { field: 'location', label: 'العنوان', re: /العنوان|المكان/u },
  { field: 'price', label: 'السعر', re: /السعر|الرسوم/u },
  { field: 'subheadline', label: 'العنوان الفرعي', re: /العنوان الفرعي/u },
  { field: 'detail', label: 'التفاصيل', re: /التفاصيل/u },
  { field: 'brand', label: 'اسم المؤسسة', re: /اسم (?:المؤسسة|الشركة|المدرسة)/u },
  { field: 'time', label: 'সময়', re: /সময়/u },
  { field: 'price', label: 'ফি', re: /ফি|মূল্য/u },
  { field: 'location', label: 'ঠিকানা', re: /ঠিকানা|স্থান/u },
  { field: 'audience', label: 'দর্শক', re: /দর্শক/u },
  { field: 'detail', label: 'বিবরণ', re: /বিবরণ|বিস্তারিত|ক্লাস|শ্রেণি/u },
  { field: 'cta', label: 'আবেদন', re: /আবেদন করুন|রেজিস্ট্রেশন/u },
  { field: 'cta', label: 'سجل', re: /سجل الآن|التسجيل/u },
  { field: 'audience', label: 'الجمهور', re: /الجمهور|الفئة المستهدفة/u },
  { field: 'price', label: 'السعر', re: /السعر|الرسوم/u },
];

/** Detects quoted user content: "…", '…', “…” . The quotation marks are dropped; inner text is preserved. */
export function extractQuotedSpans(text: string): Array<{ span: Span; text: string }> {
  const results: Array<{ span: Span; text: string }> = [];
  const re = /["“”'‘’]([^"“”'‘’]{2,200})["“”'‘’]/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const inner = match[1];
    if (inner === undefined) continue;
    const start = match.index + 1;
    results.push({ span: { start, end: start + inner.length }, text: inner });
  }
  return results;
}

/**
 * Finds `label: value` / `label — value` / `label is value` pairs.
 *
 * The value extends to the end of the line or the next sentence terminator,
 * which keeps multi-word content intact. Trailing connective punctuation is
 * trimmed from the *value boundaries only*; the characters themselves are
 * otherwise untouched.
 */
export function extractLabelledValues(text: string): LabelledValue[] {
  const out: LabelledValue[] = [];
  const lines = splitLines(text);
  for (const line of lines) {
    const found = matchLabelledLine(line.text);
    if (found) out.push({ ...found, value: found.value });
  }
  return out;
}

interface LineChunk {
  readonly text: string;
  readonly offset: number;
}

/**
 * Splits on newlines *and* on sentence terminators in Latin, Bengali and Arabic
 * scripts, preserving offsets.
 *
 * Segmenting on terminators matters because users commonly write a brief as one
 * paragraph separated by periods (`শিরোনাম: ভর্তি চলছে ২০২৬। যোগাযোগ: …`), and label
 * extraction must see each `label: value` pair on its own.
 */
export function splitLines(text: string): LineChunk[] {
  const chunks: LineChunk[] = [];
  const re = /[^\n]+?(?=[।॥.!?])|[^\n]+/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const value = match[0];
    if (value.trim().length === 0) continue;
    chunks.push({ text: value, offset: match.index });
  }
  if (chunks.length === 0) chunks.push({ text, offset: 0 });
  return chunks;
}

/**
 * True when a statement begins with a recognised `label:` prefix.
 *
 * Used so that content already captured into a slot is not also appended to the
 * body as loose prose (which would duplicate the same fact in two slots).
 */
export function hasLabelPrefix(statement: string): boolean {
  const separator = /^([^:：—–-]{2,40}?)\s*(?::|：|—|–|-|\bis\b|\bare\b)\s*(.+)$/u.exec(statement.trim());
  const labelText = separator?.[1];
  if (!labelText) return false;
  return [...LABEL_PATTERNS, ...NON_LATIN_LABEL_PATTERNS].some((candidate) => candidate.re.test(labelText));
}

/**
 * Sentence-level split used after label extraction, preserving order.
 *
 * Recognises the Bengali danda (`।`), double danda (`॥`), the Urdu full stop
 * (`۔`) and the Arabic question mark (`؟`) alongside the Latin terminators, so a
 * single-paragraph Bengali or Arabic brief still yields separate statements.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[।॥.!?。！？؟۔])\s*|\n+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Matches `label: rest` at the start of a segment, in Latin or supported
 * non-Latin scripts. Returns `undefined` when no label is present.
 */
function matchLabelledLine(line: string): LabelledValue | undefined {
  const separator = /^([^:：—–-]{2,40}?)\s*(?::|：|—|–|-|\bis\b|\bare\b)\s*(.+)$/u.exec(line.trim());
  if (!separator) return undefined;
  const labelText = separator[1];
  const value = separator[2];
  if (labelText === undefined || value === undefined) return undefined;
  if (value.trim().length === 0) return undefined;

  const pattern = [...LABEL_PATTERNS, ...NON_LATIN_LABEL_PATTERNS].find((candidate) => candidate.re.test(labelText));
  if (!pattern) return undefined;
  return { field: pattern.field, label: pattern.label, value: value.trim(), origin: 'labelled' };
}

/**
 * Contact-number candidates.
 *
 * Restricted to ASCII digits and an explicit `+` prefix. Bengali and Arabic-Indic
 * numerals are *not* matched, because a run such as `২০২৬` (a year) would be
 * mistaken for a phone number. Converting script digits just to match them would
 * also risk altering user content; those runs stay in `details` verbatim instead.
 */
const PHONE_RE = /(?:\+\d[\d\s().-]{6,}\d|\b\d[\d\s().-]{6,}\d\b)/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s,;]+/i;
const MONEY_RE = /(?:[৳$€£₹]|\b(?:BDT|USD|EUR|GBP|INR|SAR|AED)\b)\s?\d[\d,.]*|\d[\d,.]*\s?(?:৳|USD|EUR|GBP|INR|SAR|AED|taka|tk)\b/i;
const DATE_RE =
  /\b(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December))\b/i;
const TIME_RE = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm|AM|PM|a\.m\.|p\.m\.)\b|\b\d{1,2}[:.]\d{2}\s?(?:to|-|–)\s?\d{1,2}[:.]\d{2}\b/;

export interface InlineFacts {
  readonly phones: string[];
  readonly emails: string[];
  readonly urls: string[];
  readonly prices: string[];
  readonly dates: string[];
  readonly times: string[];
}

/** Finds factual tokens. Values are returned exactly as written. */
export function extractInlineFacts(text: string): InlineFacts {
  const collect = (re: RegExp): string[] => {
    const flags = re.flags.includes('g') ? re : new RegExp(re.source, `${re.flags}g`);
    const matches = text.match(flags);
    return matches ? [...matches].map((match) => match.trim()) : [];
  };
  return {
    phones: collect(PHONE_RE).filter((candidate) => candidate.replace(/\D/g, '').length >= 7),
    emails: collect(EMAIL_RE),
    urls: collect(URL_RE),
    prices: collect(MONEY_RE),
    dates: collect(DATE_RE),
    times: collect(TIME_RE),
  };
}

/** True when the text contains contact facts (phone, email, URL). */
export function hasContactFacts(facts: InlineFacts): boolean {
  return facts.phones.length > 0 || facts.emails.length > 0 || facts.urls.length > 0;
}

/**
 * Detects a repeated factual token, which usually means the user supplied the
 * same fact twice (e.g. a phone number in both a sentence and a "Contact:" line).
 * Repetition is not an error; duplication in the plan would be.
 */
export function findRepeatedFacts(facts: InlineFacts): string[] {
  const all = [...facts.phones, ...facts.emails, ...facts.urls];
  const counts = new Map<string, number>();
  for (const value of all) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

const DIMENSION_RE =
  /([\p{Nd}]+(?:[.,]\p{Nd}+)?)\s*[x×*]\s*([\p{Nd}]+(?:[.,]\p{Nd}+)?)\s*(px|pixels?|mm|cm|in|inch|inches|পিক্সেল|মিমি|সেমি|ইঞ্চি|مم|سم|بوصة)?/iu;
const UNIT_WORD_MAP: Readonly<Record<string, 'px' | 'mm' | 'cm' | 'in'>> = Object.freeze({
  px: 'px',
  pixel: 'px',
  pixels: 'px',
  'পিক্সেল': 'px',
  mm: 'mm',
  'মিমি': 'mm',
  'مم': 'mm',
  cm: 'cm',
  'সেমি': 'cm',
  'سم': 'cm',
  in: 'in',
  inch: 'in',
  inches: 'in',
  'ইঞ্চি': 'in',
  'بوصة': 'in',
});

export interface DetectedDimensions {
  readonly width: number;
  readonly height: number;
  /** `undefined` when the brief names no unit — callers must not assume pixels. */
  readonly unit?: 'px' | 'mm' | 'cm' | 'in';
  /** The matched text, for evidence. */
  readonly raw: string;
}

/** Extracts `W x H unit` dimension statements. Unit stays `undefined` if unstated. */
export function extractDimensions(text: string): DetectedDimensions[] {
  const results: DetectedDimensions[] = [];
  const re = new RegExp(DIMENSION_RE.source, 'giu');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const widthText = match[1];
    const heightText = match[2];
    const unitText = match[3];
    if (widthText === undefined || heightText === undefined) continue;
    const width = toLatinNumber(widthText);
    const height = toLatinNumber(heightText);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
    const unit = unitText === undefined ? undefined : UNIT_WORD_MAP[unitText.toLowerCase()];
    results.push({ width, height, ...(unit === undefined ? {} : { unit }), raw: match[0] });
  }
  return results;
}

/**
 * Category keywords with explicit specificity weights.
 *
 * Weighting replaces "longest string wins", which is meaningless across
 * scripts (an Arabic "إعلان" is shorter than a Bengali "পোস্টার" but not more
 * general). Weights express how specific the noun is: a named deliverable
 * ("business card", "social media post") outranks a generic synonym
 * ("advertisement", "ad"); ties are reported as ambiguity.
 */
const CATEGORY_KEYWORDS: ReadonlyArray<{
  readonly category: string;
  readonly weight: number;
  readonly terms: readonly string[];
}> = [
  { category: 'business_card', weight: 30, terms: ['business card', 'visiting card', 'name card', 'কার্ড', 'بطاقة'] },
  { category: 'social_media', weight: 30, terms: ['social media', 'instagram', 'facebook', 'story', 'reel', 'carousel', 'সোশ্যাল মিডিয়া', 'سوشل میڈیا'] },
  { category: 'magazine_cover', weight: 30, terms: ['magazine cover', 'magazine', 'cover page', 'পত্রিকা', 'ম্যাগাজিন', 'رسالہ'] },
  { category: 'brochure', weight: 25, terms: ['brochure', 'booklet', 'catalogue', 'catalog', 'পুস্তিকা', 'ব্রোশিওর', 'كتيب', 'بروشر'] },
  { category: 'flyer', weight: 25, terms: ['flyer', 'handbill', 'leaflet', 'handout', 'লিফলেট', 'ফ্লায়ার', 'منشور', 'فلائر'] },
  { category: 'poster', weight: 25, terms: ['poster', 'পোস্টার', 'ملصق', 'پوسٹر'] },
  { category: 'corporate_material', weight: 20, terms: ['letterhead', 'stationery', 'annual report', 'proposal', 'presentation', 'company profile', 'প্রতিবেদন', 'تقریر'] },
  { category: 'advertising_banner', weight: 15, terms: ['banner', 'advertisement', 'advert', 'advertising', 'billboard', 'hoarding', 'ad', 'ads', 'বিজ্ঞাপন', 'إعلان', 'اشتہار'] },
];

export interface DetectedCategory {
  readonly category: string;
  readonly term: string;
  /** `true` when more than one category matched with comparable strength. */
  readonly ambiguous: boolean;
  readonly all: readonly string[];
}

/**
 * Classifies the design category from explicit nouns.
 *
 * Category is never guessed from subject matter ("admission" does not imply a
 * poster). When several categories are named, the most specific match wins and
 * the ambiguity is reported so the caller can ask.
 */
export function detectCategory(text: string): DetectedCategory | undefined {
  const lower = text.toLowerCase();
  const hits: Array<{ category: string; term: string; weight: number; index: number }> = [];
  for (const { category, weight, terms } of CATEGORY_KEYWORDS) {
    for (const term of terms) {
      const index = lower.indexOf(term);
      if (index !== -1) hits.push({ category, term, weight, index });
    }
  }
  if (hits.length === 0) return undefined;

  // Highest specificity wins; earliest mention breaks a specificity tie.
  hits.sort((a, b) => b.weight - a.weight || a.index - b.index);
  const best = hits[0];
  if (!best) return undefined;
  const runnerUp = hits.find((hit) => hit.category !== best.category);
  const categories = [...new Set(hits.map((hit) => hit.category))];
  return {
    category: best.category,
    term: best.term,
    ambiguous: runnerUp !== undefined && runnerUp.weight === best.weight,
    all: categories,
  };
}

const MEDIUM_TERMS: ReadonlyArray<{ readonly medium: 'digital' | 'print' | 'both'; readonly terms: readonly string[] }> = [
  { medium: 'print', terms: ['print', 'printed', 'printing', 'press', 'offset', 'মুদ্রণ', 'ছাপা', 'طباعة'] },
  { medium: 'digital', terms: ['digital', 'online', 'social', 'screen', 'web', 'ডিজিটাল', 'অনলাইন', 'ডিজিটাল', 'رقمي'] },
];

export function detectMedia(text: string): Array<'digital' | 'print' | 'both'> {
  const lower = text.toLowerCase();
  const found = new Set<'digital' | 'print'>();
  for (const { medium, terms } of MEDIUM_TERMS) {
    if (terms.some((term) => lower.includes(term))) {
      if (medium !== 'both') found.add(medium);
    }
  }
  if (found.size === 2) return ['both'];
  return [...found];
}

const ALLOWED_OUTPUTS: ReadonlyArray<{ readonly format: 'svg' | 'png' | 'jpeg' | 'pdf'; readonly re: RegExp }> = [
  { format: 'svg', re: /\bsvg\b/i },
  { format: 'png', re: /\bpng\b/i },
  { format: 'jpeg', re: /\bjpe?g\b/i },
  { format: 'pdf', re: /\bpdf\b/i },
];

export function detectOutputFormats(text: string): Array<'svg' | 'png' | 'jpeg' | 'pdf'> {
  return ALLOWED_OUTPUTS.filter((entry) => entry.re.test(text)).map((entry) => entry.format);
}

/** Language names and their tags, in the brief's own languages. */
const LANGUAGE_TERMS: ReadonlyArray<{ readonly tag: string; readonly terms: readonly string[] }> = [
  { tag: 'en', terms: ['english', 'ইংরেজি', 'ইংরেজী', 'انگریزی', 'anglais'] },
  { tag: 'bn', terms: ['bengali', 'bangla', 'বাংলা', 'বাংলা', 'بنگالی'] },
  { tag: 'ar', terms: ['arabic', 'العربية', 'عربي', 'আরবি'] },
  { tag: 'ur', terms: ['urdu', 'اردو', 'উর্দু'] },
];

export function detectStatedLanguages(text: string): string[] {
  const lower = text.toLowerCase();
  return LANGUAGE_TERMS.filter((entry) => entry.terms.some((term) => lower.includes(term))).map((entry) => entry.tag);
}

const STYLE_KEYWORDS: ReadonlyArray<{ readonly styleId: string; readonly terms: readonly string[] }> = [
  { styleId: 'minimalist', terms: ['minimal', 'minimalist', 'clean', 'simple', 'সাদাসিধা', 'সরল', 'بسیار سادہ'] },
  { styleId: 'luxury', terms: ['luxury', 'premium', 'elegant', 'high-end', 'বিলাসবহুল', 'প্রিমিয়াম', 'لگژری'] },
  { styleId: 'neo-brutalism', terms: ['brutalist', 'neubrutalism', 'neo-brutalist', 'brutal'] },
  { styleId: 'swiss-international', terms: ['swiss', 'international style', 'grid-based', 'typographic'] },
  { styleId: 'editorial', terms: ['editorial', 'magazine-style', 'magazine style'] },
  { styleId: 'bauhaus', terms: ['bauhaus', 'geometric'] },
  { styleId: 'art-deco', terms: ['art deco', 'deco'] },
  { styleId: 'modern-corporate', terms: ['corporate', 'professional', 'business', 'trustworthy', 'প্রফেশনাল', 'কর্পোরেট'] },
  { styleId: 'experimental-typography', terms: ['experimental', 'bold type', 'typographic art'] },
  { styleId: 'vintage-advertising', terms: ['vintage', 'retro'] },
  { styleId: 'pop-art', terms: ['pop art'] },
  { styleId: 'cinematic-graphic', terms: ['cinematic', 'dramatic'] },
];

export function detectStyles(text: string): string[] {
  const lower = text.toLowerCase();
  return STYLE_KEYWORDS.filter((entry) => entry.terms.some((term) => lower.includes(term))).map((entry) => entry.styleId);
}

const MOOD_KEYWORDS: ReadonlyArray<{ readonly mood: string; readonly terms: readonly string[] }> = [
  { mood: 'premium', terms: ['premium', 'luxury', 'exclusive', 'প্রিমিয়াম', 'বিলাসবহুল'] },
  { mood: 'energetic', terms: ['energetic', 'dynamic', 'exciting', 'vibrant', 'প্রাণবন্ত'] },
  { mood: 'trustworthy', terms: ['trustworthy', 'reliable', 'credible', 'serious', 'বিশ্বাসযোগ্য'] },
  { mood: 'friendly', terms: ['friendly', 'warm', 'welcoming', 'বন্ধুত্বপূর্ণ'] },
  { mood: 'modern', terms: ['modern', 'contemporary', 'fresh', 'আধুনিক'] },
  { mood: 'elegant', terms: ['elegant', 'refined', 'sophisticated', 'মার্জিত'] },
  { mood: 'playful', terms: ['playful', 'fun', 'youthful', 'মজার'] },
  { mood: 'urgent', terms: ['urgent', 'last chance', 'limited', 'deadline', 'জরুরি'] },
  { mood: 'calm', terms: ['calm', 'serene', 'quiet', 'শান্ত'] },
  { mood: 'professional', terms: ['professional', 'formal', 'পেশাদার'] },
  { mood: 'educational', terms: ['educational', 'academic', 'শিক্ষামূলক', 'শিক্ষা'] },
  { mood: 'cultural', terms: ['cultural', 'traditional', 'heritage', 'সাংস্কৃতিক'] },
];

export function detectMoods(text: string): string[] {
  const lower = text.toLowerCase();
  return MOOD_KEYWORDS.filter((entry) => entry.terms.some((term) => lower.includes(term))).map((entry) => entry.mood);
}

const COLOR_WORDS: Readonly<Record<string, string>> = Object.freeze({
  black: '#000000',
  white: '#ffffff',
  red: '#d32f2f',
  blue: '#1565c0',
  green: '#2e7d32',
  yellow: '#f9a825',
  orange: '#ef6c00',
  purple: '#6a1b9a',
  pink: '#ad1457',
  gold: '#c9a227',
  silver: '#b0bec5',
  grey: '#757575',
  gray: '#757575',
  navy: '#0d2b52',
  maroon: '#6d1b1b',
  teal: '#00695c',
  brown: '#5d4037',
  beige: '#d7ccc8',
  cream: '#f5f0e6',
  'কালো': '#000000',
  'সাদা': '#ffffff',
  'লাল': '#d32f2f',
  'নীল': '#1565c0',
  'সবুজ': '#2e7d32',
  'হলুদ': '#f9a825',
});

/**
 * Recognises explicit hex colors and common color words.
 *
 * A word like "gold" becomes a named preference only; the mapped hex is a
 * starting value recorded in `preferredColors`, and the original word is kept in
 * the evidence. Brand colors quoted as hex are preserved exactly.
 */
export function detectColorPreferences(text: string): { hexes: string[]; words: string[] } {
  const hexes = [...text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0]);
  const lower = text.toLowerCase();
  const words = Object.keys(COLOR_WORDS).filter((word) => new RegExp(`\\b${word}\\b`, 'iu').test(lower));
  return { hexes, words };
}

export function colorWordToHex(word: string): string | undefined {
  return COLOR_WORDS[word];
}

/** Audience phrases such as "for students" / "targeting parents and teachers". */
const LEADING_ARTICLE = /^(?:a|an|the)\s+/i;
export function extractAudience(text: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\bfor\s+([^.,;:\n]{3,80})/gi,
    /\btarget(?:ed|ing)?\s+(?:at\s+)?([^.,;:\n]{3,80})/gi,
    /\baudience\s*(?::|is|are)?\s*([^.,;:\n]{3,80})/gi,
    /\baimed\s+at\s+([^.,;:\n]{3,80})/gi,
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const phrase = match[1]?.trim().replace(LEADING_ARTICLE, '');
      if (phrase && phrase.length >= 3) out.push(phrase);
    }
  }
  return [...new Set(out)];
}

/**
 * Objective phrases such as "objective: announce the new admission".
 *
 * Only explicit objective markers are accepted. A bare "to …" clause is *not*
 * treated as the objective, because in ordinary prose it usually continues a
 * different thought ("Class 6 to 10", "5 to 7 pm") and would produce a wrong
 * objective — a communication error that is worse than an empty field.
 */
export function extractObjective(text: string): string | undefined {
  const explicit = /\b(?:objective|purpose|goal|aim)\s*(?::|is|—|-)\s*([^.!?\n]{4,160})/i.exec(text);
  const value = explicit?.[1]?.trim();
  return value && value.length > 2 ? value : undefined;
}

/** Phrases that indicate the user wants something the platform cannot do yet. */
export interface UnsupportedRequest {
  readonly feature: string;
  readonly quote: string;
}

const UNSUPPORTED_REQUESTS: ReadonlyArray<{ readonly feature: string; readonly re: RegExp }> = [
  { feature: 'video animation', re: /\b(?:animate|animation|animated|video|motion graphic|gif)\b/i },
  { feature: 'three-dimensional rendering', re: /\b(?:3d render|render in 3d|three-dimensional model)\b/i },
  { feature: 'copywriting generated by the platform', re: /\b(?:write the copy for me|invent (?:a |the )?(?:name|slogan)|come up with (?:a )?(?:name|tagline))\b/i },
  { feature: 'logo design with trademark clearance', re: /\b(?:guarantee (?:no )?trademark|legally cleared logo)\b/i },
];

export function detectUnsupportedRequests(text: string): UnsupportedRequest[] {
  const out: UnsupportedRequest[] = [];
  for (const { feature, re } of UNSUPPORTED_REQUESTS) {
    const match = re.exec(text);
    if (match) out.push({ feature, quote: match[0] });
  }
  return out;
}

const SCRIPT_DIGIT_ZEROS = ['\u09E6', '\u0660', '\u06F0'] as const;

/**
 * Reads a number written in Bengali, Arabic-Indic or Extended Arabic-Indic digits.
 *
 * Used only to *interpret* a stated dimension (a canvas size is a number the
 * parser must understand, not content it must reproduce). The original text stays
 * untouched everywhere else.
 */
export function toLatinNumber(value: string): number {
  const normalized = value.replace(/[\u09E6-\u09EF\u0660-\u0669\u06F0-\u06F9]/g, (digit) => {
    for (const zero of SCRIPT_DIGIT_ZEROS) {
      const code = digit.codePointAt(0) ?? 0;
      const zeroCode = zero.codePointAt(0) ?? 0;
      const offset = code - zeroCode;
      if (offset >= 0 && offset <= 9) return String(offset);
    }
    return digit;
  });
  return Number(normalized.replace(',', '.'));
}

/**
 * Instructions to the tool rather than content for the artwork.
 *
 * These sentences describe *what to build*; they must never be rendered as
 * visible copy. Detection is intentionally conservative: a sentence is only
 * treated as an instruction when it opens with an imperative or describes the
 * document itself ("Create a poster…", "Include …", "Use a minimal style…").
 */
const INSTRUCTION_PATTERNS: readonly RegExp[] = Object.freeze([
  /^\s*(?:please\s+)?(?:create|design|make|build|generate|produce|prepare|draft|draw|come up)\b/i,
  /^\s*(?:please\s+)?(?:include|add|use|avoid|keep|ensure|make sure|do not|don't|must|should|need|need to)\b/i,
  /^\s*(?:the\s+)?(?:design|poster|banner|flyer|card|document|layout)\s+(?:should|must|needs?)\b/i,
  /^\s*(?:তৈরি করুন|তৈরি কর|ডিজাইন করুন|অন্তর্ভুক্ত করুন|ব্যবহার করুন)/u,
  /^\s*(?:أنشئ|صمم|اصنع|تضمين|استخدم)/u,
  /^\s*(?:بنائیں|ڈیزائن کریں|شامل کریں)/u,
]);

/** True when the sentence is an instruction to the tool, not artwork content. */
export function isInstructionSentence(sentence: string): boolean {
  return INSTRUCTION_PATTERNS.some((re) => re.test(sentence));
}

/** Normalises inline whitespace only; never changes characters or order. */
export function collapseWhitespace(value: string): string {
  return value.replace(/[ \t\u00a0]+/g, ' ').trim();
}
