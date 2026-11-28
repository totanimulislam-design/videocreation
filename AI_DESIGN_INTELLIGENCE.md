# AI DESIGN INTELLIGENCE — TECHNICAL & CREATIVE SPECIFICATION
**Runtime AI Designer Architecture**

> **Mission:** Define the intelligence architecture for the Runtime AI Designer capable of producing sophisticated, original, editable, production-quality graphic designs.
>
> **Reference Documents:**
> - `DESIGN_ENGINE_SPEC.md` (Deterministic engine contract & schemas)
> - `DESIGN_SYSTEM.md` (Creative standards & art directions)
> - `DESIGN_PATTERNS_LIBRARY.md` (Compositional strategies)
> - `DESIGN_QUALITY_METRICS.md` (Evaluation & revision framework)

---

## 1. PRIMARY OBJECTIVE & ROLE
The Runtime AI Designer acts as the **Chief Creative Director** and **Principal AI Architect**. It translates unstructured briefs into structured design plans, coordinates with the deterministic Design Engine, critiques rendered outputs, and directs intelligent revisions.

**Core Responsibilities:**
- Brief Understanding & Communication Analysis
- Creative Concept Development & Art Direction Selection
- Composition Strategy & Visual Hierarchy Planning
- Typography, Color, and Asset Direction
- Structured Design Plan Generation (Schema-compatible)
- Visual Critique & Targeted Revision Planning

---

## 2. CREATIVE REASONING ARCHITECTURE (PIPELINE)

| Stage | Purpose | Required Inputs | Expected Outputs | Decision Logic | Validation Criteria | Failure Conditions | Recovery Strategy |
|---|---|---|---|---|---|---|---|
| **1. Brief Understanding** | Extract factual constraints & intent | User Brief | `DesignBrief` (Schema §4.2) | Distinguish essential vs optional; mark unknowns | All required content preserved; no invented facts | Missing critical content (e.g. dimensions) | Ask user (if safe) or make reasonable creative assumption (mark in brief) |
| **2. Communication Analysis** | Define primary message & audience response | `DesignBrief` | Objective Statement, Audience Profile | Map category to `DESIGN_SYSTEM.md` §11 | Objective supports brief; audience matches category | Contradictory requirements | Prioritize communication objective over aesthetic preference |
| **3. Audience Analysis** | Tailor visual language | Objective, Audience Profile | Audience Persona, Cultural Context | Cross-reference `DESIGN_SYSTEM.md` §4 & §11 | Tone matches audience; language requirements met | Language unsupported | Select fallback script-capable font; flag for review |
| **4. Creative Strategy** | Establish overall direction | Objective, Audience | Creative Concept (Name, Idea, Metaphor) | Compare concepts (diversity §12); select strongest | Concept supports objective; avoids generic templates | No distinct concept | Regenerate concepts with different visual metaphors |
| **5. Concept Development** | Flesh out visual approach | Creative Concept | Art Direction, Mood, Visual Metaphor | Consult `DESIGN_SYSTEM.md` §4 & `DESIGN_PATTERNS_LIBRARY.md` | Meaningful variation from previous designs | Repetitive structure | Shift composition/typography/image treatment |
| **6. Art Direction** | Select aesthetic language | Concept, Category | `ArtDirection` (Schema §5.1) | Match style to category/objective (§4.1-4.11) | Style supports mood; no cliché mixing | Incompatible style/category | Select compatible secondary influence |
| **7. Composition Strategy** | Define structure & flow | Art Direction, Content Density | `CompositionPlan` (Schema §6.1) | Select primary pattern (§2.2); adapt zones/grid | Focal point clear; reading flow intentional | Pattern conflicts with content | Select alternative pattern from library |
| **8. Visual Hierarchy** | Rank importance | Content Slots, Composition | HierarchyItem list, Focal Point | Assign roles (Primary→Utility) per §3.1 | Main message first; CTA visible | All elements equal prominence | Re-rank based on communication objective |
| **9. Typography Direction** | Script & style decisions | Hierarchy, Language | `TypographyToken` mapping | Select script-capable fonts; pair per §6.3 | Multilingual shaping correct; no overflow | Font unavailable/unsupported | Use fallback; flag for engine measurement |
| **10. Color Direction** | Palette & contrast | Art Direction, Brand | Color Tokens (Roles §7.2) | Assign roles; check contrast per §10.3 | Contrast >= WCAG AA; harmony supports mood | Low contrast/clashing | Adjust accent/background roles |
| **11. Asset Direction** | Image/vector selection | Concept, Composition | Asset Specifications | Determine necessity; crop/mask logic (§10) | Assets relevant; licensing/rights noted | Asset missing/low-res | Define fallback or vector reconstruction |
| **12. Structured Design Plan** | Machine-readable contract | All previous stages | `DesignDocument` (Schema §3.1) | Map to `DESIGN_ENGINE_SPEC.md` types | Schema valid; IDs unique; constraints set | Schema mismatch | Re-validate against `DESIGN_ENGINE_SPEC.md` |
| **13. Design Engine Execution** | Deterministic construction | `DesignDocument` | Scene Graph, Geometry | Engine calculates positions (§7.4) | No collisions (except intentional); bounds fit | Rendering error/collision | Trigger Revision Engine |
| **14. Rendered Output** | Visual evidence | Scene Graph | Preview/Export Image | Renderer uses `DESIGN_ENGINE_SPEC.md` §18 | Output matches document; no artifacts | Export failure | Report critical failure |
| **15. Visual Critique** | Evaluate actual result | Rendered Evidence, Plan | `DesignEvaluation` (§7) | Inspect against `DESIGN_QUALITY_METRICS.md` | Score >= 85; no critical failures | Score < 85 or failure | Identify weaknesses & priority |
| **16. Revision** | Targeted correction | Critique, Evidence | Revision Plan | Prioritize Critical→High→Medium (§8) | Smallest effective edit; preserve success | Unresolved after budget | Human Review |
| **17. Final Design** | Acceptance | Validated Document | Deliverable (SVG/PNG/PDF) | Pass all gates; score >= 90 (target) | Exportable; production-ready | Technical/Artistic failure | Reject/Human Review |

---

## 3. BRIEF INTELLIGENCE
The AI must parse the **User Brief** into the `DesignBrief` structure (§4.2 of `DESIGN_ENGINE_SPEC.md`).

**Analysis Dimensions:**
- **Category:** (Poster, Ad, Flyer, Brochure, Business Card, Social Media, Magazine, Corporate)
- **Purpose/Objective:** Primary message (e.g., "Announce admission", "Promote product")
- **Target Audience:** Demographics, culture, language (Bengali, English, Arabic, Urdu)
- **Main Message & Supporting Info:** Extract verbatim; classify priority (§4.3, §4.4)
- **Brand Identity:** Name, colors, existing identity (never invent)
- **Emotional Tone:** (Luxury, Minimalist, Neo-Brutalist, Educational, etc.)
- **Visual Preferences:** Style, mood, image direction
- **Platform/Dimensions:** Width, height, unit, medium (digital/print)
- **Language Requirements:** Script shaping, RTL/LTR, fallback
- **Required Assets:** Images, vectors, fonts
- **Content Priorities:** Critical vs Low
- **Constraints:** Bleed, safe area, export format

**Intelligence Rule:**
- **Essential vs Optional:** Preserve facts (names, dates, prices).
- **Assumptions:** Make reasonable creative assumptions for missing style/mood; **never** invent brand claims or contact info.
- **Classification:** Map content to Primary, High, Medium, Low, Contextual (§4.4).

---

## 4. CREATIVE CONCEPT GENERATION
Before planning, the AI develops **multiple directions** (normally 2–4 for exploration, 1 selected for execution).

**Concept Structure:**
1. **Concept Name** (e.g., "Geometric Academic Anchor")
2. **Creative Idea** (Core metaphor)
3. **Communication Strategy** (How message is delivered)
4. **Visual Metaphor** (Symbolic representation)
5. **Art Direction** (Style selection from §5)
6. **Composition Approach** (Pattern selection from §2.2)
7. **Typography Approach** (Role assignment)
8. **Color Direction** (Palette role distribution)
9. **Image Direction** (Treatment/Crop)
10. **Emotional Character** (Mood from `DESIGN_SYSTEM.md` §4)
11. **Expected Visual Impact** (Focal point strength)

**Comparison Logic:**
- Avoid superficial changes (color/font only).
- Compare **Structural Meaning** (e.g., Central Hero vs Split-Half vs Diagonal Dynamic).
- Select the concept that best serves the **Communication Objective** and **Audience Analysis**.

---

## 5. ART DIRECTION INTELLIGENCE
The AI selects and combines directions from `DESIGN_SYSTEM.md` §4.

| Direction | Visual Characteristics | Suitable Categories | Typography Behavior | Composition | Color Behavior | Image Treatment | Use Cases | Common Mistakes |
|---|---|---|---|---|---|---|---|---|
| **Swiss International** | Asymmetric grid, Sans-serif, Clean | Corporate, Editorial, Educational | Strong hierarchy, Left-aligned | Rational, Generous whitespace | Neutral, Functional | Minimal/Isolated | Professional posters | Forced symmetry, Over-decoration |
| **Editorial Design** | Sophisticated, Expressive, Image-led | Magazines, Brochures, Cultural | Display/Body pairing, Multi-column | Structured zones, Controlled negative space | Harmonious, Accent-driven | Integrated, Cropped | Covers, Reports | Cluttered text, Poor flow |
| **Minimalism** | Limited palette, Restraint, Simple geometry | Luxury, Stationery, Premium | Controlled scale, Wide spacing | Spacious, Focal isolation | Dominant/Neutral | Subtle/None | Branding, Cards | Empty/Generic look |
| **Luxury Design** | Elegant type, Restrained, Fine borders | Premium products, Corporate | Serif/Display pairing, Optical | Balanced, Sophisticated | Muted/Accent, Metallic-inspired | High-res, Masked | High-end ads, Brochures | Black/Gold cliché, Over-styling |
| **Corporate Design** | Professional, Structured, Trustworthy | Business, Institutional, Reports | Clear, Legible, Consistent | Grid-based, Aligned | Brand-driven, Stable | Consistent, Functional | Profiles, Cards | Template repetition |
| **Bauhaus** | Geometric, Primary colors, Functional | Cultural, Educational, Modernist | Experimental, Bold | Circle/Square/Triangle relations | Primary/Neutral | Abstract/Vector | Posters, Graphics | Random shapes, Weak function |
| **Art Deco** | Geometric ornament, Symmetrical, Elegant | Cultural, Luxury, Events | Elegant, Structured | Symmetrical, Repeated lines | Metallic-inspired, Contrast | Decorative, Framed | Posters, Promotions | Over-ornamentation |
| **Neo-Brutalism** | Bold type, High contrast, Thick borders | Youth, Experimental, Contemporary | Oversized, Blocky | Unconventional, Strong blocks | High contrast, Raw | Hard shadows, Cutout | Campaigns, Posters | Unreadable text, Chaos |
| **Modern Typography** | Expressive, Unusual scale, Text-object | Experimental, Creative, Fashion | Variable, Cropped, Rotated | Typography-led, Layered | Controlled, Functional | Integrated with type | Covers, Ads | Illegible, Random |
| **Experimental Graphic** | Unusual, Layered, Abstract | Creative, Arts, Music | Varied, Masked, Overlapping | Freeform, Dynamic | High energy, Mixed | Masked, Blended | Campaigns, Posters | Meaningless decoration |
| **Geometric Composition** | Shapes, Axes, Proportions | Corporate, Tech, Educational | Structured, Aligned | Grid/Modular, Calculated | Role-based, Balanced | Vector/Shape-integrated | Graphics, Diagrams | Rigid/Boring |
| **Contemporary Advertising** | Fast recognition, Strong CTA, Product | Ads, Banners, Social | Bold headline, Clear CTA | Split/Hero, Flowing | Brand/Accent, High contrast | Product-focused, Isolated | Banners, Social | Overcrowded, Weak CTA |
| **Educational Design** | Clear, Structured, Informative | Posters, Flyers, Brochures | Readable, Hierarchical, Multilingual | Structured grid, Zones | Functional, High contrast | Illustrative, Diagrammatic | Courses, Guides | Cluttered, Unclear |
| **Cinematic Visual** | Dramatic, Depth, Lighting | Entertainment, Campaigns | Layered, Large, Flowing | Layered depth, Overlap | Dark/Light, Gradient | Full-bleed, Masked | Posters, Banners | Flat, Weak depth |
| **Cultural/Traditional** | Pattern-based, Regional, Symbolic | Cultural, Events, Identity | Script-specific, Decorative | Radial/Framed, Symbolic | Regional palette, Rich | Illustrative, Patterned | Posters, Cards | Stereotypical, Inaccurate |

**Selection Rule:** Never apply blindly. Articulate **Meaning**, **Use**, **Implementation**, **Mistakes**, **Validation** (§4 of `DESIGN_SYSTEM.md`).

---

## 6. COMPOSITION DECISION ENGINE
Selection based on **Content Density**, **Text Count**, **Image Availability**, **Message**, **Audience**, **Category**, **Dimensions**, **Tone**, **Priority**.

**Approaches (mapped to `DESIGN_PATTERNS_LIBRARY.md`):**
1. **Asymmetric Editorial** (P22): Unequal weight, balanced. (Magazines, Culture)
2. **Centered Hero** (P01): Subject center, info around. (Events, Products)
3. **Split Composition** (P04): Two zones (Image/Text). (Comparisons, Education)
4. **Grid-based Layout** (P21/P23/P61): Columns/Modules. (Corporate, Info, Reports)
5. **Diagonal Composition** (P05): Movement axis. (Sports, Tech, Energy)
6. **Typography-led** (P31-P40): Text as visual object. (Bold posters, Fashion)
7. **Image-led** (P41-P50): Dominant image/portrait. (Lifestyle, Products)
8. **Modular Composition** (P23/P75): Reusable modules. (Brochures, Catalogs)
9. **Layered Composition** (P06/P56): Foreground/Background/Depth. (Cinematic, Tech)
10. **Full-bleed Image** (P03): Image covers canvas. (Photography, Lifestyle)
11. **Minimal Negative-space** (P87/P15): Breathing room focus. (Luxury, Minimal)
12. **Dynamic Geometric** (P51-P60): Shapes, Fragments, Chaos. (Modern, Youth)

**Selection Logic:**
- **Primary Pattern:** One ID from Library.
- **Supporting Patterns:** 0–2 IDs for complexity.
- **Adaptation:** Map to `CompositionPlan` zones, focal point (x,y,strength), reading flow (LTR/RTL/Vertical/Custom).
- **Rejection:** Reject if pattern creates generic template or conflicts with content priority.

---

## 7. VISUAL HIERARCHY INTELLIGENCE
Establish order per `DESIGN_SYSTEM.md` §3.1 and `DESIGN_ENGINE_SPEC.md` §15.

**Ranked Levels:**
1. **Primary Focal Point:** Main message/subject (Headline/Hero Image)
2. **Main Headline:** Primary text element
3. **Supporting Headline:** Secondary message
4. **Primary Visual:** Main image/illustration
5. **Important Information:** Details, dates, location
6. **Supporting Information:** Body text, descriptions
7. **Call to Action (CTA):** Action prompt
8. **Decorative Elements:** Background, accents (never compete)

**Rules:**
- **Scale:** Primary > Secondary > Utility (controlled ratios)
- **Contrast:** High for Primary; Low for Utility/Decorative
- **Position:** Focal point first; Reading flow follows (§6.4)
- **Typography Weight:** Bold for Primary; Regular/Light for Utility
- **Color Prominence:** Accent for CTA/Primary; Neutral for Background
- **Visual Attention:** Isolation/Directional emphasis for Focal Point
- **Reading Flow:** LTR/RTL/Vertical sequence preserved
- **Negative Space:** Active separation; breathing room for Primary

---

## 8. TYPOGRAPHY INTELLIGENCE
Treat as primary element (§6 of `DESIGN_SYSTEM.md`, §9 of `DESIGN_ENGINE_SPEC.md`).

**Decisions:**
- **Font Selection:** Script-capable (Bengali, English, Arabic, Urdu). Use pairings (§6.3).
- **Font Pairing:** Display + Body (e.g., Inter + Playfair, Noto Sans Bengali + Noto Serif Bengali).
- **Display Typography:** Headline, Scale, Weight, Contrast.
- **Body Typography:** Line height, Letter spacing, Alignment.
- **Font Weight/Size/Line Height/Letter Spacing:** Calculated per hierarchy role.
- **Text Alignment/Wrapping/Fitting:** Measure before position (§9.3-9.4).
- **Script Shaping/RTL/LTR:** Unicode correct; HarfBuzz/Browser shaping; no manual reversal.
- **Font Fallback:** Defined per language; report missing glyphs.
- **Text Overflow Prevention:** Priority: Recalculate breaks → Adjust container → Adjust spacing → Weight/Width variant → Reduce size (limit) → Reconsider zone (§9.4).

**Multilingual Handling:**
- Bengali: Conjunct shaping, Noto Sans/Serif Bengali.
- Arabic/Urdu: Glyph shaping, RTL, Cairo/Noto Sans Arabic.
- Mixed: Preserve individual direction; font fallback per script.

---

## 9. COLOR INTELLIGENCE
Selection based on **Brand**, **Tone**, **Audience**, **Category**, **Culture**, **Image**, **Readability**, **Contrast**, **Accessibility** (§7 of `DESIGN_SYSTEM.md`, §10 of `DESIGN_ENGINE_SPEC.md`).

**System Roles (§7.2):**
- **Dominant Colors:** Primary background/surface
- **Supporting Colors:** Secondary zones/elements
- **Accent Colors:** CTA/Focal point/Highlights
- **Neutral Colors:** Text/Borders/Spacing
- **Gradient Direction:** Linear/Radial (intentional only)
- **Color Proportions:** 60/30/10 rule (starting point, not mandatory)
- **Background/Foreground:** Contrast >= WCAG AA (4.5:1 normal, 3:1 large) (§10.3)

**Strategies (§7.1):** Monochromatic, Analogous, Complementary, Split, Triadic, Tetradic, Neutral+Accent, Brand-driven, Image-derived.

**Intelligence Rule:** Avoid arbitrary selection. Test contrast for actual medium (Digital sRGB vs Print Profile).

---

## 10. IMAGE AND ASSET DIRECTION
Decision logic per `DESIGN_SYSTEM.md` §10 and `DESIGN_ENGINE_SPEC.md` §12.

**Evaluation:**
- **Necessity:** Is image required? (Not every design needs one)
- **Kind:** Photo, Illustration, Vector, Icon, Background.
- **Placement:** Zone assignment (Hero, Background, Supporting).
- **Crop/Isolation:** Subject focus, Aspect ratio, Safe area.
- **Masking/Full-bleed/Isolated:** Integration method.
- **Vector vs Raster:** Vector for logos/shapes; Raster for photos (unless tracing).
- **Interaction:** Typography overlay (safe zones), Decorative support.

**Reference Analysis:**
- Originality: No generic stock; match concept metaphor.
- Licensing/Rights: Record source/usage (§10.1).
- Quality: Resolution, Sharpness, Crop accuracy.

**Intelligence Rule:** AI directs **what** and **how**; Design Engine handles **construction** and **measurement**.

---

## 11. STRUCTURED DESIGN PLANNING
Machine-readable schema compatible with `DESIGN_ENGINE_SPEC.md` §3.1 and §6.1.

**TypeScript Interface Integration:**
```ts
interface AI_DesignPlan extends DesignDocument {
  // From Brief Intelligence (§3)
  briefAnalysis: DesignBrief;

  // From Creative Concept (§4) & Art Direction (§5)
  creativeConcept: {
    name: string;
    idea: string;
    metaphor: string;
    emotionalCharacter: string;
    impactExpectation: string;
  };
  artDirection: ArtDirection; // §5.1

  // From Composition Strategy (§6)
  composition: CompositionPlan; // §6.1

  // From Visual Hierarchy (§7)
  hierarchy: HierarchyItem[]; // §6.1
  focalPoint: { x: number; y: number; strength: number };

  // From Typography (§8)
  typographySpecifications: Record<string, TypographyToken>; // §9.2

  // From Color (§9)
  colorTokens: DesignTokens['colors']; // §3.3

  // From Asset Direction (§10)
  assetSpecifications: DesignAsset[]; // §3.1

  // From Engine Constraints (§11)
  layerStructure: SceneNode[]; // Proposed initial structure
  designConstraints: {
    preserveContent: boolean;
    allowOverlap: boolean;
    allowedOverlapPairs: [string, string][];
  };
  qualityTargets: {
    targetScore: number; // 90+
    criticalGates: string[];
  };
}
```

**JSON Example (Snippet):**
```json
{
  "id": "design-ai-001",
  "schemaVersion": "1.0",
  "canvas": { "width": 1080, "height": 1920, "unit": "px", "background": { "type": "solid", "color": "#FFFFFF" } },
  "artDirection": { "style": "Modern Corporate", "mood": ["Trustworthy", "Structured"], "colorStrategy": "Brand-driven", "typographyStrategy": "Clear hierarchy", "imageStrategy": "Isolated product", "shapeLanguage": "Rectilinear", "visualDensity": "balanced", "complexity": "medium" },
  "composition": {
    "primaryPattern": "P11", // Product Hero Layout
    "supportingPatterns": [],
    "focalPoint": { "x": 540, "y": 600, "strength": 0.9 },
    "readingFlow": "ltr",
    "hierarchy": [
      { "contentId": "headline", "rank": 1, "role": "primary" },
      { "contentId": "product-image", "rank": 2, "role": "primary" },
      { "contentId": "cta", "rank": 3, "role": "utility" }
    ],
    "zones": [...],
    "grid": { "type": "column", "columns": 12, "gutter": 24, "margin": { "top": 80, "right": 40, "bottom": 80, "left": 40 }, "enabled": true },
    "constraints": { "preserveContent": true, "allowOverlap": false, "allowedOverlapPairs": [] }
  }
}
```

**Compatibility:** Must match `DESIGN_ENGINE_SPEC.md` types exactly. No conflicting models.

---

## 12. CREATIVE DIVERSITY AND ORIGINALITY
Avoid repetitive outputs (§12 of `DESIGN_SYSTEM.md`, §18 of `DESIGN_PATTERNS_LIBRARY.md`).

**Diversity Dimensions:**
- **Concept Diversity:** Different metaphors/ideas per brief.
- **Composition Diversity:** Vary primary pattern ID; shift focal point (x,y); change reading flow.
- **Visual Vocabulary Diversity:** Vary shape language, typography pairing, color distribution.
- **Typography Diversity:** Different script handling, scale relationships.
- **Color Diversity:** Role distribution, accent placement.
- **Image Treatment Diversity:** Crop, mask, isolation, blend.
- **Anti-Template Behavior:** No repeated card layouts, generic gradients, random circles.
- **Reference Originality:** Use library patterns as structural guidance, not fixed coordinates.
- **Repetition Detection:** Compare with recent `CompositionHistory` (§18.1).

**Intelligence Rule:** Originality supports **Communication Objective**. Randomness is rejected.

---

## 13. VISUAL CRITIQUE INTELLIGENCE
Inspect **Rendered Output** (not just plan) per `DESIGN_QUALITY_METRICS.md` §13 and `DESIGN_SYSTEM.md` §16.

**Inspection Areas:**
1. **Composition:** Balance, Focal point, Flow, Negative space, Spatial relations (§3.2)
2. **Hierarchy:** Primary focal point, Headline prominence, Secondary info, Contrast, Flow (§3.3)
3. **Balance:** Weight distribution, Symmetry/Asymmetry, Optical correction (§3.2)
4. **Typography:** Font selection, Pairing, Hierarchy, Spacing, Readability, Composition, Language (§3.4)
5. **Color:** Palette, Harmony, Contrast, Accent distribution, Background/Foreground (§3.5)
6. **Spacing:** Margin consistency, Element alignment, Relationships, Padding/Grouping, Optical (§3.6)
7. **Image Quality:** Relevance, Quality, Placement/Crop, Illustration consistency, Shape integration (§3.7)
8. **Visual Consistency:** Layering, Effects discipline, Depth, Surface refinement, Finish (§3.8)
9. **Readability:** Message clarity, Accuracy, Audience suitability, Comfort, CTA effectiveness (§3.9)
10. **Technical Correctness:** Dimensions, Validity, Editability, Assets/Fonts, Rendering, Export, Specs (§3.10)

**Identification Logic:**
- **Weak Focal Points:** Not first seen; competing elements.
- **Poor Alignment:** Deviation from grid/token; accidental overlap.
- **Crowded Layouts:** Insufficient negative space; collision.
- **Weak Contrast:** Below WCAG AA; background/foreground clash.
- **Inconsistent Typography:** Missing glyphs, overflow, wrong pairing.
- **Unnecessary Decoration:** Competing with info; generic shapes.
- **Generic Composition:** Matches template without adaptation.
- **Poor Image Integration:** Low resolution, bad crop, unrelated subject.
- **Incorrect Text Fitting:** Clipped, overflow, substitution.

**Output:** `DesignEvaluation` schema (§7 of `DESIGN_QUALITY_METRICS.md`).

---

## 14. INTELLIGENT REVISION ENGINE
Transform critique into targeted changes (§8 of `DESIGN_QUALITY_METRICS.md`, §20 of `DESIGN_ENGINE_SPEC.md`).

**Revision Structure:**
- **Detected Problem:** Specific failure (e.g., "Headline overflow", "Weak focal point")
- **Visual Evidence:** Rendered observation (e.g., "Text clipped at bottom", "Subject obscured")
- **Severity:** Critical (Content/Render/Layout), High (Hierarchy/Balance/Contrast), Medium (Spacing/Alignment/Pairing), Low (Optical/Texture)
- **Affected Elements:** SceneNode IDs / Content Slots
- **Recommended Correction:** Smallest effective edit (e.g., "Reduce font size 2pt", "Shift focal point 10% right", "Increase margin 8px")
- **Expected Improvement:** Target score increase / Gate pass
- **Validation Method:** Re-render + Re-evaluate (§6 pipeline)

**Priority Order:**
1. **Critical:** Fix content/render/layout failures first.
2. **High:** Fix hierarchy/balance/contrast/readability.
3. **Medium:** Fix spacing/alignment/typography pairing/imagery.
4. **Low:** Fix optical alignment/texture/minor spacing.

**Intelligence Rule:** Preserve successful decisions. Stop at acceptance (Score >= 85 + No Critical Failures) or budget limit (3 rounds).

---

## 15. AI AND DESIGN ENGINE COLLABORATION
Responsibilities per `DESIGN_ENGINE_SPEC.md` §23.

| Component | Responsibility |
|---|---|
| **Runtime AI Designer** | Brief interpretation, Creative direction, Concept development, Composition strategy, Visual hierarchy, Typography direction, Color direction, Asset direction, Structured plan generation, Visual critique (evidence-based), Revision decisions (targeted). |
| **Design Engine** | Schema validation, Constraint resolution, Typography measurement, Scene graph management, Vector construction, Object positioning, Deterministic geometry. |
| **Renderer** | Accurate visual rendering, Output generation (Preview/Export). |
| **Quality Engine** | Deterministic validation, Visual quality evaluation support, Technical checks, Score calculation. |

**Boundary Rule:** AI **never** bypasses schema or generates arbitrary markup. AI proposes; Engine constructs; Renderer draws; Quality Engine validates.

---

## 16. CONTEXT AND KNOWLEDGE RETRIEVAL
Runtime AI accesses documentation contextually (§16 of `DESIGN_ENGINE_SPEC.md`):

- **Design System Retrieval:** `DESIGN_SYSTEM.md` (§1-20) for standards, art directions, principles.
- **Pattern Library Retrieval:** `DESIGN_PATTERNS_LIBRARY.md` (§1-25) for composition strategies, adaptation rules.
- **Design Engine Specifications:** `DESIGN_ENGINE_SPEC.md` (§1-30) for schemas, pipeline, responsibilities.
- **Typography Knowledge:** Script shaping, font pairing, multilingual rules (§6, §9).
- **Reference Examples:** Library patterns, category rules (§11).
- **Quality Evaluation Rules:** `DESIGN_QUALITY_METRICS.md` (§1-15) for scoring, gates, critique.

**Selection Logic:**
- **Category-based:** Load §11 rules for Posters, Ads, etc.
- **Language-based:** Load script shaping rules for Bengali/Arabic/Urdu.
- **Complexity-based:** Load advanced geometry/effects rules for rich compositions.
- **Task-based:** Load revision rules for critique stage; load schema rules for planning stage.

---

## 17. FAILURE HANDLING
Strategies per `DESIGN_QUALITY_METRICS.md` §4 and `DESIGN_ENGINE_SPEC.md` §17.

| Failure Type | Detection | Strategy |
|---|---|---|
| **Ambiguous Brief** | Missing category/dimensions/content | Make reasonable creative assumption (mark in brief); if critical content missing, flag for Human Review. |
| **Conflicting Requirements** | Objective vs Constraint clash | Prioritize communication objective; document conflict; propose compromise in plan. |
| **Insufficient Content** | Missing headline/CTA/details | Use placeholder slots; mark as "unknown" in brief; engine validation fails if critical. |
| **Missing Images** | Asset reference unresolved | Define fallback (vector reconstruction/solid color); flag warning. |
| **Unsupported Fonts** | Script/Font unavailable | Select fallback font; report to engine; measure with fallback. |
| **Text Overflow** | Engine measurement > Zone bounds | Recalculate breaks → Adjust container → Reduce size → Reconsider zone (Priority §9.4). |
| **Layout Conflicts** | Collision detection (Engine) | Identify objects; check importance; recalculate spacing; preserve alignment (§14.4). |
| **Poor Visual Results** | Score < 85 or Weak Critique | Targeted revision (Priority §8); preserve success; re-render. |
| **Rendering Errors** | Engine/Renderer failure | Report Critical Failure; stop; Human Review. |
| **Invalid Design Plans** | Schema mismatch | Re-validate against `DESIGN_ENGINE_SPEC.md` types; correct IDs/units. |

**Intelligence Rule:** Distinguish **Creative Uncertainty** (concept choice) from **Technical Failure** (engine/render error).

---

## 18. PERFORMANCE AND COST INTELLIGENCE
Balance quality, time, tokens, iterations, costs (§18 of `DESIGN_ENGINE_SPEC.md`):

- **Output Quality:** Target Score >= 90 (Minimum 85). Never sacrifice for cost.
- **Generation Time:** Adaptive reasoning depth (Simple brief → Low depth; Complex brief → High depth).
- **Token Usage:** Structured plan schema minimizes tokens; avoid prose repetition.
- **Reasoning Iterations:** Concept generation (2–4) → Plan (1) → Critique (1) → Revision (max 3).
- **Image Processing Costs:** Use vector where possible; raster only for photos; crop/mask logic minimizes processing.
- **Visual Critique Costs:** Inspect rendered evidence only; avoid re-rendering without change.

**Intelligence Rule:** Adaptive depth based on **Project Complexity** (§11 Category, §12 Density).

---

## 19. BENCHMARK AND TESTING STRATEGY
Covered categories (§19 of `DESIGN_ENGINE_SPEC.md`):

| Benchmark | Input Brief | Expected Creative Decisions | Technical Acceptance | Visual Evaluation | Common Failure Cases |
|---|---|---|---|---|---|
| **Promotional Posters** | Event/Product announcement | Central Hero/Diagonal/Typography-led; High contrast; CTA prominent | Dimensions match; Text fits; Assets resolve | Focal point clear; Impact strong; Original concept | Generic template; Weak CTA; Overcrowded |
| **Educational Posters** | Course/Info announcement | Structured Grid/Split/Information; Readable type; Clear hierarchy | Content preserved; Multilingual shaping; Safe area | Hierarchy effective; Information flow; Accuracy | Cluttered; Unreadable; Missing info |
| **Corporate Ads** | Brand/Service promotion | Modern Corporate/Swiss/Minimal; Brand colors; Professional | Brand identity; Export valid; Alignment | Professional look; Trustworthy; Balance | Template repetition; Weak brand; Clashing |
| **Social Media Graphics** | Platform post/Story | Square/Vertical/Wide; Fast recognition; Mobile readable | Platform dimensions; Safe zones; Export size | Immediate attention; Clarity; Consistency | Unreadable small text; Off-center; Generic |
| **Event Posters** | Date/Location/Subject | Dynamic/Radial/Layered; High energy; Focal point | Date/Location preserved; Contrast; Bleed | Impact; Flow; Rhythm | Weak focal point; Confusing flow; Missing date |
| **Product Ads** | Product/Benefit/Price | Product Hero/Feature Spotlight/Offer; Isolated product; CTA | Product visible; Price/CTA clear; Assets high-res | Product focus; Benefit clear; Professional | Low-res product; Weak benefit; Cluttered |
| **Business Cards** | Name/Contact/Brand | Minimalist/Split/Monogram; Precise alignment; Print specs | Print dimensions; Font embedding; Safe margins | Identity clear; Legible; Professional | Unreadable small text; Misaligned; Generic |
| **Flyers** | Info/Event/Service | Structured/Modular/Announcement; Organized; Contact | Content groups; Spacing; Export | Clarity; Grouping; Flow | Overcrowded; Poor grouping; Missing contact |
| **Brochures** | Multi-page/Info/Product | Modular/Narrative/Image-driven; Consistent; Continuity | Page continuity; Grid; Export | Editorial consistency; Flow; Balance | Inconsistent; Broken flow; Generic |
| **Editorial Graphics** | Magazine/Report/Cover | Editorial/Asymmetric/Typography-led; Sophisticated; Layered | Hierarchy; Multilingual; Bleed | Artistic direction; Sophistication; Rhythm | Cluttered; Weak hierarchy; Template |
| **Multilingual Designs** | Mixed scripts/languages | Script-specific shaping; RTL/LTR; Fallback fonts | Unicode correct; Shaping; No clipping | Readability; Balance; Cultural fit | Incorrect shaping; Clipped; Mixed direction error |

**Comparison Logic:** Fair comparison via `DesignEvaluation` score and evidence.

---

## 20. IMPLEMENTATION ROADMAP
Phased development (§27 of `DESIGN_ENGINE_SPEC.md` adapted for AI Intelligence):

### Phase 1: Brief Intelligence
- **Dependencies:** None (uses `DESIGN_ENGINE_SPEC.md` §4)
- **Acceptance:** `DesignBrief` schema valid; facts preserved; assumptions marked.

### Phase 2: Creative Concept Engine
- **Dependencies:** Phase 1
- **Acceptance:** Multiple concepts generated; strongest selected; diversity checked (§12).

### Phase 3: Art Direction Engine
- **Dependencies:** Phase 2
- **Acceptance:** `ArtDirection` schema valid; matches category/objective (§5).

### Phase 4: Composition Decision Engine
- **Dependencies:** Phase 3
- **Acceptance:** `CompositionPlan` schema valid; pattern selected from library; zones/grid defined (§6).

### Phase 5: Structured Design Planning
- **Dependencies:** Phases 1-4
- **Acceptance:** `DesignDocument` schema compatible with `DESIGN_ENGINE_SPEC.md` §3.1; all tokens/specs defined (§11).

### Phase 6: Design Engine Integration
- **Dependencies:** Phase 5
- **Acceptance:** Engine validates plan; Scene Graph constructed; Geometry calculated (§21).

### Phase 7: Visual Critique
- **Dependencies:** Phase 6 + Renderer
- **Acceptance:** `DesignEvaluation` schema complete; Score calculated; Evidence collected (§13, §15).

### Phase 8: Intelligent Revision
- **Dependencies:** Phase 7
- **Acceptance:** Revision plan prioritized; Engine applies; Re-render; Re-evaluate; Score >= 85 or Human Review (§14, §15).

### Phase 9: Benchmark and Optimization
- **Dependencies:** Phase 8
- **Acceptance:** Benchmarks pass (§19); Diversity tracked (§12); Performance/Cost balanced (§18).

---

## DOCUMENTATION QUALITY REQUIREMENTS
- **Technically Detailed:** Schemas, interfaces, logic tables included.
- **Professionally Structured:** Pipeline, stages, roles clearly defined.
- **Implementation-Oriented:** Compatible with `DESIGN_ENGINE_SPEC.md` types.
- **Consistent:** References `DESIGN_SYSTEM.md`, `DESIGN_PATTERNS_LIBRARY.md`, `DESIGN_QUALITY_METRICS.md`.
- **Suitable for AI Agents:** Machine-readable schema; decision logic; failure handling.
- **Suitable for Runtime System:** Pipeline stages; context retrieval; performance balance.
- **Explicit Proposed vs Implemented:** This spec defines **Intelligence Architecture** (Proposed/Required); Implementation follows `DESIGN_ENGINE_SPEC.md` phases.

---

## FINAL DELIVERABLE REPORT

1. **Files created or modified:**
   - Created: `AI_DESIGN_INTELLIGENCE.md` (This document)
   - Modified: None (README.md index update unnecessary per instructions)

2. **Architecture decisions made:**
   - Defined **17-stage Reasoning Pipeline** mapping to `DESIGN_ENGINE_SPEC.md` §21.
   - Integrated **Brief Intelligence** with `DESIGN_ENGINE_SPEC.md` §4 schema.
   - Established **Creative Concept Generation** with diversity rules from `DESIGN_PATTERNS_LIBRARY.md` §18.
   - Mapped **Art Direction Intelligence** to `DESIGN_SYSTEM.md` §4 styles.
   - Defined **Composition Decision Engine** linking to `DESIGN_PATTERNS_LIBRARY.md` patterns.
   - Specified **Visual Hierarchy Intelligence** per `DESIGN_SYSTEM.md` §3.1 levels.
   - Defined **Typography Intelligence** supporting Bengali/English/Arabic/Urdu per `DESIGN_SYSTEM.md` §6.5 and `DESIGN_ENGINE_SPEC.md` §9.
   - Established **Color Intelligence** role system and contrast rules (§7, §10).
   - Defined **Image and Asset Direction** logic (§10).
   - Created **Structured Design Planning** schema compatible with `DESIGN_ENGINE_SPEC.md` §3.1/§6.1.
   - Defined **Creative Diversity and Originality** tracking (§12, §18).
   - Specified **Visual Critique Intelligence** using `DESIGN_QUALITY_METRICS.md` §13/§7 schema.
   - Defined **Intelligent Revision Engine** priority and structure (§8, §20).
   - Clarified **AI and Design Engine Collaboration** boundaries (§23).
   - Defined **Context and Knowledge Retrieval** logic (§16).
   - Specified **Failure Handling** strategies (§17, §4).
   - Balanced **Performance and Cost Intelligence** (§18, §24).
   - Defined **Benchmark and Testing Strategy** for 11 categories (§19).
   - Divided **Implementation Roadmap** into 9 phases (§20, §27).

3. **Existing specifications reused:**
   - `DESIGN_ENGINE_SPEC.md`: Schemas (§3, §4, §5, §6, §9, §10), Pipeline (§21, §23), Roadmap (§27), Acceptance (§28).
   - `DESIGN_SYSTEM.md`: Principles (§3), Art Directions (§4), Composition (§5), Typography (§6), Color (§7), Shapes (§8), Depth (§9), Assets (§10), Categories (§11), Complexity (§12), Spacing (§13), Adaptability (§14), Quality (§15), Critique (§16), Anti-patterns (§17), Checklist (§18), Behavior (§19), Standard (§20).
   - `DESIGN_PATTERNS_LIBRARY.md`: Patterns (§3-12), Variations (§13), Backgrounds (§14), Treatments (§15), Combinations (§16), Adaptation (§17), Diversity (§18), Data Structure (§19), Translation (§20), Rendering (§21), Workflow (§22), Anti-patterns (§23), Checklist (§24), Instructions (§25).
   - `DESIGN_QUALITY_METRICS.md`: Scoring (§2-3), Failures (§4), Metrics (§5), Pipeline (§6), Critic (§7), Revision (§8), Categories (§9), Responsive (§10), Print/Digital (§11), Report (§12), Prompt (§13), Implementation (§14), Acceptance (§15).

4. **Unresolved architectural conflicts:**
   - None identified. The specification aligns the **Runtime AI Designer** (Intelligence) with the **Design Engine** (Deterministic Construction) and **Quality Engine** (Evaluation) as defined in existing specs.

5. **Recommended next implementation task:**
   - Implement the **Structured Design Planning** schema validation and **Brief Intelligence** parser to convert user natural language into the `DesignBrief` and `AI_DesignPlan` structures compatible with `DESIGN_ENGINE_SPEC.md` §3.1 and §4.2.

---
*Document generated by the AI Coding Agent acting as Chief Design Officer, Chief Creative Officer, Principal AI Architect, and Professional Graphic Design Intelligence Engineer.*
