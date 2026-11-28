/**
 * Font container handling: source loading, format detection, WOFF decoding.
 *
 * The shaping engine (HarfBuzz, via `harfbuzzjs`) consumes raw `sfnt` bytes —
 * TrueType (`glyf`) or OpenType (`CFF`). It does **not** decompress the web-font
 * containers. This module performs the one container transform the engine
 * supports (WOFF 1.0 → sfnt) with Node's built-in zlib, and reports every other
 * container as unsupported instead of pretending to parse it.
 *
 * Explicitly unsupported, with the reason recorded rather than hidden:
 * - **WOFF2** (`wOF2`): its `glyf`/`loca` transform is a nontrivial decoding
 *   stage that this engine does not implement, so registering it fails with
 *   `FONT_FORMAT_UNSUPPORTED`. Convert the face to TTF/OTF/WOFF first.
 * - **TrueType collections** (`ttcf`): multiple faces in one file; selecting a
 *   face index is not exposed, so the file is rejected rather than silently
 *   using face 0.
 *
 * Failures are returned as values, never thrown: font registration is a
 * boundary where user-supplied bytes arrive (`AGENTS.md` §4).
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import type { FontFormat, FontSource, FontSourceKind } from './types.ts';

/** The largest font file the engine will accept, in bytes (32 MiB). */
export const MAX_FONT_BYTES = 32 * 1024 * 1024;

/** Structural failure while loading a font. Converted to a diagnostic by callers. */
export interface FontLoadIssue {
  readonly code:
    | 'FONT_SOURCE_INVALID'
    | 'FONT_DATA_EMPTY'
    | 'FONT_FORMAT_UNSUPPORTED'
    | 'FONT_PARSE_FAILED';
  readonly message: string;
  readonly hint?: string;
}

export interface LoadedFontBytes {
  readonly ok: boolean;
  readonly bytes?: Uint8Array;
  readonly kind?: FontSourceKind;
  readonly issue?: FontLoadIssue;
}

function isUint8Array(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

/** Normalises the three accepted byte inputs into a `Uint8Array` view. */
function toBytes(value: Uint8Array | ArrayBuffer): Uint8Array | undefined {
  if (isUint8Array(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return undefined;
}

/** Decodes a `data:` URI synchronously (base64 only, per RFC 2397 common form). */
function decodeDataUri(uri: string): LoadedFontBytes {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri);
  if (!match) {
    return {
      ok: false,
      kind: 'data-uri',
      issue: {
        code: 'FONT_SOURCE_INVALID',
        message: 'Font data URI could not be parsed.',
        hint: 'Use `data:font/ttf;base64,<data>` or pass raw bytes instead.',
      },
    };
  }
  const isBase64 = match[2] === ';base64';
  const payload = match[3] ?? '';
  try {
    const bytes = isBase64
      ? Uint8Array.from(Buffer.from(payload, 'base64'))
      : Uint8Array.from(Buffer.from(decodeURIComponent(payload), 'binary'));
    return finishBytes(bytes, 'data-uri');
  } catch {
    return {
      ok: false,
      kind: 'data-uri',
      issue: { code: 'FONT_SOURCE_INVALID', message: 'Font data URI payload could not be decoded.' },
    };
  }
}

function finishBytes(bytes: Uint8Array, kind: FontSourceKind): LoadedFontBytes {
  if (bytes.byteLength === 0) {
    return { ok: false, kind, issue: { code: 'FONT_DATA_EMPTY', message: 'Font source is empty.' } };
  }
  if (bytes.byteLength > MAX_FONT_BYTES) {
    return {
      ok: false,
      kind,
      issue: {
        code: 'FONT_SOURCE_INVALID',
        message: `Font source is ${bytes.byteLength} bytes, above the ${MAX_FONT_BYTES}-byte limit.`,
      },
    };
  }
  return { ok: true, bytes, kind };
}

/**
 * Resolves any accepted font source to bytes.
 *
 * `path` sources use `node:fs`; the engine therefore targets Node. Supplying
 * bytes keeps the engine usable from any host that can read a font file.
 */
export function loadFontSource(source: FontSource | Uint8Array | ArrayBuffer): LoadedFontBytes {
  if (isUint8Array(source) || source instanceof ArrayBuffer) {
    const bytes = toBytes(source);
    if (!bytes) {
      return {
        ok: false,
        issue: { code: 'FONT_SOURCE_INVALID', message: 'Font source must be bytes, an ArrayBuffer, or a FontSource object.' },
      };
    }
    return finishBytes(bytes, 'bytes');
  }

  const described = source as FontSource;
  switch (described.kind) {
    case 'bytes': {
      const bytes = toBytes(described.bytes);
      if (!bytes) {
        return { ok: false, kind: 'bytes', issue: { code: 'FONT_SOURCE_INVALID', message: '`source.bytes` is not a Uint8Array.' } };
      }
      return finishBytes(bytes, 'bytes');
    }
    case 'path': {
      try {
        const bytes = readFileSync(described.path);
        return finishBytes(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), 'path');
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown read failure';
        return {
          ok: false,
          kind: 'path',
          issue: { code: 'FONT_SOURCE_INVALID', message: `Font file could not be read: ${reason}` },
        };
      }
    }
    case 'data-uri':
      return decodeDataUri(described.uri);
    default:
      return {
        ok: false,
        issue: {
          code: 'FONT_SOURCE_INVALID',
          message: 'Unrecognised font source. Use `{ kind: "bytes" | "path" | "data-uri" }`, raw bytes, or an ArrayBuffer.',
        },
      };
  }
}

/** Reads the 4-byte container signature as ASCII. */
function signature(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < 4; i += 1) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

/**
 * Detects the container format from the first four bytes.
 *
 * Detection is structural, not guessed from a file extension: a `.ttf` file that
 * actually contains a WOFF container is reported as WOFF.
 */
export function detectFontFormat(bytes: Uint8Array): FontFormat {
  if (bytes.byteLength < 4) return 'unknown';
  const tag = signature(bytes);
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'OTTO') return 'opentype';
  if (tag === 'ttcf') return 'collection';
  if (tag === 'true' || tag === 'typ1') return 'truetype';
  // 0x00010000 big-endian: the standard TrueType sfnt version.
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return 'truetype';
  return 'unknown';
}

export interface DecodedFont {
  readonly ok: boolean;
  /** `sfnt` bytes ready for HarfBuzz. */
  readonly sfnt?: Uint8Array;
  readonly format: FontFormat;
  readonly issue?: FontLoadIssue;
}

/** Rounds up to the next multiple of four, as the sfnt format requires. */
function align4(value: number): number {
  return value % 4 === 0 ? value : value + (4 - (value % 4));
}

/**
 * Converts a WOFF 1.0 container into raw `sfnt` bytes.
 *
 * WOFF stores each table deflate-compressed (or verbatim when compression would
 * grow it). Reassembly follows the WOFF 1.0 specification: a 44-byte header, a
 * 20-byte directory entry per table, tables ordered by tag and padded to a
 * four-byte boundary.
 */
export function decodeWoffToSfnt(bytes: Uint8Array): DecodedFont {
  try {
    if (bytes.byteLength < 44) {
      return { ok: false, format: 'woff', issue: { code: 'FONT_PARSE_FAILED', message: 'WOFF header is truncated.' } };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const numTables = view.getUint16(12, false);
    const totalSfntSize = view.getUint32(16, false);
    if (numTables === 0 || numTables > 4096) {
      return { ok: false, format: 'woff', issue: { code: 'FONT_PARSE_FAILED', message: `WOFF declares an implausible table count (${numTables}).` } };
    }
    if (44 + numTables * 20 > bytes.byteLength) {
      return { ok: false, format: 'woff', issue: { code: 'FONT_PARSE_FAILED', message: 'WOFF table directory is truncated.' } };
    }
    // `flavor` (offset 4) is the sfnt version of the decompressed font.
    const flavor = view.getUint32(4, false);

    interface TableEntry {
      tag: number;
      offset: number;
      compLength: number;
      origLength: number;
      checksum: number;
    }
    const entries: TableEntry[] = [];
    for (let i = 0; i < numTables; i += 1) {
      const base = 44 + i * 20;
      entries.push({
        tag: view.getUint32(base, false),
        offset: view.getUint32(base + 4, false),
        compLength: view.getUint32(base + 8, false),
        origLength: view.getUint32(base + 12, false),
        checksum: view.getUint32(base + 16, false),
      });
    }

    const tableData: Uint8Array[] = [];
    let dataLength = 0;
    for (const entry of entries) {
      if (entry.origLength === 0) {
        return { ok: false, format: 'woff', issue: { code: 'FONT_PARSE_FAILED', message: 'WOFF contains a zero-length table.' } };
      }
      if (entry.offset + entry.compLength > bytes.byteLength) {
        return { ok: false, format: 'woff', issue: { code: 'FONT_PARSE_FAILED', message: 'WOFF table data extends past the end of the file.' } };
      }
      const slice = bytes.subarray(entry.offset, entry.offset + entry.compLength);
      let table: Uint8Array;
      if (entry.compLength === entry.origLength) {
        table = slice;
      } else {
        const inflated = inflateSync(slice);
        if (inflated.byteLength !== entry.origLength) {
          return {
            ok: false,
            format: 'woff',
            issue: {
              code: 'FONT_PARSE_FAILED',
              message: `WOFF table decompressed to ${inflated.byteLength} bytes, expected ${entry.origLength}.`,
            },
          };
        }
        table = new Uint8Array(inflated.buffer, inflated.byteOffset, inflated.byteLength);
      }
      tableData.push(table);
      dataLength += align4(table.byteLength);
    }

    const headerSize = 12 + numTables * 16;
    const totalSize = headerSize + dataLength;
    if (totalSfntSize !== 0 && totalSfntSize !== totalSize) {
      // Not fatal: some encoders round differently. The rebuilt size is authoritative.
    }
    const sfnt = new Uint8Array(totalSize);
    const out = new DataView(sfnt.buffer);
    out.setUint32(0, flavor, false);
    out.setUint16(4, numTables, false);
    const maxPower = 2 ** Math.floor(Math.log2(numTables));
    const searchRange = maxPower * 16;
    out.setUint16(6, searchRange, false);
    out.setUint16(8, Math.log2(maxPower), false);
    out.setUint16(10, numTables * 16 - searchRange, false);

    // The sfnt directory must be sorted by tag ascending.
    const ordered = entries
      .map((entry, index) => ({ entry, table: tableData[index] }))
      .sort((a, b) => a.entry.tag - b.entry.tag);

    let cursor = headerSize;
    ordered.forEach(({ entry, table }, index) => {
      if (!table) return;
      const recordBase = 12 + index * 16;
      out.setUint32(recordBase, entry.tag, false);
      out.setUint32(recordBase + 4, entry.checksum, false);
      out.setUint32(recordBase + 8, cursor, false);
      out.setUint32(recordBase + 12, entry.origLength, false);
      sfnt.set(table.subarray(0, entry.origLength), cursor);
      cursor += align4(entry.origLength);
    });

    return { ok: true, format: 'woff', sfnt };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown decode failure';
    return { ok: false, format: 'woff', issue: { code: 'FONT_PARSE_FAILED', message: `WOFF could not be decoded: ${reason}` } };
  }
}

/**
 * Produces raw `sfnt` bytes from any container the engine supports.
 *
 * Unsupported containers return `ok: false` with `format` set, so the caller can
 * name the format in the diagnostic instead of reporting a vague parse failure.
 */
export function toSfntBytes(bytes: Uint8Array): DecodedFont {
  const format = detectFontFormat(bytes);
  switch (format) {
    case 'truetype':
    case 'opentype':
      return { ok: true, format, sfnt: bytes };
    case 'woff':
      return decodeWoffToSfnt(bytes);
    case 'woff2':
      return {
        ok: false,
        format,
        issue: {
          code: 'FONT_FORMAT_UNSUPPORTED',
          message: 'WOFF2 fonts are not supported by this engine.',
          hint: 'Convert the font to TTF, OTF, or WOFF 1.0 before registering it. WOFF2\'s glyf/loca transform is not implemented here.',
        },
      };
    case 'collection':
      return {
        ok: false,
        format,
        issue: {
          code: 'FONT_FORMAT_UNSUPPORTED',
          message: 'TrueType/OpenType collections (.ttc/.otc) are not supported.',
          hint: 'Extract the individual face and register it as a stand-alone TTF/OTF file.',
        },
      };
    default:
      return {
        ok: false,
        format,
        issue: {
          code: 'FONT_FORMAT_UNSUPPORTED',
          message: 'Unrecognised font container format.',
          hint: 'Supported inputs are TrueType (TTF), OpenType/CFF (OTF) and WOFF 1.0.',
        },
      };
  }
}
