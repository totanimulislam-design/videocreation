# Architecture — Design Intelligence Foundation (Task 03, Phase 1)

> **Scope.** This document describes the foundation implemented in this repository: the canonical
> design schema, the brief intelligence parser, the design-plan validator, the pattern metadata and
> selection-guidance integration, the AI provider *interface*, and their tests. It does **not**
> describe a renderer, editor, layout engine, or AI provider integration — none of those exist yet,
> and no model is called.

## 1. What was here before

Repository inspection at the start of this task found only documentation:

```
.gitignore
AGENTS.md
AI_DESIGN_INTELLIGENCE.md
DESIGN_ENGINE_SPEC.md
DESIGN_PATTERNS_LIBRARY.md
DESIGN_QUALITY_METRICS.md
DESIGN_SYSTEM.md
README.md
```

No source tree, no test suite, no package manifest, no configured toolchain. There was therefore no
existing framework to follow and no existing behaviour that could be broken. `README.md` recorded
this status accurately, and it has been updated rather than contradicted.

## 2. Technology choice and justification

The task required not assuming a stack. The chosen stack is deliberately minimal:

| Choice | Rationale |
|---|---|
| **TypeScript** | `DESIGN_ENGINE_SPEC.md` §3 expresses the canonical contract as TypeScript interfaces. Implementing in the same language keeps one contract instead of a re-typed copy. |
| **No runtime dependencies** | The foundation is pure data validation and text analysis. Zero runtime dependencies means zero supply-chain surface, no version drift, and no bundler assumptions before the editor/renderer stack is chosen. |
| **Node.js ≥ 22.18 built-in test runner** (`node --test`) | Tests run with no test framework dependency. Node's runner is stable, supports `describe`/`it`, and produces TAP output. |
| **Node.js native TypeScript type stripping** (`--experimental-strip-types`) | Runs the `.ts` sources directly with no build step and no transpiler. The code was written to be erasable-syntax-only so this works (`erasableSyntaxOnly` is enforced in `tsconfig.json`). |
| **TypeScript only as a dev dependency** | Used for `tsc --noEmit` type checking. Not present at runtime. |
| **No validation library (no Zod)** | The spec's suggested architecture mentions Zod. It was not added because the validator needed precise, path-aware, *non-throwing* diagnostics with stable codes and an explicit error/warning split; that logic is small and fully tested here. Adopting Zod later would mean either duplicating these rules or dropping the stable diagnostic codes. This is a reversible decision, recorded rather than hidden. |

**Migration path.** Because sources are standard ES modules with explicit `.ts` import specifiers and
`erasableSyntaxOnly` enabled, the same code runs unchanged under a bundler, `tsx`, or a future
compile-to-JS step. Nothing depends on the type-stripping flag beyond the `npm test` script.

**Node version.** `package.json` declares `engines.node >= 22.18.0`. Earlier Node 22 releases do not
enable type stripping by default and would need `--experimental-strip-types`.

## 3. Layer map

```
src/
├── schema/          the canonical contract — single source of wire shapes
│   ├── types.ts       DesignBrief, DesignDocument, CanvasConfig, DesignTokens,
│   │                  ArtDirection, CompositionPlan, HierarchyItem, TypographyToken,
│   │                  DesignAsset, SceneNode, DesignConstraints
│   ├── version.ts     schema versioning, support window, comparison
│   ├── units.ts       px/mm/cm/in, explicit conversion (never implicit px→mm)
│   ├── limits.ts      numeric limits shared by parser + validator
│   └── factories.ts   canonical constructors with documented safe defaults
├── knowledge/       stable identifiers taken from the design documents
│   ├── ids.ts           design categories, styles, colour strategies, roles, slots
│   ├── patterns.ts      registry over generated pattern metadata + combinations
│   ├── selection-guidance.ts  machine-readable selection rules (§1.1, §2.2, §2.3, §16.2, §24)
│   └── generated/
│       └── patterns.generated.ts   AUTO-GENERATED from DESIGN_PATTERNS_LIBRARY.md
├── brief/           natural-language brief → structured DesignBrief
│   ├── parse.ts         orchestration, evidence, assumptions, open questions
│   ├── extract.ts       deterministic fact/label/category/language extraction
│   ├── capacity.ts      character-count capacity *screening* (not measurement)
│   └── types.ts         BriefAnalysis: evidence, assumptions, unknowns, conflicts
├── validation/      the gate before any renderer
│   ├── design-plan.ts   entry point: validateDesignPlan / assertValidDesignPlan
│   ├── document.ts      alias for validating a persisted document
│   ├── structural.ts    canvas, tokens, art direction, assets, guides, settings
│   ├── scene.ts         scene graph: IDs, references, node types, bounds policy
│   ├── composition.ts   patterns, focal point, hierarchy, zones, grid, constraints
│   └── primitives.ts    typed readers over `unknown` that record diagnostics
└── core/            shared primitives
    ├── diagnostics.ts   stable codes, severities, result envelope
    ├── ids.ts           ID validation/generation
    ├── color.ts         hex parsing, WCAG luminance/contrast
    └── script.ts        script/language/direction detection (detection only)

tools/
└── generate-knowledge.ts   compiles pattern metadata from the Markdown source

examples/
└── foundation-smoke.ts     runnable Definition of Done (non-zero exit on failure)

.github/workflows/ci.yml    typecheck + tests on Node 22.18 / 22.x + metadata drift check

tests/
├── fixtures/plans.ts       hand-authored valid plan fixtures (digital, print, Arabic, mixed)
├── brief-parser.test.ts          35 tests
├── plan-validator.test.ts       104 tests
├── pattern-integration.test.ts   19 tests
├── knowledge-selection.test.ts  19 tests
├── ai-provider.test.ts          32 tests
├── schema.test.ts                29 tests
├── pipeline.test.ts              15 tests
└── robustness.test.ts            35 tests
```

### Dependency direction

```
core  ←  schema  ←  knowledge  ←  brief
                       ↑            ↑
                  validation  ──────┘
```

`core` and `schema` depend on nothing else. `validation` may depend on `knowledge` (to resolve
pattern IDs) and on `schema`, but never on `brief`'s parsing logic — the validator accepts a
`DesignBrief` *value*, so parsing and validation stay independently testable.

## 4. The canonical contract, and why there is only one

`DESIGN_ENGINE_SPEC.md` §3 states that these types are "the single normative contract" and that other
documents "must not define competing wire shapes". `AI_DESIGN_INTELLIGENCE.md` §11 repeats the
requirement.

Implementation consequences, all enforced by construction:

1. `src/schema/types.ts` is the only module that declares these shapes. Everything else imports.
2. `DesignPlan` is an **alias** for `DesignDocument`, not a new interface. `AI_DesignPlan extends
   DesignDocument`, so validating the document validates the plan core; the analysis-only blocks named
   in `AI_DESIGN_INTELLIGENCE.md` §11 are not implemented and are not required.
3. `DesignConstraints` is an **alias** for `CompositionConstraints`. The task brief names the former
   and the spec names the latter; aliasing avoids two constraint shapes.
4. `CompositionPlan` appears once. The vector engine, quality report and pattern library import it.
5. Brief analysis data (evidence, assumptions, unknowns, conflicts, unassigned content) lives in
   `src/brief/types.ts` as `BriefAnalysis`, **beside** the brief, never inside it. The contract stays
   clean and `DesignBrief` remains exactly the §4.2 shape.

### Additive changes to the documented contract

Recorded in `DESIGN_ENGINE_SPEC.md` §3.4 as well: `CanvasConfig.unit` is required (not optional);
collection fields are `readonly`; typography `fontSize`/`letterSpacing` are in canvas units while
`lineHeight` is a multiplier; normalized ratios (`opacity`, focal strength, gradient offsets, crop)
are explicitly not canvas units; colours are sRGB hex only.

## 5. Brief parser — how "do not invent facts" is enforced

The parser is deterministic: no model, no network, no randomness. Factual safety rests on five
mechanisms, each covered by tests:

1. **Verbatim-only content.** Every value placed in `content`, `brand` or `objective` is a substring
   of the user's text or a caller-supplied hint. The parser never writes, translates, rewords,
   completes, or reformats a fact.
2. **Instructions are not artwork.** Sentences such as "Create a poster…" or "Include the contact
   number" describe the deliverable. They are recognised (`isInstructionSentence`) and excluded from
   artwork content — a defect this test suite caught during development.
3. **Unknowns stay unknown.** A missing headline produces a *blocking open question*, not an
   authored headline. A missing canvas produces a recorded assumption **plus** a question. `medium`
   is left `unspecified` rather than guessed.
4. **Assumptions are narrow and reversible.** Only presentation defaults (canvas size, unit, export
   format) may be assumed, always with a stated reason and a question to the user. The assumed canvas
   size is a documented constant, not a creative decision.
5. **Nothing is dropped.** Prose that cannot be placed in a slot is surfaced in
   `analysis.unassignedContent` with a warning. It is not pushed onto the canvas (which would invent
   hierarchy) and not discarded (which would lose user content). This, too, was a defect found by a
   test.

Structural facts (category, dimensions, unit, medium, language, formats) are recognised from explicit
statements only. Their evidence kind is recorded as `explicit`, `caller-supplied`, `derived`,
`assumed` or `unknown`, with a confidence value.

### Multilingual handling

Recognition keywords exist for English, Bengali, Arabic and Urdu. Bengali-Indic, Arabic-Indic and
Extended Arabic-Indic digits are **read** for dimensions and **preserved** in content. Terminators
(`।`, `॥`, `؟`, `۔`) segment statements. Right-to-left detection is reported for selection only:
per §6.4/§9.6 each text run keeps its own direction, and the parser never reverses or reshapes
content. Shaping, measurement and bidirectional ordering are explicitly **not** implemented.

## 6. Validator — what it guarantees

`validateDesignPlan(input, { brief? })` returns `{ result, admitted, summary }` and never throws for
malformed input. Checks run in dependency order:

1. **Envelope** — ID shape, name, schema version (semver, supported window), revision, ISO timestamps
   and their ordering.
2. **Canvas** — positive finite dimensions within limits, required unit, DPI range, bleed/safe-area
   insets, safe area not inside bleed, background (solid/image/gradient/transparent), gradient stop
   ordering and offsets.
3. **Tokens** — all five typography roles, colour roles, spacing/radii/shadow shapes.
4. **Art direction** — documented style IDs, colour-strategy IDs, non-empty mood, closed enums.
5. **Assets** — unique IDs, allowed URI schemes, MIME kind, licensing warning for imagery, and
   resolution of the canvas background image reference.
6. **Scene graph** — unique IDs across the whole tree, finite transforms with non-zero scale,
   per-type required properties, asset-kind matching, validated path data (grammar-only, no markup),
   group-only children, shadow-token resolution, and bounds policy.
7. **Composition** — pattern IDs against the generated catalogue, hierarchy rank/content uniqueness
   and resolution against real brief slots, focal point inside the canvas, zone bounds and element
   references, grid sanity, constraint consistency.
8. **Cross-checks** — unused assets, missing font assets, and brief consistency (canvas, category,
   content preservation).

**Severity policy.** `error` blocks admission; `warning` never does. Warnings are always returned —
nothing is silently swallowed. The distinction follows `DESIGN_QUALITY_METRICS.md` §5.1, where
"intentional vs defective" is a judgement the plan must declare.

### Deliberate non-checks

The validator does **not**:

- measure text or claim text fits (`DESIGN_ENGINE_SPEC.md` §9.3 forbids character-count estimation as
  measurement; `DESIGN_QUALITY_METRICS.md` §5.1 requires `not_assessed` in that case);
- detect collisions (Quality Engine, spec §14);
- evaluate contrast for approval — `core/color.ts` provides measurement primitives only, and print
  contrast is explicitly unprovable from sRGB ratios;
- score or approve a design in any way.

## 7. Pattern metadata integration

`DESIGN_PATTERNS_LIBRARY.md` §19 defines the pattern data structure and §19.1 its requirements;
§19.2 forbids turning metadata into templates.

Rather than hand-copying 100 patterns into a second table, `tools/generate-knowledge.ts` **compiles**
them from the Markdown: `## Pnn — Name`, `**Structure:**`, `**Construction:**`, `**Best for:**`. The
result is checked in at `src/knowledge/generated/patterns.generated.ts`. A drift test re-parses the
Markdown and asserts the generated file matches, so documentation and code cannot diverge unnoticed
(`npm run generate:knowledge` refreshes it).

The generated module carries **no coordinates** — only ID, name, category, meaning (Structure),
implementation notes (Construction) and use cases (Best for). All geometry remains the Design Engine's
job.

Fields §19 also lists but the Markdown does not supply per entry — `avoidWhen`, `commonMistakes`,
`validationChecks`, `adaptationRules`, `recommendedElements`, `structure.readingFlow`, `complexity` —
are **not invented**. `lookupPattern` reports `completeness.hasFailureGuidance === false`, and the
validator emits a `PATTERN_GUIDANCE_INCOMPLETE` warning so the five-part decision contract in §1.1
stays the caller's responsibility.

The §16.1 recommended-combination table uses informal shorthand ("Central Hero", "Oversized
Typography"). Because fuzzy name matching could silently bind the wrong pattern, each row names its
catalogue ID explicitly and keeps the documented shorthand for traceability; a row whose IDs do not
exist throws at load time.

## 8. Testing

`npm test` runs 288 tests across eight files using Node's built-in runner. Coverage includes every
scenario the task required:

| Required scenario | Where |
|---|---|
| Valid design brief | `brief-parser` — valid brief suite |
| Missing essential content | `brief-parser` — missing content suite (headline, dimensions, empty input) |
| Conflicting constraints | `brief-parser` — contradictory sizes, ranges, media, dual phone numbers |
| Bengali brief | `brief-parser` + `pipeline` |
| Arabic and RTL brief | `brief-parser`, `plan-validator` (RTL plan fixture), `pipeline` |
| Mixed-language brief | `brief-parser`, `plan-validator` (mixed fixture) |
| Invalid dimensions | `plan-validator` — zero, negative, NaN, Infinity, oversize, missing unit |
| Invalid pattern ID | `plan-validator` — malformed, unknown, duplicate, excessive |
| Duplicate element IDs | `plan-validator` — top level, nested, assets, zones |
| Missing asset references | `plan-validator` — nodes, image nodes, backgrounds, kind mismatch, schemes |
| Invalid typography configuration | `plan-validator` — missing role, sizes, weights, alignment, line height |
| Valid complete design plan | `plan-validator`, `pipeline` |

Additional coverage: schema versioning, unit conversion, colour parsing and WCAG measurement, ID
helpers, script detection, factories, pattern-catalogue drift, and the admission boundary.

`npm run typecheck` runs `tsc --noEmit` under `strict`, `noUncheckedIndexedAccess`,
`erasableSyntaxOnly` and `verbatimModuleSyntax`.

## 9. The AI provider boundary (interface only)

The deterministic parser is intentionally not a language model. Richer interpretation is future work,
and the seam for it is declared in `src/ai/` so that future work cannot accidentally bypass
validation or bring network calls into the parser.

**What exists:** the interface, the proposal data shapes, the validation of untrusted proposals, and
the orchestration that turns every failure mode into a typed result. **What does not exist:** any
provider, prompt, model call, vendor SDK, API-key handling or network code. `NoAiProvider` is the
default and rejects every request with `NoAiProviderError`, so shipped behaviour stays deterministic
and offline.

### Why a proposal is not a `DesignBrief`

A provider returns `AiBriefProposal` — a list of candidate field values with per-field provenance —
never a `DesignBrief` and never a `DesignDocument`. This keeps the contract single-sourced (a model
cannot return a shape that competes with `src/schema/types.ts`) and makes "the model suggested this"
mechanically distinct from "the brief says this".

The proposable field set is a narrow subset (`PROPOSAL_FIELDS`) that excludes IDs, geometry, the
scene graph and every structural section of the document.

### The fact-safety rule

The dangerous failure is a model inventing a fact — a price, a date, a phone number, a name — and
having it reach a canvas. `validateAiBriefProposal` therefore requires that a **factual** field
(`brand.name`, `content.*`) claiming `explicit` or `derived` evidence must quote text that is a
verbatim, case- and whitespace-insensitive substring of the user's original brief, and every element
of an array value must be traceable too. Otherwise the proposal is rejected
(`AI_PROPOSAL_FACT_UNSOURCED`). Creative fields (mood, style, objective) need no quote but must be
marked `assumed`/`derived` at confidence ≤ the ceiling.

An unsourced fact can be admitted only when a caller explicitly passes `allowUnsourcedFacts: true`,
and then only as a *warning* for human review — never for automatic use.

### Outcome matrix

| Situation | Status | Code |
|---|---|---|
| No provider, or `available: false` | `unavailable` | `AI_PROVIDER_MISSING` |
| Provider throws, or exceeds the timeout | `failed` | `AI_PROVIDER_FAULT` |
| Proposal fails validation | `rejected` | `AI_PROPOSAL_*` |
| Proposal passes validation | `proposed` | warnings may accompany it |

`requestBriefProposal` never throws. Losing the AI path always degrades quality, never correctness:
the deterministic brief remains valid and usable in every case.

## 10. Pattern selection guidance

`src/knowledge/selection-guidance.ts` makes the library's *selection* rules machine-readable: the
§2.2 requirement→direction table, the §2.3 requirements, the §1.1 five-part decision contract, the
§16.2 combination restrictions and the §24 checklist. Drift tests re-parse the Markdown and fail if
the transcription diverges.

It deliberately does **not** carry per-pattern `selectionGuidance`: §19.1 lists such fields but the
catalogue supplies only `Structure`, `Construction` and `Best for` per entry. Block decoration of all
100 patterns with generic advice would fabricate metadata. The module instead reports the gap
(`unmetDecisionContractItems`), matching the `PATTERN_GUIDANCE_INCOMPLETE` warning the validator
already emits.

Two attributes — `orientationFit` and `multiPageOrPanel` — are derived from each pattern's own name
vocabulary and are marked `provenance: 'derived'` so they are never mistaken for authored metadata.

`assessPatternSelection` is advisory by construction: it returns notes and has no verdict field, so
`validateDesignPlan` remains the single admission gate.

## 11. Known limitations

Stated plainly, because reporting them is part of the task:

1. **No layout, geometry, measurement, rendering, export, editor, or AI provider.** Pattern
   *selection*, text measurement and collision detection are future work.
2. **Brief parsing is heuristic.** It is deterministic and conservative, but it recognises specific
   label forms and keywords. Prose that uses unfamiliar phrasing lands in `unassignedContent` (by
   design) rather than being guessed at. It is not a language model and does not claim to be.
3. **Only four scripts are recognised.** Anything else is reported as an unsupported language with a
   warning, never silently accepted.
4. **`medium` is frequently `unspecified`.** This is intentional: guessing print vs digital changes
   DPI, bleed and export, so the parser asks instead.
5. **Pattern failure guidance is absent from the source document.** Recorded as a warning, not
   filled in.
6. **No Zod-based JSON Schema export.** The contract is TypeScript plus a runtime validator; a
   machine-readable JSON Schema could be generated from it later if another language needs it.
   Deliberately deferred: generating one needs an extra generator dependency, and hand-authoring it
   would duplicate the canonical contract that this repository keeps single-sourced.
7. **No AI provider exists.** `src/ai/` implements the seam and the validation of untrusted
   proposals, not an integration. `NoAiProvider` is the default and rejects every request, so the
   shipped behaviour is fully deterministic and offline. Tests use hand-built fakes to exercise the
   seam; they are not evidence of model capability.
8. **Per-pattern failure guidance is absent from the source document.** §19.1 lists `avoidWhen`,
   `commonMistakes`, `validationChecks`, `adaptationRules` and `complexity`; the catalogue supplies
   only `Structure`, `Construction` and `Best for`. They are reported as missing, never invented.
9. **Pattern selection guidance is advisory.** `assessPatternSelection` returns notes and gaps and
   has no verdict field, so `validateDesignPlan` remains the only admission gate.
7. **Category keyword lists are English/Bengali/Arabic/Urdu only** and are data in `extract.ts`, easy
   to extend.
8. **`DesignPlan` validation requires the brief for content-preservation checks.** Without it the
   result carries an explicit warning rather than a false pass.

## 12. Next steps (dependency order)

1. **Text measurement and fitting** via a real shaping engine — the largest missing piece for honest
   typography validation.
2. **Deterministic layout/grid engine** consuming `CompositionPlan` + measurements.
3. **Collision and safe-area analysis** in the Quality Engine, with declared-overlap support already
   modelled by `CompositionConstraints`.
4. **Pattern selection** (not just metadata) as the Runtime AI Designer's first real job, with
   diversity tracking.
5. **A renderer and preview/export parity tests** — only after 1–3 produce trustworthy geometry.
6. **Quality gates and evidence-bearing reports**, then bounded revision.

Until those exist, nothing in this repository should be described as producing a finished design.
