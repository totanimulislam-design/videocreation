/**
 * Public typography engine facade.
 *
 * Composition, not a god module: the engine wires a font registry, the HarfBuzz
 * shaping backend, the layout pipeline and two caches, and exposes one API for the
 * future scene builder, layout engine and editor.
 *
 * Loading model: HarfBuzz ships as WebAssembly. It is imported lazily through a
 * dynamic `import()` inside `createTypographyEngine`, so importing this package
 * (or validating a document) never pays for a 440 kB WASM module and never fails
 * on a host that has no `WebAssembly`. The module is instantiated once per
 * process and shared by every engine instance.
 *
 * Failure model: nothing throws for input problems. Bad fonts, missing families,
 * invalid typography and unbreakable text all return results carrying structured
 * diagnostics, matching the validator's conventions.
 */

import { CODES, DiagnosticBag, type Diagnostic } from '../core/diagnostics.ts';
import type { Unit } from '../schema/units.ts';

import { fitText } from './fit.ts';
import { FontRegistry } from './font-registry.ts';
import { duplicateFontDiagnostic } from './font-registry.ts';
import { loadFont } from './font-record.ts';
import type { HarfBuzzApi } from './font-record.ts';
import { invalidLayout, layoutRequestFromWrap, layoutText, measureResultFrom, shapeText, wrapResultFrom } from './layout.ts';
import type { LayoutContext } from './layout.ts';
import { detectOverflow } from './overflow.ts';
import { SCRIPT_CAPABILITIES } from './script-runs.ts';
import type { ShapingContext } from './shaper.ts';
import { ShapeCache as ShapeCacheImpl } from './shaper.ts';
import type {
  FitTextRequest,
  FontMetadata,
  FontRegistrationResult,
  FontRequest,
  FontResolveResult,
  LayoutSceneTextRequest,
  LayoutTextRequest,
  MeasureTextResult,
  RegisterFontInput,
  ScriptSupportReport,
  ShapedText,
  SupportedScript,
  TextFitResult,
  TextLayoutResult,
  TextOverflowRequest,
  TextOverflowResult,
  TextRequest,
  TypographyCacheStats,
  TypographyEngineOptions,
  WrapTextRequest,
  WrapTextResult,
} from './types.ts';

/** The typography engine surface. */
export interface TypographyEngine {
  /** Registers a font. Never throws; duplicates and unreadable files are reported. */
  registerFont(input: RegisterFontInput): FontRegistrationResult;
  /** Metadata for a font id or a family name (all variants). */
  getFontMetadata(idOrFamily: string): readonly FontMetadata[];
  /** Metadata for a registered font id. */
  getFont(id: string): FontMetadata | undefined;
  listFonts(): readonly FontMetadata[];
  /** Resolves a family/weight/style request, reporting fallbacks and coverage. */
  resolveFont(request: FontRequest): FontResolveResult;
  /** Capability matrix for the documented scripts, based on registered coverage. */
  scriptSupport(): readonly ScriptSupportReport[];
  /** Shaping only: scripts, direction, glyphs and advances. */
  shapeText(request: TextRequest): ShapedText;
  /** Intrinsic measurement without a width constraint. */
  measureText(request: TextRequest): MeasureTextResult;
  /** Wrapping inside a maximum width. */
  wrapText(request: WrapTextRequest): WrapTextResult;
  /** Largest font size that satisfies the constraints. */
  fitText(request: FitTextRequest): TextFitResult;
  /** Overflow verdict for an existing layout, optionally with new constraints. */
  detectTextOverflow(request: TextOverflowRequest): TextOverflowResult;
  /** Shaping + measurement + wrapping + diagnostics for one text block. */
  layoutText(request: LayoutTextRequest): TextLayoutResult;
  /** Layout of the canonical `SceneNode` text shape. */
  layoutSceneText(request: LayoutSceneTextRequest): TextLayoutResult;
  cacheStats(): TypographyCacheStats;
  clearCaches(): void;
}

let modulePromise: Promise<HarfBuzzApi> | undefined;

/** Instantiates HarfBuzz once per process. */
export function loadHarfBuzz(): Promise<HarfBuzzApi> {
  modulePromise ??= import('harfbuzzjs').then((module) => module as unknown as HarfBuzzApi);
  return modulePromise;
}

/**
 * Normalises a non-object request so every entry point can answer with
 * diagnostics instead of throwing (`AGENTS.md` §3).
 */
function ensureRequest<T extends object>(request: T | undefined): T {
  if (request && typeof request === 'object') return request;
  return {
    text: '',
    typography: { fontFamily: '', fontSize: 0, fontWeight: 400, lineHeight: 1, letterSpacing: 0 },
    maxWidth: 0,
    minFontSize: 0,
  } as unknown as T;
}

let unserialisableCounter = 0;

/** JSON-serialises a request value without throwing on cycles or exotic objects. */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    unserialisableCounter += 1;
    return `unserialisable:${unserialisableCounter}`;
  }
}

interface LayoutCacheEntry {
  readonly result: TextLayoutResult;
}

class TypographyEngineImpl implements TypographyEngine {
  readonly #hb: HarfBuzzApi;
  readonly #registry: FontRegistry;
  readonly #shaping: ShapingContext;
  readonly #context: LayoutContext;
  readonly #layoutCache = new Map<string, LayoutCacheEntry>();
  readonly #layoutCacheSize: number;
  #layoutHits = 0;
  #layoutMisses = 0;
  #fontVersion = 0;

  constructor(hb: HarfBuzzApi, options: TypographyEngineOptions) {
    this.#hb = hb;
    this.#registry = new FontRegistry({
      ...(options.fallbackFamilies === undefined ? {} : { fallbackFamilies: options.fallbackFamilies }),
      ...(options.genericFamilies === undefined ? {} : { genericFamilies: options.genericFamilies }),
    });
    this.#shaping = { hb, cache: new ShapeCacheImpl(options.shapingCacheSize ?? 512) };
    this.#layoutCacheSize = Math.max(1, Math.floor(options.layoutCacheSize ?? 128));
    this.#context = {
      hb,
      registry: this.#registry,
      shaping: this.#shaping,
      segmentationLocale: options.segmentationLocale ?? 'und',
    };
  }

  static async create(options: TypographyEngineOptions): Promise<TypographyEngineImpl> {
    const hb = await loadHarfBuzz();
    const engine = new TypographyEngineImpl(hb, options);
    for (const font of options.fonts ?? []) {
      engine.registerFont(font);
    }
    return engine;
  }

  registerFont(input: RegisterFontInput): FontRegistrationResult {
    const loaded = loadFont(input, this.#hb);
    if (!loaded.ok || !loaded.font) {
      return { ok: false, diagnostics: loaded.diagnostics };
    }
    const duplicate = this.#registry.findDuplicate(loaded.font);
    if (duplicate) {
      return {
        ok: false,
        diagnostics: [...loaded.diagnostics, duplicateFontDiagnostic(duplicate, loaded.font.metadata)],
      };
    }
    this.#registry.add(loaded.font);
    this.#fontVersion += 1;
    this.#layoutCache.clear();
    return { ok: true, metadata: loaded.font.metadata, diagnostics: loaded.diagnostics };
  }

  getFontMetadata(idOrFamily: string): readonly FontMetadata[] {
    const byId = this.#registry.getById(idOrFamily);
    if (byId) return Object.freeze([byId.metadata]);
    return Object.freeze(this.#registry.findFamily(idOrFamily).map((font) => font.metadata));
  }

  getFont(id: string): FontMetadata | undefined {
    return this.#registry.getById(id)?.metadata;
  }

  listFonts(): readonly FontMetadata[] {
    return this.#registry.list();
  }

  resolveFont(request: FontRequest): FontResolveResult {
    return this.#registry.resolve(request);
  }

  scriptSupport(): readonly ScriptSupportReport[] {
    const scripts: SupportedScript[] = ['latin', 'bengali', 'arabic', 'urdu'];
    return Object.freeze(
      scripts.map((script) => {
        const fonts = this.#registry.fontsCoveringScript(script);
        return Object.freeze({
          script,
          shaped: true,
          coveredByRegisteredFont: fonts.length > 0,
          families: Object.freeze([...new Set(fonts.map((font) => font.metadata.family))]),
          note: SCRIPT_CAPABILITIES[script].note,
        });
      }),
    );
  }

  shapeText(request: TextRequest): ShapedText {
    return shapeText(ensureRequest(request), this.#context);
  }

  measureText(request: TextRequest): MeasureTextResult {
    return measureResultFrom(this.layoutText(ensureRequest(request)));
  }

  wrapText(request: WrapTextRequest): WrapTextResult {
    return wrapResultFrom(this.layoutText(layoutRequestFromWrap(ensureRequest(request))));
  }

  fitText(request: FitTextRequest): TextFitResult {
    return fitText(ensureRequest(request), this.#context);
  }

  detectTextOverflow(request: TextOverflowRequest): TextOverflowResult {
    const layout = request?.layout;
    if (!layout) {
      const bag = new DiagnosticBag();
      bag.error(CODES.TEXT_MISSING, 'An existing layout result is required to evaluate overflow.', { path: 'layout' });
      return {
        ok: false,
        overflow: Object.freeze({
          horizontal: false,
          vertical: false,
          lineCountExceeded: false,
          unbreakable: false,
          missingGlyphs: 0,
          missingFont: false,
          unsupportedScripts: Object.freeze([]),
          reasons: Object.freeze([]),
        }),
        diagnostics: bag.all,
      };
    }
    const maxWidth = request.maxWidth ?? layout.constraints.maxWidth;
    const maxHeight = request.maxHeight ?? layout.constraints.maxHeight;
    const maxLines = request.maxLines ?? layout.constraints.maxLines;
    const result = detectOverflow({
      lines: layout.lines,
      height: layout.height,
      ...(maxWidth === undefined ? {} : { maxWidth }),
      ...(maxHeight === undefined ? {} : { maxHeight }),
      ...(maxLines === undefined ? {} : { maxLines }),
      missingGlyphs: layout.overflow.missingGlyphs,
      missingFont: layout.overflow.missingFont,
      unsupportedScripts: layout.overflow.unsupportedScripts,
      unbreakable: layout.overflow.unbreakable,
    });
    return { ok: !result.hasOverflow, overflow: result.report, diagnostics: result.diagnostics };
  }

  layoutText(request: LayoutTextRequest): TextLayoutResult {
    const safe = ensureRequest(request);
    const key = this.#layoutKey(safe);
    const cached = this.#layoutCache.get(key);
    if (cached) {
      this.#layoutHits += 1;
      return cached.result;
    }
    this.#layoutMisses += 1;
    const result = layoutText(safe, this.#context);
    this.#layoutCache.set(key, { result });
    while (this.#layoutCache.size > this.#layoutCacheSize) {
      const oldest = this.#layoutCache.keys().next();
      if (oldest.done) break;
      this.#layoutCache.delete(oldest.value);
    }
    return result;
  }

  layoutSceneText(request: LayoutSceneTextRequest): TextLayoutResult {
    const unit: Unit = request.unit ?? 'px';
    const node = request.node;
    const text = node?.text;
    if (!node || typeof node !== 'object' || node.type !== 'text' || !text) {
      const bag = new DiagnosticBag();
      bag.error(CODES.TEXT_MISSING, 'A text scene node with `text.content` and `text.typography` is required.', {
        path: 'node',
        hint: 'Pass a node whose `type` is "text"; other node types carry no text to lay out.',
        context: { nodeType: node?.type ?? 'missing' },
      });
      return invalidLayout(
        {
          text: '',
          typography: { fontFamily: '', fontSize: 0, fontWeight: 400, lineHeight: 1, letterSpacing: 0 },
        },
        unit,
        bag.all,
      );
    }
    // The node's geometry *is* the box the text must fit: a 300×100 text frame
    // constrains layout to 300×100 unless the caller overrides it explicitly.
    const geometry = node.geometry;
    const geometryWidth = geometry?.width;
    const geometryHeight = geometry?.height;
    const constraint =
      request.constraint ??
      // A zero-sized frame is an auto-size text node, not a zero-width container;
      // only positive dimensions constrain layout.
      (geometryWidth !== undefined && Number.isFinite(geometryWidth) && geometryWidth > 0
        ? {
            maxWidth: geometryWidth,
            ...(geometryHeight !== undefined && Number.isFinite(geometryHeight) && geometryHeight > 0
              ? { maxHeight: geometryHeight }
              : {}),
          }
        : undefined);
    return this.layoutText({
      text: text.content,
      typography: text.typography,
      ...(text.language === undefined ? {} : { language: text.language }),
      ...(text.direction === undefined ? {} : { direction: text.direction }),
      ...(constraint === undefined ? {} : { constraint }),
      ...(request.overflowWrap === undefined ? {} : { overflowWrap: request.overflowWrap }),
      unit,
    });
  }

  cacheStats(): TypographyCacheStats {
    const shaping = this.#shaping.cache.stats;
    return {
      shapingEntries: shaping.entries,
      shapingHits: shaping.hits,
      shapingMisses: shaping.misses,
      layoutEntries: this.#layoutCache.size,
      layoutHits: this.#layoutHits,
      layoutMisses: this.#layoutMisses,
    };
  }

  clearCaches(): void {
    this.#shaping.cache.clear();
    this.#layoutCache.clear();
  }

  #layoutKey(request: LayoutTextRequest): string {
    const typography = request.typography;
    return JSON.stringify([
      // The whole token, so a field the engine ignores (e.g. `wordSpacing` nested
      // in the token, which produces a warning) still separates cache entries.
      safeJson(typography),
      this.#fontVersion,
      request.text,
      typography?.fontFamily,
      typography?.fontSize,
      typography?.fontWeight,
      typography?.lineHeight,
      typography?.letterSpacing,
      typography?.textAlign,
      typography?.textTransform,
      request.language,
      request.direction,
      request.wordSpacing,
      request.features,
      request.unit,
      request.overflowWrap ?? 'normal',
      request.constraint?.maxWidth,
      request.constraint?.maxHeight,
      request.constraint?.maxLines,
    ]);
  }

}

/**
 * Creates a typography engine.
 *
 * The HarfBuzz WASM module is loaded once per process; fonts passed in `options`
 * are registered before the promise resolves, and any registration problem is
 * reported through `registerFont` results rather than thrown. To inspect those
 * results, construct the engine without `fonts` and register afterwards.
 */
export async function createTypographyEngine(options: TypographyEngineOptions = {}): Promise<TypographyEngine> {
  return TypographyEngineImpl.create(options);
}

