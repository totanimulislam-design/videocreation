/**
 * Test fixtures for the design contract.
 *
 * These are *documents*, hand-authored data, not implementations. They exercise
 * the validator against realistic shapes and are intentionally kept out of `src`
 * so production code cannot accidentally depend on fixture data.
 *
 * All values are fictional. No real contact details, institutions or prices are
 * used anywhere in this repository.
 */

import type {
  ArtDirection,
  CompositionPlan,
  DesignAsset,
  DesignDocument,
  SceneNode,
} from '../../src/schema/types.ts';
import { SCHEMA_VERSION } from '../../src/schema/version.ts';
import { createCanvas, createDesignTokens, createGrid } from '../../src/schema/factories.ts';

const NOW = '2026-01-05T09:30:00Z';

export const tuitionAdvertArtDirection: ArtDirection = {
  style: 'modern-corporate',
  mood: ['trustworthy', 'educational'],
  colorStrategy: 'brand-driven',
  typographyStrategy: 'Clear size and weight hierarchy with one accent colour',
  imageStrategy: 'No photography; typographic focus with a geometric accent panel',
  shapeLanguage: 'Rectilinear blocks with one circular accent',
  visualDensity: 'balanced',
  complexity: 'medium',
};

export function tuitionAdvertComposition(): CompositionPlan {
  return {
    primaryPattern: 'P19',
    supportingPatterns: ['P12'],
    focalPoint: { x: 540, y: 620, strength: 0.9 },
    readingFlow: 'ltr',
    hierarchy: [
      { contentId: 'headline', rank: 1, role: 'primary' },
      { contentId: 'subheadline', rank: 2, role: 'secondary' },
      { contentId: 'details/0', rank: 3, role: 'tertiary' },
      { contentId: 'cta', rank: 4, role: 'utility' },
    ],
    zones: [
      {
        id: 'zone-headline',
        purpose: 'headline',
        priority: 1,
        bounds: { x: 80, y: 120, width: 920, height: 320 },
        elementIds: ['el-headline', 'el-subheadline'],
      },
      {
        id: 'zone-cta',
        purpose: 'cta section',
        priority: 2,
        bounds: { x: 80, y: 860, width: 400, height: 120 },
        elementIds: ['el-cta-bg', 'el-cta-label'],
      },
    ],
    grid: createGrid({
      type: 'column',
      columns: 12,
      gutter: 24,
      margin: { top: 80, right: 80, bottom: 80, left: 80 },
    }),
    constraints: {
      preserveContent: true,
      allowOverlap: true,
      allowedOverlapPairs: [['el-cta-bg', 'el-cta-label']],
    },
  };
}

export const legalNoticeAsset: DesignAsset = {
  id: 'asset-font-body',
  kind: 'font',
  uri: 'asset://fonts/inter-regular',
  mimeType: 'font/woff2',
  licensing: { source: 'local project asset', usage: 'embedded UI font, self-hosted' },
};

export function tuitionAdvertElements(): SceneNode[] {
  return [
    {
      id: 'el-background',
      type: 'shape',
      name: 'Background panel',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      geometry: { width: 1080, height: 1080, shape: 'rect' },
      style: { fill: '#f7f5f0' },
      visible: true,
      locked: true,
      metadata: { intentionalBleed: true },
    },
    {
      id: 'el-headline',
      type: 'text',
      name: 'Main headline',
      transform: { x: 80, y: 160, scaleX: 1, scaleY: 1, rotation: 0 },
      geometry: { width: 920, height: 180 },
      text: {
        content: 'Admission Open 2026',
        language: 'en',
        direction: 'ltr',
        typography: {
          fontFamily: 'Inter',
          fontSize: 96,
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: -1,
          textAlign: 'left',
        },
      },
      visible: true,
      locked: false,
      metadata: { essential: true },
    },
    {
      id: 'el-subheadline',
      type: 'text',
      name: 'Subheadline',
      transform: { x: 80, y: 360, scaleX: 1, scaleY: 1, rotation: 0 },
      geometry: { width: 920, height: 60 },
      text: {
        content: 'Class 6 to 10 · batch starts 5 January 2026',
        language: 'en',
        direction: 'auto',
        typography: {
          fontFamily: 'Inter',
          fontSize: 36,
          fontWeight: 500,
          lineHeight: 1.3,
          letterSpacing: 0,
        },
      },
      visible: true,
      locked: false,
      metadata: { essential: true },
    },
    {
      id: 'el-cta-bg',
      type: 'shape',
      name: 'CTA background',
      transform: { x: 80, y: 860, scaleX: 1, scaleY: 1, rotation: 0 },
      geometry: { width: 400, height: 96, shape: 'rect' },
      style: { fill: '#0d2b52', radius: 8, opacity: 1 },
      visible: true,
      locked: false,
    },
    {
      id: 'el-cta-label',
      type: 'text',
      name: 'CTA label',
      transform: { x: 116, y: 888, scaleX: 1, scaleY: 1, rotation: 0 },
      geometry: { width: 328, height: 40 },
      text: {
        content: 'Register Now',
        language: 'en',
        direction: 'ltr',
        typography: {
          fontFamily: 'Inter',
          fontSize: 32,
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: 0.5,
          textAlign: 'center',
        },
      },
      style: { fill: '#ffffff' },
      visible: true,
      locked: false,
      metadata: { essential: true },
    },
    {
      id: 'grp-accent',
      type: 'group',
      name: 'Accent geometry',
      transform: { x: 760, y: 120, scaleX: 1, scaleY: 1, rotation: 0 },
      visible: true,
      locked: false,
      children: [
        {
          id: 'el-accent-circle',
          type: 'shape',
          name: 'Accent circle',
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
          geometry: { width: 220, height: 220, shape: 'ellipse' },
          style: { fill: '#c9a227', opacity: 0.9 },
          visible: true,
          locked: false,
        },
      ],
    },
  ];
}

/** A complete, valid plan for a 1080×1080 digital advert. */
export function validDesignPlan(): DesignDocument {
  return {
    id: 'design-tuition-advert',
    name: 'Tuition centre admission advert',
    schemaVersion: SCHEMA_VERSION,
    version: 3,
    metadata: {
      category: 'advertising_banner',
      description: 'Square digital advert for an admission announcement.',
      createdAt: NOW,
      updatedAt: NOW,
    },
    canvas: createCanvas({ width: 1080, height: 1080, unit: 'px' }),
    designTokens: createDesignTokens({
      colors: {
        primary: '#0d2b52',
        accent: '#c9a227',
        background: '#f7f5f0',
        text_primary: '#101010',
        text_secondary: '#4a4a4a',
      },
      shadows: {
        soft: { x: 0, y: 6, blur: 16, spread: 0, color: '#000000', opacity: 0.12 },
      },
    }),
    artDirection: tuitionAdvertArtDirection,
    composition: tuitionAdvertComposition(),
    elements: tuitionAdvertElements(),
    assets: [legalNoticeAsset],
    guides: [
      { id: 'guide-safe-top', kind: 'line', x: 0, y: 80, visible: false },
    ],
    settings: { colorProfile: 'srgb', exportScale: 2 },
  };
}

/**
 * A valid physical print plan: A5 in millimetres with 3 mm bleed and an 8 mm
 * safe margin.
 *
 * Geometry is authored in millimetres, not pixels — the first draft of this
 * fixture reused the 1080 px layout and the validator rejected it, which is the
 * intended behaviour: a unit change is a real design change, not a scale factor
 * (`DESIGN_ENGINE_SPEC.md` §3.2).
 */
export function validPrintPlan(): DesignDocument {
  return {
    id: 'design-print-handbill',
    name: 'A5 print handbill',
    schemaVersion: SCHEMA_VERSION,
    version: 1,
    metadata: {
      category: 'flyer',
      description: 'A5 handbill announcing an open day.',
      createdAt: NOW,
      updatedAt: NOW,
    },
    canvas: createCanvas({
      width: 148,
      height: 210,
      unit: 'mm',
      dpi: 300,
      bleedMm: 3,
      safeMarginMm: 8,
    }),
    designTokens: createDesignTokens({
      colors: {
        primary: '#1f3d2b',
        accent: '#b87333',
        background: '#faf7f0',
        text_primary: '#141414',
        text_secondary: '#4a4a4a',
      },
    }),
    artDirection: {
      style: 'editorial',
      mood: ['calm', 'educational'],
      colorStrategy: 'neutral-with-accent',
      typographyStrategy: 'Serif headline with a sans body at a clear size step',
      imageStrategy: 'No photography; information-first layout',
      shapeLanguage: 'Fine rules and rectangles only',
      visualDensity: 'minimal',
      complexity: 'low',
    },
    composition: {
      primaryPattern: 'P61',
      supportingPatterns: ['P68'],
      focalPoint: { x: 74, y: 62, strength: 0.8 },
      readingFlow: 'ltr',
      hierarchy: [
        { contentId: 'headline', rank: 1, role: 'primary' },
        { contentId: 'details/0', rank: 2, role: 'tertiary' },
      ],
      zones: [
        {
          id: 'zone-headline',
          purpose: 'headline',
          priority: 1,
          bounds: { x: 12, y: 20, width: 124, height: 60 },
          elementIds: ['print-headline'],
        },
      ],
      grid: createGrid({
        type: 'column',
        columns: 6,
        gutter: 4,
        margin: { top: 12, right: 12, bottom: 12, left: 12 },
      }),
      constraints: { preserveContent: true, allowOverlap: false, allowedOverlapPairs: [] },
    },
    elements: [
      {
        id: 'print-headline',
        type: 'text',
        name: 'Headline',
        transform: { x: 12, y: 24, scaleX: 1, scaleY: 1, rotation: 0 },
        geometry: { width: 124, height: 30 },
        text: {
          content: 'Open Day 2026',
          language: 'en',
          direction: 'ltr',
          typography: {
            fontFamily: 'Source Serif Pro',
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: 0,
            textAlign: 'left',
          },
        },
        visible: true,
        locked: false,
        metadata: { essential: true },
      },
    ],
    assets: [],
    guides: [{ id: 'guide-safe', kind: 'rect', x: 8, y: 8, width: 132, height: 194, visible: false }],
    settings: { colorProfile: 'fogra39', exportScale: 1 },
  };
}

/**
 * An RTL, Arabic-script document.
 *
 * Used to prove that direction handling is per-run and that nothing in the
 * validator silently mirrors or reverses content.
 */
export function validArabicPlan(): DesignDocument {
  const base = validDesignPlan();
  return {
    ...base,
    id: 'design-arabic-announcement',
    name: 'Arabic announcement',
    metadata: { ...base.metadata, category: 'social_media' },
    artDirection: {
      ...base.artDirection,
      style: 'modern-corporate',
      mood: ['professional', 'trustworthy'],
    },
    composition: {
      ...base.composition,
      readingFlow: 'rtl',
      hierarchy: [
        { contentId: 'headline', rank: 1, role: 'primary' },
        { contentId: 'details/0', rank: 2, role: 'tertiary' },
      ],
      zones: [
        {
          id: 'zone-headline',
          purpose: 'headline',
          priority: 1,
          bounds: { x: 80, y: 120, width: 920, height: 320 },
          elementIds: ['el-headline'],
        },
      ],
      constraints: { preserveContent: true, allowOverlap: false, allowedOverlapPairs: [] },
    },
    elements: [
      {
        id: 'el-headline',
        type: 'text',
        name: 'العنوان الرئيسي',
        transform: { x: 80, y: 160, scaleX: 1, scaleY: 1, rotation: 0 },
        geometry: { width: 920, height: 180 },
        text: {
          content: 'التسجيل مفتوح',
          language: 'ar',
          direction: 'rtl',
          typography: {
            fontFamily: 'Noto Sans Arabic',
            fontSize: 96,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: 0,
            textAlign: 'right',
          },
        },
        visible: true,
        locked: false,
        metadata: { essential: true },
      },
    ],
  };
}

/** A valid document with a mixed Bengali/English text run and an image asset. */
export function validMixedLanguagePlan(): DesignDocument {
  const base = validDesignPlan();
  return {
    ...base,
    id: 'design-mixed-language',
    name: 'Mixed language notice',
    metadata: { ...base.metadata, category: 'poster' },
    assets: [
      {
        id: 'asset-image-photo',
        kind: 'image',
        uri: 'asset://images/campus',
        mimeType: 'image/jpeg',
        width: 2400,
        height: 1600,
        licensing: { source: 'commissioned photography', usage: 'print and digital, worldwide' },
      },
    ],
    composition: {
      ...base.composition,
      hierarchy: [{ contentId: 'headline', rank: 1, role: 'primary' }],
      zones: [
        {
          id: 'zone-hero',
          purpose: 'hero',
          priority: 1,
          bounds: { x: 0, y: 0, width: 1080, height: 540 },
          elementIds: ['el-photo', 'el-headline'],
        },
      ],
      constraints: { preserveContent: true, allowOverlap: true, allowedOverlapPairs: [['el-photo', 'el-headline']] },
    },
    elements: [
      {
        id: 'el-photo',
        type: 'image',
        name: 'Campus photograph',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        geometry: { width: 1080, height: 540 },
        assetId: 'asset-image-photo',
        imagePlacement: { fit: 'cover', crop: { x: 0, y: 0.1, width: 1, height: 0.8 } },
        visible: true,
        locked: false,
      },
      {
        id: 'el-headline',
        type: 'text',
        name: 'ভর্তি চলছে',
        transform: { x: 60, y: 600, scaleX: 1, scaleY: 1, rotation: 0 },
        geometry: { width: 960, height: 140 },
        text: {
          content: 'ভর্তি চলছে ২০২৬ · Admission Open',
          language: 'bn',
          direction: 'auto',
          typography: {
            fontFamily: 'Noto Sans Bengali',
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: 0,
          },
        },
        visible: true,
        locked: false,
        metadata: { essential: true },
      },
    ],
  };
}
