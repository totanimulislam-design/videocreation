#!/usr/bin/env node
/**
 * Compiles design-pattern metadata from `DESIGN_PATTERNS_LIBRARY.md`.
 *
 * Why a generator instead of hand-written pattern data:
 * - The patterns library is the authoritative source of pattern meaning
 *   (`DESIGN_PATTERNS_LIBRARY.md` §1, §19). Hand-copying 100 entries into a
 *   second table would immediately drift and create a competing pattern schema.
 * - The document's shape is stable and machine-readable enough: each pattern is
 *   `## Pnn — Name` followed by `**Structure:**`, `**Construction:**`,
 *   `**Best for:**` lines (§19.1 maps these to meaning/implementation/use).
 *
 * Output: `src/knowledge/generated/patterns.generated.ts` — a checked-in data
 * module so the runtime and tests never parse Markdown, and so a doc change is
 * caught by a drift test until the module is regenerated.
 *
 * Usage: `npm run generate:knowledge`
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..');
const SOURCE_DOC = join(REPO_ROOT, 'DESIGN_PATTERNS_LIBRARY.md');
const OUTPUT_FILE = join(REPO_ROOT, 'src/knowledge/generated/patterns.generated.ts');

/** Section heading → pattern category ID used by the schema and validator. */
const SECTION_CATEGORIES: ReadonlyArray<readonly [RegExp, string]> = Object.freeze([
  [/^# 3\. Professional Poster/, 'poster'],
  [/^# 4\. Advertising & Promotional/, 'advertising'],
  [/^# 5\. Editorial & Magazine/, 'editorial'],
  [/^# 6\. Typography-Led/, 'typography'],
  [/^# 7\. Image-Led/, 'image-led'],
  [/^# 8\. Geometric, Abstract/, 'geometric'],
  [/^# 9\. Information, Data/, 'information'],
  [/^# 10\. Brochure, Multi-Panel/, 'brochure'],
  [/^# 11\. Business Card/, 'identity'],
  [/^# 12\. Social Media/, 'digital'],
]);

export interface PatternSourceEntry {
  id: string;
  name: string;
  category: string;
  meaning: string;
  implementation: string[];
  useCases: string[];
}

const PATTERN_HEADING = /^## (P\d{2,3}) — (.+)$/;
const FIELD = /^\*\*(Structure|Construction|Best for):\*\*\s*(.*)$/;

/** Parses the patterns library Markdown into structured entries. */
export function parsePatternLibrary(markdown: string): PatternSourceEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: PatternSourceEntry[] = [];
  let category: string | undefined;
  let current: PatternSourceEntry | undefined;
  let collecting: 'construction' | 'use' | undefined;

  const flush = (): void => {
    if (!current) return;
    if (!current.category) throw new Error(`Pattern ${current.id} has no recognised section category`);
    if (!current.meaning) throw new Error(`Pattern ${current.id} is missing a Structure description`);
    entries.push(current);
    current = undefined;
    collecting = undefined;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('# ')) {
      flush();
      category = SECTION_CATEGORIES.find(([pattern]) => pattern.test(line))?.[1];
      continue;
    }

    const heading = PATTERN_HEADING.exec(line);
    if (heading) {
      flush();
      const [, id, name] = heading;
      if (id === undefined || name === undefined) continue;
      current = {
        id,
        name: name.trim(),
        category: category ?? '',
        meaning: '',
        implementation: [],
        useCases: [],
      };
      collecting = undefined;
      continue;
    }

    if (!current) continue;

    const field = FIELD.exec(line);
    if (field) {
      const [, label, value] = field;
      if (label === 'Structure') {
        current.meaning = (value ?? '').trim();
        collecting = undefined;
      } else {
        collecting = label === 'Construction' ? 'construction' : 'use';
      }
      if (value && value.trim() && (label === 'Best for')) current.useCases.push(value.trim());
      continue;
    }

    if (line.startsWith('## ') || line.startsWith('---')) {
      flush();
      collecting = undefined;
      continue;
    }

    const bullet = /^-\s+(.*)$/.exec(line);
    if (bullet && bullet[1]) {
      if (collecting === 'construction') current.implementation.push(bullet[1].trim());
      else if (collecting === 'use') current.useCases.push(bullet[1].trim());
      continue;
    }

    if (line.trim() === '') {
      // A blank line ends the current bullet block but keeps the pattern open.
      collecting = undefined;
    }
  }
  flush();

  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) throw new Error(`Duplicate pattern ID ${entry.id} in library`);
    seen.add(entry.id);
  }
  return entries;
}

/** Serialises entries into a typed, document-order-preserving TS module. */
export function renderPatternModule(entries: PatternSourceEntry[]): string {
  const rows = entries.map((entry) => {
    const implementation = entry.implementation.map((item) => `      ${quote(item)},`).join('\n');
    const useCases = entry.useCases.map((item) => `      ${quote(item)},`).join('\n');
    return [
      '  {',
      `    id: ${quote(entry.id)},`,
      `    name: ${quote(entry.name)},`,
      `    category: ${quote(entry.category)},`,
      `    meaning: ${quote(entry.meaning)},`,
      '    implementation: [',
      implementation,
      '    ],',
      '    useCases: [',
      useCases,
      '    ],',
      '  },',
    ]
      .filter((line) => line !== '')
      .join('\n');
  });

  return `// AUTO-GENERATED — do not edit by hand.
// Source: DESIGN_PATTERNS_LIBRARY.md §§3–12 (pattern catalogue).
// Regenerate: npm run generate:knowledge
//
// This module carries pattern *metadata* (stable ID, name, category, meaning,
// implementation notes, use cases). It deliberately contains no coordinates and
// no layout: geometry is computed by the Design Engine from the plan, content
// measurements and canvas (library §19.2, §20).

import type { PatternCategory } from '../patterns.ts';

export interface GeneratedPatternEntry {
  readonly id: string;
  readonly name: string;
  readonly category: PatternCategory;
  readonly meaning: string;
  readonly implementation: readonly string[];
  readonly useCases: readonly string[];
}

export const GENERATED_PATTERNS: readonly GeneratedPatternEntry[] = Object.freeze([
${rows.join('\n')}
]);
`;
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function main(): Promise<void> {
  const markdown = await readFile(SOURCE_DOC, 'utf8');
  const entries = parsePatternLibrary(markdown);

  const categoryIds = new Set(entries.map((entry) => entry.category));
  const expectedCategories = SECTION_CATEGORIES.length;
  if (categoryIds.size !== expectedCategories) {
    throw new Error(
      `Expected ${expectedCategories} pattern categories, parsed ${categoryIds.size}: ${[...categoryIds].join(', ')}`,
    );
  }
  if (entries.length !== 100) {
    throw new Error(`Expected 100 pattern entries (P01–P100), parsed ${entries.length}`);
  }

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, renderPatternModule(entries), 'utf8');
  process.stdout.write(
    `Wrote ${relative(REPO_ROOT, OUTPUT_FILE)} with ${entries.length} patterns across ${categoryIds.size} categories.\n`,
  );
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
