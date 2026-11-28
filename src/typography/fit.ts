/**
 * Text fitting inside a bounded box.
 *
 * Fitting is a search for the **largest** font size that satisfies every
 * constraint, not an arbitrary shrink. The search is bounded below by
 * `minFontSize`: when nothing fits at the minimum the engine reports
 * `cannot-fit` with evidence instead of quietly producing unreadable text
 * (spec §9.4, `DESIGN_QUALITY_METRICS.md` §4 "unusable text sizes").
 *
 * The measured quantity is `layoutText` at each candidate size, so wrapping,
 * overflow and baselines are recomputed exactly — there is no linear scaling
 * shortcut. Sizes are found by bisection to a tolerance far below a design unit,
 * and the returned layout is always the layout of the returned size.
 */

import { CODES, DiagnosticBag, type Diagnostic } from '../core/diagnostics.ts';
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from '../schema/limits.ts';
import type { Unit } from '../schema/units.ts';

import { layoutText } from './layout.ts';
import type { LayoutContext } from './layout.ts';
import type {
  FitStatus,
  FitTextRequest,
  OverflowReport,
  TextFitResult,
  TextLayoutResult,
} from './types.ts';

/** A layout "fits" when nothing overflows and no error was recorded. */
export function layoutFits(layout: TextLayoutResult): boolean {
  if (layout.status === 'invalid') return false;
  if (layout.overflow.horizontal || layout.overflow.vertical || layout.overflow.lineCountExceeded || layout.overflow.missingFont) {
    return false;
  }
  return !layout.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

const MAX_ATTEMPTS = 40;

/** Fits text into `maxWidth` / `maxHeight` / `maxLines`. Never throws. */
export function fitText(request: FitTextRequest, context: LayoutContext): TextFitResult {
  const unit: Unit = request.unit ?? 'px';
  const bag = new DiagnosticBag();
  const requestedFontSize = request.typography.fontSize;
  const minFontSize = request.minFontSize;
  const maxFontSize = request.maxFontSize ?? requestedFontSize;
  const policy = request.overflowPolicy ?? 'shrink';
  // Declared before `invalid`, which reports attempts for already-failed calls.
  let attempts = 0;

  const invalid = (message: string, hint?: string): TextFitResult => {
    bag.error(CODES.TEXT_FIT_FAILED, message, { path: 'fit', ...(hint === undefined ? {} : { hint }) });
    return result({
      ok: false,
      status: 'invalid',
      selectedFontSize: requestedFontSize,
      layout: undefined,
      diagnostics: bag.all,
    });
  };

  if (!Number.isFinite(minFontSize) || minFontSize < FONT_SIZE_MIN || minFontSize > FONT_SIZE_MAX) {
    return invalid(`minFontSize ${String(minFontSize)} is outside ${FONT_SIZE_MIN}…${FONT_SIZE_MAX}.`, 'Font sizes use the canvas unit.');
  }
  if (!Number.isFinite(maxFontSize) || maxFontSize < FONT_SIZE_MIN || maxFontSize > FONT_SIZE_MAX) {
    return invalid(`maxFontSize ${String(maxFontSize)} is outside ${FONT_SIZE_MIN}…${FONT_SIZE_MAX}.`);
  }
  if (maxFontSize < minFontSize) {
    return invalid(`maxFontSize ${maxFontSize} is below minFontSize ${minFontSize}.`, 'The search interval would be empty.');
  }
  if (!Number.isFinite(request.maxWidth) || request.maxWidth <= 0) {
    return invalid(`maxWidth ${String(request.maxWidth)} must be a positive finite length.`);
  }
  if (policy !== 'shrink' && policy !== 'clip' && policy !== 'fail') {
    return invalid(`overflowPolicy "${String(policy)}" is not supported.`, 'Use "shrink", "clip" or "fail".');
  }

  const evaluate = (fontSize: number): TextLayoutResult => {
    attempts += 1;
    return layoutText(
      {
        text: request.text,
        typography: { ...request.typography, fontSize },
        ...(request.language === undefined ? {} : { language: request.language }),
        ...(request.direction === undefined ? {} : { direction: request.direction }),
        ...(request.wordSpacing === undefined ? {} : { wordSpacing: request.wordSpacing }),
        ...(request.features === undefined ? {} : { features: request.features }),
        ...(request.unit === undefined ? {} : { unit: request.unit }),
        ...(request.overflowWrap === undefined ? {} : { overflowWrap: request.overflowWrap }),
        constraint: {
          maxWidth: request.maxWidth,
          ...(request.maxHeight === undefined ? {} : { maxHeight: request.maxHeight }),
          ...(request.maxLines === undefined ? {} : { maxLines: request.maxLines }),
        },
      },
      context,
    );
  };

  const atMax = evaluate(maxFontSize);
  if (atMax.status === 'invalid') {
    return result({
      ok: false,
      status: 'invalid',
      selectedFontSize: maxFontSize,
      layout: atMax,
      diagnostics: [...atMax.diagnostics],
      attempts,
    });
  }

  if (policy === 'clip' || policy === 'fail') {
    const fits = layoutFits(atMax);
    const diagnostics = [...atMax.diagnostics];
    if (!fits && policy === 'fail') {
      const failure = new DiagnosticBag();
      failure.error(CODES.TEXT_FIT_FAILED, `Text does not fit at the requested size ${maxFontSize} ${unit} and shrinking is disabled.`, {
        path: 'fit',
        hint: 'Use `overflowPolicy: "shrink"`, widen the container, or shorten the copy.',
        context: { reasons: atMax.overflow.reasons },
      });
      diagnostics.push(...failure.all);
    }
    return result({
      ok: fits,
      status: fits ? (maxFontSize < requestedFontSize ? 'shrunk' : 'fits') : 'cannot-fit',
      selectedFontSize: maxFontSize,
      layout: atMax,
      diagnostics,
      attempts,
    });
  }

  if (layoutFits(atMax)) {
    return result({
      ok: true,
      status: maxFontSize < requestedFontSize ? 'shrunk' : 'fits',
      selectedFontSize: maxFontSize,
      layout: atMax,
      diagnostics: [...atMax.diagnostics],
      attempts,
    });
  }

  // Bisection between the minimum (inclusive) and the maximum (exclusive).
  let lo = minFontSize;
  let hi = maxFontSize;
  let best: TextLayoutResult | undefined;
  let bestSize = Number.NaN;

  const tolerance = Math.max(1e-3, (maxFontSize - minFontSize) * 1e-4);
  for (let iteration = 0; iteration < MAX_ATTEMPTS && hi - lo > tolerance; iteration += 1) {
    const mid = (lo + hi) / 2;
    const candidate = evaluate(mid);
    if (candidate.status === 'invalid') break;
    if (layoutFits(candidate)) {
      best = candidate;
      bestSize = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  if (!best) {
    const atMin = evaluate(minFontSize);
    const failing = layoutFits(atMin) ? best : atMin;
    const diagnostics: Diagnostic[] = [...(failing ?? atMin).diagnostics];
    const failure = new DiagnosticBag();
    failure.error(
      CODES.TEXT_FIT_FAILED,
      `Text does not fit even at the minimum font size ${minFontSize} ${unit}.`,
      {
        path: 'fit',
        hint: 'Increase the container, allow more lines, reduce the copy length, or lower `minFontSize` deliberately.',
        context: {
          availableWidth: request.maxWidth,
          ...(request.maxHeight === undefined ? {} : { availableHeight: request.maxHeight }),
          ...(request.maxLines === undefined ? {} : { maxLines: request.maxLines }),
          reasons: (failing ?? atMin).overflow.reasons,
        },
      },
    );
    diagnostics.push(...failure.all);
    return result({
      ok: false,
      status: 'cannot-fit',
      selectedFontSize: minFontSize,
      layout: failing ?? atMin,
      diagnostics,
      attempts,
    });
  }

  const diagnostics: Diagnostic[] = [...best.diagnostics];
  if (bestSize < requestedFontSize) {
    const reduced = new DiagnosticBag();
    reduced.warning(
      CODES.TEXT_FIT_REDUCED,
      `Text was fitted at ${round(bestSize)} ${unit} instead of the requested ${requestedFontSize} ${unit}.`,
      {
        path: 'fit',
        hint: 'This is a measurement-backed reduction within the configured minimum, not an arbitrary shrink.',
        context: { requestedFontSize, selectedFontSize: bestSize, minFontSize },
      },
    );
    diagnostics.push(...reduced.all);
  }

  return result({
    ok: true,
    status: bestSize < requestedFontSize ? 'shrunk' : 'fits',
    selectedFontSize: bestSize,
    layout: best,
    diagnostics,
    attempts,
  });

  function result(input: {
    ok: boolean;
    status: FitStatus;
    selectedFontSize: number;
    layout: TextLayoutResult | undefined;
    diagnostics: readonly Diagnostic[];
    attempts?: number;
  }): TextFitResult {
    const overflow: OverflowReport =
      input.layout?.overflow ??
      Object.freeze({
        horizontal: false,
        vertical: false,
        lineCountExceeded: false,
        unbreakable: false,
        missingGlyphs: 0,
        missingFont: false,
        unsupportedScripts: Object.freeze([]),
        reasons: Object.freeze([]),
      });
    return Object.freeze({
      ok: input.ok,
      status: input.status,
      unit,
      requestedFontSize,
      selectedFontSize: input.selectedFontSize,
      minFontSize,
      maxFontSize,
      lineCount: input.layout?.lineCount ?? 0,
      width: input.layout?.width ?? 0,
      height: input.layout?.height ?? 0,
      availableWidth: request.maxWidth,
      ...(request.maxHeight === undefined ? {} : { availableHeight: request.maxHeight }),
      ...(request.maxLines === undefined ? {} : { maxLines: request.maxLines }),
      overflow,
      ...(input.layout === undefined ? {} : { layout: input.layout }),
      attempts: input.attempts ?? attempts,
      diagnostics: Object.freeze([...input.diagnostics]),
    });
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
