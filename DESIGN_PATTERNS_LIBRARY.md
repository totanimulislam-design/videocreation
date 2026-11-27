# DESIGN PATTERNS LIBRARY
## Professional Composition Patterns, Layout Structures & Creative Design Techniques

> **Purpose:** This document defines a reusable library of professional graphic design composition patterns for an AI-powered, code-driven design platform. It provides structural guidance for creating original, production-quality posters, banners, flyers, brochures, business cards, advertisements, social media graphics, editorial layouts, and other visual communication materials.

---

# 1. Core Philosophy

This library is a Runtime AI Designer resource. The canonical system boundaries and shared `CompositionPlan`/`DesignDocument` types are owned by `DESIGN_ENGINE_SPEC.md`; this library defines pattern meaning and guidance only. Its examples and metadata are not claims of implemented patterns.

This library is not a collection of fixed templates.

It is a collection of **compositional strategies** that professional designers can interpret, combine, adapt, and transform according to the design brief.

The Runtime AI Designer must not blindly copy a pattern. It must understand:

- Why a composition works.
- What type of message it communicates.
- Where the viewer's attention should go.
- How visual elements interact.
- How typography, imagery, color, shapes, and negative space work together.
- How the structure can be adapted to a specific design context.

## 1.1 Fundamental Rule

**A pattern is a starting point, not the final design.**

Every generated design must be art-directed according to its:

- Purpose
- Audience
- Industry
- Brand personality
- Content hierarchy
- Emotional tone
- Output dimensions
- Platform
- Cultural context

## Pattern decision contract

For every selected pattern, the Runtime AI Designer must be able to state five things: **meaning** (the structural idea), **appropriate use** (purpose/audience/content/output fit), **implementation** (how it maps to the canonical plan and what geometry is calculated), **common mistakes** (how the pattern can fail), and **validation** (how to inspect the result). Existing catalog labels map as follows: `Structure`/description = meaning, `Best for` = use cases, `Construction` = implementation, and the pattern checklist plus `avoidWhen`/`commonMistakes`/`validationChecks` = failure and validation guidance. Where an entry is terse or lacks one of these fields, apply this contract before using it; do not assume an unmentioned implementation or claim a pattern is available in code.

## 1.2 No Template Repetition

The Runtime AI Designer must avoid producing designs that look like slightly modified versions of previous outputs.

Changing only the background color, font, image, or decorative shape does not create a genuinely new composition.

Variation must include meaningful changes in:

- Layout structure
- Focal point placement
- Typography arrangement
- Image treatment
- Negative-space distribution
- Visual rhythm
- Shape language
- Color relationships
- Information grouping
- Direction of visual movement

---

# 2. Pattern Selection Engine

Before selecting a composition pattern, the Runtime AI Designer must interpret the design brief.

## 2.1 Required Brief Analysis

Identify:

1. Design category
2. Primary communication objective
3. Target audience
4. Main headline
5. Supporting information
6. Primary visual or subject
7. Call to action
8. Brand identity
9. Emotional direction
10. Required dimensions and output medium

## 2.2 Pattern Selection Logic

Use the following decision process:

| Design requirement | Recommended direction |
|---|---|
| Strong promotional message | Bold advertising composition |
| Large product photograph | Image-led composition |
| Powerful headline | Typography-led composition |
| Multiple information sections | Editorial or grid composition |
| Premium brand identity | Minimalist or luxury composition |
| Educational information | Structured information composition |
| Event announcement | Dynamic poster composition |
| Multiple pages | Editorial or modular brochure system |
| Limited content | Minimal composition |
| Complex content | Hierarchical information layout |
| Youth-oriented campaign | Experimental or energetic composition |
| Corporate communication | Structured and restrained composition |

## 2.3 Pattern Selection Requirements

The Runtime AI Designer must:

- Select one primary composition pattern.
- Optionally select one or two supporting patterns.
- Explain internally why the selected structure suits the brief.
- Adapt the pattern to the actual content.
- Avoid unnecessary decorative elements.
- Preserve readability and visual hierarchy.
- Avoid using the same primary pattern repeatedly across consecutive designs.

Do not combine patterns randomly. Every combination must have a clear compositional purpose.

---

# 3. Professional Poster Composition Patterns

These patterns are suitable for event posters, promotional posters, educational posters, cultural posters, campaign graphics, and public announcements.

## P01 — Central Hero Composition

**Structure:** A dominant central subject surrounded by supporting information.

**Construction:**
- Place the main subject near the visual center.
- Establish a strong focal point.
- Position the headline above or around the subject.
- Distribute supporting information around the primary visual.

**Best for:** Event announcements, product launches, promotional campaigns.

## P02 — Upper Headline / Lower Visual

**Structure:** Typography occupies the upper section while the main image anchors the lower section.

**Construction:**
- Create a strong headline area.
- Keep the visual subject large and recognizable.
- Use a transition between text and image.
- Place secondary details near the bottom.

**Best for:** Educational, cultural, and informational posters.

## P03 — Full-Bleed Image Poster

**Structure:** A photograph or illustration covers the entire canvas.

**Construction:**
- Use an image that supports the message.
- Apply controlled contrast or overlays behind text.
- Position typography where sufficient readability exists.
- Use cropping intentionally.

**Best for:** Photography campaigns, lifestyle advertisements, cinematic posters.

## P04 — Split-Half Composition

**Structure:** The canvas is divided into two major visual zones.

**Construction:**
- Use a vertical or horizontal division.
- Place imagery in one section and typography in the other.
- Establish a clear relationship between the two areas.
- Avoid making the division feel arbitrary.

**Best for:** Before-and-after campaigns, product promotions, educational comparisons.

## P05 — Diagonal Dynamic Composition

**Structure:** Major elements follow a strong diagonal direction.

**Construction:**
- Establish a diagonal movement axis.
- Align image, headline, and graphic accents with that direction.
- Use overlapping elements carefully.
- Preserve a stable reading path.

**Best for:** Sports, technology, entertainment, energetic promotions.

## P06 — Layered Depth Composition

**Structure:** Foreground, middle-ground, and background create a dimensional scene.

**Construction:**
- Background establishes atmosphere.
- Middle-ground supports the main subject.
- Foreground creates emphasis or depth.
- Use shadows, blur, scale, and overlap selectively.

**Best for:** Cinematic posters, product advertisements, creative campaigns.

## P07 — Frame Within a Frame

**Structure:** A major subject is enclosed within a distinctive visual frame.

**Construction:**
- Create a frame using geometry, photography, typography, or illustration.
- Make the subject the dominant focal point.
- Allow selected elements to break the frame.
- Maintain a purposeful relationship between frame and content.

**Best for:** Luxury promotions, cultural events, editorial posters.

## P08 — Floating Elements Composition

**Structure:** Several visual elements appear to float within a controlled space.

**Construction:**
- Use varied scale and positioning.
- Maintain visual balance through spacing.
- Establish a clear primary object.
- Use shadows or perspective to support depth.

**Best for:** Creative campaigns, product showcases, technology promotions.

## P09 — Radial Composition

**Structure:** Elements radiate from a central focal point.

**Construction:**
- Establish a central subject or message.
- Arrange supporting elements around it.
- Use radial lines, circles, or directional shapes.
- Avoid excessive symmetry when a more organic result is appropriate.

**Best for:** Festivals, educational diagrams, announcements, promotional graphics.

## P10 — Oversized Subject Composition

**Structure:** A large subject dominates the canvas, sometimes extending beyond its boundaries.

**Construction:**
- Scale the primary image dramatically.
- Use cropping to create visual impact.
- Place text in the remaining negative space.
- Avoid sacrificing subject recognition.

**Best for:** Fashion, lifestyle, product, and entertainment posters.

---

# 4. Advertising & Promotional Composition Patterns

Designed for advertisements, product campaigns, service promotions, sales graphics, and marketing materials.

## P11 — Product Hero Layout

**Structure:** One product is the primary visual focus.

**Construction:**
- Display the product prominently.
- Use a supporting headline.
- Include a concise benefit statement.
- Position price or CTA in a clearly visible area.

**Best for:** Product advertisements and e-commerce campaigns.

## P12 — Offer Badge Composition

**Structure:** A promotional offer receives strong visual emphasis.

**Construction:**
- Give the offer a distinct visual area.
- Keep the product or service identifiable.
- Use a clear hierarchy between offer, benefit, and CTA.
- Avoid adding too many competing badges.

**Best for:** Discounts, seasonal promotions, special offers.

## P13 — Problem-to-Solution Layout

**Structure:** Present a problem and then its solution.

**Construction:**
- Establish the problem visually or through a short statement.
- Introduce the solution as the main focus.
- Explain the key benefit.
- End with a relevant CTA.

**Best for:** Educational services, software, healthcare communication, business promotions.

## P14 — Benefit Stack Layout

**Structure:** A central product or service is supported by a vertical or horizontal list of benefits.

**Construction:**
- Present one primary promise.
- Arrange benefits in a clear sequence.
- Use icons only when they improve comprehension.
- Maintain consistent spacing.

**Best for:** Service advertisements and feature promotions.

## P15 — Testimonial-Focused Layout

**Structure:** A customer statement becomes the main communication element.

**Construction:**
- Feature a concise testimonial.
- Include attribution when available and authorized.
- Use a portrait or brand element as supporting content.
- Keep the brand identity visible.

**Best for:** Educational institutions, service businesses, product credibility campaigns.

## P16 — Comparison Advertisement

**Structure:** Two or more options are compared side by side.

**Construction:**
- Use a consistent comparison grid.
- Highlight meaningful differences.
- Maintain equivalent visual treatment.
- Avoid misleading comparisons.

**Best for:** Product comparisons, service plans, educational programs.

## P17 — Feature Spotlight Layout

**Structure:** One important feature receives special emphasis.

**Construction:**
- Show the relevant product or service.
- Use callouts or labels to identify the feature.
- Keep secondary information subordinate.
- Use a clear reading direction.

**Best for:** Technology products, devices, software, educational tools.

## P18 — Promotional Ribbon Layout

**Structure:** A strong ribbon or band carries the offer or campaign message.

**Construction:**
- Integrate the ribbon into the overall composition.
- Use a strong contrast relationship.
- Avoid covering important visual content.
- Keep ribbon text concise.

**Best for:** Campaign announcements, discounts, retail promotions.

## P19 — Announcement Hierarchy Layout

**Structure:** The announcement itself is the primary focal point.

**Construction:**
- Use a dominant announcement headline.
- Place date, location, and supporting details beneath it.
- Add a supporting visual only when useful.
- Preserve quick readability.

**Best for:** Admissions, registrations, opening announcements, public notices.

## P20 — CTA-Dominant Layout

**Structure:** The desired action receives strong visual prominence.

**Construction:**
- Communicate the value proposition first.
- Make the action easy to identify.
- Use a clear button-like or typographic CTA treatment.
- Avoid competing calls to action.

**Best for:** Lead generation, registrations, event booking, online promotions.

---

# 5. Editorial & Magazine Composition Patterns

Suitable for brochures, magazine covers, reports, editorial posters, publications, and long-form visual communication.

## P21 — Swiss International Grid

**Structure:** Strict grid, disciplined alignment, and strong typographic hierarchy.

**Construction:**
- Establish consistent columns.
- Use a clear typographic scale.
- Align text and images systematically.
- Use whitespace as an active design element.

**Best for:** Editorial, corporate, cultural, and informational designs.

## P22 — Asymmetric Editorial Layout

**Structure:** Unequal visual weight creates a deliberate balance.

**Construction:**
- Place a large image or headline on one side.
- Balance it with smaller information groups.
- Use consistent alignment anchors.
- Avoid accidental imbalance.

**Best for:** Magazine spreads, creative publications, editorial posters.

## P23 — Modular Editorial Grid

**Structure:** Content is organized into reusable modules.

**Construction:**
- Define a modular grid.
- Assign each content group a module.
- Vary module size according to importance.
- Preserve consistent spacing.

**Best for:** Reports, brochures, information-heavy layouts.

## P24 — Magazine Cover Composition

**Structure:** A dominant cover image is supported by layered editorial typography.

**Construction:**
- Establish a clear masthead area.
- Feature one primary image.
- Arrange cover lines according to hierarchy.
- Avoid excessive text competition.

**Best for:** Magazine covers, publication announcements.

## P25 — Oversized Editorial Typography

**Structure:** Large typography becomes the main visual element.

**Construction:**
- Use one dominant word or phrase.
- Combine it with small supporting information.
- Control line breaks and letter spacing.
- Treat typography as a graphic shape.

**Best for:** Editorial posters, cultural campaigns, creative announcements.

## P26 — Multi-Column Editorial Layout

**Structure:** Information flows through multiple columns.

**Construction:**
- Establish consistent column widths.
- Use clear section headings.
- Maintain readable line lengths.
- Control image placement and text flow.

**Best for:** Brochures, newsletters, reports, magazines.

## P27 — Image-and-Caption Editorial Layout

**Structure:** Images and captions form a repeating editorial rhythm.

**Construction:**
- Pair each image with a concise caption.
- Maintain consistent caption styling.
- Vary image sizes when appropriate.
- Use whitespace to separate content groups.

**Best for:** Catalogues, portfolios, educational publications.

## P28 — Pull-Quote Composition

**Structure:** A selected quotation becomes a major visual element.

**Construction:**
- Highlight one meaningful statement.
- Use oversized quotation typography.
- Keep the surrounding content restrained.
- Include attribution when available.

**Best for:** Interviews, editorial spreads, reports.

## P29 — Documentary Editorial Layout

**Structure:** Photography and factual information work together.

**Construction:**
- Use authentic documentary imagery.
- Keep information hierarchy restrained.
- Use captions and metadata consistently.
- Avoid unnecessary decorative effects.

**Best for:** Annual reports, educational publications, documentary posters.

## P30 — Chapter Opener Layout

**Structure:** A section or chapter begins with a strong visual introduction.

**Construction:**
- Feature a section number or title.
- Introduce a supporting image or abstract graphic.
- Establish a distinct opening rhythm.
- Maintain consistency across the publication.

**Best for:** Books, reports, multi-page brochures.

---

# 6. Typography-Led Composition Patterns

Typography must be treated as a visual design element, not merely as text placed inside boxes.

## P31 — Kinetic Typography Layout

**Structure:** Text appears to move through scale, rotation, alignment, or directional rhythm.

**Construction:**
- Establish a dominant phrase.
- Use controlled directional variation.
- Maintain readable text relationships.
- Use movement to reinforce meaning.

**Best for:** Youth campaigns, entertainment, music, creative posters.

## P32 — Stacked Word Composition

**Structure:** A headline is broken into multiple large lines.

**Construction:**
- Use deliberate line breaks.
- Control line spacing and alignment.
- Emphasize selected words through scale or weight.
- Avoid awkward word separation.

**Best for:** Bold posters, event announcements, campaign graphics.

## P33 — Typographic Frame

**Structure:** Typography forms a visual boundary around an image or message.

**Construction:**
- Arrange text along edges or around a central area.
- Maintain sufficient negative space.
- Use consistent type relationships.
- Ensure the framing text remains readable.

**Best for:** Editorial, fashion, and experimental posters.

## P34 — Giant Initial Letter

**Structure:** One oversized letter anchors the composition.

**Construction:**
- Use the initial of a key word or a meaningful letterform.
- Place supporting text around or within the letter.
- Use the letter as a visual shape.
- Avoid compromising legibility.

**Best for:** Editorial covers, identity graphics, cultural posters.

## P35 — Vertical Typography

**Structure:** Main text is arranged vertically or rotated.

**Construction:**
- Use vertical text as a deliberate hierarchy device.
- Preserve a comfortable reading direction.
- Balance vertical text with horizontal supporting content.
- Avoid excessive rotation.

**Best for:** Fashion, editorial, urban, and experimental layouts.

## P36 — Outline Typography

**Structure:** Large outlined text provides a graphic layer.

**Construction:**
- Use outlined text for secondary emphasis or atmosphere.
- Maintain sufficient contrast.
- Avoid using outlines for long body text.
- Combine with solid typography when necessary.

**Best for:** Modern promotional graphics and experimental posters.

## P37 — Typography Mask Composition

**Structure:** An image or texture appears inside letterforms.

**Construction:**
- Use a suitable image or texture.
- Create a text clipping mask.
- Preserve the word's recognition.
- Keep supporting text separate and readable.

**Best for:** Campaign posters, fashion, entertainment graphics.

## P38 — Mixed-Scale Typography

**Structure:** Different words within the same headline use contrasting sizes.

**Construction:**
- Identify the most important words.
- Create a clear scale hierarchy.
- Control baseline and line spacing.
- Maintain visual unity.

**Best for:** Promotional headlines, event posters, editorial design.

## P39 — Typographic Repetition

**Structure:** A word, phrase, or letter is repeated to create rhythm.

**Construction:**
- Establish a clear repetition pattern.
- Use changes in opacity, scale, or position.
- Keep the main message distinguishable.
- Avoid visual noise.

**Best for:** Music, fashion, experimental, and cultural posters.

## P40 — Multilingual Typography Composition

**Structure:** Two or more writing systems work together as one composition.

**Construction:**
- Respect each script's natural reading direction.
- Use fonts with appropriate glyph coverage.
- Handle Bengali conjuncts, Arabic shaping, ligatures, and script-specific spacing correctly.
- Establish hierarchy without treating one language as decorative filler.
- Test the final rendered output.

**Best for:** Bengali-English-Arabic educational, cultural, and institutional designs.

---

# 7. Image-Led Composition Patterns

These patterns focus on photography, illustration, product imagery, and visual storytelling.

## P41 — Portrait Hero

**Structure:** A person's portrait is the primary visual anchor.

**Construction:**
- Select a high-quality portrait.
- Use controlled cropping.
- Position text around the portrait's visual direction.
- Preserve facial integrity and natural proportions.

**Best for:** Speaker announcements, profiles, personal branding, events.

## P42 — Subject Cutout Composition

**Structure:** A cutout subject is separated from its original background.

**Construction:**
- Remove or isolate the subject.
- Place it within a designed environment.
- Use realistic shadows and edge treatment.
- Ensure the subject integrates naturally.

**Best for:** Product advertising, promotional posters, creative campaigns.

## P43 — Image Collage

**Structure:** Multiple images form one coordinated visual composition.

**Construction:**
- Define a clear visual theme.
- Use controlled image sizes and spacing.
- Establish one dominant image.
- Avoid unrelated image collections.

**Best for:** Travel, education, fashion, event promotion.

## P44 — Overlapping Photography

**Structure:** Two or more images overlap to create depth or narrative.

**Construction:**
- Establish foreground and background images.
- Use masks and controlled overlap.
- Maintain a clear focal point.
- Avoid accidental visual conflicts.

**Best for:** Creative campaigns, editorial posters, lifestyle advertising.

## P45 — Circular Image Composition

**Structure:** Images are cropped into circular or radial containers.

**Construction:**
- Use circles as intentional framing devices.
- Vary scale when necessary.
- Align circular elements with the overall grid.
- Avoid using circles merely as decoration.

**Best for:** Team profiles, educational graphics, identity layouts.

## P46 — Image Window Composition

**Structure:** Photography is displayed through custom geometric windows.

**Construction:**
- Create a distinctive image mask.
- Relate the mask to the design's visual language.
- Keep image focal points visible.
- Use multiple windows only when they improve storytelling.

**Best for:** Editorial, architectural, travel, and creative designs.

## P47 — Panoramic Image Layout

**Structure:** A wide image becomes the primary visual foundation.

**Construction:**
- Use a wide, high-resolution image.
- Place text in a clear visual zone.
- Use cropping that preserves the subject.
- Avoid covering important image details.

**Best for:** Website banners, landscape posters, event headers.

## P48 — Silhouette Composition

**Structure:** A subject is represented through a strong silhouette.

**Construction:**
- Use recognizable outlines.
- Create contrast between silhouette and background.
- Support the subject with contextual information.
- Keep the silhouette visually clean.

**Best for:** Cultural posters, sports, events, storytelling graphics.

## P49 — Double Exposure-Inspired Composition

**Structure:** Two visual subjects or environments are blended into a single image treatment.

**Construction:**
- Select compatible image subjects.
- Use masks and controlled blending.
- Preserve the primary subject's recognition.
- Avoid excessive visual complexity.

**Best for:** Artistic campaigns, music posters, conceptual editorial designs.

## P50 — Perspective Product Composition

**Structure:** A product is presented using a deliberate perspective angle.

**Construction:**
- Select or create a suitable product view.
- Use perspective, scale, and shadow consistently.
- Establish a believable ground or spatial relationship.
- Avoid unrealistic distortions.

**Best for:** Technology, packaging, product launches, advertising.

---

# 8. Geometric, Abstract & Experimental Patterns

## P51 — Geometric Grid Composition

**Structure:** Geometric shapes organize the major visual elements.

**Construction:**
- Use a consistent geometric system.
- Align elements to shared axes.
- Control shape proportions.
- Keep decoration subordinate to the message.

**Best for:** Modern corporate, technology, educational graphics.

## P52 — Bauhaus-Inspired Composition

**Structure:** Basic geometry, primary forms, and functional typography create visual order.

**Construction:**
- Use circles, rectangles, lines, and geometric blocks.
- Establish a strong relationship between form and content.
- Use restrained color relationships.
- Avoid decorative imitation without purpose.

**Best for:** Cultural posters, educational graphics, modernist campaigns.

## P53 — Abstract Shape Composition

**Structure:** Organic or geometric abstract forms create visual atmosphere.

**Construction:**
- Select a coherent shape language.
- Use shapes to guide attention.
- Control scale and overlap.
- Keep important content clear.

**Best for:** Creative branding, modern posters, abstract campaigns.

## P54 — Organic Blob Composition

**Structure:** Soft, irregular shapes create an expressive visual environment.

**Construction:**
- Use organic forms as background or framing elements.
- Balance soft shapes with typography.
- Control color transitions.
- Avoid random blob placement.

**Best for:** Lifestyle, education, wellness, creative campaigns.

## P55 — Grid-Breaking Composition

**Structure:** Selected elements intentionally break the established grid.

**Construction:**
- Begin with a stable underlying grid.
- Break alignment selectively.
- Use overlap or oversized elements.
- Preserve enough order to maintain readability.

**Best for:** Experimental editorial, fashion, and contemporary posters.

## P56 — Layered Geometric Composition

**Structure:** Multiple geometric planes create a structured depth effect.

**Construction:**
- Establish a clear foreground and background.
- Use controlled transparency.
- Maintain consistent perspective.
- Avoid unnecessary visual layers.

**Best for:** Technology, modern branding, abstract promotional graphics.

## P57 — Circular Geometry System

**Structure:** Circles, arcs, rings, and radial lines organize the design.

**Construction:**
- Establish a central or orbital structure.
- Use circles for grouping or directional movement.
- Maintain consistent stroke relationships.
- Keep the composition balanced.

**Best for:** Technology, science, education, event graphics.

## P58 — Isometric Composition

**Structure:** Objects are arranged in an isometric visual environment.

**Construction:**
- Maintain consistent isometric angles.
- Use coherent light and shadow directions.
- Build objects from reusable vector shapes.
- Avoid mixing incompatible perspective systems.

**Best for:** Technology illustrations, educational diagrams, infographics.

## P59 — Fragmented Composition

**Structure:** Visual elements appear separated into fragments or panels.

**Construction:**
- Establish an underlying complete subject or grid.
- Use fragmentation to communicate energy or complexity.
- Preserve recognizable content.
- Avoid random clipping.

**Best for:** Music, technology, sports, experimental campaigns.

## P60 — Controlled Chaos Composition

**Structure:** Multiple elements create an energetic arrangement while retaining deliberate hierarchy.

**Construction:**
- Define one primary focal point.
- Use varied scales and directions.
- Maintain controlled spacing and contrast.
- Keep supporting content readable.

**Best for:** Youth campaigns, music, sports, street culture.

---

# 9. Information, Data & Educational Composition Patterns

## P61 — Structured Information Grid

**Structure:** Information is arranged into consistent columns and rows.

**Construction:**
- Group related information.
- Use clear section headings.
- Establish consistent alignment.
- Prioritize scanning and comprehension.

**Best for:** Educational posters, schedules, course information, reports.

## P62 — Timeline Layout

**Structure:** Events or stages follow a chronological sequence.

**Construction:**
- Establish a clear directional timeline.
- Distinguish milestones.
- Use consistent markers.
- Keep descriptions concise.

**Best for:** Historical posters, project roadmaps, event schedules.

## P63 — Step-by-Step Process Layout

**Structure:** A process is presented as a sequence of actions.

**Construction:**
- Divide the process into logical steps.
- Use numbers or directional indicators.
- Maintain consistent step styling.
- Avoid overcrowding.

**Best for:** Tutorials, educational graphics, instructions.

## P64 — Comparison Matrix

**Structure:** Multiple subjects are compared through a structured matrix.

**Construction:**
- Define comparison criteria.
- Use consistent row and column relationships.
- Highlight important differences.
- Ensure labels remain readable.

**Best for:** Academic comparisons, product specifications, service plans.

## P65 — Central Concept Map

**Structure:** A central concept connects to related ideas.

**Construction:**
- Place the primary concept at the center.
- Arrange related topics around it.
- Use connectors with clear relationships.
- Avoid crossing lines unnecessarily.

**Best for:** Educational posters, learning materials, brainstorming graphics.

## P66 — Hierarchical Tree Layout

**Structure:** Information flows from a parent concept into subordinate categories.

**Construction:**
- Define parent-child relationships.
- Use consistent branching.
- Maintain readable node labels.
- Prevent unnecessary connector complexity.

**Best for:** Organizational charts, classification systems, educational diagrams.

## P67 — Statistical Dashboard Layout

**Structure:** Key metrics are arranged into a visual dashboard.

**Construction:**
- Identify the most important metrics.
- Use appropriate charts and labels.
- Maintain consistent units and scales.
- Do not use decorative charts that misrepresent data.

**Best for:** Reports, institutional communication, business infographics.

## P68 — Icon-and-Label System

**Structure:** Small illustrations or icons support concise information groups.

**Construction:**
- Use a consistent icon family.
- Pair each icon with a clear label.
- Keep icon proportions consistent.
- Avoid using icons when text alone is clearer.

**Best for:** Course features, service lists, information posters.

## P69 — Number-Led Information Layout

**Structure:** Large numbers organize the information hierarchy.

**Construction:**
- Give important numbers visual prominence.
- Attach clear labels and context.
- Use consistent number formatting.
- Avoid presenting unsupported statistics.

**Best for:** Results, achievements, statistics, educational promotions.

## P70 — Map-and-Information Layout

**Structure:** A map or geographic visual is paired with supporting information.

**Construction:**
- Use accurate geographic data.
- Establish a clear map legend.
- Distinguish important locations.
- Keep labels and annotations readable.

**Best for:** Location guides, campus maps, event directions, travel graphics.

---

# 10. Brochure, Multi-Panel & Multi-Page Patterns

A brochure must work as a connected publication, not as unrelated individual pages.

## P71 — Classic Tri-Fold Layout

**Structure:** Three vertical panels create a folded brochure.

**Construction:**
- Plan the front cover, internal panels, and back panel.
- Respect fold positions and panel widths.
- Maintain a logical information sequence.
- Account for printer-specific fold allowances.

**Best for:** Business services, institutional brochures, travel information.

## P72 — Z-Fold Layout

**Structure:** Three or more panels fold in an alternating direction.

**Construction:**
- Use sequential storytelling.
- Create a clear visual transition between panels.
- Respect fold and safe-area requirements.
- Design the full unfolded sheet as one composition.

**Best for:** Campaigns, service explanations, product information.

## P73 — Gate-Fold Layout

**Structure:** Two outer panels fold inward to reveal a central section.

**Construction:**
- Use the outer panels as an introduction.
- Create a strong reveal in the center.
- Keep the central subject visually dominant.
- Check panel dimensions and folding specifications.

**Best for:** Premium product brochures, event invitations.

## P74 — Bi-Fold Editorial Layout

**Structure:** Four connected page surfaces form a simple folded publication.

**Construction:**
- Design a coherent front cover.
- Organize internal information.
- Use a purposeful back cover.
- Maintain consistent typography and spacing.

**Best for:** Company profiles, educational brochures, institutional publications.

## P75 — Modular Multi-Page Layout

**Structure:** Pages share a consistent design system with variable content modules.

**Construction:**
- Define reusable page grids.
- Establish typography and spacing tokens.
- Create flexible image and text modules.
- Maintain visual consistency without making every page identical.

**Best for:** Catalogues, annual reports, course guides.

## P76 — Narrative Sequential Layout

**Structure:** Content is revealed progressively across pages or panels.

**Construction:**
- Establish an introduction.
- Develop the message in a logical sequence.
- Build toward a conclusion or CTA.
- Maintain continuity across page transitions.

**Best for:** Brand stories, educational publications, campaign brochures.

## P77 — Image-Driven Brochure Layout

**Structure:** Large photographs lead the reader through the publication.

**Construction:**
- Use photography with a consistent visual direction.
- Balance image pages with information pages.
- Keep captions and supporting content consistent.
- Avoid image repetition without narrative purpose.

**Best for:** Travel, hospitality, real estate, institutional brochures.

## P78 — Product Catalogue Layout

**Structure:** Products are presented through a repeatable catalogue system.

**Construction:**
- Establish consistent product image treatment.
- Use clear product names and specifications.
- Maintain a consistent pricing hierarchy.
- Allow flexible content lengths without breaking the grid.

**Best for:** Retail, product catalogues, service listings.

## P79 — Corporate Profile Layout

**Structure:** A structured publication communicates organizational identity and capabilities.

**Construction:**
- Introduce the organization.
- Present mission, services, achievements, and contact information.
- Use consistent brand elements.
- Maintain a professional editorial rhythm.

**Best for:** Company profiles, institutional profiles, proposals.

## P80 — Long-Form Report Layout

**Structure:** Dense information is distributed through a consistent publication system.

**Construction:**
- Define heading levels and page grids.
- Use charts and tables where they improve comprehension.
- Establish headers, footers, and page numbers.
- Maintain readable typography and sufficient whitespace.

**Best for:** Research reports, annual reports, academic publications.

---

# 11. Business Card, Identity & Brand Communication Patterns

## P81 — Minimalist Identity Card

**Structure:** Brand identity and contact information are presented with restraint.

**Construction:**
- Prioritize logo and name.
- Use carefully selected typography.
- Maintain generous whitespace.
- Avoid unnecessary decorative elements.

**Best for:** Premium, professional, corporate identities.

## P82 — Split-Side Business Card

**Structure:** Front and back surfaces have different but related functions.

**Construction:**
- Use one side for identity.
- Use the other side for contact details.
- Maintain consistent brand styling.
- Respect print-safe margins.

**Best for:** Professional business cards.

## P83 — Monogram-Centered Card

**Structure:** A monogram or custom lettermark dominates the design.

**Construction:**
- Use a distinctive letterform.
- Balance it with supporting identity information.
- Maintain clear spacing.
- Ensure the mark remains legible at small sizes.

**Best for:** Personal branding, studios, premium services.

## P84 — Pattern-Based Identity Layout

**Structure:** A brand pattern supports the main identity elements.

**Construction:**
- Derive patterns from brand geometry or symbols.
- Use repetition consistently.
- Keep the logo recognizable.
- Control pattern density.

**Best for:** Creative studios, packaging, identity systems.

## P85 — Grid-Based Brand System

**Structure:** Brand elements follow a consistent underlying grid.

**Construction:**
- Define alignment and spacing rules.
- Establish logo placement.
- Use consistent typographic relationships.
- Support multiple output formats.

**Best for:** Corporate identity systems and brand collateral.

## P86 — Bold Brand Typography

**Structure:** The brand name becomes the primary graphic element.

**Construction:**
- Use strong typography.
- Control scale and letter spacing.
- Support the name with minimal contact information.
- Maintain brand consistency.

**Best for:** Creative agencies, fashion brands, modern businesses.

## P87 — Premium Negative-Space Card

**Structure:** Large areas of empty space create an elegant composition.

**Construction:**
- Use limited visual elements.
- Maintain precise alignment.
- Apply refined typography.
- Use material and print finishes only when appropriate.

**Best for:** Luxury brands, consultants, premium services.

## P88 — Symbol-and-Information Card

**Structure:** A brand symbol and structured contact information share the layout.

**Construction:**
- Establish a clear symbol area.
- Group contact details logically.
- Use consistent icon or label styling.
- Avoid overcrowding.

**Best for:** Professional services and institutional identity.

## P89 — Vertical Business Card

**Structure:** The card uses a portrait orientation.

**Construction:**
- Adapt the hierarchy to vertical space.
- Avoid simply rotating a horizontal layout.
- Establish a natural top-to-bottom reading flow.
- Keep contact details readable.

**Best for:** Personal brands, modern studios, creative professionals.

## P90 — Die-Cut-Inspired Identity Layout

**Structure:** The design anticipates a custom physical shape or cutout.

**Construction:**
- Design within a clearly defined trim boundary.
- Keep essential information away from cut lines.
- Use shapes that support the brand identity.
- Provide a separate production-ready cut path when supported.

**Best for:** Creative business cards, packaging inserts, promotional identity materials.

---

# 12. Social Media, Banner & Digital Layout Patterns

## P91 — Wide Hero Banner

**Structure:** A large horizontal visual with a headline and supporting CTA.

**Construction:**
- Use a strong left-to-right or right-to-left reading flow.
- Position the subject according to available text space.
- Respect platform cropping.
- Keep essential information inside safe zones.

**Best for:** Website banners, campaign headers, digital advertisements.

## P92 — Social Media Square Composition

**Structure:** A balanced square canvas with a focused message.

**Construction:**
- Use one primary focal point.
- Maintain mobile readability.
- Limit secondary information.
- Avoid placing essential details too close to the edges.

**Best for:** Social media promotional posts.

## P93 — Vertical Story Composition

**Structure:** Content is arranged for a tall mobile screen.

**Construction:**
- Establish a strong top-to-bottom flow.
- Keep text within platform-safe regions.
- Use a clear focal point.
- Design for quick viewing.

**Best for:** Stories, reels covers, vertical campaigns.

## P94 — Carousel Continuity Layout

**Structure:** Multiple social slides form one connected visual narrative.

**Construction:**
- Define a shared grid and visual identity.
- Give each slide a clear individual purpose.
- Use repeated elements for continuity.
- Create a meaningful opening and conclusion.

**Best for:** Educational carousels, product explanations, campaigns.

## P95 — Split-Panel Digital Banner

**Structure:** The banner contains separate but connected content zones.

**Construction:**
- Allocate areas for headline, image, and CTA.
- Maintain clear separation.
- Use consistent alignment.
- Avoid too many competing zones.

**Best for:** Web advertising, promotional banners.

## P96 — Countdown / Date Announcement

**Structure:** Time-sensitive information becomes the primary focus.

**Construction:**
- Emphasize the date or countdown.
- Keep event name and details clear.
- Use supporting imagery only when useful.
- Ensure date information is accurate.

**Best for:** Event launches, admission deadlines, registrations.

## P97 — Profile / Speaker Announcement

**Structure:** A portrait and identity information form the main composition.

**Construction:**
- Give the portrait appropriate prominence.
- Include name and role.
- Add event or topic information.
- Keep institutional branding secondary but visible.

**Best for:** Speaker announcements, teacher profiles, webinars.

## P98 — Product Launch Digital Layout

**Structure:** A product reveal is supported by concise launch information.

**Construction:**
- Use a strong product visual.
- Establish the launch message.
- Highlight one or two key benefits.
- Include a clear CTA.

**Best for:** Digital campaigns and product launches.

## P99 — Educational Course Promotion

**Structure:** Course identity, benefits, instructor, and enrollment details form a structured hierarchy.

**Construction:**
- Establish the course or program name.
- Highlight the main educational value.
- Include relevant instructor or institution details.
- Make enrollment information easy to find.

**Best for:** Coaching centers, schools, online courses, academic programs.

## P100 — Announcement Card

**Structure:** One clear message is presented in a compact, shareable format.

**Construction:**
- Use a concise headline.
- Include essential details only.
- Maintain strong contrast.
- Keep branding consistent.

**Best for:** Notices, greetings, announcements, updates.

---

# 13. Advanced Composition Variations

These techniques can be applied to multiple pattern families. They are not standalone templates.

## V01 — Rule-of-Thirds Placement

Position important subjects near meaningful intersections of a three-by-three grid.

Use when a balanced but non-central composition is needed.

## V02 — Golden-Ratio-Inspired Placement

Use proportional relationships to guide focal points and visual flow.

Do not force every design into a mathematical spiral.

## V03 — Optical Centering

Adjust elements according to visual perception rather than relying only on mathematical center alignment.

Especially useful for logos, icons, irregular shapes, and typography.

## V04 — Intentional Cropping

Allow selected images, letters, and graphic forms to extend beyond the canvas.

Never crop essential information or damage subject recognition.

## V05 — Edge Anchoring

Use the canvas boundaries as compositional anchors.

Maintain sufficient safe margins for important content.

## V06 — Negative-Space Emphasis

Use empty space to isolate and strengthen the focal point.

Do not fill every available area.

## V07 — Controlled Overlap

Allow elements to overlap to establish depth and relationships.

Every overlap must have a clear foreground-background order.

## V08 — Visual Counterweight

Balance a large element with smaller but visually meaningful elements.

Balance does not require equal size or symmetry.

## V09 — Directional Flow

Use image gaze, lines, shapes, and typography to guide the viewer through the content.

Ensure the reading path is intentional.

## V10 — Scale Contrast

Combine large and small elements to establish hierarchy.

Avoid random scale differences.

---

# 14. Background & Surface Treatment Library

Backgrounds should support the composition rather than compete with the main content.

## B01 — Solid Color Field

A single color creates a clean visual foundation.

## B02 — Linear Gradient

A gradual color transition establishes depth or atmosphere.

## B03 — Radial Gradient

A central light or color transition creates focal emphasis.

## B04 — Mesh Gradient

Multiple color points create a soft, organic gradient field.

## B05 — Duotone Image Background

An image is transformed using two coordinated colors.

## B06 — Grain Texture

Subtle grain adds tactile character.

## B07 — Paper Texture

A restrained paper surface supports editorial or printed aesthetics.

## B08 — Halftone Pattern

Dot patterns create a print-inspired visual treatment.

## B09 — Grid Background

A subtle geometric grid supports technical or structured designs.

## B10 — Architectural Line Pattern

Repeated lines create a disciplined visual surface.

## B11 — Organic Wave Background

Flowing forms create movement and softness.

## B12 — Abstract Geometric Background

Large geometric elements establish a visual direction.

## B13 — Blurred Light Background

Soft light areas create atmosphere and depth.

## B14 — Dark Cinematic Background

A dark visual field supports dramatic contrast.

## B15 — Minimal Negative-Space Background

A restrained background allows typography and imagery to dominate.

## B16 — Layered Color Planes

Overlapping color regions create depth.

## B17 — Monochromatic Texture

A single color family is combined with subtle surface variation.

## B18 — Image Overlay Background

A photograph is combined with a controlled overlay for readability.

## B19 — Patterned Brand Background

A repeatable visual motif derived from the brand supports identity consistency.

## B20 — Transparent / No-Fill Surface

The composition relies on typography, lines, and other elements without a dominant background fill.

---

# 15. Image Treatment & Graphic Enhancement Library

These techniques should be applied only when they improve the design.

## I01 — Background Removal

Isolate a subject from its original background.

## I02 — Soft Shadow

Create a subtle depth relationship between subject and background.

## I03 — Hard Shadow

Use a defined shadow for bold or graphic compositions.

## I04 — Long Shadow

Create an extended shadow direction for a stylized visual treatment.

## I05 — Gradient Overlay

Apply a gradient to improve atmosphere or text contrast.

## I06 — Duotone Treatment

Convert image tones into a controlled two-color palette.

## I07 — Color Tint

Apply a subtle color treatment to connect photography with brand colors.

## I08 — Blur Separation

Use selective blur to distinguish foreground and background.

## I09 — Clipping Mask

Constrain an image inside a vector shape or text form.

## I10 — Image Border Treatment

Use a deliberate stroke, frame, or edge treatment.

## I11 — Perspective Transformation

Adjust an image's perspective for a deliberate spatial effect.

## I12 — Reflection Treatment

Create a controlled reflection when the visual context supports it.

## I13 — Light and Glow

Use controlled light effects to emphasize a focal object.

## I14 — Grain and Noise

Add subtle texture to reduce an overly digital appearance.

## I15 — Selective Desaturation

Reduce color in secondary image areas to emphasize the main subject.

## I16 — Color Separation

Separate selected visual elements through controlled color contrast.

## I17 — Depth of Field

Use foreground and background focus differences to guide attention.

## I18 — Halftone Image Treatment

Convert photographic tones into a controlled dot-based style.

## I19 — Cutout Outline

Add a clean outline around an isolated subject.

## I20 — Multi-Image Blend

Combine multiple images using masks and controlled transparency.

---

# 16. Pattern Combination Rules

Combining patterns can create more sophisticated designs, but uncontrolled combinations create visual confusion.

## 16.1 Recommended Combinations

| Primary pattern | Supporting pattern | Intended result |
|---|---|---|
| Central Hero | Layered Depth | Strong dimensional poster |
| Full-Bleed Image | Oversized Typography | Editorial campaign |
| Product Hero | Feature Spotlight | Product-focused advertisement |
| Swiss Grid | Pull Quote | Editorial information design |
| Diagonal Dynamic | Kinetic Typography | Energetic promotional design |
| Modular Editorial | Image-and-Caption | Structured publication |
| Portrait Hero | Typographic Frame | Speaker or personality poster |
| Structured Information Grid | Icon-and-Label | Educational information graphic |
| Split-Half | Comparison Advertisement | Clear comparison |
| Minimalist Identity Card | Premium Negative Space | Refined identity design |
| Timeline | Step-by-Step Process | Sequential information graphic |
| Abstract Shape | Oversized Editorial Typography | Contemporary creative poster |
| Image Collage | Documentary Editorial | Storytelling composition |
| Product Hero | Perspective Product | Premium product presentation |
| Carousel Continuity | Modular Editorial | Consistent social media series |

## 16.2 Combination Restrictions

- Do not combine multiple dominant focal points without a clear hierarchy.
- Do not use several unrelated shape languages.
- Do not combine incompatible perspective systems.
- Do not use multiple decorative effects simply because they are available.
- Do not sacrifice readability for visual complexity.
- Do not let a supporting pattern overpower the primary composition.

---

# 17. Pattern Adaptation for Different Output Sizes

A composition must be redesigned for its target dimensions.

It must not simply be stretched or scaled without evaluation.

## 17.1 Portrait Formats

Common uses:
- Posters
- Flyers
- Stories
- Portrait advertisements

Recommended considerations:
- Establish a vertical reading sequence.
- Use the upper region for strong introductory content when appropriate.
- Use the lower region for supporting information or CTA.
- Control vertical spacing.

## 17.2 Landscape Formats

Common uses:
- Website banners
- Presentation graphics
- Horizontal advertisements
- Brochure spreads

Recommended considerations:
- Establish a horizontal reading direction.
- Use left-right visual relationships.
- Allocate space for image and text deliberately.
- Account for responsive cropping.

## 17.3 Square Formats

Common uses:
- Social media posts
- Product announcements
- Promotional cards

Recommended considerations:
- Establish one clear focal point.
- Avoid excessive information.
- Maintain balanced margins.
- Test readability at small screen sizes.

## 17.4 Multi-Page Formats

Common uses:
- Brochures
- Catalogues
- Reports
- Magazines

Recommended considerations:
- Establish a shared design system.
- Maintain consistent page margins.
- Use recurring grid structures.
- Create visual variation through module arrangement.
- Ensure the publication feels connected as a whole.

---

# 18. AI Pattern Diversity Engine

The platform must track composition choices to reduce repetitive outputs.

## 18.1 Composition History

Maintain a record of recently used patterns and major visual decisions.

Example:

```ts
interface CompositionHistory {
  projectId: string;
  documentId: string;
  primaryPatternId: string;
  supportingPatternIds: string[];
  artDirection: string;
  focalPointPosition: string;
  imageTreatment: string;
  typographyStyle: string;
  backgroundTreatment: string;
  createdAt: string;
}
```

## 18.2 Diversity Rules

When generating multiple design concepts:

1. Do not use the same primary pattern for every concept.
2. Vary focal point placement.
3. Vary image-led and typography-led approaches.
4. Vary composition density.
5. Explore different visual directions.
6. Use different background and image treatments.
7. Avoid repeating the same headline arrangement.
8. Avoid using the same decorative shapes in every design.

## 18.3 Similarity Detection

The system should compare new designs with recent designs using meaningful visual attributes.

Potential comparison dimensions:

- Layout topology
- Element position distribution
- Focal point location
- Typography scale relationships
- Image placement
- Shape distribution
- Color distribution
- Negative-space ratio
- Visual density
- Background treatment

A design should not be considered original merely because its colors or text have changed.

## 18.4 Diversity Does Not Mean Randomness

The objective is not maximum variation at any cost.

The objective is **purposeful visual diversity**.

A design must remain relevant to the brief, audience, brand, and communication objective.

---

# 19. Pattern Library Data Structure

Store patterns as structured data so the Runtime AI Designer and Design Engine can use them programmatically.

Example TypeScript interface:

```ts
type PatternCategory =
  | "poster"
  | "advertising"
  | "editorial"
  | "typography"
  | "image-led"
  | "geometric"
  | "information"
  | "brochure"
  | "identity"
  | "digital";

interface DesignPattern {
  id: string;
  name: string;
  category: PatternCategory;

  description: string;
  purpose: string[];

  suitableFor: string[];

  structure: {
    primaryZone: string;
    secondaryZone: string;
    focalPoint: string;
    readingFlow: string;
  };

  visualCharacteristics: string[];

  recommendedElements: string[];

  implementationNotes: string[];

  avoidWhen: string[];

  adaptationRules: string[];

  commonMistakes: string[];

  validationChecks: string[];

  complexity: "low" | "medium" | "high";
}
```

## 19.1 Pattern Data Requirements

Every implemented pattern should include:

- Unique ID
- Human-readable name
- Category
- Purpose
- Suitable design categories
- Structural description
- Focal point strategy
- Reading direction
- Visual characteristics
- Recommended elements and implementation notes (how the strategy maps to the canonical `CompositionPlan` in `DESIGN_ENGINE_SPEC.md`)
- Limitations and common mistakes
- Adaptation rules
- Validation checks (reading order, focus, fit and intended-use criteria)
- Complexity level

## 19.2 Pattern Metadata Must Not Become a Template

The pattern engine should provide structural guidance.

The final layout engine must calculate actual positions, sizes, spacing, and relationships based on the content and canvas dimensions.

Do not store every pattern as one fixed arrangement of coordinates.

---

# 20. Pattern-to-Scene-Graph Translation

A selected pattern must be translated into editable design elements.

The pattern library must work with the platform's vector scene graph.

For example:

Use only the canonical `CompositionPlan` type in `DESIGN_ENGINE_SPEC.md` §6.1; do not create a second plan schema in this library. Map a selected pattern's ID to `primaryPattern`, supporting IDs to `supportingPatterns`, intended content slots to the plan's `hierarchy`, and its structural regions to `zones` with canvas-unit bounds. Map reading direction and grid/overlap requirements to their corresponding canonical fields; safe margins belong to the document's `CanvasConfig.safeArea`, not a second pattern-specific value. The Layout Engine derives actual element geometry from this plan, content measurements, and canvas; pattern metadata must not supply a fixed output coordinate arrangement.

The composition engine should translate this plan into:

- Text objects
- Vector shapes
- Image objects
- Masks
- Paths
- Lines
- Background elements
- Effects
- Groups
- Guides
- Layer relationships

All generated elements should remain editable whenever technically possible.

A flattened image must not replace the editable vector composition.

---

# 21. Pattern Rendering & Technical Requirements

The rendering engine must support the following capabilities.

## 21.1 Layout

- Responsive coordinate calculations
- Grid and column systems
- Alignment
- Spacing
- Optical centering
- Safe margins
- Grouping and layering
- Z-index management

## 21.2 Vector Graphics

- SVG paths
- Rectangles
- Circles
- Polygons
- Ellipses
- Lines
- Custom shapes
- Clipping paths
- Masks
- Gradients
- Patterns
- Strokes
- Opacity
- Filters

## 21.3 Typography

- Font family and weight
- Font size
- Line height
- Letter spacing
- Paragraph spacing
- Text alignment
- Text wrapping
- Text clipping
- Text-on-path where supported
- Multilingual shaping
- Font fallback

## 21.4 Image Processing

- Image cropping
- Background removal
- Subject isolation
- Image masks
- Image filters
- Blend modes
- Color adjustment
- Shadows
- Perspective transformation where supported

## 21.5 Export

Support appropriate production formats, including:

- SVG
- PNG
- JPEG
- PDF

Where print output is required, support:

- Correct physical dimensions
- Resolution requirements
- Bleed
- Safe area
- Color management
- Font embedding or outlining where appropriate
- Printer-ready PDF settings

---

# 22. AI Design Generation Workflow

This library participates only in the **Composition Strategy** stage of the canonical workflow in `DESIGN_ENGINE_SPEC.md` §21. The full sequence is: Brief Analysis → Communication Objective → Creative Direction → Composition Strategy → Visual Hierarchy → Typography → Color → Asset Selection → Construction → Rendering → Quality Evaluation → Revision. Pattern selection must use the earlier objective/direction and return a pattern ID, reading flow, zones, and adaptation constraints for the shared `CompositionPlan`; it must not reorder the workflow or directly construct final geometry. After quality findings, a revision can revisit pattern choice only when the evidence identifies a structural weakness.

---

# 23. Anti-Patterns: What the Runtime AI Designer Must Avoid

The following are common signs of weak or generic design.

## 23.1 Composition Problems

- Everything centered without a reason.
- Every section placed inside a rounded rectangle.
- Repeated use of identical card layouts.
- No clear focal point.
- Too many competing elements.
- Randomly distributed decorative shapes.
- Excessive symmetry.
- Uncontrolled overlap.
- Poor use of negative space.

## 23.2 Typography Problems

- Too many font families.
- Uncontrolled font size changes.
- Poor line breaks.
- Weak contrast between headline and body text.
- Excessive letter spacing.
- Inconsistent alignment.
- Incorrect multilingual rendering.
- Using decorative fonts for long paragraphs.

## 23.3 Color Problems

- Too many unrelated colors.
- Insufficient text contrast.
- Uncontrolled gradients.
- Excessive glow effects.
- Inconsistent color relationships.
- Using color without considering the message.

## 23.4 Image Problems

- Unrelated stock imagery.
- Low-resolution images.
- Poor subject cropping.
- Inconsistent lighting.
- Unnatural shadows.
- Unconvincing cutout edges.
- Decorative images that do not support the message.

## 23.5 Generic AI Design Problems

- Using the same template for every category.
- Adding random icons to fill empty spaces.
- Adding unnecessary badges and pills.
- Using gradients everywhere.
- Making every design look like a dashboard.
- Treating every text block as a card.
- Adding decorative lines without compositional purpose.
- Using visual effects instead of strong layout decisions.

---

# 24. Final Pattern Selection Checklist

Before generating a design, verify:

- [ ] The pattern matches the design objective.
- [ ] The pattern is appropriate for the audience.
- [ ] The pattern supports the content hierarchy.
- [ ] The focal point is clear.
- [ ] The reading flow is intentional.
- [ ] The selected pattern is not being used mechanically.
- [ ] Supporting patterns have a clear purpose.
- [ ] Typography and imagery work together.
- [ ] The design has sufficient negative space.
- [ ] The output dimensions have been considered.
- [ ] The design remains editable.
- [ ] The composition does not look like a generic template.

---

# 25. Runtime AI Designer Instructions

When making a creative plan, the Runtime AI Designer follows these rules. Coding-agent behavior is defined only in `AGENTS.md`.

1. Treat this document as a professional composition reference, not a fixed template collection.
2. Select patterns according to the design brief.
3. Do not use the same composition repeatedly.
4. Do not generate generic card-based layouts by default.
5. Explore different art directions before settling on a composition.
6. Use typography as an active visual element.
7. Use photography and illustration with a clear purpose.
8. Build compositions using editable vector and image objects.
9. Preserve multilingual typography accuracy.
10. Adapt layouts to the actual output dimensions.
11. Use negative space intentionally.
12. Apply visual effects only when they improve the design.
13. Avoid unnecessary decoration.
14. Evaluate the final composition before delivery.
15. Prioritize originality, communication, visual hierarchy, and professional execution over the number of design elements.

## Ultimate Standard

The platform must not behave like a tool that places text and images into predefined templates.

It must behave like a professional design system that understands visual communication, explores composition possibilities, constructs original layouts, and refines them through systematic design evaluation.

**The objective is not to reproduce the appearance of a template. The objective is to develop the visual reasoning and construction capabilities required to create original, professional graphic designs.**
