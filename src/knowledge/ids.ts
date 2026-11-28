/**
 * Stable identifier catalogues.
 *
 * PURPOSE: connect the canonical schema to the design documents using stable
 * IDs rather than prose, so a plan can be validated against
 * `DESIGN_SYSTEM.md`, `DESIGN_PATTERNS_LIBRARY.md` and
 * `AI_DESIGN_INTELLIGENCE.md` without hardcoding descriptions in code.
 *
 * Rules honoured here:
 * - IDs come from the documents; no creative rule is re-invented.
 * - A catalogue is a *recognition* aid, not a whitelist by default. Documents
 *   are the authority; a value absent from a catalogue produces a warning
 *   (unknown/unverified) rather than a hard failure, except where the spec's
 *   own enumerations are closed (units, canvas background kinds, grid types,
 *   node types, medium, output formats, visual density, complexity).
 * - `P00`-style pattern IDs are closed, because the plan contract references
 *   the pattern catalogue by ID (spec §6.1 `primaryPattern: string`).
 */

import { GENERATED_PATTERNS } from './generated/patterns.generated.ts';

export type PatternCategory =
  | 'poster'
  | 'advertising'
  | 'editorial'
  | 'typography'
  | 'image-led'
  | 'geometric'
  | 'information'
  | 'brochure'
  | 'identity'
  | 'digital';

/**
 * Design category IDs.
 *
 * Derived from `DESIGN_SYSTEM.md` §11 category rules and the brief-intelligence
 * category list in `AI_DESIGN_INTELLIGENCE.md` §3, plus `custom` for a brief
 * whose output type is outside the documented set. `unspecified` is explicit:
 * it must never be replaced by a guess.
 */
export const DESIGN_CATEGORY_IDS = Object.freeze([
  'poster',
  'advertising_banner',
  'flyer',
  'brochure',
  'business_card',
  'social_media',
  'magazine_cover',
  'corporate_material',
  'custom',
  'unspecified',
] as const);

export type DesignCategoryId = (typeof DESIGN_CATEGORY_IDS)[number];

/**
 * Art-direction style IDs from `DESIGN_SYSTEM.md` §4.
 *
 * The first eleven are §4.1–§4.11 named directions; `ADDITIONAL_STYLE_IDS`
 * covers §4.11's "Additional Creative Directions" list. IDs are kebab-case
 * slugs of the document headings so they stay stable and readable.
 */
export const PRIMARY_STYLE_IDS = Object.freeze([
  'swiss-international',
  'editorial',
  'minimalist',
  'neo-brutalism',
  'luxury',
  'bauhaus',
  'art-deco',
  'swiss-editorial-brutalism',
  'modern-corporate',
  'experimental-typography',
] as const);

export const ADDITIONAL_STYLE_IDS = Object.freeze([
  'memphis',
  'retro-futurism',
  'y2k',
  'constructivism',
  'international-typographic',
  'vintage-advertising',
  'pop-art',
  'geometric-abstraction',
  'contemporary-swiss',
  'modernist-poster',
  'neo-retro',
  'contemporary-art-direction',
  'newspaper-editorial',
  'cinematic-graphic',
  'contemporary-japanese-editorial',
  'organic-modernism',
  'maximalist',
  'minimal-luxury',
] as const);

export const ART_DIRECTION_STYLE_IDS: readonly string[] = Object.freeze([
  ...PRIMARY_STYLE_IDS,
  ...ADDITIONAL_STYLE_IDS,
]);

export type ArtDirectionStyleId = (typeof PRIMARY_STYLE_IDS)[number] | (typeof ADDITIONAL_STYLE_IDS)[number];

/**
 * Color-strategy IDs from `DESIGN_ENGINE_SPEC.md` §10.2 and the harmony list in
 * `DESIGN_SYSTEM.md` §7.1. The union of both documents is accepted; where the
 * two documents agree the IDs coincide.
 */
export const COLOR_STRATEGY_IDS = Object.freeze([
  'monochromatic',
  'analogous',
  'complementary',
  'split-complementary',
  'triadic',
  'tetradic',
  'neutral-with-accent',
  'brand-driven',
  'image-derived',
  // Present in DESIGN_SYSTEM.md §7.1 but not §10.2; accepted as valid IDs.
  'neutral',
  'warm',
  'cool',
  'earthy',
  'high-contrast',
  'muted',
  'pastel',
] as const);

export type ColorStrategyId = (typeof COLOR_STRATEGY_IDS)[number];

/**
 * Functional color roles from `DESIGN_SYSTEM.md` §7.2.
 *
 * Used as the recommended role set for `DesignTokens.colors` keys. Extra keys
 * are allowed (the token contract is an open record) but are reported so
 * palette-role drift is visible.
 */
export const COLOR_ROLE_IDS = Object.freeze([
  'primary',
  'secondary',
  'accent',
  'background',
  'surface',
  'text_primary',
  'text_secondary',
  'border',
  'decorative',
] as const);

export type ColorRoleId = (typeof COLOR_ROLE_IDS)[number];

/**
 * Canonical content-slot IDs (`DESIGN_ENGINE_SPEC.md` §6.1).
 *
 * `HierarchyItem.contentId` values are either one of these fixed slots, one of
 * the indexed slots (`body/<n>`, `details/<n>`), or a declared user-content ID
 * supplied by the caller. The validator checks that every ranked slot actually
 * exists in the brief content so hierarchy cannot reference phantom content.
 */
export const CONTENT_SLOT_IDS = Object.freeze([
  'headline',
  'subheadline',
  'body',
  'details',
  'cta',
] as const);

export type ContentSlotId = (typeof CONTENT_SLOT_IDS)[number];

/** Indexed slot prefixes permitted by the contract. */
export const INDEXED_SLOT_PREFIXES = Object.freeze(['body/', 'details/'] as const);

/**
 * Hierarchy roles (`DESIGN_ENGINE_SPEC.md` §6.1).
 *
 * Note: `DESIGN_SYSTEM.md` §3.1 also names a "decorative" level. The contract's
 * `HierarchyItem.role` is the closed four-value union, and decorative content is
 * not part of the content hierarchy, so it is intentionally not accepted here.
 */
export const HIERARCHY_ROLES = Object.freeze(['primary', 'secondary', 'tertiary', 'utility'] as const);

export type HierarchyRole = (typeof HIERARCHY_ROLES)[number];

/** Writing-direction IDs documented for supported scripts. */
export const SCRIPT_DIRECTIONS: Readonly<Record<string, 'ltr' | 'rtl'>> = Object.freeze({
  en: 'ltr',
  bn: 'ltr',
  ar: 'rtl',
  ur: 'rtl',
});

/**
 * Scripts the platform documents as required
 * (`DESIGN_ENGINE_SPEC.md` §9.6, `DESIGN_SYSTEM.md` §6.5).
 */
export const DOCUMENTED_SCRIPTS = Object.freeze(['latin', 'bengali', 'arabic', 'urdu'] as const);

/** Pattern categories in document order. */
export const PATTERN_CATEGORY_IDS = Object.freeze([
  'poster',
  'advertising',
  'editorial',
  'typography',
  'image-led',
  'geometric',
  'information',
  'brochure',
  'identity',
  'digital',
] as const);

/**
 * Design categories each pattern category is documented as serving.
 *
 * Derived from the pattern library section intros and `DESIGN_SYSTEM.md` §11;
 * used for advisory "pattern may not suit this category" warnings only, never
 * as a hard block, because §2.2 selection logic is about content, not the label.
 */
export const PATTERN_CATEGORY_FIT: Readonly<Record<PatternCategory, readonly DesignCategoryId[]>> = Object.freeze({
  poster: ['poster', 'corporate_material', 'custom'],
  advertising: ['advertising_banner', 'social_media', 'poster', 'custom'],
  editorial: ['magazine_cover', 'brochure', 'poster', 'corporate_material', 'custom'],
  typography: ['poster', 'advertising_banner', 'social_media', 'magazine_cover', 'custom'],
  'image-led': ['poster', 'advertising_banner', 'magazine_cover', 'social_media', 'custom'],
  geometric: ['poster', 'social_media', 'corporate_material', 'custom'],
  information: ['flyer', 'brochure', 'corporate_material', 'social_media', 'custom'],
  brochure: ['brochure', 'flyer', 'corporate_material', 'custom'],
  identity: ['business_card', 'corporate_material', 'custom'],
  digital: ['social_media', 'advertising_banner', 'custom'],
});

export { GENERATED_PATTERNS };

export function isDesignCategoryId(value: unknown): value is DesignCategoryId {
  return typeof value === 'string' && (DESIGN_CATEGORY_IDS as readonly string[]).includes(value);
}

export function isArtDirectionStyleId(value: unknown): boolean {
  return typeof value === 'string' && ART_DIRECTION_STYLE_IDS.includes(value);
}

export function isColorStrategyId(value: unknown): value is ColorStrategyId {
  return typeof value === 'string' && (COLOR_STRATEGY_IDS as readonly string[]).includes(value);
}

export function isColorRoleId(value: unknown): value is ColorRoleId {
  return typeof value === 'string' && (COLOR_ROLE_IDS as readonly string[]).includes(value);
}

export function isHierarchyRole(value: unknown): value is HierarchyRole {
  return typeof value === 'string' && (HIERARCHY_ROLES as readonly string[]).includes(value);
}
