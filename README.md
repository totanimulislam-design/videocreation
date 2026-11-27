# Creative Studio — Design Platform Documentation

> A documentation foundation for a proposed AI-assisted, editable graphic-design platform. This repository currently contains design and engineering documentation only; it does **not** contain application source, tests, package metadata, or a running implementation. Treat capabilities below as requirements or roadmap items unless implementation is later verified in source.

## Documentation map and authority

Read the document for the kind of decision being made; do not treat this README as a second implementation specification.

| Document | Audience | Authority |
|---|---|---|
| `AGENTS.md` | Coding agents and developers | Repository inspection, implementation, security, testing, and reporting behavior. It does not instruct the runtime design model. |
| `DESIGN_SYSTEM.md` | Runtime AI Designer and human designers | Creative principles, style direction, typography, color, assets, and visual decision rules. |
| `DESIGN_PATTERNS_LIBRARY.md` | Runtime AI Designer and composition implementation | Reusable compositional strategies and their selection/adaptation—not fixed templates. |
| `DESIGN_ENGINE_SPEC.md` | Implementers of the design platform | Proposed architecture, canonical data contract, deterministic construction, rendering boundary, and implementation strategy. |
| `DESIGN_QUALITY_METRICS.md` | Quality Engine, Runtime AI Designer, and human reviewers | Scoring, hard gates, validation procedures, critique, revision, and delivery statuses. |

**Precedence:** (1) the checked-out implementation and tests determine what exists; (2) `AGENTS.md` governs coding-agent behavior; (3) `DESIGN_ENGINE_SPEC.md` is authoritative for proposed architecture and shared data structures; (4) `DESIGN_SYSTEM.md` is authoritative for creative rules; (5) `DESIGN_PATTERNS_LIBRARY.md` supplies reusable structures subordinate to the brief and design system; (6) `DESIGN_QUALITY_METRICS.md` is authoritative for evaluation and acceptance. If a requirement conflicts with user content, preserve the user's factual content and flag unresolved ambiguity. If documents conflict, follow this precedence, resolve the conflict in documentation, and do not silently invent an implementation.

## Product intent

The intended product helps people create original, editable digital and print visual communications—such as posters, social graphics, flyers, brochures, cards, and editorial layouts. It should use structured content, deliberate art direction, layout and typography systems, an editable scene graph, rendering, and quality review rather than depend on fixed templates or a flattened generated image.

This is an aspirational product scope, **not a claim that any listed feature is built**. Specific feature acceptance criteria belong in the Engine Spec and Quality Metrics; visual judgment belongs in the Design System and Patterns Library.

## Shared terminology and responsibility boundaries

- **Coding Agent:** inspects and changes the repository, follows its real stack, implements and tests approved requirements, and reports verified outcomes. It does not act as the runtime designer or claim unbuilt functionality.
- **Runtime AI Designer:** interprets the brief and proposes creative intent, priorities, and revisions as validated structured data. It does not execute code, bypass validation, or directly render arbitrary markup.
- **Design Engine:** deterministic services that validate structured intent, calculate geometry and text/layout constraints, and construct an editable document/scene graph.
- **Renderer:** turns that document into a visual preview/output. Rendering is not a quality verdict.
- **Quality Engine:** runs deterministic checks and organizes evidence; visual critique is advisory and must cite rendered evidence. Hard failures cannot be overridden by a weighted score, and uncertain/production-sensitive decisions route to Human Review.
- **Human Review:** resolves subjective or ambiguous decisions, reviews failed/uncertain outputs, and approves production-sensitive delivery where required.

The normative end-to-end creative sequence is: **Brief Analysis → Communication Objective → Creative Direction → Composition Strategy → Visual Hierarchy → Typography → Color → Asset Selection → Construction → Rendering → Quality Evaluation → Revision.** Re-render and re-evaluate after revision; deliver only after acceptance. The detailed hand-offs and data contract are in `DESIGN_ENGINE_SPEC.md`.

## Implementation status

Repository inspection for this audit found only the six Markdown documents and `.gitignore` in the tracked tree. There is no source code, test suite, package manifest, or implementation to verify. Accordingly, architecture diagrams, schemas, module layouts, scoring rules, and feature descriptions in the specialist documents describe a **proposed target**, not shipped functionality. Do not use a “current implementation” claim unless source and tests are added and checked.

## Audit report — Task 01

### Summary of changes

- Replaced the former README’s overlapping product pitch and second, competing technical specification with this concise entry point, explicit authority order, role boundaries, status statement, audit findings, and a dependency-aware roadmap. Detailed creative and technical knowledge remains in the four specialist documents.
- Narrowed `AGENTS.md` to development-agent behavior. Runtime creative judgment is delegated to the design documents instead of repeated as a second AI system prompt.
- Made the exact creative workflow, six system responsibilities, canonical contract ownership, pattern-vs-template distinction, quality gates, and feature-status language explicit across the specialist documents.
- Added operational decision rules and validation procedures so the creative principles and quality targets can be implemented and tested.

### Resolved contradictions and duplication

1. **Two competing architecture descriptions:** the README’s long architecture and the Engine Spec described the same system with different labels and stage orders. The README is now an index; the Engine Spec owns the architecture and pipeline.
2. **Runtime designer vs coding agent:** `AGENTS.md` previously mixed repository tasks with runtime design-generation instructions. It now governs coding work only; creative decisions are specified in `DESIGN_SYSTEM.md`, patterns in the library, and acceptance in Quality Metrics.
3. **Pipeline ordering:** overlapping workflows omitted or reordered typography, color, assets, construction, render, and evaluation. One canonical sequence is stated above and detailed in the Engine Spec; quality evaluation is a downstream gate, not a parallel design stage.
4. **Pattern identity and template repetition:** composition examples could be read as coordinate templates. Patterns are now explicitly metadata/strategy; the Engine computes geometry from the canonical plan, brief, and canvas.
5. **Implementation claims:** the former README named `src/core`, `src/quality`, code modules, tests, and present limitations, although none of those paths or tests exists in the tracked repository. Those claims were removed and replaced with a verified documentation-only status; all capabilities are labeled as proposed until evidenced.
6. **Data-contract drift:** the pattern document had a second, incompatible `CompositionPlan`; the quality report example used `overallScore` while its TypeScript schema used `totalScore`. The Engine Spec now owns the shared plan and the report consistently uses `totalScore`.
7. **Quality score vs hard failure:** a numeric total could appear to approve a design that fails content/render/export. Acceptance now requires passing hard gates regardless of score, with reviewer escalation when visual evidence cannot be produced.
8. **“Implement it” vs no code:** requirements are preserved but distinguished from delivery status. The roadmap sequences implementation rather than implying it already exists.

### Missing or incomplete requirements

- No executable schemas, API/AI-provider integration, rendering/editor implementation, export pipeline, automated validators, tests, or build setup are present in this repository.
- The target contract still needs a versioned machine-readable schema and migration policy when implementation begins; the TypeScript shapes in the Engine Spec are illustrative contracts, not generated types.
- Font licensing/embedding, asset provenance and licensing, privacy/retention of user content, and content-safety policy need product decisions before production use.
- Print profiles, color management/ICC behavior, bleed and crop marks, PDF conformance, and the supported export formats need explicit product-level choices before “print-ready” can be claimed.
- The visual critic needs a defined evidence input, uncertainty behavior, reproducibility strategy, and human-review queue. It must not fabricate inspection results.
- Accessibility criteria for editor controls and exported design content need separate acceptance tests; visual color contrast alone is not sufficient.
- Undo/redo, persistence, collaboration, recovery, localization, and supported browser/device targets are not yet scoped as implementable contracts.

### Recommended implementation roadmap

1. **Foundation and scope:** select an initial use case and supported output; adopt the canonical document/brief/plan schemas from the Engine Spec, define units, IDs, defaults, validation errors, versioning, and migrations. Add schema and factory tests before UI or AI work.
2. **Deterministic document/render slice:** implement a minimal editable scene graph and one renderer/export path using the repository’s chosen stack (none is established here). Validate preview/export parity, bounds, asset references, and deterministic output.
3. **Typography and localization:** implement measured text layout, font availability/fallback, script shaping and direction, overflow detection, and multilingual visual regression fixtures before claiming multilingual support.
4. **Composition and editing:** add grid/spacing/layout constraints and a minimal editor with selection, transforms, undo/redo, and accessibility checks. Keep pattern metadata separate from computed geometry.
5. **AI orchestration:** define validated request/response schemas, provider boundary, factual-content preservation, prompt/version logging, security/privacy limits, and deterministic fallback. Have AI return plans, never executable markup.
6. **Quality gates:** implement deterministic validators and evidence-bearing reports first; add rendered-image critique only after a reliable renderer. Add bounded revisions (default maximum three), re-render/re-evaluation, and human escalation; test critical failures and score boundaries.
7. **Production output and hardening:** decide supported digital/print formats and color/print profiles, validate assets and licensing, add export conformance tests, performance/security testing, recovery, and release acceptance.

At every phase, update implementation status only from code and tests. Do not promise later-phase features as present.
