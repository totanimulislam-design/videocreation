import type { DesignDocument, DesignElement, TextElement } from "../../core/design-document/types.ts";
import { elementBounds } from "../../core/geometry/bounds.ts";
import {
  backgroundForElement,
  type DocumentAnalysis,
} from "../analysis.ts";
import { contrastRatio, parseColor, readableTextColor, type RGBA } from "../../core/color/color.ts";
import { defaultTextMeasurer } from "../text/measure.ts";
import type { QualityContext, RevisionActionType } from "../types.ts";
import type { PlannedRevision, RevisionPlan } from "./revision-planner.ts";

/**
 * Mechanical revision executor.
 *
 * Only corrections that are mathematically safe are applied automatically:
 * moving clipping elements back inside the canvas, growing an undersized text
 * frame, raising unreadable type sizes, fixing leading and selecting an
 * accessible text colour. Anything that requires creative judgement (content
 * changes, imagery replacement, missing fonts) is reported as unresolved so the
 * caller or the user can act on it.
 */

export interface AppliedRevision {
  action: RevisionActionType | "none";
  elementIds: string[];
  detail: string;
}

export interface UnresolvedRevision {
  action: RevisionActionType | "none";
  elementIds: string[];
  reason: string;
}

export interface MechanicalRevisionResult {
  document: DesignDocument;
  applied: AppliedRevision[];
  unresolved: UnresolvedRevision[];
}

export interface MechanicalExecutorOptions {
  analysis: DocumentAnalysis;
  context: QualityContext;
  textMeasurer?: QualityContext["textMeasurer"];
}

function cloneDocument(document: DesignDocument): DesignDocument {
  return structuredClone(document);
}

function findElement(elements: DesignElement[], id: string): DesignElement | undefined {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.children) {
      const found = findElement(element.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function clampInside(
  element: DesignElement,
  canvas: { width: number; height: number },
  margin: number,
): boolean {
  const bounds = elementBounds(element);
  let dx = 0;
  let dy = 0;
  if (bounds.x < margin) dx = margin - bounds.x;
  else if (bounds.x + bounds.width > canvas.width - margin) {
    dx = canvas.width - margin - (bounds.x + bounds.width);
  }
  if (bounds.y < margin) dy = margin - bounds.y;
  else if (bounds.y + bounds.height > canvas.height - margin) {
    dy = canvas.height - margin - (bounds.y + bounds.height);
  }
  if (dx === 0 && dy === 0) return false;
  element.transform.x = Math.round((element.transform.x + dx) * 1000) / 1000;
  element.transform.y = Math.round((element.transform.y + dy) * 1000) / 1000;
  // Never leave the element larger than the available area.
  const maxWidth = canvas.width - margin * 2;
  const maxHeight = canvas.height - margin * 2;
  if (bounds.width > maxWidth) element.transform.width = maxWidth;
  if (bounds.height > maxHeight) element.transform.height = maxHeight;
  return true;
}

function isText(element: DesignElement): element is TextElement {
  return element.type === "text";
}

function chooseAccessibleColor(
  foreground: RGBA,
  background: RGBA,
  required: number,
): RGBA {
  if (contrastRatio(foreground, background) >= required) return foreground;
  const candidate = readableTextColor(background);
  if (contrastRatio(candidate, background) >= required) return candidate;
  // Fall back to pushing the existing hue to an extreme.
  const extreme = { ...foreground, r: foreground.r > 127 ? 255 : 0, g: foreground.g > 127 ? 255 : 0, b: foreground.b > 127 ? 255 : 0, a: 1 };
  return contrastRatio(extreme, background) >= contrastRatio(candidate, background) ? extreme : candidate;
}

function applyHint(
  document: DesignDocument,
  hint: PlannedRevision["hints"][number],
  options: MechanicalExecutorOptions,
): { applied: AppliedRevision[]; unresolved: UnresolvedRevision[] } {
  const applied: AppliedRevision[] = [];
  const unresolved: UnresolvedRevision[] = [];
  const measurer = options.textMeasurer ?? defaultTextMeasurer;

  for (const elementId of hint.elementIds) {
    const element = findElement(document.elements, elementId);
    if (!element) {
      unresolved.push({ action: hint.action, elementIds: [elementId], reason: "Element no longer exists in the document." });
      continue;
    }

    switch (hint.action) {
      case "nudge_into_bounds":
      case "move_inside_safe_area": {
        const margin = hint.action === "move_inside_safe_area"
          ? Number(hint.parameters?.safeMargin ?? document.canvas.safeMargin ?? 0)
          : 0;
        const changed = clampInside(element, document.canvas, margin);
        if (changed) {
          applied.push({
            action: hint.action,
            elementIds: [elementId],
            detail: `Moved "${element.name}" inside ${margin > 0 ? `the ${margin}-unit safe area` : "the canvas"}.`,
          });
        } else {
          unresolved.push({ action: hint.action, elementIds: [elementId], reason: "Element is already inside the target area." });
        }
        break;
      }
      case "grow_text_frame": {
        if (!isText(element)) {
          unresolved.push({ action: hint.action, elementIds: [elementId], reason: "Frame expansion is only supported for text elements." });
          break;
        }
        const measurement = measurer.measure(element.text, element.typography, {
          maxWidth: element.transform.width,
          wrap: element.typography.wrap !== false,
        });
        const targetHeight = Math.ceil(measurement.height + 1);
        const targetWidth = Math.ceil(Math.max(element.transform.width, measurement.width + 1));
        if (targetHeight <= element.transform.height && targetWidth <= element.transform.width) {
          unresolved.push({ action: hint.action, elementIds: [elementId], reason: "Text already fits its frame." });
          break;
        }
        element.transform.height = Math.max(element.transform.height, targetHeight);
        element.transform.width = targetWidth;
        applied.push({
          action: hint.action,
          elementIds: [elementId],
          detail: `Expanded the text frame to ${targetWidth}×${targetHeight}.`,
        });
        break;
      }
      case "increase_font_size": {
        if (!isText(element)) {
          unresolved.push({ action: hint.action, elementIds: [elementId], reason: "Font size only applies to text." });
          break;
        }
        const requested = Number(hint.parameters?.fontSize ?? 0);
        const target = Math.max(element.typography.fontSize, requested);
        if (!Number.isFinite(target) || target <= element.typography.fontSize) {
          unresolved.push({ action: hint.action, elementIds: [elementId], reason: "No larger size was requested." });
          break;
        }
        element.typography.fontSize = Math.round(target * 10) / 10;
        applied.push({
          action: hint.action,
          elementIds: [elementId],
          detail: `Raised type size to ${element.typography.fontSize}.`,
        });
        break;
      }
      case "increase_line_height": {
        if (!isText(element)) {
          unresolved.push({ action: hint.action, elementIds: [elementId], reason: "Leading only applies to text." });
          break;
        }
        const requested = Number(hint.parameters?.lineHeight ?? 0);
        const target = Math.max(element.typography.lineHeight, requested);
        element.typography.lineHeight = Math.round(target * 100) / 100;
        applied.push({
          action: hint.action,
          elementIds: [elementId],
          detail: `Set line height to ${element.typography.lineHeight}.`,
        });
        break;
      }
      case "replace_text_color": {
        if (!isText(element)) {
          unresolved.push({ action: hint.action, elementIds: [elementId], reason: "Text colour only applies to text." });
          break;
        }
        const resolution = backgroundForElement(options.analysis, element, options.context.assets);
        const background = resolution.color;
        if (!background) {
          unresolved.push({
            action: hint.action,
            elementIds: [elementId],
            reason: "Background is imagery or a gradient; contrast must be corrected by hand.",
          });
          break;
        }
        const required = Number(hint.parameters?.requiredRatio ?? 4.5);
        const current = parseColor(element.style.fill ?? "#000000") ?? { r: 0, g: 0, b: 0, a: 1 };
        const next = chooseAccessibleColor(current, background, required);
        const hex = `#${[next.r, next.g, next.b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
        if (`${element.style.fill ?? ""}`.toLowerCase() === hex) {
          unresolved.push({ action: hint.action, elementIds: [elementId], reason: "No accessible colour was found at this size." });
          break;
        }
        element.style.fill = hex;
        applied.push({
          action: hint.action,
          elementIds: [elementId],
          detail: `Changed text colour to ${hex} for ≥${required}:1 contrast.`,
        });
        break;
      }
      case "reduce_effects": {
        if (!element.effects || element.effects.length <= 1) {
          unresolved.push({ action: hint.action, elementIds: [elementId], reason: "Element does not stack excessive effects." });
          break;
        }
        const removed = element.effects.length - 1;
        element.effects = element.effects.slice(0, 1);
        applied.push({
          action: hint.action,
          elementIds: [elementId],
          detail: `Removed ${removed} excess effect(s).`,
        });
        break;
      }
      default:
        unresolved.push({
          action: hint.action,
          elementIds: [elementId],
          reason: "This correction requires content, assets or art-direction decisions and is not applied automatically.",
        });
    }
  }

  return { applied, unresolved };
}

export function applyMechanicalRevisions(
  document: DesignDocument,
  plan: RevisionPlan,
  options: MechanicalExecutorOptions,
): MechanicalRevisionResult {
  const next = cloneDocument(document);
  const applied: AppliedRevision[] = [];
  const unresolved: UnresolvedRevision[] = [];

  for (const action of plan.autoFixable) {
    for (const hint of action.hints) {
      const result = applyHint(next, hint, options);
      applied.push(...result.applied);
      unresolved.push(...result.unresolved);
    }
  }

  for (const action of plan.manualActions) {
    unresolved.push({
      action: action.hints[0]?.action ?? "manual",
      elementIds: action.affectedElementIds,
      reason: `${action.issueCodes.join(", ")}: ${action.recommendedCorrection}`,
    });
  }

  return { document: next, applied, unresolved };
}
