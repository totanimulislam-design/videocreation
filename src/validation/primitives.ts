/**
 * Typed readers for validating untrusted values.
 *
 * AI output and persisted documents arrive as `unknown`. These helpers convert
 * `unknown` into typed values while recording a diagnostic at a precise path, so
 * every validator reads structurally instead of trusting shapes.
 *
 * Convention: a reader returns `undefined` when the value is unusable and the
 * failure has been recorded. Callers must stop descending at that point rather
 * than inventing a default, because a silent default is how invalid documents
 * reach renderers.
 */

import { CODES, type DiagnosticBag, type DiagnosticCode } from '../core/diagnostics.ts';

export type AnyRecord = Record<string, unknown>;

/** True for non-null, non-array objects. */
export function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export interface ReaderContext {
  readonly bag: DiagnosticBag;
}

/** Describes a value's runtime type for error messages. */
export function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  return typeof value;
}

/** Requires `value` to be an object at `path`. */
export function readObject(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  label: string,
  code: DiagnosticCode = CODES.INVALID_TYPE,
): AnyRecord | undefined {
  if (!isRecord(value)) {
    ctx.bag.error(code, `${label} must be an object, received ${describeType(value)}.`, { path });
    return undefined;
  }
  return value;
}

/** Requires `value` to be an array at `path`. */
export function readArray(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  label: string,
  options: { minLength?: number; code?: DiagnosticCode } = {},
): unknown[] | undefined {
  if (!Array.isArray(value)) {
    ctx.bag.error(options.code ?? CODES.INVALID_TYPE, `${label} must be an array, received ${describeType(value)}.`, {
      path,
    });
    return undefined;
  }
  if (options.minLength !== undefined && value.length < options.minLength) {
    ctx.bag.error(
      CODES.REQUIRED,
      `${label} must contain at least ${options.minLength} item${options.minLength === 1 ? '' : 's'}; received ${value.length}.`,
      { path },
    );
  }
  return value;
}

/** Requires a non-empty string, with an optional shape pattern. */
export function readString(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  label: string,
  options: { pattern?: RegExp; patternHint?: string; code?: DiagnosticCode; allowEmpty?: boolean } = {},
): string | undefined {
  if (value === undefined) {
    ctx.bag.error(options.code ?? CODES.REQUIRED, `${label} is required.`, { path });
    return undefined;
  }
  if (typeof value !== 'string') {
    ctx.bag.error(options.code ?? CODES.INVALID_TYPE, `${label} must be a string, received ${describeType(value)}.`, {
      path,
    });
    return undefined;
  }
  if (!options.allowEmpty && value.trim().length === 0) {
    ctx.bag.error(options.code ?? CODES.REQUIRED, `${label} must not be empty.`, { path });
    return undefined;
  }
  if (options.pattern && !options.pattern.test(value)) {
    ctx.bag.error(options.code ?? CODES.UNEXPECTED_VALUE, `${label} is malformed: ${JSON.stringify(value)}.`, {
      path,
      ...(options.patternHint === undefined ? {} : { hint: options.patternHint }),
    });
    return undefined;
  }
  return value;
}

/** Requires a finite number, optionally within `[min, max]`. */
export function readNumber(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  label: string,
  options: { min?: number; max?: number; exclusiveMin?: number; code?: DiagnosticCode } = {},
): number | undefined {
  if (value === undefined) {
    ctx.bag.error(CODES.REQUIRED, `${label} is required.`, { path });
    return undefined;
  }
  if (!isFiniteNumber(value)) {
    ctx.bag.error(
      options.code ?? CODES.INVALID_TYPE,
      `${label} must be a finite number, received ${describeType(value)}${typeof value === 'number' ? ` (${value})` : ''}.`,
      { path },
    );
    return undefined;
  }
  if (options.exclusiveMin !== undefined && value <= options.exclusiveMin) {
    ctx.bag.error(options.code ?? CODES.UNEXPECTED_VALUE, `${label} must be greater than ${options.exclusiveMin}; received ${value}.`, {
      path,
    });
    return undefined;
  }
  if (options.min !== undefined && value < options.min) {
    ctx.bag.error(options.code ?? CODES.UNEXPECTED_VALUE, `${label} must be at least ${options.min}; received ${value}.`, {
      path,
    });
    return undefined;
  }
  if (options.max !== undefined && value > options.max) {
    ctx.bag.error(options.code ?? CODES.UNEXPECTED_VALUE, `${label} must be at most ${options.max}; received ${value}.`, {
      path,
    });
    return undefined;
  }
  return value;
}

/** Requires a boolean. */
export function readBoolean(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  label: string,
): boolean | undefined {
  if (value === undefined) {
    ctx.bag.error(CODES.REQUIRED, `${label} is required.`, { path });
    return undefined;
  }
  if (typeof value !== 'boolean') {
    ctx.bag.error(CODES.INVALID_TYPE, `${label} must be a boolean, received ${describeType(value)}.`, { path });
    return undefined;
  }
  return value;
}

/** Requires one of a closed set of string literals. */
export function readEnum<T extends string>(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  label: string,
  allowed: readonly T[],
  code: DiagnosticCode = CODES.UNEXPECTED_VALUE,
): T | undefined {
  if (value === undefined) {
    ctx.bag.error(CODES.REQUIRED, `${label} is required.`, { path });
    return undefined;
  }
  if (typeof value !== 'string') {
    ctx.bag.error(CODES.INVALID_TYPE, `${label} must be a string, received ${describeType(value)}.`, { path });
    return undefined;
  }
  if (!(allowed as readonly string[]).includes(value)) {
    ctx.bag.error(code, `${label} must be one of ${allowed.map((item) => `"${item}"`).join(', ')}; received "${value}".`, {
      path,
    });
    return undefined;
  }
  return value as T;
}

/** Reads a string record such as `DesignTokens.colors`. */
export function readStringRecord(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  label: string,
): Record<string, string> | undefined {
  const record = readObject(ctx, value, path, label);
  if (!record) return undefined;
  const out: Record<string, string> = {};
  let failed = false;
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== 'string') {
      ctx.bag.error(CODES.INVALID_TYPE, `${label}["${key}"] must be a string, received ${describeType(entry)}.`, {
        path: `${path}.${key}`,
      });
      failed = true;
      continue;
    }
    out[key] = entry;
  }
  return failed ? undefined : out;
}

/** Reads a numeric record such as `DesignTokens.spacing`. */
export function readNumberRecord(
  ctx: ReaderContext,
  value: unknown,
  path: string,
  label: string,
  options: { min?: number } = {},
): Record<string, number> | undefined {
  const record = readObject(ctx, value, path, label);
  if (!record) return undefined;
  const out: Record<string, number> = {};
  let failed = false;
  for (const [key, entry] of Object.entries(record)) {
    if (!isFiniteNumber(entry)) {
      ctx.bag.error(CODES.INVALID_TYPE, `${label}["${key}"] must be a finite number, received ${describeType(entry)}.`, {
        path: `${path}.${key}`,
      });
      failed = true;
      continue;
    }
    if (options.min !== undefined && entry < options.min) {
      ctx.bag.error(CODES.UNEXPECTED_VALUE, `${label}["${key}"] must be at least ${options.min}; received ${entry}.`, {
        path: `${path}.${key}`,
      });
      failed = true;
      continue;
    }
    out[key] = entry;
  }
  return failed ? undefined : out;
}

/** Reports an unknown but permitted extra key, without failing the document. */
export function noteUnknownKeys(
  ctx: ReaderContext,
  record: AnyRecord,
  known: readonly string[],
  path: string,
  label: string,
): void {
  const extras = Object.keys(record).filter((key) => !known.includes(key));
  if (extras.length === 0) return;
  ctx.bag.warning(
    CODES.UNEXPECTED_VALUE,
    `${label} has unrecognised field${extras.length === 1 ? '' : 's'} ${extras.map((key) => `"${key}"`).join(', ')}; they are preserved but not validated.`,
    { path },
  );
}
