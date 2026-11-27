/**
 * Normalizes user-supplied content for deterministic comparison.
 *
 * The comparison is deliberately forgiving about whitespace, casing and
 * typographic punctuation (a designer may set an en dash or a curly quote), but
 * never about the actual characters of names, numbers, prices or dates.
 */
export function normalizeForComparison(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
