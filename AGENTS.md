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
