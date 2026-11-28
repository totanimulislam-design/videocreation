/**
 * Typography test fixtures.
 *
 * Fonts are real, OpenType-capable, SIL OFL 1.1 licensed Noto faces committed
 * under `tests/fixtures/fonts/` (see `OFL.txt` there and `docs/TYPOGRAPHY.md` for
 * provenance and SHA-256 digests). They are required: a typography engine cannot
 * be tested meaningfully with fake metrics, and Bengali conjuncts or Arabic
 * joining cannot be simulated.
 *
 * The set is deliberately small (≈1.4 MB total) and covers the documented
 * scripts plus weight variants:
 * - Noto Sans Bengali Regular/Bold — Bengali conjuncts, kar, phala, ref, digits
 * - Noto Sans Arabic Regular — Arabic contextual joining and marks
 * - Noto Nastaliq Urdu Regular — Urdu Nastaliq shaping
 * - Noto Sans Regular — Latin shaping and mixed-script fallback
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import type { Diagnostic } from '../../src/core/diagnostics.ts';
import { createTypographyEngine } from '../../src/index.ts';
import type {
  RegisterFontInput,
  TypographyEngine,
  TypographyEngineOptions,
  TypographyToken,
} from '../../src/index.ts';

export const FONT_DIR = fileURLToPath(new URL('./fonts/', import.meta.url));

export const FONT_FILES = {
  bengaliRegular: 'NotoSansBengali-Regular.ttf',
  bengaliBold: 'NotoSansBengali-Bold.ttf',
  arabicRegular: 'NotoSansArabic-Regular.ttf',
  nastaliqRegular: 'NotoNastaliqUrdu-Regular.ttf',
  latinRegular: 'NotoSans-Regular.ttf',
} as const;

export type FontFixtureName = (typeof FONT_FILES)[keyof typeof FONT_FILES];

export function fontBytes(name: keyof typeof FONT_FILES): Uint8Array {
  const file = readFileSync(join(FONT_DIR, FONT_FILES[name]));
  return new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
}

export function fontPath(name: keyof typeof FONT_FILES): string {
  return join(FONT_DIR, FONT_FILES[name]);
}

export function fontSource(name: keyof typeof FONT_FILES): RegisterFontInput['source'] {
  return { kind: 'path', path: fontPath(name) } as RegisterFontInput['source'];
}

/** Registration inputs for one fully populated engine. */
export const TEST_FONTS: readonly RegisterFontInput[] = Object.freeze([
  { family: 'Noto Sans Bengali', source: { kind: 'path', path: fontPath('bengaliRegular') }, weight: 400, scripts: ['bengali'] },
  { family: 'Noto Sans Bengali', source: { kind: 'path', path: fontPath('bengaliBold') }, weight: 700, scripts: ['bengali'] },
  { family: 'Noto Sans Arabic', source: { kind: 'path', path: fontPath('arabicRegular') }, weight: 400, scripts: ['arabic'] },
  { family: 'Noto Nastaliq Urdu', source: { kind: 'path', path: fontPath('nastaliqRegular') }, weight: 400, scripts: ['urdu'] },
  { family: 'Noto Sans', source: { kind: 'path', path: fontPath('latinRegular') }, weight: 400, scripts: ['latin'] },
]);

/** Engine preloaded with every fixture font. */
export function createTestEngine(options: TypographyEngineOptions = {}): Promise<TypographyEngine> {
  return createTypographyEngine({ ...options, fonts: options.fonts ?? TEST_FONTS });
}

/**
 * Default typography tokens per script.
 *
 * Line heights are chosen above each fixture's ascent+descent so tests that are
 * not about tight leading do not collect `TEXT_LINE_HEIGHT_BELOW_METRICS`.
 */
export const TYPOGRAPHY: Readonly<Record<'latin' | 'bengali' | 'arabic' | 'urdu', TypographyToken>> = Object.freeze({
  latin: Object.freeze({ fontFamily: 'Noto Sans', fontSize: 40, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }),
  bengali: Object.freeze({ fontFamily: 'Noto Sans Bengali', fontSize: 40, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }),
  arabic: Object.freeze({ fontFamily: 'Noto Sans Arabic', fontSize: 40, fontWeight: 400, lineHeight: 2.2, letterSpacing: 0 }),
  urdu: Object.freeze({ fontFamily: 'Noto Nastaliq Urdu', fontSize: 40, fontWeight: 400, lineHeight: 2.6, letterSpacing: 0 }),
});

/** True when a diagnostic with `code` is present. */
export function has(diagnostics: readonly Diagnostic[], code: string): boolean {
  return diagnostics.some((diagnostic) => diagnostic.code === code);
}

/** Codes present in a diagnostic list, for assertions and failure messages. */
export function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

/** Floating-point comparison helper for measured lengths. */
export function closeTo(actual: number, expected: number, tolerance = 1e-6): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Encodes a TrueType/OpenType `sfnt` file as a WOFF 1.0 container.
 *
 * Used to prove the WOFF decoder against the real fixture font rather than
 * shipping a second binary. With `compress: true` the tables are zlib-deflated,
 * which exercises the decoder's inflate branch; otherwise they are stored
 * verbatim (`compLength === origLength`), which WOFF permits.
 */
export function makeWoff(sfnt: Uint8Array, compress = false): Uint8Array {
  const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const flavor = view.getUint32(0, false);
  const numTables = view.getUint16(4, false);
  interface Table {
    tag: number;
    offset: number;
    length: number;
    checksum: number;
  }
  const tables: Table[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const base = 12 + i * 16;
    tables.push({
      tag: view.getUint32(base, false),
      checksum: view.getUint32(base + 4, false),
      offset: view.getUint32(base + 8, false),
      length: view.getUint32(base + 12, false),
    });
  }
  tables.sort((a, b) => a.tag - b.tag);

  const chunks: Uint8Array[] = [];
  const entries: Array<{ tag: number; offset: number; compLength: number; origLength: number; checksum: number }> = [];
  let offset = 44 + numTables * 20;
  let sfntSize = 12 + numTables * 16;
  for (const table of tables) {
    const raw = sfnt.subarray(table.offset, table.offset + table.length);
    const deflated = compress ? new Uint8Array(deflateSync(Buffer.from(raw))) : undefined;
    const payload = deflated && deflated.byteLength < raw.byteLength ? deflated : raw;
    entries.push({
      tag: table.tag,
      offset,
      compLength: payload.byteLength,
      origLength: table.length,
      checksum: table.checksum,
    });
    chunks.push(payload);
    offset += payload.byteLength;
    while (offset % 4 !== 0) {
      chunks.push(new Uint8Array(1));
      offset += 1;
    }
    sfntSize += (table.length + 3) & ~3;
  }

  const total = offset;
  const out = new Uint8Array(total);
  const outView = new DataView(out.buffer);
  out.set([0x77, 0x4f, 0x46, 0x46], 0); // 'wOFF'
  outView.setUint32(4, flavor, false);
  outView.setUint32(8, total, false);
  outView.setUint16(12, numTables, false);
  outView.setUint16(14, 0, false);
  outView.setUint32(16, sfntSize, false);
  entries.forEach((entry, index) => {
    const base = 44 + index * 20;
    outView.setUint32(base, entry.tag, false);
    outView.setUint32(base + 4, entry.offset, false);
    outView.setUint32(base + 8, entry.compLength, false);
    outView.setUint32(base + 12, entry.origLength, false);
    outView.setUint32(base + 16, entry.checksum, false);
  });
  let cursor = 44 + numTables * 20;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return out;
}

/** Deflated WOFF container (exercises the inflate path of the decoder). */
export function makeCompressedWoff(sfnt: Uint8Array): Uint8Array {
  return makeWoff(sfnt, true);
}
