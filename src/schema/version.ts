/**
 * Schema versioning for the canonical design contract.
 *
 * The contract itself is owned by `DESIGN_ENGINE_SPEC.md` §3 (see
 * `src/schema/types.ts`). This module is the single place that decides which
 * persisted versions can be read, so that migrations have one owner instead of
 * ad-hoc checks scattered through parsers and validators.
 */

/**
 * Current contract version written by factories.
 *
 * Semantics follow semver for the *wire contract* only: it is independent of a
 * user's edit/revision `DesignDocument.version` counter (spec §3.1).
 *
 * - major: a breaking change to required fields, units, or reference semantics
 * - minor: additive optional fields (backward compatible)
 * - patch: validation/clarification only, no shape change
 */
export const SCHEMA_VERSION = '1.0.0' as const;

/**
 * Persisted versions this build can read and validate.
 *
 * Only versions listed here pass document validation. Reading a future major
 * version is refused explicitly rather than silently mis-read.
 */
export const SUPPORTED_SCHEMA_VERSIONS: readonly string[] = Object.freeze(['1.0.0']);

const SCHEMA_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export interface ParsedSchemaVersion {
  major: number;
  minor: number;
  patch: number;
}

/** Parses a schema version string, returning `undefined` when malformed. */
export function parseSchemaVersion(value: string): ParsedSchemaVersion | undefined {
  const match = SCHEMA_VERSION_PATTERN.exec(value);
  if (!match) return undefined;
  const [, major, minor, patch] = match;
  if (major === undefined || minor === undefined || patch === undefined) return undefined;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

/** True when `value` is a version this build can validate. */
export function isSupportedSchemaVersion(value: unknown): boolean {
  return typeof value === 'string' && SUPPORTED_SCHEMA_VERSIONS.includes(value);
}

/** Highest supported version, used for "upgrade available" diagnostics. */
export function latestSupportedSchemaVersion(): string {
  const versions = SUPPORTED_SCHEMA_VERSIONS.map(parseSchemaVersion).filter(
    (value): value is ParsedSchemaVersion => value !== undefined,
  );
  versions.sort((a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch);
  const newest = versions[versions.length - 1];
  return newest ? `${newest.major}.${newest.minor}.${newest.patch}` : SCHEMA_VERSION;
}

/**
 * Compares two schema versions by numeric precedence.
 * Returns a negative number when `left < right`, positive when `left > right`.
 */
export function compareSchemaVersions(left: string, right: string): number {
  const a = parseSchemaVersion(left);
  const b = parseSchemaVersion(right);
  if (!a || !b) throw new TypeError(`Invalid schema version comparison: "${left}" vs "${right}"`);
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}
