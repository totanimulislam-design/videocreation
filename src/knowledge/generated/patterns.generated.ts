// AUTO-GENERATED — do not edit by hand.
// Source: DESIGN_PATTERNS_LIBRARY.md §§3–12 (pattern catalogue).
// Regenerate: npm run generate:knowledge
//
// This module carries pattern *metadata* (stable ID, name, category, meaning,
// implementation notes, use cases). It deliberately contains no coordinates and
// no layout: geometry is computed by the Design Engine from the plan, content
// measurements and canvas (library §19.2, §20).

import type { PatternCategory } from '../patterns.ts';

export interface GeneratedPatternEntry {
  readonly id: string;
  readonly name: string;
  readonly category: PatternCategory;
  readonly meaning: string;
  readonly implementation: readonly string[];
  readonly useCases: readonly string[];
}

export const GENERATED_PATTERNS: readonly GeneratedPatternEntry[] = Object.freeze([
  {
    id: 'P01',
    name: 'Central Hero Composition',
    category: 'poster',
    meaning: 'A dominant central subject surrounded by supporting information.',
    implementation: [
      'Place the main subject near the visual center.',
      'Establish a strong focal point.',
      'Position the headline above or around the subject.',
      'Distribute supporting information around the primary visual.',
    ],
    useCases: [
      'Event announcements, product launches, promotional campaigns.',
    ],
  },
  {
    id: 'P02',
    name: 'Upper Headline / Lower Visual',
    category: 'poster',
    meaning: 'Typography occupies the upper section while the main image anchors the lower section.',
    implementation: [
      'Create a strong headline area.',
      'Keep the visual subject large and recognizable.',
      'Use a transition between text and image.',
      'Place secondary details near the bottom.',
    ],
    useCases: [
      'Educational, cultural, and informational posters.',
    ],
  },
  {
    id: 'P03',
    name: 'Full-Bleed Image Poster',
    category: 'poster',
    meaning: 'A photograph or illustration covers the entire canvas.',
    implementation: [
      'Use an image that supports the message.',
      'Apply controlled contrast or overlays behind text.',
      'Position typography where sufficient readability exists.',
      'Use cropping intentionally.',
    ],
    useCases: [
      'Photography campaigns, lifestyle advertisements, cinematic posters.',
    ],
  },
  {
    id: 'P04',
    name: 'Split-Half Composition',
    category: 'poster',
    meaning: 'The canvas is divided into two major visual zones.',
    implementation: [
      'Use a vertical or horizontal division.',
      'Place imagery in one section and typography in the other.',
      'Establish a clear relationship between the two areas.',
      'Avoid making the division feel arbitrary.',
    ],
    useCases: [
      'Before-and-after campaigns, product promotions, educational comparisons.',
    ],
  },
  {
    id: 'P05',
    name: 'Diagonal Dynamic Composition',
    category: 'poster',
    meaning: 'Major elements follow a strong diagonal direction.',
    implementation: [
      'Establish a diagonal movement axis.',
      'Align image, headline, and graphic accents with that direction.',
      'Use overlapping elements carefully.',
      'Preserve a stable reading path.',
    ],
    useCases: [
      'Sports, technology, entertainment, energetic promotions.',
    ],
  },
  {
    id: 'P06',
    name: 'Layered Depth Composition',
    category: 'poster',
    meaning: 'Foreground, middle-ground, and background create a dimensional scene.',
    implementation: [
      'Background establishes atmosphere.',
      'Middle-ground supports the main subject.',
      'Foreground creates emphasis or depth.',
      'Use shadows, blur, scale, and overlap selectively.',
    ],
    useCases: [
      'Cinematic posters, product advertisements, creative campaigns.',
    ],
  },
  {
    id: 'P07',
    name: 'Frame Within a Frame',
    category: 'poster',
    meaning: 'A major subject is enclosed within a distinctive visual frame.',
    implementation: [
      'Create a frame using geometry, photography, typography, or illustration.',
      'Make the subject the dominant focal point.',
      'Allow selected elements to break the frame.',
      'Maintain a purposeful relationship between frame and content.',
    ],
    useCases: [
      'Luxury promotions, cultural events, editorial posters.',
    ],
  },
  {
    id: 'P08',
    name: 'Floating Elements Composition',
    category: 'poster',
    meaning: 'Several visual elements appear to float within a controlled space.',
    implementation: [
      'Use varied scale and positioning.',
      'Maintain visual balance through spacing.',
      'Establish a clear primary object.',
      'Use shadows or perspective to support depth.',
    ],
    useCases: [
      'Creative campaigns, product showcases, technology promotions.',
    ],
  },
  {
    id: 'P09',
    name: 'Radial Composition',
    category: 'poster',
    meaning: 'Elements radiate from a central focal point.',
    implementation: [
      'Establish a central subject or message.',
      'Arrange supporting elements around it.',
      'Use radial lines, circles, or directional shapes.',
      'Avoid excessive symmetry when a more organic result is appropriate.',
    ],
    useCases: [
      'Festivals, educational diagrams, announcements, promotional graphics.',
    ],
  },
  {
    id: 'P10',
    name: 'Oversized Subject Composition',
    category: 'poster',
    meaning: 'A large subject dominates the canvas, sometimes extending beyond its boundaries.',
    implementation: [
      'Scale the primary image dramatically.',
      'Use cropping to create visual impact.',
      'Place text in the remaining negative space.',
      'Avoid sacrificing subject recognition.',
    ],
    useCases: [
      'Fashion, lifestyle, product, and entertainment posters.',
    ],
  },
  {
    id: 'P11',
    name: 'Product Hero Layout',
    category: 'advertising',
    meaning: 'One product is the primary visual focus.',
    implementation: [
      'Display the product prominently.',
      'Use a supporting headline.',
      'Include a concise benefit statement.',
      'Position price or CTA in a clearly visible area.',
    ],
    useCases: [
      'Product advertisements and e-commerce campaigns.',
    ],
  },
  {
    id: 'P12',
    name: 'Offer Badge Composition',
    category: 'advertising',
    meaning: 'A promotional offer receives strong visual emphasis.',
    implementation: [
      'Give the offer a distinct visual area.',
      'Keep the product or service identifiable.',
      'Use a clear hierarchy between offer, benefit, and CTA.',
      'Avoid adding too many competing badges.',
    ],
    useCases: [
      'Discounts, seasonal promotions, special offers.',
    ],
  },
  {
    id: 'P13',
    name: 'Problem-to-Solution Layout',
    category: 'advertising',
    meaning: 'Present a problem and then its solution.',
    implementation: [
      'Establish the problem visually or through a short statement.',
      'Introduce the solution as the main focus.',
      'Explain the key benefit.',
      'End with a relevant CTA.',
    ],
    useCases: [
      'Educational services, software, healthcare communication, business promotions.',
    ],
  },
  {
    id: 'P14',
    name: 'Benefit Stack Layout',
    category: 'advertising',
    meaning: 'A central product or service is supported by a vertical or horizontal list of benefits.',
    implementation: [
      'Present one primary promise.',
      'Arrange benefits in a clear sequence.',
      'Use icons only when they improve comprehension.',
      'Maintain consistent spacing.',
    ],
    useCases: [
      'Service advertisements and feature promotions.',
    ],
  },
  {
    id: 'P15',
    name: 'Testimonial-Focused Layout',
    category: 'advertising',
    meaning: 'A customer statement becomes the main communication element.',
    implementation: [
      'Feature a concise testimonial.',
      'Include attribution when available and authorized.',
      'Use a portrait or brand element as supporting content.',
      'Keep the brand identity visible.',
    ],
    useCases: [
      'Educational institutions, service businesses, product credibility campaigns.',
    ],
  },
  {
    id: 'P16',
    name: 'Comparison Advertisement',
    category: 'advertising',
    meaning: 'Two or more options are compared side by side.',
    implementation: [
      'Use a consistent comparison grid.',
      'Highlight meaningful differences.',
      'Maintain equivalent visual treatment.',
      'Avoid misleading comparisons.',
    ],
    useCases: [
      'Product comparisons, service plans, educational programs.',
    ],
  },
  {
    id: 'P17',
    name: 'Feature Spotlight Layout',
    category: 'advertising',
    meaning: 'One important feature receives special emphasis.',
    implementation: [
      'Show the relevant product or service.',
      'Use callouts or labels to identify the feature.',
      'Keep secondary information subordinate.',
      'Use a clear reading direction.',
    ],
    useCases: [
      'Technology products, devices, software, educational tools.',
    ],
  },
  {
    id: 'P18',
    name: 'Promotional Ribbon Layout',
    category: 'advertising',
    meaning: 'A strong ribbon or band carries the offer or campaign message.',
    implementation: [
      'Integrate the ribbon into the overall composition.',
      'Use a strong contrast relationship.',
      'Avoid covering important visual content.',
      'Keep ribbon text concise.',
    ],
    useCases: [
      'Campaign announcements, discounts, retail promotions.',
    ],
  },
  {
    id: 'P19',
    name: 'Announcement Hierarchy Layout',
    category: 'advertising',
    meaning: 'The announcement itself is the primary focal point.',
    implementation: [
      'Use a dominant announcement headline.',
      'Place date, location, and supporting details beneath it.',
      'Add a supporting visual only when useful.',
      'Preserve quick readability.',
    ],
    useCases: [
      'Admissions, registrations, opening announcements, public notices.',
    ],
  },
  {
    id: 'P20',
    name: 'CTA-Dominant Layout',
    category: 'advertising',
    meaning: 'The desired action receives strong visual prominence.',
    implementation: [
      'Communicate the value proposition first.',
      'Make the action easy to identify.',
      'Use a clear button-like or typographic CTA treatment.',
      'Avoid competing calls to action.',
    ],
    useCases: [
      'Lead generation, registrations, event booking, online promotions.',
    ],
  },
  {
    id: 'P21',
    name: 'Swiss International Grid',
    category: 'editorial',
    meaning: 'Strict grid, disciplined alignment, and strong typographic hierarchy.',
    implementation: [
      'Establish consistent columns.',
      'Use a clear typographic scale.',
      'Align text and images systematically.',
      'Use whitespace as an active design element.',
    ],
    useCases: [
      'Editorial, corporate, cultural, and informational designs.',
    ],
  },
  {
    id: 'P22',
    name: 'Asymmetric Editorial Layout',
    category: 'editorial',
    meaning: 'Unequal visual weight creates a deliberate balance.',
    implementation: [
      'Place a large image or headline on one side.',
      'Balance it with smaller information groups.',
      'Use consistent alignment anchors.',
      'Avoid accidental imbalance.',
    ],
    useCases: [
      'Magazine spreads, creative publications, editorial posters.',
    ],
  },
  {
    id: 'P23',
    name: 'Modular Editorial Grid',
    category: 'editorial',
    meaning: 'Content is organized into reusable modules.',
    implementation: [
      'Define a modular grid.',
      'Assign each content group a module.',
      'Vary module size according to importance.',
      'Preserve consistent spacing.',
    ],
    useCases: [
      'Reports, brochures, information-heavy layouts.',
    ],
  },
  {
    id: 'P24',
    name: 'Magazine Cover Composition',
    category: 'editorial',
    meaning: 'A dominant cover image is supported by layered editorial typography.',
    implementation: [
      'Establish a clear masthead area.',
      'Feature one primary image.',
      'Arrange cover lines according to hierarchy.',
      'Avoid excessive text competition.',
    ],
    useCases: [
      'Magazine covers, publication announcements.',
    ],
  },
  {
    id: 'P25',
    name: 'Oversized Editorial Typography',
    category: 'editorial',
    meaning: 'Large typography becomes the main visual element.',
    implementation: [
      'Use one dominant word or phrase.',
      'Combine it with small supporting information.',
      'Control line breaks and letter spacing.',
      'Treat typography as a graphic shape.',
    ],
    useCases: [
      'Editorial posters, cultural campaigns, creative announcements.',
    ],
  },
  {
    id: 'P26',
    name: 'Multi-Column Editorial Layout',
    category: 'editorial',
    meaning: 'Information flows through multiple columns.',
    implementation: [
      'Establish consistent column widths.',
      'Use clear section headings.',
      'Maintain readable line lengths.',
      'Control image placement and text flow.',
    ],
    useCases: [
      'Brochures, newsletters, reports, magazines.',
    ],
  },
  {
    id: 'P27',
    name: 'Image-and-Caption Editorial Layout',
    category: 'editorial',
    meaning: 'Images and captions form a repeating editorial rhythm.',
    implementation: [
      'Pair each image with a concise caption.',
      'Maintain consistent caption styling.',
      'Vary image sizes when appropriate.',
      'Use whitespace to separate content groups.',
    ],
    useCases: [
      'Catalogues, portfolios, educational publications.',
    ],
  },
  {
    id: 'P28',
    name: 'Pull-Quote Composition',
    category: 'editorial',
    meaning: 'A selected quotation becomes a major visual element.',
    implementation: [
      'Highlight one meaningful statement.',
      'Use oversized quotation typography.',
      'Keep the surrounding content restrained.',
      'Include attribution when available.',
    ],
    useCases: [
      'Interviews, editorial spreads, reports.',
    ],
  },
  {
    id: 'P29',
    name: 'Documentary Editorial Layout',
    category: 'editorial',
    meaning: 'Photography and factual information work together.',
    implementation: [
      'Use authentic documentary imagery.',
      'Keep information hierarchy restrained.',
      'Use captions and metadata consistently.',
      'Avoid unnecessary decorative effects.',
    ],
    useCases: [
      'Annual reports, educational publications, documentary posters.',
    ],
  },
  {
    id: 'P30',
    name: 'Chapter Opener Layout',
    category: 'editorial',
    meaning: 'A section or chapter begins with a strong visual introduction.',
    implementation: [
      'Feature a section number or title.',
      'Introduce a supporting image or abstract graphic.',
      'Establish a distinct opening rhythm.',
      'Maintain consistency across the publication.',
    ],
    useCases: [
      'Books, reports, multi-page brochures.',
    ],
  },
  {
    id: 'P31',
    name: 'Kinetic Typography Layout',
    category: 'typography',
    meaning: 'Text appears to move through scale, rotation, alignment, or directional rhythm.',
    implementation: [
      'Establish a dominant phrase.',
      'Use controlled directional variation.',
      'Maintain readable text relationships.',
      'Use movement to reinforce meaning.',
    ],
    useCases: [
      'Youth campaigns, entertainment, music, creative posters.',
    ],
  },
  {
    id: 'P32',
    name: 'Stacked Word Composition',
    category: 'typography',
    meaning: 'A headline is broken into multiple large lines.',
    implementation: [
      'Use deliberate line breaks.',
      'Control line spacing and alignment.',
      'Emphasize selected words through scale or weight.',
      'Avoid awkward word separation.',
    ],
    useCases: [
      'Bold posters, event announcements, campaign graphics.',
    ],
  },
  {
    id: 'P33',
    name: 'Typographic Frame',
    category: 'typography',
    meaning: 'Typography forms a visual boundary around an image or message.',
    implementation: [
      'Arrange text along edges or around a central area.',
      'Maintain sufficient negative space.',
      'Use consistent type relationships.',
      'Ensure the framing text remains readable.',
    ],
    useCases: [
      'Editorial, fashion, and experimental posters.',
    ],
  },
  {
    id: 'P34',
    name: 'Giant Initial Letter',
    category: 'typography',
    meaning: 'One oversized letter anchors the composition.',
    implementation: [
      'Use the initial of a key word or a meaningful letterform.',
      'Place supporting text around or within the letter.',
      'Use the letter as a visual shape.',
      'Avoid compromising legibility.',
    ],
    useCases: [
      'Editorial covers, identity graphics, cultural posters.',
    ],
  },
  {
    id: 'P35',
    name: 'Vertical Typography',
    category: 'typography',
    meaning: 'Main text is arranged vertically or rotated.',
    implementation: [
      'Use vertical text as a deliberate hierarchy device.',
      'Preserve a comfortable reading direction.',
      'Balance vertical text with horizontal supporting content.',
      'Avoid excessive rotation.',
    ],
    useCases: [
      'Fashion, editorial, urban, and experimental layouts.',
    ],
  },
  {
    id: 'P36',
    name: 'Outline Typography',
    category: 'typography',
    meaning: 'Large outlined text provides a graphic layer.',
    implementation: [
      'Use outlined text for secondary emphasis or atmosphere.',
      'Maintain sufficient contrast.',
      'Avoid using outlines for long body text.',
      'Combine with solid typography when necessary.',
    ],
    useCases: [
      'Modern promotional graphics and experimental posters.',
    ],
  },
  {
    id: 'P37',
    name: 'Typography Mask Composition',
    category: 'typography',
    meaning: 'An image or texture appears inside letterforms.',
    implementation: [
      'Use a suitable image or texture.',
      'Create a text clipping mask.',
      'Preserve the word\'s recognition.',
      'Keep supporting text separate and readable.',
    ],
    useCases: [
      'Campaign posters, fashion, entertainment graphics.',
    ],
  },
  {
    id: 'P38',
    name: 'Mixed-Scale Typography',
    category: 'typography',
    meaning: 'Different words within the same headline use contrasting sizes.',
    implementation: [
      'Identify the most important words.',
      'Create a clear scale hierarchy.',
      'Control baseline and line spacing.',
      'Maintain visual unity.',
    ],
    useCases: [
      'Promotional headlines, event posters, editorial design.',
    ],
  },
  {
    id: 'P39',
    name: 'Typographic Repetition',
    category: 'typography',
    meaning: 'A word, phrase, or letter is repeated to create rhythm.',
    implementation: [
      'Establish a clear repetition pattern.',
      'Use changes in opacity, scale, or position.',
      'Keep the main message distinguishable.',
      'Avoid visual noise.',
    ],
    useCases: [
      'Music, fashion, experimental, and cultural posters.',
    ],
  },
  {
    id: 'P40',
    name: 'Multilingual Typography Composition',
    category: 'typography',
    meaning: 'Two or more writing systems work together as one composition.',
    implementation: [
      'Respect each script\'s natural reading direction.',
      'Use fonts with appropriate glyph coverage.',
      'Handle Bengali conjuncts, Arabic shaping, ligatures, and script-specific spacing correctly.',
      'Establish hierarchy without treating one language as decorative filler.',
      'Test the final rendered output.',
    ],
    useCases: [
      'Bengali-English-Arabic educational, cultural, and institutional designs.',
    ],
  },
  {
    id: 'P41',
    name: 'Portrait Hero',
    category: 'image-led',
    meaning: 'A person\'s portrait is the primary visual anchor.',
    implementation: [
      'Select a high-quality portrait.',
      'Use controlled cropping.',
      'Position text around the portrait\'s visual direction.',
      'Preserve facial integrity and natural proportions.',
    ],
    useCases: [
      'Speaker announcements, profiles, personal branding, events.',
    ],
  },
  {
    id: 'P42',
    name: 'Subject Cutout Composition',
    category: 'image-led',
    meaning: 'A cutout subject is separated from its original background.',
    implementation: [
      'Remove or isolate the subject.',
      'Place it within a designed environment.',
      'Use realistic shadows and edge treatment.',
      'Ensure the subject integrates naturally.',
    ],
    useCases: [
      'Product advertising, promotional posters, creative campaigns.',
    ],
  },
  {
    id: 'P43',
    name: 'Image Collage',
    category: 'image-led',
    meaning: 'Multiple images form one coordinated visual composition.',
    implementation: [
      'Define a clear visual theme.',
      'Use controlled image sizes and spacing.',
      'Establish one dominant image.',
      'Avoid unrelated image collections.',
    ],
    useCases: [
      'Travel, education, fashion, event promotion.',
    ],
  },
  {
    id: 'P44',
    name: 'Overlapping Photography',
    category: 'image-led',
    meaning: 'Two or more images overlap to create depth or narrative.',
    implementation: [
      'Establish foreground and background images.',
      'Use masks and controlled overlap.',
      'Maintain a clear focal point.',
      'Avoid accidental visual conflicts.',
    ],
    useCases: [
      'Creative campaigns, editorial posters, lifestyle advertising.',
    ],
  },
  {
    id: 'P45',
    name: 'Circular Image Composition',
    category: 'image-led',
    meaning: 'Images are cropped into circular or radial containers.',
    implementation: [
      'Use circles as intentional framing devices.',
      'Vary scale when necessary.',
      'Align circular elements with the overall grid.',
      'Avoid using circles merely as decoration.',
    ],
    useCases: [
      'Team profiles, educational graphics, identity layouts.',
    ],
  },
  {
    id: 'P46',
    name: 'Image Window Composition',
    category: 'image-led',
    meaning: 'Photography is displayed through custom geometric windows.',
    implementation: [
      'Create a distinctive image mask.',
      'Relate the mask to the design\'s visual language.',
      'Keep image focal points visible.',
      'Use multiple windows only when they improve storytelling.',
    ],
    useCases: [
      'Editorial, architectural, travel, and creative designs.',
    ],
  },
  {
    id: 'P47',
    name: 'Panoramic Image Layout',
    category: 'image-led',
    meaning: 'A wide image becomes the primary visual foundation.',
    implementation: [
      'Use a wide, high-resolution image.',
      'Place text in a clear visual zone.',
      'Use cropping that preserves the subject.',
      'Avoid covering important image details.',
    ],
    useCases: [
      'Website banners, landscape posters, event headers.',
    ],
  },
  {
    id: 'P48',
    name: 'Silhouette Composition',
    category: 'image-led',
    meaning: 'A subject is represented through a strong silhouette.',
    implementation: [
      'Use recognizable outlines.',
      'Create contrast between silhouette and background.',
      'Support the subject with contextual information.',
      'Keep the silhouette visually clean.',
    ],
    useCases: [
      'Cultural posters, sports, events, storytelling graphics.',
    ],
  },
  {
    id: 'P49',
    name: 'Double Exposure-Inspired Composition',
    category: 'image-led',
    meaning: 'Two visual subjects or environments are blended into a single image treatment.',
    implementation: [
      'Select compatible image subjects.',
      'Use masks and controlled blending.',
      'Preserve the primary subject\'s recognition.',
      'Avoid excessive visual complexity.',
    ],
    useCases: [
      'Artistic campaigns, music posters, conceptual editorial designs.',
    ],
  },
  {
    id: 'P50',
    name: 'Perspective Product Composition',
    category: 'image-led',
    meaning: 'A product is presented using a deliberate perspective angle.',
    implementation: [
      'Select or create a suitable product view.',
      'Use perspective, scale, and shadow consistently.',
      'Establish a believable ground or spatial relationship.',
      'Avoid unrealistic distortions.',
    ],
    useCases: [
      'Technology, packaging, product launches, advertising.',
    ],
  },
  {
    id: 'P51',
    name: 'Geometric Grid Composition',
    category: 'geometric',
    meaning: 'Geometric shapes organize the major visual elements.',
    implementation: [
      'Use a consistent geometric system.',
      'Align elements to shared axes.',
      'Control shape proportions.',
      'Keep decoration subordinate to the message.',
    ],
    useCases: [
      'Modern corporate, technology, educational graphics.',
    ],
  },
  {
    id: 'P52',
    name: 'Bauhaus-Inspired Composition',
    category: 'geometric',
    meaning: 'Basic geometry, primary forms, and functional typography create visual order.',
    implementation: [
      'Use circles, rectangles, lines, and geometric blocks.',
      'Establish a strong relationship between form and content.',
      'Use restrained color relationships.',
      'Avoid decorative imitation without purpose.',
    ],
    useCases: [
      'Cultural posters, educational graphics, modernist campaigns.',
    ],
  },
  {
    id: 'P53',
    name: 'Abstract Shape Composition',
    category: 'geometric',
    meaning: 'Organic or geometric abstract forms create visual atmosphere.',
    implementation: [
      'Select a coherent shape language.',
      'Use shapes to guide attention.',
      'Control scale and overlap.',
      'Keep important content clear.',
    ],
    useCases: [
      'Creative branding, modern posters, abstract campaigns.',
    ],
  },
  {
    id: 'P54',
    name: 'Organic Blob Composition',
    category: 'geometric',
    meaning: 'Soft, irregular shapes create an expressive visual environment.',
    implementation: [
      'Use organic forms as background or framing elements.',
      'Balance soft shapes with typography.',
      'Control color transitions.',
      'Avoid random blob placement.',
    ],
    useCases: [
      'Lifestyle, education, wellness, creative campaigns.',
    ],
  },
  {
    id: 'P55',
    name: 'Grid-Breaking Composition',
    category: 'geometric',
    meaning: 'Selected elements intentionally break the established grid.',
    implementation: [
      'Begin with a stable underlying grid.',
      'Break alignment selectively.',
      'Use overlap or oversized elements.',
      'Preserve enough order to maintain readability.',
    ],
    useCases: [
      'Experimental editorial, fashion, and contemporary posters.',
    ],
  },
  {
    id: 'P56',
    name: 'Layered Geometric Composition',
    category: 'geometric',
    meaning: 'Multiple geometric planes create a structured depth effect.',
    implementation: [
      'Establish a clear foreground and background.',
      'Use controlled transparency.',
      'Maintain consistent perspective.',
      'Avoid unnecessary visual layers.',
    ],
    useCases: [
      'Technology, modern branding, abstract promotional graphics.',
    ],
  },
  {
    id: 'P57',
    name: 'Circular Geometry System',
    category: 'geometric',
    meaning: 'Circles, arcs, rings, and radial lines organize the design.',
    implementation: [
      'Establish a central or orbital structure.',
      'Use circles for grouping or directional movement.',
      'Maintain consistent stroke relationships.',
      'Keep the composition balanced.',
    ],
    useCases: [
      'Technology, science, education, event graphics.',
    ],
  },
  {
    id: 'P58',
    name: 'Isometric Composition',
    category: 'geometric',
    meaning: 'Objects are arranged in an isometric visual environment.',
    implementation: [
      'Maintain consistent isometric angles.',
      'Use coherent light and shadow directions.',
      'Build objects from reusable vector shapes.',
      'Avoid mixing incompatible perspective systems.',
    ],
    useCases: [
      'Technology illustrations, educational diagrams, infographics.',
    ],
  },
  {
    id: 'P59',
    name: 'Fragmented Composition',
    category: 'geometric',
    meaning: 'Visual elements appear separated into fragments or panels.',
    implementation: [
      'Establish an underlying complete subject or grid.',
      'Use fragmentation to communicate energy or complexity.',
      'Preserve recognizable content.',
      'Avoid random clipping.',
    ],
    useCases: [
      'Music, technology, sports, experimental campaigns.',
    ],
  },
  {
    id: 'P60',
    name: 'Controlled Chaos Composition',
    category: 'geometric',
    meaning: 'Multiple elements create an energetic arrangement while retaining deliberate hierarchy.',
    implementation: [
      'Define one primary focal point.',
      'Use varied scales and directions.',
      'Maintain controlled spacing and contrast.',
      'Keep supporting content readable.',
    ],
    useCases: [
      'Youth campaigns, music, sports, street culture.',
    ],
  },
  {
    id: 'P61',
    name: 'Structured Information Grid',
    category: 'information',
    meaning: 'Information is arranged into consistent columns and rows.',
    implementation: [
      'Group related information.',
      'Use clear section headings.',
      'Establish consistent alignment.',
      'Prioritize scanning and comprehension.',
    ],
    useCases: [
      'Educational posters, schedules, course information, reports.',
    ],
  },
  {
    id: 'P62',
    name: 'Timeline Layout',
    category: 'information',
    meaning: 'Events or stages follow a chronological sequence.',
    implementation: [
      'Establish a clear directional timeline.',
      'Distinguish milestones.',
      'Use consistent markers.',
      'Keep descriptions concise.',
    ],
    useCases: [
      'Historical posters, project roadmaps, event schedules.',
    ],
  },
  {
    id: 'P63',
    name: 'Step-by-Step Process Layout',
    category: 'information',
    meaning: 'A process is presented as a sequence of actions.',
    implementation: [
      'Divide the process into logical steps.',
      'Use numbers or directional indicators.',
      'Maintain consistent step styling.',
      'Avoid overcrowding.',
    ],
    useCases: [
      'Tutorials, educational graphics, instructions.',
    ],
  },
  {
    id: 'P64',
    name: 'Comparison Matrix',
    category: 'information',
    meaning: 'Multiple subjects are compared through a structured matrix.',
    implementation: [
      'Define comparison criteria.',
      'Use consistent row and column relationships.',
      'Highlight important differences.',
      'Ensure labels remain readable.',
    ],
    useCases: [
      'Academic comparisons, product specifications, service plans.',
    ],
  },
  {
    id: 'P65',
    name: 'Central Concept Map',
    category: 'information',
    meaning: 'A central concept connects to related ideas.',
    implementation: [
      'Place the primary concept at the center.',
      'Arrange related topics around it.',
      'Use connectors with clear relationships.',
      'Avoid crossing lines unnecessarily.',
    ],
    useCases: [
      'Educational posters, learning materials, brainstorming graphics.',
    ],
  },
  {
    id: 'P66',
    name: 'Hierarchical Tree Layout',
    category: 'information',
    meaning: 'Information flows from a parent concept into subordinate categories.',
    implementation: [
      'Define parent-child relationships.',
      'Use consistent branching.',
      'Maintain readable node labels.',
      'Prevent unnecessary connector complexity.',
    ],
    useCases: [
      'Organizational charts, classification systems, educational diagrams.',
    ],
  },
  {
    id: 'P67',
    name: 'Statistical Dashboard Layout',
    category: 'information',
    meaning: 'Key metrics are arranged into a visual dashboard.',
    implementation: [
      'Identify the most important metrics.',
      'Use appropriate charts and labels.',
      'Maintain consistent units and scales.',
      'Do not use decorative charts that misrepresent data.',
    ],
    useCases: [
      'Reports, institutional communication, business infographics.',
    ],
  },
  {
    id: 'P68',
    name: 'Icon-and-Label System',
    category: 'information',
    meaning: 'Small illustrations or icons support concise information groups.',
    implementation: [
      'Use a consistent icon family.',
      'Pair each icon with a clear label.',
      'Keep icon proportions consistent.',
      'Avoid using icons when text alone is clearer.',
    ],
    useCases: [
      'Course features, service lists, information posters.',
    ],
  },
  {
    id: 'P69',
    name: 'Number-Led Information Layout',
    category: 'information',
    meaning: 'Large numbers organize the information hierarchy.',
    implementation: [
      'Give important numbers visual prominence.',
      'Attach clear labels and context.',
      'Use consistent number formatting.',
      'Avoid presenting unsupported statistics.',
    ],
    useCases: [
      'Results, achievements, statistics, educational promotions.',
    ],
  },
  {
    id: 'P70',
    name: 'Map-and-Information Layout',
    category: 'information',
    meaning: 'A map or geographic visual is paired with supporting information.',
    implementation: [
      'Use accurate geographic data.',
      'Establish a clear map legend.',
      'Distinguish important locations.',
      'Keep labels and annotations readable.',
    ],
    useCases: [
      'Location guides, campus maps, event directions, travel graphics.',
    ],
  },
  {
    id: 'P71',
    name: 'Classic Tri-Fold Layout',
    category: 'brochure',
    meaning: 'Three vertical panels create a folded brochure.',
    implementation: [
      'Plan the front cover, internal panels, and back panel.',
      'Respect fold positions and panel widths.',
      'Maintain a logical information sequence.',
      'Account for printer-specific fold allowances.',
    ],
    useCases: [
      'Business services, institutional brochures, travel information.',
    ],
  },
  {
    id: 'P72',
    name: 'Z-Fold Layout',
    category: 'brochure',
    meaning: 'Three or more panels fold in an alternating direction.',
    implementation: [
      'Use sequential storytelling.',
      'Create a clear visual transition between panels.',
      'Respect fold and safe-area requirements.',
      'Design the full unfolded sheet as one composition.',
    ],
    useCases: [
      'Campaigns, service explanations, product information.',
    ],
  },
  {
    id: 'P73',
    name: 'Gate-Fold Layout',
    category: 'brochure',
    meaning: 'Two outer panels fold inward to reveal a central section.',
    implementation: [
      'Use the outer panels as an introduction.',
      'Create a strong reveal in the center.',
      'Keep the central subject visually dominant.',
      'Check panel dimensions and folding specifications.',
    ],
    useCases: [
      'Premium product brochures, event invitations.',
    ],
  },
  {
    id: 'P74',
    name: 'Bi-Fold Editorial Layout',
    category: 'brochure',
    meaning: 'Four connected page surfaces form a simple folded publication.',
    implementation: [
      'Design a coherent front cover.',
      'Organize internal information.',
      'Use a purposeful back cover.',
      'Maintain consistent typography and spacing.',
    ],
    useCases: [
      'Company profiles, educational brochures, institutional publications.',
    ],
  },
  {
    id: 'P75',
    name: 'Modular Multi-Page Layout',
    category: 'brochure',
    meaning: 'Pages share a consistent design system with variable content modules.',
    implementation: [
      'Define reusable page grids.',
      'Establish typography and spacing tokens.',
      'Create flexible image and text modules.',
      'Maintain visual consistency without making every page identical.',
    ],
    useCases: [
      'Catalogues, annual reports, course guides.',
    ],
  },
  {
    id: 'P76',
    name: 'Narrative Sequential Layout',
    category: 'brochure',
    meaning: 'Content is revealed progressively across pages or panels.',
    implementation: [
      'Establish an introduction.',
      'Develop the message in a logical sequence.',
      'Build toward a conclusion or CTA.',
      'Maintain continuity across page transitions.',
    ],
    useCases: [
      'Brand stories, educational publications, campaign brochures.',
    ],
  },
  {
    id: 'P77',
    name: 'Image-Driven Brochure Layout',
    category: 'brochure',
    meaning: 'Large photographs lead the reader through the publication.',
    implementation: [
      'Use photography with a consistent visual direction.',
      'Balance image pages with information pages.',
      'Keep captions and supporting content consistent.',
      'Avoid image repetition without narrative purpose.',
    ],
    useCases: [
      'Travel, hospitality, real estate, institutional brochures.',
    ],
  },
  {
    id: 'P78',
    name: 'Product Catalogue Layout',
    category: 'brochure',
    meaning: 'Products are presented through a repeatable catalogue system.',
    implementation: [
      'Establish consistent product image treatment.',
      'Use clear product names and specifications.',
      'Maintain a consistent pricing hierarchy.',
      'Allow flexible content lengths without breaking the grid.',
    ],
    useCases: [
      'Retail, product catalogues, service listings.',
    ],
  },
  {
    id: 'P79',
    name: 'Corporate Profile Layout',
    category: 'brochure',
    meaning: 'A structured publication communicates organizational identity and capabilities.',
    implementation: [
      'Introduce the organization.',
      'Present mission, services, achievements, and contact information.',
      'Use consistent brand elements.',
      'Maintain a professional editorial rhythm.',
    ],
    useCases: [
      'Company profiles, institutional profiles, proposals.',
    ],
  },
  {
    id: 'P80',
    name: 'Long-Form Report Layout',
    category: 'brochure',
    meaning: 'Dense information is distributed through a consistent publication system.',
    implementation: [
      'Define heading levels and page grids.',
      'Use charts and tables where they improve comprehension.',
      'Establish headers, footers, and page numbers.',
      'Maintain readable typography and sufficient whitespace.',
    ],
    useCases: [
      'Research reports, annual reports, academic publications.',
    ],
  },
  {
    id: 'P81',
    name: 'Minimalist Identity Card',
    category: 'identity',
    meaning: 'Brand identity and contact information are presented with restraint.',
    implementation: [
      'Prioritize logo and name.',
      'Use carefully selected typography.',
      'Maintain generous whitespace.',
      'Avoid unnecessary decorative elements.',
    ],
    useCases: [
      'Premium, professional, corporate identities.',
    ],
  },
  {
    id: 'P82',
    name: 'Split-Side Business Card',
    category: 'identity',
    meaning: 'Front and back surfaces have different but related functions.',
    implementation: [
      'Use one side for identity.',
      'Use the other side for contact details.',
      'Maintain consistent brand styling.',
      'Respect print-safe margins.',
    ],
    useCases: [
      'Professional business cards.',
    ],
  },
  {
    id: 'P83',
    name: 'Monogram-Centered Card',
    category: 'identity',
    meaning: 'A monogram or custom lettermark dominates the design.',
    implementation: [
      'Use a distinctive letterform.',
      'Balance it with supporting identity information.',
      'Maintain clear spacing.',
      'Ensure the mark remains legible at small sizes.',
    ],
    useCases: [
      'Personal branding, studios, premium services.',
    ],
  },
  {
    id: 'P84',
    name: 'Pattern-Based Identity Layout',
    category: 'identity',
    meaning: 'A brand pattern supports the main identity elements.',
    implementation: [
      'Derive patterns from brand geometry or symbols.',
      'Use repetition consistently.',
      'Keep the logo recognizable.',
      'Control pattern density.',
    ],
    useCases: [
      'Creative studios, packaging, identity systems.',
    ],
  },
  {
    id: 'P85',
    name: 'Grid-Based Brand System',
    category: 'identity',
    meaning: 'Brand elements follow a consistent underlying grid.',
    implementation: [
      'Define alignment and spacing rules.',
      'Establish logo placement.',
      'Use consistent typographic relationships.',
      'Support multiple output formats.',
    ],
    useCases: [
      'Corporate identity systems and brand collateral.',
    ],
  },
  {
    id: 'P86',
    name: 'Bold Brand Typography',
    category: 'identity',
    meaning: 'The brand name becomes the primary graphic element.',
    implementation: [
      'Use strong typography.',
      'Control scale and letter spacing.',
      'Support the name with minimal contact information.',
      'Maintain brand consistency.',
    ],
    useCases: [
      'Creative agencies, fashion brands, modern businesses.',
    ],
  },
  {
    id: 'P87',
    name: 'Premium Negative-Space Card',
    category: 'identity',
    meaning: 'Large areas of empty space create an elegant composition.',
    implementation: [
      'Use limited visual elements.',
      'Maintain precise alignment.',
      'Apply refined typography.',
      'Use material and print finishes only when appropriate.',
    ],
    useCases: [
      'Luxury brands, consultants, premium services.',
    ],
  },
  {
    id: 'P88',
    name: 'Symbol-and-Information Card',
    category: 'identity',
    meaning: 'A brand symbol and structured contact information share the layout.',
    implementation: [
      'Establish a clear symbol area.',
      'Group contact details logically.',
      'Use consistent icon or label styling.',
      'Avoid overcrowding.',
    ],
    useCases: [
      'Professional services and institutional identity.',
    ],
  },
  {
    id: 'P89',
    name: 'Vertical Business Card',
    category: 'identity',
    meaning: 'The card uses a portrait orientation.',
    implementation: [
      'Adapt the hierarchy to vertical space.',
      'Avoid simply rotating a horizontal layout.',
      'Establish a natural top-to-bottom reading flow.',
      'Keep contact details readable.',
    ],
    useCases: [
      'Personal brands, modern studios, creative professionals.',
    ],
  },
  {
    id: 'P90',
    name: 'Die-Cut-Inspired Identity Layout',
    category: 'identity',
    meaning: 'The design anticipates a custom physical shape or cutout.',
    implementation: [
      'Design within a clearly defined trim boundary.',
      'Keep essential information away from cut lines.',
      'Use shapes that support the brand identity.',
      'Provide a separate production-ready cut path when supported.',
    ],
    useCases: [
      'Creative business cards, packaging inserts, promotional identity materials.',
    ],
  },
  {
    id: 'P91',
    name: 'Wide Hero Banner',
    category: 'digital',
    meaning: 'A large horizontal visual with a headline and supporting CTA.',
    implementation: [
      'Use a strong left-to-right or right-to-left reading flow.',
      'Position the subject according to available text space.',
      'Respect platform cropping.',
      'Keep essential information inside safe zones.',
    ],
    useCases: [
      'Website banners, campaign headers, digital advertisements.',
    ],
  },
  {
    id: 'P92',
    name: 'Social Media Square Composition',
    category: 'digital',
    meaning: 'A balanced square canvas with a focused message.',
    implementation: [
      'Use one primary focal point.',
      'Maintain mobile readability.',
      'Limit secondary information.',
      'Avoid placing essential details too close to the edges.',
    ],
    useCases: [
      'Social media promotional posts.',
    ],
  },
  {
    id: 'P93',
    name: 'Vertical Story Composition',
    category: 'digital',
    meaning: 'Content is arranged for a tall mobile screen.',
    implementation: [
      'Establish a strong top-to-bottom flow.',
      'Keep text within platform-safe regions.',
      'Use a clear focal point.',
      'Design for quick viewing.',
    ],
    useCases: [
      'Stories, reels covers, vertical campaigns.',
    ],
  },
  {
    id: 'P94',
    name: 'Carousel Continuity Layout',
    category: 'digital',
    meaning: 'Multiple social slides form one connected visual narrative.',
    implementation: [
      'Define a shared grid and visual identity.',
      'Give each slide a clear individual purpose.',
      'Use repeated elements for continuity.',
      'Create a meaningful opening and conclusion.',
    ],
    useCases: [
      'Educational carousels, product explanations, campaigns.',
    ],
  },
  {
    id: 'P95',
    name: 'Split-Panel Digital Banner',
    category: 'digital',
    meaning: 'The banner contains separate but connected content zones.',
    implementation: [
      'Allocate areas for headline, image, and CTA.',
      'Maintain clear separation.',
      'Use consistent alignment.',
      'Avoid too many competing zones.',
    ],
    useCases: [
      'Web advertising, promotional banners.',
    ],
  },
  {
    id: 'P96',
    name: 'Countdown / Date Announcement',
    category: 'digital',
    meaning: 'Time-sensitive information becomes the primary focus.',
    implementation: [
      'Emphasize the date or countdown.',
      'Keep event name and details clear.',
      'Use supporting imagery only when useful.',
      'Ensure date information is accurate.',
    ],
    useCases: [
      'Event launches, admission deadlines, registrations.',
    ],
  },
  {
    id: 'P97',
    name: 'Profile / Speaker Announcement',
    category: 'digital',
    meaning: 'A portrait and identity information form the main composition.',
    implementation: [
      'Give the portrait appropriate prominence.',
      'Include name and role.',
      'Add event or topic information.',
      'Keep institutional branding secondary but visible.',
    ],
    useCases: [
      'Speaker announcements, teacher profiles, webinars.',
    ],
  },
  {
    id: 'P98',
    name: 'Product Launch Digital Layout',
    category: 'digital',
    meaning: 'A product reveal is supported by concise launch information.',
    implementation: [
      'Use a strong product visual.',
      'Establish the launch message.',
      'Highlight one or two key benefits.',
      'Include a clear CTA.',
    ],
    useCases: [
      'Digital campaigns and product launches.',
    ],
  },
  {
    id: 'P99',
    name: 'Educational Course Promotion',
    category: 'digital',
    meaning: 'Course identity, benefits, instructor, and enrollment details form a structured hierarchy.',
    implementation: [
      'Establish the course or program name.',
      'Highlight the main educational value.',
      'Include relevant instructor or institution details.',
      'Make enrollment information easy to find.',
    ],
    useCases: [
      'Coaching centers, schools, online courses, academic programs.',
    ],
  },
  {
    id: 'P100',
    name: 'Announcement Card',
    category: 'digital',
    meaning: 'One clear message is presented in a compact, shareable format.',
    implementation: [
      'Use a concise headline.',
      'Include essential details only.',
      'Maintain strong contrast.',
      'Keep branding consistent.',
    ],
    useCases: [
      'Notices, greetings, announcements, updates.',
    ],
  },
]);
