# AGENTS.md — Instructions for AI Coding Agents

This file tells any AI coding agent (or human contributor) how to work safely and effectively in this repository. Read it completely before making any change. If anything here conflicts with a direct instruction from the user, ask the user which takes precedence.

---

## 1. Repository Status (as of 2026-11-27)

- This repository currently contains **documentation only** — `README.md` is the full specification for "Creative Studio", a professional, code-powered graphic design platform.
- **No application source code exists yet.** There is no `package.json`, no `src/` tree, no build tooling, and no test runner. Do not assume any of these exist.
- `DESIGN_SYSTEM.md` is referenced by the mandatory instructions below but **does not exist in this repository yet** (checked the working tree, git history, and all branches). Until it is created, `README.md` is the sole authoritative source of truth. Do not invent its contents or cite it as if it exists; if a task genuinely requires it, stop and ask the user, or create it deliberately as its own documented change.
- The README itself describes a *target* architecture. Where the README and reality differ, reality wins and the README/AGENTS.md should be updated to reflect it.

---

## 2. Mandatory Instructions (read before implementing anything)

1. Read `README.md` **completely** before implementing any feature. It is long (~2,100 lines) and dense — skim the Table of Contents first, then read in full.
2. Read `DESIGN_SYSTEM.md` if and when it exists. Until then, treat the design guidance embedded in `README.md` (especially sections 3–11 and "Production-Grade AI Graphic Design Architecture") as the design system.
3. Understand the existing project architecture before editing. Today that means understanding the spec; once code lands, it means reading the modules you touch.
4. Follow the established design document schema. The canonical object shape is the `DesignElement` interface in `README.md` ("5.1 Use a Structured Vector-Based Design Document"): `id`, `type`, `name`, `transform` (x, y, width, height, rotation, scaleX, scaleY), `style` (fill, stroke, strokeWidth, opacity, blendMode), optional `effects`, `visible`, `locked`, `zIndex`, optional `children`. Extend it with type-specific properties (typography for text, crop/asset refs for images, path data for paths) rather than inventing parallel structures.
5. Reuse existing rendering and graphics systems. Do not introduce a second canvas library, a second rendering path, or a parallel object model.
6. Do not introduce duplicate or conflicting systems (e.g., two state stores, two schema validators, two export pipelines).
7. Never bypass the design production pipeline (see §5 below). A design that has not passed through the pipeline stages is not done, regardless of how it looks.
8. Preserve existing working functionality. Do not refactor, delete, or "improve" working code that is unrelated to the task.
9. Validate every implementation (see §7 below). "It renders" is not validation.
10. Update documentation when architecture changes. If you change the schema, the pipeline, the directory structure, or the tech stack, update `README.md` and this file in the same change.

For all AI-generated graphic designs, follow the complete design production workflow defined in `README.md` and (eventually) `DESIGN_SYSTEM.md`. Professional visual quality, editability, rendering accuracy, and production reliability are mandatory requirements, not stretch goals.

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
- **Revision budget.** Automated revision loops are capped (README suggests ~3 rounds) before handing back to the user. Never loop indefinitely.
- **Recommended stack** (use these unless an existing, working choice already covers the need): React + TypeScript, Tailwind CSS, SVG, HTML Canvas (rendering-intensive work), Konva/Fabric (interactive canvas — pick one, not both), Paper.js (geometry), Zustand (state), Zod (validation), Node.js backend, PostgreSQL, S3-compatible storage.
- **Technology selection rules:** don't introduce multiple canvas libraries without a clear technical reason; keep the design document renderer-independent; don't bypass the chosen stack for one-off needs; avoid unnecessary dependencies.
- **Target directory structure** is described in `README.md` §10. It is a target, not a mandate to create empty folders — implement modules incrementally as features land.
- **Naming/organization:** independent modules (`core/design-document`, `core/scene-graph`, `core/rendering`, `design-intelligence/*`, `graphics/*`, `editor/*`, `production/*`, `quality/*`, `shared/*`) communicating only through the common structured design document.

---

## 5. Mandatory Design Production Workflow

Whenever a user requests a new design, the agent MUST follow this workflow (README §11). Do not skip steps to generate faster.

1. **STEP 01 — Understand.** Analyze content, category, purpose, audience, language, output dimensions. Never invent important user-provided information; make reasonable assumptions only for what is missing.
2. **STEP 02 — Art Direct.** Decide visual concept, creative direction, and style. One dominant creative direction per design — never randomly mix unrelated styles.
3. **STEP 03 — Plan.** Establish layout, grid, hierarchy, typography, color palette, image strategy, shape language, and the focal point.
4. **STEP 04 — Generate.** Create the structured design document with real, editable elements (text, shapes, paths, images as positioned assets).
5. **STEP 05 — Render.** Render the document through the graphics engine (SVG/Canvas pipeline).
6. **STEP 06 — Inspect.** Evaluate the rendered composition for visual and technical problems.
7. **STEP 07 — Refine.** Fix weaknesses with targeted, local revisions — do not rebuild the whole design for a local flaw.
8. **STEP 08 — Validate.** Run structural, layout, typography, and export validation (README §7).
9. **STEP 09 — Deliver.** Hand over the final editable design plus the requested export formats.

### Design quality bar (from README)

Every design must demonstrate: strong visual hierarchy, professional typography and pairing, deliberate color theory, intelligent negative space, intentional composition (avoid repetitive template-like layouts), balanced visual weight, meaningful decorative elements only, and consistent visual language. Every element must have a visual purpose; every decision must serve the communication objective.

---

## 6. Editing & Change Discipline

- Work only on the branch designated for the session; do not create, switch to, or push other branches.
- Make the smallest change that fully satisfies the task. Preserve working functionality.
- Do not commit generated build artifacts or large datasets to Git; follow existing ignore conventions when code exists.
- Keep commits focused and descriptive; work lands on this branch via normal commits/PRs.
- When the architecture changes, update `README.md`, this file, and (once it exists) `DESIGN_SYSTEM.md` in the same change — documentation drift is a defect.
- Ask before adding new dependencies, new frameworks, or new infrastructure. Prefer the documented stack and existing patterns.

---

## 7. Validation Expectations

Match validation rigor to the change:

- **Documentation-only changes:** proofread for factual accuracy against the repo; verify every cross-reference, path, and claim (e.g., file existence) is true. Check markdown renders correctly.
- **Schema/model changes:** the design document must remain serializable, validated, and renderer-independent; update `DesignElement`-derived types and validators together; add or update tests.
- **Rendering changes:** verify preview and export consistency; check layering, transforms, typography, clipping, and transparency on representative documents.
- **Design output changes:** run the full §5 workflow, including inspection and validation, and confirm the output against the production acceptance criteria in README §15 (design quality, technical quality, production quality, AI quality checklists).
- **Export changes:** test the actual exported files (PDF/PNG/SVG), not just the editor preview — including dimensions, DPI, bleed, and transparency where applicable.

If validation tooling does not exist yet (it doesn't, today), say so explicitly in your delivery notes and describe exactly what you did verify and what you could not.

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

---

## 9. Quick Reference

| Topic | Where |
|---|---|
| Project vision, quality standards | `README.md` §1–3, §16, Final Quality Standard |
| Design categories supported | `README.md` §2 |
| Engine capabilities (vector, type, layout, images, effects) | `README.md` §4–7 (and Architecture §3–6) |
| Design document schema / object model | `README.md` "5.1 Use a Structured Vector-Based Design Document" |
| Mandatory AI workflow (STEP 01–09) | `README.md` §11 |
| AI system prompt / design rules | `README.md` §12 |
| QA engine (structural/layout/typography/visual/revision) | `README.md` §7 |
| Rendering & production pipeline | `README.md` §8 |
| Tech stack & selection rules | `README.md` §9, §12 (Technical Architecture) |
| Target directory structure | `README.md` §10 |
| Technology stack table | `README.md` §9 |
| Acceptance criteria checklists | `README.md` §15 (Production Acceptance Criteria) |
| Development rules | `README.md` §14 |

**When in doubt:** preserve the working system, follow the README, keep creative intelligence separate from graphics execution, validate before declaring done — and ask the user when the spec and the task genuinely conflict.
