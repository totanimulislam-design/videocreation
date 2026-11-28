# Implementation Report — Task 03-R

> **Read this first.** The task brief assumed `main` contained **documentation only**. That premise was
> out of date: the repository already contained a working Phase 1 implementation of the design-intelligence
> foundation. This report records what was actually verified, what was already built, and exactly what
> this task added. Nothing was rewritten, and no capability is claimed that does not run.

---

## 1. Repository audit (performed before any edit)

### What the task brief claimed vs. what the repository contained

| Task brief premise | Verified reality |
|---|---|
| "current main branch contains documentation only" | **False.** 44 tracked files, including 11,401 lines of TypeScript |
| "application source … not yet established" | `src/` with 7 subsystems already present |
| "executable schemas, validators … not established" | `src/schema/`, `src/validation/` implemented |
| "automated tests … not established" | 237 passing tests across 6 files |
| "existing GitHub Actions, if any" | **None existed** — this was a real gap |
| Existing dependencies | `typescript` + `@types/node` only, both dev; **zero runtime dependencies** |
| Runtime environment | Node v22.22.3, npm 10.9.8 |

The repository was verified by execution, not by reading its own documentation:

```
npm install      → 3 packages, 0 vulnerabilities
npm run typecheck → clean (tsc --noEmit)
npm test          → 237 tests, 237 pass, 0 fail
```

`docs/ARCHITECTURE.md` §1 already recorded that Phase 1 had started from a documentation-only
repository. The Task 03-R brief was therefore writing against the state *before* Task 03 Phase 1, not
the current state.

### Consequence

Given the decision confirmed with the user, this task **extended** the existing foundation rather than
rebuilding it. A rewrite would have violated the repository's own `AGENTS.md` §3 ("Preserve existing
behavior and project architecture … avoid … wholesale rewrites") and destroyed 237 working tests.

---

## 2. Technology selection — review of the existing choice

The existing stack was evaluated against the task's §2 criteria and **kept unchanged**.

| Criterion | Task suggestion | Repository choice | Verdict |
|---|---|---|---|
| Language | TypeScript | TypeScript (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`) | Keep — canonical contract in `DESIGN_ENGINE_SPEC.md` §3 is TypeScript |
| Runtime validation | Zod | Hand-written, non-throwing, path-aware validator with **stable diagnostic codes** | Keep — see below |
| Test runner | Vitest | Node's built-in `node --test` | Keep — zero test-framework dependency |
| JSON Schema | Consider interoperability | Not implemented; documented limitation | Keep — per user decision |

### Why Zod was not adopted

This is a deliberate, reversible engineering decision, already recorded in `docs/ARCHITECTURE.md` §2
before this task. The validator's contract is:

- **non-throwing** with `{ ok, errors, warnings }` and a `value` only when admitted;
- **path-aware** diagnostics (`composition.supportingPatterns[0]`);
- a **stable, machine-readable code catalogue** (`CODES`, ~200 codes) that tests and future quality
  reports key on;
- an explicit **error vs. warning** split, where warnings never block admission.

Zod is an excellent shape validator, but adopting it would either duplicate these rules alongside
Zod schemas or require dropping the stable codes and severity policy that `DESIGN_QUALITY_METRICS.md`
§5.1 depends on. The decision is recorded rather than hidden, and because sources are standard ES
modules with explicit `.ts` specifiers, adopting Zod later is a contained change.

### Why JSON Schema export was not added

Per the user's explicit decision. Generating one needs an additional generator dependency, and
hand-authoring it would **duplicate the canonical contract** — which the task's own Restrictions
forbid ("Do not duplicate the canonical data contract"). Recorded as limitation §11.6 in
`docs/ARCHITECTURE.md`.

---

## 3. Files created or changed by this task

### Created

| File | Lines | Purpose |
|---|---|---|
| `.github/workflows/ci.yml` | 60 | Type-check, test, and generated-metadata drift check |
| `src/ai/types.ts` | 162 | Provider interface, proposal shapes, `NoAiProvider` |
| `src/ai/proposal.ts` | 302 | Validation of untrusted proposals (fact-safety gate) |
| `src/ai/request.ts` | 129 | Timeout/failure/rejection orchestration |
| `src/knowledge/selection-guidance.ts` | 317 | Machine-readable pattern selection rules |
| `examples/foundation-smoke.ts` | 291 | Runnable Definition of Done, non-zero exit on failure |
| `tests/ai-provider.test.ts` | 437 | 32 tests for the AI boundary |
| `tests/knowledge-selection.test.ts` | 195 | 19 tests incl. Markdown drift checks |
| `IMPLEMENTATION_REPORT.md` | this file | Report |

### Modified (minimal, additive)

| File | Change |
|---|---|
| `src/core/diagnostics.ts` | +8 diagnostic codes for the AI boundary. No existing code changed. |
| `src/index.ts` | +exports for the new modules. No existing export changed. |
| `package.json` | +1 script (`example`). No dependency added. |
| `README.md` | Corrected test count 237→288; added rows for new capabilities; corrected limitations |
| `docs/ARCHITECTURE.md` | Layer map, §9 AI boundary, §10 selection guidance, updated limitations/tests |

**No existing source file was rewritten. No documentation was deleted. No new dependency was added.**

---

## 4. What each gap closed

### 4.1 CI workflow (§9) — was entirely absent

`.github/workflows/ci.yml` runs on push, PR and manual dispatch:

- Node **22.18.0** (the exact `engines.node` floor, where type stripping is on by default) and **22.x**;
- `npm ci` → `npm run typecheck` → `npm test`;
- regenerates `patterns.generated.ts` and runs `git diff --exit-code`, so documentation and code
  cannot drift unnoticed.

Verified locally that the generator is idempotent, so the drift step does not spuriously fail.

### 4.2 AI provider interface (§5) — the seam was missing entirely

The task required: "Keep future LLM integration behind a separate provider interface" and "Do not claim
AI integration exists when it does not."

Implemented as an **interface plus a gate, with no provider**:

- `AiBriefProvider` — the single seam. `NoAiProvider` is the shipped default and **rejects every
  request**, so runtime behaviour is unchanged: fully deterministic and offline.
- A proposal is `AiBriefProposal` (candidate field values + provenance), **never** a `DesignBrief` or
  `DesignDocument`. The proposable field set excludes IDs, geometry, the scene graph and every
  structural document section — a model cannot return a competing schema.
- **Fact-safety rule:** a factual field (`brand.name`, `content.*`) claiming `explicit`/`derived`
  evidence must quote text that is a verbatim, case/whitespace-insensitive substring of the user's
  brief, and every array element must be traceable. Otherwise → `AI_PROPOSAL_FACT_UNSOURCED` (error).
  A model therefore cannot inject an invented price, date, phone number or name.
- Over-confident inference is an **error** (`AI_PROPOSAL_CONFIDENCE_EXCESSIVE`) rather than a warning.
- `requestBriefProposal` never throws; four typed outcomes: `unavailable` / `failed` / `rejected` /
  `proposed`. A hung provider is bounded by a timeout.

No network code, no prompt text, no vendor SDK, no API-key handling, no model call.

### 4.3 Pattern selection guidance (§7) — partially present, honestly reported

`src/knowledge/selection-guidance.ts` makes the library's selection rules machine-readable:
§2.2 requirement→direction table, §2.3 requirements, §1.1 five-part decision contract, §16.2
combination restrictions, §24 checklist. Drift tests re-parse the Markdown and fail if the
transcription diverges.

**What was deliberately not done:** the brief asked for per-pattern "selection guidance" and
"constraints". Inspection of `DESIGN_PATTERNS_LIBRARY.md` showed every one of the 100 `## Pnn`
sections supplies only `Structure`, `Construction` and `Best for` — §19.1's `avoidWhen`,
`commonMistakes`, `validationChecks`, `adaptationRules` and `complexity` **do not exist in the source**.
Stamping identical generic advice onto all 100 patterns would have fabricated per-pattern metadata and
made the registry appear more authoritative than its source. Instead:

- library-wide rules are modelled exactly as documented, each with a section reference;
- the per-pattern gap is **reported** (`unmetDecisionContractItems`, existing
  `PATTERN_GUIDANCE_INCOMPLETE` warning), never filled in;
- two name-derived attributes (`orientationFit`, `multiPageOrPanel`) are marked
  `provenance: 'derived'` so they are never mistaken for authored data;
- the assessment is **advisory only** — no verdict field, so `validateDesignPlan` stays the single
  admission gate.

### 4.4 Runnable example (§10 Definition of Done)

`npm run example` exercises the real modules end-to-end: brief normalization, a valid plan admitted, six
invalid plans each rejected **for the expected error code**, the pattern registry, selection guidance,
and the AI boundary reporting `unavailable`. It exits non-zero if any expectation fails, so it is a
smoke test rather than a demo that always prints OK.

Building it surfaced three genuine misunderstandings on my side, each fixed rather than papered over:

1. The plan initially omitted `metadata.category`, so *every* "invalid" case was failing for the wrong
   reason (`REQUIRED`) while still reporting `REJECTED`. Fixed by asserting the **expected code**, not
   merely "some error" — this is why the example checks codes.
2. A missing canvas `unit` correctly yields `REQUIRED`, not `UNIT_INVALID` — an absent explicit unit must
   never be read as `px`. Expectation corrected, and a separate implausible-unit case (`'pt'`) added to
   cover `UNIT_INVALID`.
3. The duplicate-ID fixture used `type: 'rect'`, which is not a `SceneNodeType`, and omitted
   `visible`/`locked`. Corrected so the case fails *only* on `ID_NOT_UNIQUE`.

---

## 5. Commands executed and results

All commands were run in this checkout. Results are copied from actual output.

| Command | Result |
|---|---|
| `npm install` | added 3 packages, 0 vulnerabilities |
| `npm run typecheck` | **clean**, no output (exit 0) |
| `npm test` (baseline, before changes) | **237 pass**, 0 fail |
| `npm test` (after changes) | **288 pass**, 0 fail, 46 suites |
| `npm run example` | `All expectations held.` (exit 0) |
| `npm run check` | typecheck + 288 tests pass |
| `npm run generate:knowledge` | 100 patterns / 10 categories, **no working-tree diff** |
| `gh run view` (GitHub Actions) | run `46123624250` — **both legs success**, no annotations |

### Clean-clone verification (the actual Definition of Done)

Cloned the branch into a fresh directory and ran the full sequence with no inherited state:

```
git clone --branch arena/578f49cb-videocreation <repo> dodcheck
npm ci            → success
npm run typecheck → clean
npm test          → 288 pass / 0 fail
npm run example   → All expectations held.
npm run generate:knowledge && git diff --exit-code → NO DRIFT
```

A developer can clone, install, type-check and test successfully.

---

## 6. Test coverage added (51 tests, 237 → 288)

### `tests/ai-provider.test.ts` — 32 tests

Accepted shapes (4): sourced single value; a full sourced set including an array; case/whitespace
quote matching; stable proposable-field list that excludes structural fields.

Invented facts rejected (6): untraceable factual value; factual field with no quote; quote present but
not containing the claimed value; array with one invented element; opt-in downgrade to warning; a
creative field needs no quote.

Malformed input (13): non-object (6 variants); missing `fields`; missing `briefText`; unknown field;
missing/unknown evidence kind; confidence out of range/non-finite/non-number; over-confidence on
inferred evidence; caller-supplied ceiling; duplicated field; scalar-for-array and array-for-scalar;
empty strings and empty elements; non-object field entries; empty field list warns but admits.

Orchestration (9): missing provider → `unavailable`; no-op provider → `unavailable` and never called;
self-reported unavailable provider; throwing provider → typed `failed`; hung provider → timeout;
well-behaved provider → `proposed`; lying provider → `rejected`; **deterministic brief never mutated**;
no-op error distinguishable from generic failure.

### `tests/knowledge-selection.test.ts` — 19 tests

Fidelity (6): every §2.2 row transcribed exactly; every §16.2 restriction; five §1.1 contract items;
§24 checklist count and text; §2.3 tagging; routing categories resolve.

Derived characteristics (5): orientation from name vocabulary; `any` when uncommitted; multi-panel
flags; `provenance: 'derived'`; `undefined` for unknown IDs rather than guessing.

Advisory assessment (8): no notes for a sane choice; >2 supporting patterns flagged against §2.3;
orientation disagreement flagged; routing filtered by family; unmet §1.1 items reported; unknown
pattern handled without throwing; **no verdict field exists**; every recommended combination resolves.

### Pre-existing coverage retained

All 237 original tests still pass unchanged, covering the task's required scenarios: valid brief,
missing information, Bengali content, Arabic/RTL content, mixed-language content, invalid dimensions,
invalid pattern IDs, duplicate IDs, missing asset references, invalid typography, valid complete plan,
invalid plan.

---

## 7. Definition of Done — status

| Requirement | Status |
|---|---|
| Actual source code | **Met** — pre-existing, verified by execution; extended, not rewritten |
| Executable runtime schemas | **Met** — `src/schema/types.ts` + `src/validation/` |
| Brief normalization layer | **Met** — `src/brief/`, deterministic, fact-preserving |
| Runtime plan validator | **Met** — `src/validation/design-plan.ts` |
| Machine-readable pattern registry | **Met** — 100 patterns + selection rules |
| Automated tests | **Met** — 288 passing |
| Working build/type-check/test commands | **Met** — verified from a clean clone |
| Implementation report | **Met** — this file |
| Sample brief → structured object | **Met** — `npm run example` §1 |
| Valid plan passes validation | **Met** — `npm run example` §2 |
| Invalid plan fails with meaningful errors | **Met** — 6 cases, each asserting its expected code |
| Registry exposes composition metadata | **Met** — `npm run example` §4 |
| CI for type check and tests | **Met** — `.github/workflows/ci.yml`, **observed passing on GitHub** (runs 46123579175 and 46123624250; both matrix legs green, zero annotations) |

---

## 8. Remaining limitations (stated plainly)

1. **No renderer, layout engine, text measurement/shaping, collision detection, quality scoring,
   editor, export, or AI model call.** Unchanged by this task.
2. **No AI provider exists.** `src/ai/` is an interface plus a validation gate. Tests use hand-built
   fakes; passing them is **not** evidence of model capability. `NoAiProvider` refuses every request,
   so shipped behaviour remains deterministic and offline.
3. **Per-pattern failure guidance is absent from the source document.** Reported as a gap, not
   invented.
4. **Pattern selection is advisory.** No selection engine chooses a pattern; the example's composition
   is hand-authored, because choosing one is a creative decision this repository does not make.
5. **No JSON Schema export** (deliberate, per user decision).
6. **No Zod** (deliberate; rationale in `docs/ARCHITECTURE.md` §2).
7. **CI is verified green on GitHub** for this branch (Node 22.18.0 and 22.x). It has not been
   observed on a pull request into `main`, only on push, because no PR exists yet.
8. **Brief parsing remains heuristic** — deterministic and conservative, not semantic understanding.
   Only English, Bengali, Arabic and Urdu script keywords are recognised.
9. **No schema migrations** — only a supported-version window is enforced.

---

## 9. Recommended next steps (dependency order)

1. **Text measurement and fitting** via a real shaping engine — the largest honest gap for typography.
2. **Deterministic layout/grid engine** consuming `CompositionPlan` + measurements.
3. **Collision and safe-area analysis** with declared-overlap support already modelled.
4. **Pattern selection engine** — the first real job for the `AiBriefProvider` seam, with diversity
   tracking per library §18.
5. **Renderer and preview/export parity tests** — only after 1–3 produce trustworthy geometry.
6. **Quality gates and evidence-bearing reports**, then bounded revision.

Until those exist, nothing here should be described as producing a finished design.
