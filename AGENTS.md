# AGENTS.md — Instructions for AI Coding Agents

This file tells any AI coding agent (or human contributor) how to work safely and effectively in this repository. Read it completely before making any change. If anything here conflicts with a direct instruction from the user, ask the user which takes precedence.

---

## 1. Repository Status (as of 2026-11-27)

- The repository now contains a working first slice of the platform alongside the specifications:
  - `README.md` — architecture and platform specification.
  - `DESIGN_SYSTEM.md` — creative, typographic, compositional, and visual standards.
  - `DESIGN_QUALITY_METRICS.md` — the measurable quality framework: weighted scoring, critical gates, critique contract, revision policy, report format.
  - `src/core/` — the canonical structured design document model (`design-document/types.ts`, `validation.ts`, `traverse.ts`, `factory.ts`), geometry (`geometry/bounds.ts`) and colour maths (`color/color.ts`).
  - `src/quality/` — the implemented Quality Engine (analysis, deterministic validators, category scoring, SVG preview, critic adapter, revision engine, reports, pipeline, CLI).
  - `tests/` — Node test suite plus design-document and critique fixtures.
- Tooling exists: `package.json` (ESM, Node ≥22.18), `tsconfig.json`, and two dev dependencies only (`typescript`, `@types/node`). There is **no build step and no runtime dependency**: sources are native TypeScript executed by Node's type stripping.
- The application layers described in `README.md` (browser renderer, editor, AI orchestrator, production export, state store) **do not exist yet**. Do not invent their files or APIs.
- `README.md`, `DESIGN_SYSTEM.md`, and `DESIGN_QUALITY_METRICS.md` are authoritative in their own domains. Where a spec and reality differ, reality wins and the documentation must be corrected in the same change.

---

## 2. Mandatory Instructions (read before implementing anything)

1. Read `README.md` **completely** before implementing any feature. It is long and dense — skim the Table of Contents first, then read in full.
2. Read `DESIGN_SYSTEM.md` **completely** before designing or implementing any creative or design-generation feature. It is the primary creative design rulebook governing art direction, composition, typography, color, shapes, critique, anti-patterns, and checklists.
3. Read `DESIGN_QUALITY_METRICS.md` **completely** before touching scoring, validation, preview, critique, revision, or reporting. It is the authority for weights, thresholds, critical gates, and the critic contract.
4. Understand the existing project architecture before editing. Read the modules you touch, including their tests and fixtures.
5. Follow the established design document schema. The canonical object shape is `DesignElement` in `README.md` §5.1, implemented in `src/core/design-document/types.ts`: `id`, `type`, `name`, `transform` (x, y, width, height, rotation, scaleX, scaleY), `style` (fill, stroke, strokeWidth, opacity, blendMode), optional `effects`, `visible`, `locked`, `zIndex`, optional `children`, and optional `meta` (`role`, `decorative`, `intentionalOverlap`, `language`). Extend it with type-specific properties rather than inventing parallel structures. The document container (`canvas`, `assets`, `fonts`, `metadata`) is equally canonical.
6. Reuse existing rendering and graphics systems. Do not introduce a second canvas library, a second rendering path, or a parallel object model. There is exactly one preview renderer (`src/quality/visual/preview-generator.ts`) and one validator suite (`src/quality/validators/`) today; extend them rather than duplicating them.
7. Do not introduce duplicate or conflicting systems (e.g., two state stores, two schema validators, two export pipelines, two scoring rulebooks, two issue vocabularies).
8. Never bypass the design production pipeline (see §5 below). A design that has not passed through the pipeline stages is not done, regardless of how it looks.
9. Preserve existing working functionality. Do not refactor, delete, or "improve" working code that is unrelated to the task.
10. Validate every implementation (see §7 below). "It renders" is not validation.
11. Update documentation when architecture or creative standards change. If you change the schema, pipeline, directory structure, tech stack, scoring rules, or creative standards, update `README.md`, `DESIGN_SYSTEM.md`, `DESIGN_QUALITY_METRICS.md`, and this file in the same change.

For all AI-generated graphic designs, follow the complete design production workflow and creative standards defined in `README.md`, `DESIGN_SYSTEM.md`, and `DESIGN_QUALITY_METRICS.md`. Professional visual quality, editability, rendering accuracy, and production reliability are mandatory requirements, not stretch goals.

---

## 3. What This Project Is

**Creative Studio** is a professional, code-powered graphic design platform whose goal is creative quality comparable to Adobe Illustrator — not a template-based poster maker. The platform should produce original, art-directed compositions across marketing, social media, print, educational, and corporate design categories.

Core architectural principle (from the README, verbatim intent):

> **AI decides WHAT to design and WHY. The Design Engine determines HOW to construct it. The Rendering Engine determines HOW it looks. The Quality Engine determines WHETHER it is good enough.**

> The final output must be a structured, editable design document, not simply a flattened AI-generated image.

The most important separation is **creative intelligence from graphics execution**. Build independent but connected systems:

1. Creative Intelligence — what should be designed
2. Art Direction — the visual language
3. Design Planning — composition and hierarchy
4. Graphics Engine — actual vector/raster construction
5. Rendering Engine — the visual result
6. Quality Engine — evaluation and improvement
7. Production Engine — professional deliverables

---

## 4. Non-Negotiable Architecture Rules

These come from `README.md` and must hold for all code and all generated designs:

- **Structured design document first.** Designs are serializable JSON object graphs, validated (Zod is the recommended validator), independent of any rendering library. Never represent a design as arbitrary HTML/markup or a single flattened image.
- **SVG is the primary vector representation** for scalable, editable artwork. Avoid unnecessary rasterization of vector elements.
- **Editable elements by default.** Build designs from editable vector/text objects. Generated imagery may only be integrated as *assets inside* the design document (never as a full-bleed substitute for the composition).
- **Schema validation before rendering.** All AI-generated design instructions must pass schema validation before entering the rendering engine.
- **Same document for preview and export.** The editor preview and the PNG/SVG/PDF export must render from the same underlying design document.
- **Separation of concerns.** Keep rendering, editing, export, state, and intelligence in separate modules. Keep AI providers replaceable behind a common adapter.
- **Deterministic validation enforces hard requirements; AI critique is advisory.** Contrast, overflow, bounds, references, and schema correctness are enforced by deterministic checks. Visual critique guides refinement.
- **Approval requires inspection and coverage.** The critic may only score criteria that require seeing the artwork; measured criteria stay authoritative and may not be re-scored. A design cannot be `approved` while any criterion is unassessed. Never invent a score, and never claim to have inspected something that was not rendered.
- **Versioned scoring rules.** Scores embed the ruleset version (`SCORING_RULES_V1` = `1.0.0`). Changing weights or thresholds requires a new version; never silently reinterpret historical reports.
- **Critical failures override scores.** Missing content or assets, missing fonts or glyphs, clipped or unreadable essential text, obscured content, invalid structure, and broken exports reject the design regardless of its score.
- **Unverifiable is reported, not guessed.** Contrast over unanalysed imagery, approximate glyph metrics, and unrendered previews must be labelled in the report. Do not fabricate certainty.
- **Revision budget.** Automated revision loops are capped (default 3 rounds) and only apply mathematically safe, targeted corrections before handing back to the user. Never loop indefinitely.
- **Recommended stack** (use these unless an existing, working choice already covers the need): React + TypeScript, Tailwind CSS, SVG, HTML Canvas (rendering-intensive work), Konva/Fabric (interactive canvas — pick one, not both), Paper.js (geometry), Zustand (state), Zod (validation), Node.js backend, PostgreSQL, S3-compatible storage.
- **Technology selection rules:** don't introduce multiple canvas libraries without a clear technical reason; keep the design document renderer-independent; don't bypass the chosen stack for one-off needs; avoid unnecessary dependencies.
- **Target directory structure** is described in `README.md` §10. It is a target, not a mandate to create empty folders — implement modules incrementally as features land.
- **Naming/organization:** independent modules (`core/design-document`, `core/scene-graph`, `core/rendering`, `design-intelligence/*`, `graphics/*`, `editor/*`, `production/*`, `quality/*`, `shared/*`) communicating only through the common structured design document.

---

## 5. Mandatory Design Production Workflow

Whenever a user requests a new design, the agent MUST follow this workflow (`README.md` §11; creative standards in `DESIGN_SYSTEM.md` §2–20). Do not skip steps to generate faster.

1. **STEP 01 — Understand.** Analyze content, category, purpose, audience, language, output dimensions. Never invent important user-provided information; make reasonable assumptions only for what is missing.
2. **STEP 02 — Art Direct.** Decide visual concept, creative direction, and style (`DESIGN_SYSTEM.md` §4). One dominant creative direction per design — never randomly mix unrelated styles.
3. **STEP 03 — Plan.** Establish layout, grid, hierarchy, typography, color palette, image strategy, shape language, and the focal point (`DESIGN_SYSTEM.md` §3, §5–10, §12–13).
4. **STEP 04 — Generate.** Create the structured design document with real, editable elements (text, shapes, paths, images as positioned assets).
5. **STEP 05 — Render.** Render the document through the graphics engine (SVG/Canvas pipeline).
6. **STEP 06 — Inspect.** Evaluate the rendered composition for visual and technical problems (`DESIGN_SYSTEM.md` §15–17). Code path: `evaluateDesign()` / `runQualityPipeline()` renders an SVG preview, runs the deterministic validators, and merges a validated visual critique.
7. **STEP 07 — Refine.** Fix weaknesses with targeted, local revisions — do not rebuild the whole design for a local flaw (`DESIGN_SYSTEM.md` §16, `DESIGN_QUALITY_METRICS.md` §8). Code path: `planRevisions()` + `applyMechanicalRevisions()` inside the bounded `runRevisionLoop()`.
8. **STEP 08 — Validate.** Run structural, layout, typography, and export validation (`README.md` §7, `DESIGN_SYSTEM.md` §18, `DESIGN_QUALITY_METRICS.md` §2/§4/§15). Code path: the deterministic gate in `reports/report-generator.ts` (`determineDeliveryStatus`).
9. **STEP 09 — Deliver.** Hand over the final editable design plus the requested export formats.

### Design quality bar (from README & DESIGN_SYSTEM)

Every design must demonstrate: strong visual hierarchy, professional typography and pairing, deliberate color theory, intelligent negative space, intentional composition (avoid repetitive template-like layouts and `DESIGN_SYSTEM.md` §17 anti-patterns), balanced visual weight, meaningful decorative elements only, and consistent visual language. Every element must have a visual purpose; every decision must serve the communication objective.

---

## 6. Editing & Change Discipline

- Work only on the branch designated for the session; do not create, switch to, or push other branches.
- Make the smallest change that fully satisfies the task. Preserve working functionality.
- Do not commit generated build artifacts or large datasets to Git; follow existing ignore conventions when code exists.
- Keep commits focused and descriptive; work lands on this branch via normal commits/PRs.
- When the architecture or creative standards change, update `README.md`, `DESIGN_SYSTEM.md`, and this file in the same change — documentation drift is a defect.
- Ask before adding new dependencies, new frameworks, or new infrastructure. Prefer the documented stack and existing patterns.

---

## 7. Validation Expectations

Match validation rigor to the change:

- **Documentation-only changes:** proofread for factual accuracy against the repo; verify every cross-reference, path, and claim (e.g., file existence) is true. Check markdown renders correctly.
- **Schema/model changes:** the design document must remain serializable, validated, and renderer-independent; update `DesignElement`-derived types and validators together; add or update tests.
- **Rendering changes:** verify preview and export consistency; check layering, transforms, typography, clipping, and transparency on representative documents.
- **Design output changes:** run the full §5 workflow, including inspection and validation, and confirm the output against `DESIGN_SYSTEM.md` §18 and the production acceptance criteria in `README.md` §15 (design quality, technical quality, production quality, AI quality checklists).
- **Export changes:** test the actual exported files (PDF/PNG/SVG), not just the editor preview — including dimensions, DPI, bleed, and transparency where applicable.

Available validation commands:

```bash
npm test            # node --test — unit + integration suite
npx tsc --noEmit    # strict type check (no build output)
node src/quality/cli.ts tests/fixtures/poster-strong.json \
  --assets tests/fixtures/assets-strong.json \
  --brief tests/fixtures/brief-strong.json \
  --critique tests/fixtures/critique-strong.json \
  --preview /tmp/preview.svg --markdown /tmp/report.md
```

Quality-engine rules for validation:

- New validator → add a focused test with a purpose-built document, and confirm it emits the right code, severity, element ids and gate behaviour.
- New scoring rule or weight → bump the ruleset version, add the rule to `SCORING_RULES_V1` (or a new version), and keep the weights summing to 100.
- Preview/rendering change → render a real fixture and look at it. The translation bug fixed in the first implementation passed every unit test and was only visible in the rendered image.
- Never mark a design approved based on tests alone: approval requires a preview and a validated critique.

---

## 8. Common Pitfalls to Avoid

- Treating the README as aspirational fiction and quietly ignoring it, or treating it as already-implemented fact and inventing nonexistent files/APIs.
- Generating a flattened AI image and calling it the design.
- Skipping schema validation, rendering, inspection, or revision steps because "the design looks fine."
- Introducing a second rendering/state/validation stack "temporarily."
- Empty scaffolding folders for the whole future architecture ("implement incrementally rather than creating empty folders for every module immediately" — README §10).
- Repetitive, template-like compositions; designs where every element is equally prominent; decorative elements without purpose.
- Hardcoding designs that cannot adapt to different content or dimensions.
- Claiming professional quality merely because something renders.
- Approving a design from JSON or SVG source without inspecting a rendered preview.
- Letting the critic re-score measured criteria, or filling unassessed criteria with optimistic numbers.
- Reporting an approximate measurement as exact, or a guessed contrast ratio for text over an unanalysed image.
- Editing `SCORING_RULES_V1` in place instead of versioning the ruleset.

---

## 9. Quick Reference

| Topic | Where |
|---|---|
| Project vision, quality standards | `README.md` §1–3, §16; `DESIGN_SYSTEM.md` §1, §20 |
| Creative design principles, art direction & styles | `DESIGN_SYSTEM.md` §2–4 |
| Composition, typography, color, shapes & effects | `DESIGN_SYSTEM.md` §5–10 |
| Category rules, density, spacing & adaptability | `DESIGN_SYSTEM.md` §11–14 |
| Visual critique, anti-patterns & design checklist | `DESIGN_SYSTEM.md` §15–19 |
| Design categories supported | `README.md` §2; `DESIGN_SYSTEM.md` §11 |
| Engine capabilities (vector, type, layout, images, effects) | `README.md` §4–7 (and Architecture §3–6) |
| Design document schema / object model | `README.md` "5.1 Use a Structured Vector-Based Design Document" |
| Mandatory AI workflow (STEP 01–09) | `README.md` §11; `DESIGN_SYSTEM.md` §2, §16, §18–19 |
| AI system prompt / design rules | `README.md` §12; `DESIGN_SYSTEM.md` §19 |
| QA engine (structural/layout/typography/visual/revision) | `README.md` §7; `DESIGN_SYSTEM.md` §15–16 |
| Rendering & production pipeline | `README.md` §8 |
| Tech stack & selection rules | `README.md` §9, §12 (Technical Architecture) |
| Target directory structure | `README.md` §10 |
| Technology stack table | `README.md` §9 |
| Acceptance criteria checklists | `README.md` §15; `DESIGN_SYSTEM.md` §18 |
| Development rules | `README.md` §14 |
| Quality framework (weights, gates, critic contract, reports) | `DESIGN_QUALITY_METRICS.md` §2, §4, §7, §12 |
| Quality engine implementation | `src/quality/pipeline.ts`, `src/quality/evaluator/`, `src/quality/validators/` |
| Design document model & schema validation | `src/core/design-document/types.ts`, `src/core/design-document/validation.ts` |
| Quality CLI and fixtures | `src/quality/cli.ts`, `tests/fixtures/` |
| Test / typecheck commands | `npm test`, `npx tsc --noEmit` |

**When in doubt:** preserve the working system, follow `README.md` and `DESIGN_SYSTEM.md`, keep creative intelligence separate from graphics execution, validate before declaring done — and ask the user when the spec and the task genuinely conflict.
