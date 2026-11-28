/**
 * Stable identifier generation and checking.
 *
 * IDs in the design contract are "stable within a document" and must be unique
 * (spec §3.1, §13.1). Stability across sessions matters for editing, undo and
 * revision diffs, so factories derive IDs deterministically from a caller
 * supplied scope rather than from randomness. Randomness is available for
 * one-off documents, but it is explicit (`randomId`), never implicit.
 */

/** Characters permitted in an ID: letters, digits, `-`, `_`, `.`, `:` and `/`. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
export const MAX_ID_LENGTH = 128;

/** True when `value` is a structurally valid, non-empty ID. */
export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH && ID_PATTERN.test(value);
}

/** Collapses arbitrary text into an ID-safe slug. Never returns an empty string. */
export function slugify(input: string, fallback = 'item'): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug.length > 0 ? slug : fallback;
}

/** Counts occurrences of each ID; used to report duplicates deterministically. */
export function findDuplicateIds(ids: readonly string[]): Array<{ id: string; count: number; indices: number[] }> {
  const seen = new Map<string, number[]>();
  ids.forEach((id, index) => {
    const existing = seen.get(id);
    if (existing) existing.push(index);
    else seen.set(id, [index]);
  });
  const duplicates: Array<{ id: string; count: number; indices: number[] }> = [];
  for (const [id, indices] of seen) {
    if (indices.length > 1) duplicates.push({ id, count: indices.length, indices });
  }
  return duplicates;
}

/**
 * Deterministic, collision-resistant ID maker.
 *
 * Given the same prefix + key sequence, the same IDs are produced, which keeps
 * generated documents diffable and keeps tests reproducible.
 */
export function createIdFactory(prefix: string): (key: string | number) => string {
  const used = new Map<string, number>();
  return (key: string | number): string => {
    const base = `${prefix}-${slugify(String(key))}`;
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  };
}

/**
 * Non-deterministic ID for user-created or one-off documents.
 *
 * Uses `globalThis.crypto` when available; falls back to a time-based value so
 * the function never throws in constrained runtimes. Callers that need
 * deterministic output must use `createIdFactory` instead.
 */
export function randomId(prefix: string): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const suffix =
    cryptoApi && typeof cryptoApi.randomUUID === 'function'
      ? cryptoApi.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
}
