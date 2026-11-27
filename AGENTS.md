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

---

# AGENTS.md
# AI Agent Instructions — Professional Graphic Design Platform

> **Primary Mission:** Build a professional, AI-assisted, code-driven graphic design platform capable of producing original, high-quality visual communication designs comparable to work created by experienced professional graphic designers using Adobe Illustrator and other professional design tools.

This document defines mandatory instructions for all AI coding agents working inside this repository.

These instructions apply to:
- GitHub Copilot
- Claude Code
- Cursor AI
- OpenAI coding agents
- Other AI-powered development tools
- Human developers using AI assistance

---

# 1. Core Mission and Development Philosophy

This project is not intended to be another basic template-based graphic design tool.

The goal is to build a professional design platform that can understand visual communication, develop creative concepts, construct sophisticated compositions, and produce editable, production-quality designs.

The platform should support:

- Digital posters
- Promotional banners
- Advertising graphics
- Flyers
- Brochures
- Business cards
- Social media graphics
- Educational graphics
- Event graphics
- Magazine and editorial layouts
- Product advertisements
- Corporate identity materials
- Infographics
- Other professional graphic design formats

## 1.1 Fundamental Development Principle

**AI should think creatively, the design engine should construct accurately, and the renderer should produce consistently.**

The platform must separate these responsibilities:

| System | Responsibility |
|---|---|
| AI Intelligence | Understand briefs, develop concepts, suggest art direction |
| Creative Direction Engine | Select visual style, composition, mood, and design approach |
| Composition Engine | Calculate layout, hierarchy, spacing, and element positions |
| Design Engine | Construct editable vector and image elements |
| Typography Engine | Handle font selection, text layout, and multilingual rendering |
| Rendering Engine | Produce accurate visual output |
| Quality Engine | Evaluate, detect problems, and recommend improvements |
| Export Engine | Generate production-ready output files |

Do not combine all responsibilities into one giant component or one unstructured AI prompt.

---

# 2. Mandatory Documentation Reading

Before making substantial changes, read the documentation relevant to the task.

The following files define the project's design and engineering standards.

| File | Purpose |
|---|---|
| `README.md` | Project vision, architecture, technical overview |
| `DESIGN_SYSTEM.md` | Visual design principles, typography, color, spacing, art direction |
| `DESIGN_QUALITY_METRICS.md` | Design evaluation, quality scoring, validation |
| `DESIGN_PATTERNS_LIBRARY.md` | Professional composition patterns and layout strategies |
| `AGENTS.md` | AI development instructions and coding standards |

## 2.1 Documentation Priority

Follow this priority:

1. `AGENTS.md` — development behavior and implementation rules.
2. `README.md` — overall system architecture and project direction.
3. `DESIGN_SYSTEM.md` — visual design standards.
4. `DESIGN_PATTERNS_LIBRARY.md` — composition strategies.
5. `DESIGN_QUALITY_METRICS.md` — quality evaluation.

If documentation conflicts with the actual implementation, inspect the codebase and determine the safest consistent solution.

Do not assume that a documented feature already exists.

Do not claim that a feature is implemented unless the source code confirms it.

## 2.2 Before Every Major Task

1. Inspect the relevant files.
2. Understand existing architecture.
3. Identify dependencies.
4. Identify affected components.
5. Review related documentation.
6. Plan the implementation.
7. Implement changes.
8. Run appropriate checks.
9. Report what changed and what remains incomplete.

Do not start rewriting files before understanding their current behavior.

---

# 3. Repository Inspection Rules

Before implementing a feature:

- Inspect the project folder structure.
- Identify the framework and programming language.
- Inspect package dependencies.
- Find relevant existing components.
- Identify shared utilities and design tokens.
- Understand state management.
- Understand rendering and export mechanisms.
- Inspect existing tests.
- Identify existing user-facing behavior.

## 3.1 Never Assume the Architecture

Do not assume:

- The project uses React.
- The project uses TypeScript.
- The project uses SVG for all rendering.
- A particular state management library exists.
- A particular export library exists.
- An AI provider is already connected.

Inspect the repository and use the existing technology stack unless a justified architectural improvement is necessary.

## 3.2 Avoid Unnecessary Rewrites

Do not rewrite the entire project to implement a small feature.

Prefer focused, maintainable changes.

Before replacing an existing system:

1. Understand why it exists.
2. Identify its dependencies.
3. Determine whether it is actually defective.
4. Evaluate migration risks.
5. Preserve unrelated functionality.

---

# 4. Professional Design Quality Requirements

The most important product requirement is visual quality.

A technically functional design is not automatically a professionally designed graphic.

The AI must consider:

- Creative direction
- Originality
- Composition
- Visual hierarchy
- Typography
- Color relationships
- Alignment
- Spacing
- Image quality
- Shape language
- Depth
- Readability
- Communication effectiveness
- Technical output quality

## 4.1 Design Like a Professional Art Director

Before generating a design, the system should determine:

1. What is the primary communication objective?
2. Who is the target audience?
3. What should viewers notice first?
4. What emotional response should the design create?
5. Which art direction is appropriate?
6. Which composition structure best supports the content?
7. What typography approach should be used?
8. What imagery or illustration is necessary?
9. How should the viewer's attention move?
10. What should be removed to improve the composition?

Do not immediately place all supplied content onto the canvas.

First establish a visual strategy.

## 4.2 Never Default to Generic Templates

Avoid automatically producing:

- Centered headline with image below.
- Four identical rounded cards.
- Random floating circles.
- Excessive gradient backgrounds.
- Unnecessary icons.
- Repeated decorative badges.
- Identical layouts for different industries.
- Generic AI-style promotional compositions.

Use these structures only when they genuinely serve the design objective.

## 4.3 Originality Requirements

A new design should not merely change:

- Background color
- Font
- Image
- Decorative shapes
- Border radius

Meaningful originality may involve changing:

- Composition topology
- Focal point
- Reading flow
- Typography arrangement
- Image treatment
- Visual density
- Negative-space distribution
- Grid structure
- Shape language
- Layer relationships

---

# 5. Mandatory Design Generation Workflow

Every substantial design-generation task must follow this workflow.

## Phase 1 — Brief Interpretation

Extract:

- Design category
- Main objective
- Target audience
- Brand identity
- Main headline
- Supporting text
- Important details
- CTA
- Required output dimensions
- Language requirements
- Visual preferences

If essential information is missing, use reasonable design assumptions where possible.

Ask the user only when missing information materially affects the result.

## Phase 2 — Creative Direction

Develop a visual direction containing:

- Design style
- Mood
- Color direction
- Typography direction
- Image direction
- Shape language
- Visual density
- Overall composition approach

Possible art directions include:

- Swiss International
- Editorial Minimalism
- Luxury
- Modern Corporate
- Bauhaus
- Art Deco
- Neo-Brutalism
- Experimental Typography
- Cinematic
- Contemporary Advertising
- Geometric Modernism
- Minimalist
- Documentary
- Expressive Editorial

Do not force a style when another direction is more suitable.

## Phase 3 — Composition Selection

Consult `DESIGN_PATTERNS_LIBRARY.md`.

Select:

- One primary composition pattern.
- Zero to two supporting patterns.
- Appropriate image treatment.
- Appropriate background treatment.

Do not randomly combine unrelated patterns.

## Phase 4 — Design Planning

Create a structured composition plan.

Define:

- Canvas dimensions
- Grid
- Margins
- Content zones
- Focal point
- Visual hierarchy
- Reading direction
- Element relationships
- Layer order
- Typography scale
- Color palette

## Phase 5 — Design Construction

Build the actual design using editable design objects.

Prefer reusable components and structured scene-graph data.

## Phase 6 — Visual Refinement

Refine:

- Typography
- Alignment
- Spacing
- Proportions
- Image cropping
- Color harmony
- Contrast
- Layering
- Shadows
- Effects
- Negative space

## Phase 7 — Quality Evaluation

Consult `DESIGN_QUALITY_METRICS.md`.

Evaluate the design and identify weak areas.

## Phase 8 — Revision

Make targeted improvements.

Do not add unnecessary decorative elements merely to make the design appear more complex.

## Phase 9 — Final Validation

Verify:

- Visual quality
- Text accuracy
- Font rendering
- Image quality
- Element positions
- Layer order
- Editability
- Export integrity

---

# 6. Architecture and Code Quality Rules

## 6.1 Separation of Responsibilities

Keep the following responsibilities separate whenever the project architecture supports it:

- AI orchestration
- Creative direction
- Composition planning
- Layout calculations
- Typography
- Vector construction
- Image processing
- Scene graph
- Canvas rendering
- Interaction handling
- Design validation
- Export

Avoid creating components that simultaneously handle AI communication, layout calculation, rendering, and export.

## 6.2 Modular Architecture

Build reusable modules.

A feature should be implemented in an appropriate location rather than duplicating similar logic across unrelated files.

## 6.3 Reusability

Prefer reusable:

- Components
- Hooks
- Utilities
- Design tokens
- Layout algorithms
- Vector primitives
- Typography functions
- Export utilities
- Validation functions

Do not create duplicate implementations without a clear reason.

## 6.4 Type Safety

When the project uses TypeScript:

- Define explicit interfaces.
- Avoid unnecessary `any`.
- Validate external AI responses.
- Use discriminated unions where appropriate.
- Keep shared types in appropriate locations.
- Validate data at system boundaries.

## 6.5 Error Handling

Every external or asynchronous operation should have appropriate error handling.

Examples:

- AI provider errors
- Invalid design JSON
- Missing fonts
- Failed image loading
- Invalid SVG
- Export failures
- Unsupported features
- Corrupted project data

Never silently discard errors that could damage the user's work.

---

# 7. Editable Vector Design Requirements

The platform must prioritize structured, editable design objects.

## 7.1 Editable Elements

Where technically possible, preserve:

- Text
- Shapes
- Paths
- Images
- Frames
- Lines
- Backgrounds
- Gradients
- Masks
- Groups
- Effects
- Layers

## 7.2 Avoid Flattening

Do not flatten an entire composition into one image during normal editing.

A flattened image may be used for:

- Preview
- Thumbnail
- Temporary rendering
- Final raster export

But the original design document must preserve its editable structure.

## 7.3 Scene Graph

Use a structured representation for design elements.

Example:

```ts
interface DesignDocument {
  id: string;
  version: number;

  canvas: {
    width: number;
    height: number;
    background: string;
  };

  elements: DesignElement[];
}

interface DesignElement {
  id: string;

  type:
    | "text"
    | "shape"
    | "image"
    | "path"
    | "group";

  name: string;

  x: number;
  y: number;

  width: number;
  height: number;

  rotation?: number;
  opacity?: number;

  visible?: boolean;
  locked?: boolean;

  children?: DesignElement[];
}
```

Adapt this structure to the existing implementation instead of blindly replacing the current data model.

---

# 8. Typography Engineering Rules

Typography is a core design capability.

Do not treat it as a simple text-rendering feature.

The system should support:

- Multiple font families
- Font weights
- Font styles
- Font sizes
- Line height
- Letter spacing
- Paragraph spacing
- Text alignment
- Text wrapping
- Text clipping
- Text transformation
- Text outlines
- Text shadows
- Text-on-path where supported
- Text masks where supported

## 8.1 Multilingual Requirements

The platform should support:

- English
- Bengali
- Arabic
- Urdu
- Other Unicode-compatible scripts where possible

Pay special attention to:

- Bengali conjuncts
- Bengali vowel signs
- Arabic joining behavior
- Arabic ligatures
- Right-to-left text
- Mixed-direction text
- Font fallback
- Unicode normalization
- Line breaking

Never assume that a font file supports every character in a language.

Test actual rendering.

## 8.2 Typography Hierarchy

Use a clear relationship between:

- Display typography
- Main headline
- Section heading
- Subheading
- Body text
- Captions
- Labels
- CTA

Avoid unnecessary font-family variation.

---

# 9. Image and Illustration Engineering

Images and illustrations must support the communication objective.

## 9.1 Image Handling

Support appropriate image operations:

- Crop
- Resize
- Rotate
- Mask
- Clip
- Remove background
- Adjust brightness
- Adjust contrast
- Adjust saturation
- Apply overlays
- Apply filters
- Add shadows

## 9.2 Vector Illustration

Use vector graphics when suitable.

Support:

- SVG paths
- Basic geometry
- Custom shapes
- Curves
- Clipping
- Masks
- Gradients
- Stroke styles
- Reusable symbols

## 9.3 AI-Generated Images

AI-generated imagery can be used as a visual asset.

However:

- Do not replace the entire editable composition with a generated poster image.
- Preserve text as editable text whenever possible.
- Preserve vector elements as editable objects.
- Ensure image assets fit the selected art direction.
- Inspect image quality and subject consistency.
- Do not claim an image is vector-editable unless it actually is.

---

# 10. Color and Visual Styling Rules

Use a deliberate color system.

The platform should support:

- Solid fills
- Linear gradients
- Radial gradients
- Mesh gradients where supported
- Transparency
- Blend modes
- Stroke colors
- Background treatments
- Color palettes
- Theme-based colors

## 10.1 Color Selection

Choose colors according to:

- Brand identity
- Audience
- Industry
- Emotional objective
- Image content
- Accessibility
- Print or digital medium

Do not select colors randomly.

## 10.2 Effects

Effects may include:

- Shadows
- Blur
- Glow
- Stroke
- Inner shadow
- Gradient overlay
- Texture
- Opacity
- Blend modes

Effects must have a clear purpose.

Avoid applying every available effect to every object.

---

# 11. Canvas Editor Requirements

The editing experience should support professional creative workflows.

Where relevant, preserve or implement:

- Element selection
- Multi-selection
- Drag and drop
- Resize
- Rotation
- Alignment
- Distribution
- Group
- Ungroup
- Lock
- Unlock
- Hide
- Show
- Duplicate
- Delete
- Copy
- Paste
- Undo
- Redo
- Layers
- Z-order
- Guides
- Snapping
- Zoom
- Pan
- Contextual toolbar
- Keyboard shortcuts

## 11.1 Interaction Quality

Interactions must feel predictable and accurate.

Avoid:

- Cursor-following bugs
- Unintended dragging
- Lagging color pickers
- Incorrect selection states
- Unexpected object resizing
- Lost selection after toolbar actions
- Broken undo history

## 11.2 Selection and Editing

Every selectable object should have a clear selection state.

Text editing should not accidentally trigger canvas dragging.

Resizing should preserve the intended aspect ratio when appropriate.

Group and ungroup operations must preserve element positions and visual appearance.

---

# 12. AI Integration Rules

AI should be used for tasks that benefit from reasoning and creativity.

Examples:

- Brief interpretation
- Creative concept development
- Art direction
- Pattern selection
- Content hierarchy
- Design planning
- Image prompt development
- Design critique
- Revision recommendations

Do not use an AI API for simple deterministic calculations that can be handled locally.

## 12.1 Structured AI Responses

Prefer structured JSON outputs for design plans.

Validate every AI response before passing it to the rendering engine.

Never trust unvalidated AI-generated coordinates, styles, or object definitions.

## 12.2 Provider Independence

Keep AI provider integration modular.

Avoid tightly coupling the design engine to one provider.

The system should allow future integration of different models and services.

## 12.3 API and Security

- Never expose secret API keys in frontend code.
- Use secure server-side operations for protected API credentials.
- Validate user input.
- Apply request limits where necessary.
- Handle provider failures gracefully.
- Never log sensitive credentials.

## 12.4 Cost and Performance

Use AI only where it provides meaningful value.

Consider:

- Prompt size
- Image token usage
- Model selection
- Caching
- Request reuse
- User quotas
- Fallback behavior

Do not make every small canvas interaction trigger an AI request.

---

# 13. Performance Requirements

The platform should remain responsive with complex designs.

Consider:

- Efficient rendering
- Avoiding unnecessary re-renders
- Memoization where appropriate
- Image optimization
- Lazy loading
- Background processing where supported
- Debouncing expensive operations
- Efficient state updates
- SVG optimization
- Large-document handling

Never sacrifice editing accuracy for a superficial performance improvement.

---

# 14. Export and Production Requirements

Export must preserve the intended appearance as closely as the target format allows.

Supported output formats may include:

- SVG
- PNG
- JPEG
- PDF

## 14.1 Digital Export

Validate:

- Pixel dimensions
- Resolution
- Transparency
- Color appearance
- Image quality
- Font rendering
- Cropping

## 14.2 Print Export

Where print production is required, support:

- Physical dimensions
- Bleed
- Safe area
- Crop marks where needed
- Appropriate resolution
- Color profile management
- Font embedding or outlining
- PDF production settings

Do not claim professional print readiness without validating the relevant production requirements.

---

# 15. Testing and Validation

Every meaningful code change must be tested appropriately.

## 15.1 Code Validation

Where available, run:

- Type checking
- Linting
- Unit tests
- Integration tests
- Build checks

## 15.2 Visual Validation

For design-related features, inspect actual rendered output.

Check:

- Layout correctness
- Typography
- Image positioning
- Spacing
- Alignment
- Layering
- Clipping
- Responsiveness
- Readability

A successful build does not prove that a design feature works correctly.

## 15.3 Regression Testing

Before completing a change, verify that unrelated existing functionality remains intact.

Especially check:

- Existing design documents
- Canvas interactions
- Selection behavior
- Typography
- Layer management
- Export
- Undo and redo
- Responsive layout

## 15.4 Quality Gate

Use `DESIGN_QUALITY_METRICS.md` to evaluate generated design outputs.

The target quality score should be 90 or above.

A score below 85 should trigger revision before the design is presented as production-ready.

Critical failures such as unreadable text, broken layout, missing assets, or corrupted output must prevent approval regardless of the total score.

---

# 16. File and Code Modification Rules

## 16.1 Before Editing

- Read the complete relevant implementation.
- Understand dependencies.
- Identify the actual cause of the issue.
- Plan the smallest reliable change.

## 16.2 During Editing

- Preserve existing behavior unless modification is requested.
- Follow existing coding conventions.
- Use existing reusable components.
- Avoid unnecessary dependencies.
- Avoid duplicated logic.
- Keep changes focused.
- Maintain type safety.

## 16.3 After Editing

- Inspect the final diff.
- Remove unused code introduced by the change.
- Run relevant checks.
- Fix introduced errors.
- Confirm affected functionality.
- Document important architectural changes.

## 16.4 Destructive Changes

Never delete or replace an existing feature merely because a new implementation appears simpler.

Before destructive changes:

1. Identify dependencies.
2. Identify user-facing behavior.
3. Check whether data migration is required.
4. Check whether backward compatibility matters.
5. Explain significant risks.
6. Implement safely.

If the user explicitly requests removal, remove the relevant feature and its obsolete dependencies without damaging unrelated systems.

---

# 17. User Experience and Interface Design Standards

The platform itself must follow professional product design principles.

The UI should be:

- Clear
- Consistent
- Responsive
- Accessible
- Efficient
- Visually refined
- Predictable

Avoid:

- Unnecessary controls
- Overcrowded toolbars
- Inconsistent spacing
- Confusing labels
- Repeated settings
- Poor visual grouping
- Excessive nested panels
- Decorative UI that harms usability

Use contextual controls when they make the workflow easier.

A professional editor should expose the right tools at the right time.

---

# 18. Accessibility Requirements

Where applicable:

- Provide keyboard accessibility.
- Use meaningful labels.
- Maintain adequate contrast.
- Support focus states.
- Avoid color-only communication.
- Provide accessible controls.
- Respect reduced-motion preferences.
- Ensure readable text sizes.

Accessibility must not be treated as an optional visual enhancement.

---

# 19. Handling Incomplete or Ambiguous Requirements

If the user requests a feature but the implementation details are unclear:

1. Inspect existing code.
2. Identify the intended behavior.
3. Use established project conventions.
4. Choose a reasonable implementation.
5. Ask a concise clarification only when necessary.

Do not repeatedly ask the user questions that can be answered by inspecting the repository.

Do not invent requirements.

Do not silently change the scope of a task.

---

# 20. Development Task Execution Protocol

For each substantial task, follow this protocol.

### Step 1 — Understand

Read the request and relevant documentation.

### Step 2 — Inspect

Explore the repository and existing implementation.

### Step 3 — Analyze

Identify the affected architecture and possible risks.

### Step 4 — Plan

Define a clear implementation strategy.

### Step 5 — Implement

Make focused, maintainable changes.

### Step 6 — Test

Run relevant checks and inspect the result.

### Step 7 — Refine

Fix issues introduced by the implementation.

### Step 8 — Report

Explain:

- What was implemented
- Which files were changed
- How the implementation works
- Which tests were performed
- What remains incomplete
- Any known limitations

Never claim tests passed if they were not run.

---

# 21. Definition of Done

A task is not complete merely because code has been written.

A feature is considered complete only when:

- [ ] The requested functionality is implemented.
- [ ] Existing relevant functionality remains intact.
- [ ] The implementation follows the project architecture.
- [ ] Code is maintainable and reasonably modular.
- [ ] Appropriate error handling exists.
- [ ] Type checks pass where applicable.
- [ ] Relevant tests pass.
- [ ] The actual UI or rendered output has been inspected where relevant.
- [ ] No known critical regression remains.
- [ ] Documentation is updated when necessary.
- [ ] Remaining limitations are communicated honestly.

For design-generation features:

- [ ] The design follows the selected creative direction.
- [ ] The composition supports the content.
- [ ] Visual hierarchy is clear.
- [ ] Typography is readable and correctly rendered.
- [ ] Images and illustrations are appropriate.
- [ ] Spacing and alignment are refined.
- [ ] The composition is not a generic template.
- [ ] Elements remain editable where technically possible.
- [ ] Quality evaluation has been performed.

---

# 22. Final Non-Negotiable Rules

Every AI agent working on this repository must follow these principles:

1. Read relevant documentation before substantial implementation.
2. Inspect the existing codebase before changing it.
3. Never assume an architecture that has not been verified.
4. Never unnecessarily rewrite working systems.
5. Prioritize professional design quality over decorative complexity.
6. Treat composition as a deliberate design decision.
7. Avoid generic, repetitive AI-generated layouts.
8. Prefer editable vector-based construction.
9. Preserve multilingual typography accuracy.
10. Separate AI reasoning from deterministic rendering.
11. Validate AI-generated structured data.
12. Protect API credentials and user data.
13. Test actual functionality rather than relying only on successful compilation.
14. Evaluate visual output before approving design-generation features.
15. Preserve existing user data and project functionality.
16. Never claim an implementation or test is complete without verification.
17. Make meaningful improvements rather than cosmetic changes.
18. Keep the platform extensible and production-oriented.

---

# 23. Ultimate Product Standard

The platform must evolve into a professional creative design environment.

It should not behave like a simple template generator, a text-to-image wrapper, or a collection of decorative UI components.

It must combine:

- Creative intelligence
- Professional art direction
- Composition planning
- Vector design construction
- Advanced typography
- Image and illustration processing
- Precise editing tools
- Design quality evaluation
- Production-ready export

**The AI agent's responsibility is not simply to make the application work. Its responsibility is to help build a design platform capable of producing original, visually sophisticated, technically accurate, and professionally usable graphic designs.**
