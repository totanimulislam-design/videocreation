# AGENTS.md — Coding Agent Instructions

This file governs **development agents modifying this repository**. It is not a runtime AI design prompt. Runtime creative decisions are governed by `DESIGN_SYSTEM.md`; compositional strategy by `DESIGN_PATTERNS_LIBRARY.md`; architecture and contracts by `DESIGN_ENGINE_SPEC.md`; evaluation and acceptance by `DESIGN_QUALITY_METRICS.md`. `README.md` is the documentation index and records verified repository status.

## 1. Authority and truthfulness

1. Inspect the actual repository, source, tests, and configuration before designing a change. The implementation and tests determine what exists; documentation describes intent and may be aspirational.
2. Do not claim a feature, test, dependency, module, or architecture exists until verified in tracked source. Do not infer implementation from a diagram, TypeScript example, roadmap, or prose.
3. When documentation conflicts, follow the authority order in `README.md`, preserve user-provided facts, and update the conflicting docs in the same change when appropriate. Do not silently choose a behavior that changes the contract.
4. Preserve existing behavior and project architecture unless the request justifies a change. Avoid speculative packages, empty modules, wholesale rewrites, and unrelated cleanup.
5. Distinguish implemented, partially implemented, proposed, and not verified. Report uncertainty and missing requirements plainly.

## 2. Task execution

For substantive tasks:

1. Read relevant docs and inspect files, history/context where useful, dependencies, and tests.
2. Identify the user outcome, current behavior, constraints, affected modules, and failure modes.
3. Plan the smallest coherent change. For design-platform work, follow the Engine Spec’s canonical responsibilities and data contract; do not let AI output bypass schema or document validation.
4. Implement in existing patterns and modules. Keep responsibilities separated, types/contracts explicit, error states actionable, and user data safe.
5. Add or update tests at the correct level. Run relevant format, lint, type, unit, integration, visual, or build checks that actually exist.
6. Inspect the diff for unrelated edits, accidental removals, generated artifacts, secrets, and inaccurate docs.
7. Summarize what changed, checks run and results, limitations, and follow-up work. Never say a check passed if it was not run.

For a documentation-only repository, do not invent codebase paths or test commands. Record the absence of implementation where it affects claims.

## 3. Engineering boundaries

- Keep user interface, runtime AI orchestration, deterministic design/layout logic, scene/document model, rendering, quality checks, and export responsibilities separable. Adapt boundaries to the established codebase rather than creating modules to match a speculative diagram.
- Treat the structured design document as the source of truth for editor, renderer, and export. Validate untrusted user/AI input at boundaries; never execute AI-generated code or arbitrary markup.
- Runtime AI may propose intent and structured plans; deterministic code owns geometry, text measurements, constraint checks, document construction, and export behavior. The renderer renders; it does not certify quality. Hard quality failures cannot be hidden by a weighted score.
- Preserve editability and source asset references where required. Handle intentional overlaps differently from accidental collisions; avoid “fixes” that damage intended art direction.
- Use explicit types, stable IDs, safe parsing, finite/range checks, useful errors, and backward-compatible migrations where a persisted document format exists.
- Prefer small, composable, testable units and existing dependencies. Avoid duplicated business rules or parallel schemas.

## 4. Security, privacy, and reliability

- Never expose API keys, credentials, or private configuration in browser bundles, logs, fixtures, docs, or commits. Keep provider secrets server-side and use environment/configuration conventions already present.
- Validate uploaded assets and AI responses; do not trust SVG, image metadata, file names, URLs, coordinates, or serialized documents. Apply size/type limits and safe parsing appropriate to the existing stack.
- Avoid logging sensitive user content. Use timeouts, bounded retries, cancellation, clear failure states, and non-destructive save/update behavior where relevant.
- Do not silently discard user content or errors. Protect against destructive edits, preserve originals when feasible, and explain irreversible operations.
- Consider performance and accessibility as functional requirements, not decorative polish. Do not introduce a performance optimization that breaks editing correctness or accessibility.

## 5. User experience, ambiguity, and accessibility

Do not silently resolve a materially ambiguous requirement, destructive operation, or missing factual content. Ask for clarification when blocked; otherwise choose the least surprising reversible assumption and document it. Preserve user content exactly unless asked to edit it.

For interactive features, retain keyboard access, visible focus, semantic roles/labels, understandable errors, and usable contrast. Test accessibility behavior with tools available in the project; do not assume that an attractive interface is accessible. For exported artwork, preserve legible essential text and evaluate relevant color contrast, while recognizing that this does not replace editor-UI accessibility.

## 6. Testing and visual verification

Test the changed behavior and regressions using tools that are actually configured in the repository. For design/rendering features, include fixtures for bounds/overflow, intentional vs accidental overlap, layer order, preview/export parity, supported scripts and direction, missing assets/fonts, and output-size constraints as relevant.

When visual behavior changes, inspect the rendered result at intended sizes. Numerical or source-only checks do not prove visual quality. Conversely, visual approval does not replace structural, security, content, or export checks. If rendering or visual review is unavailable, state that limitation rather than implying it was verified.

A feature is not complete merely because code compiles. Its relevant acceptance criteria, error handling, tests, documentation, and user-facing behavior must be checked.

## 7. Design decision references

When implementation decisions involve creative principles, use this process:

- `DESIGN_SYSTEM.md`: meaning, use, implementation, common mistakes, and visual validation of principles and directions.
- `DESIGN_PATTERNS_LIBRARY.md`: pattern selection, adaptation and composition metadata; never treat a pattern as fixed coordinates.
- `DESIGN_ENGINE_SPEC.md`: canonical contracts, stages, deterministic responsibilities, renderer boundary, and technical strategy.
- `DESIGN_QUALITY_METRICS.md`: measurable checks, subjective critique evidence, hard gates, score and revision policy.

Do not copy long runtime design prompts into code-agent instructions. Keep runtime instruction changes with the design documents and application prompt/configuration when one exists.

## 8. Completion report

Report concisely:

- Files/behavior changed and why.
- Checks actually run, including failures or skipped checks.
- Whether behavior is implemented or remains a documented target.
- Known limitations, risks, and sensible next steps.

Never claim that a design is professional, a release is production-ready, or an implementation is complete based only on an unverified document or a successful render.
