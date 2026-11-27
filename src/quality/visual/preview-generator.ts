import type {
  DesignDocument,
  DesignElement,
  TextElement,
} from "../../core/design-document/types.ts";
import { elementBounds } from "../../core/geometry/bounds.ts";
import { paintOrder } from "../../core/design-document/traverse.ts";
import { defaultTextMeasurer } from "../text/measure.ts";
import type { RenderEvidence, TextMeasurer } from "../types.ts";

/**
 * Deterministic SVG preview generation.
 *
 * The Quality Engine must inspect rendered output, not source JSON
 * (DESIGN_QUALITY_METRICS.md §6). Until the browser renderer lands, this module
 * produces a faithful SVG preview from the same document the exporter will use.
 *
 * Scope: geometry, paint, opacity, blend mode, z-order, text wrapping and
 * clipping, simple effects and image placeholders. It deliberately does not
 * perform font shaping — glyph metrics are approximated and the preview is
 * marked as such, so the engine never claims typographic precision it does not
 * have.
 */

export interface PreviewOptions {
  textMeasurer?: TextMeasurer;
  /** True when the caller embeds real font files; shapes text exactly. */
  exactFonts?: boolean;
}

export interface GeneratedPreview extends RenderEvidence {
  format: "svg";
  preview: string;
  width: number;
  height: number;
  elementIds: string[];
  approximateTextMetrics: boolean;
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
}

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

function styleAttributes(element: DesignElement): string {
  const style = element.style ?? {};
  const attributes: string[] = [];
  if (style.fill && style.fill !== "none") attributes.push(`fill="${escapeXml(style.fill)}"`);
  else attributes.push('fill="none"');
  if (style.stroke) {
    attributes.push(`stroke="${escapeXml(style.stroke)}"`);
    attributes.push(`stroke-width="${number(style.strokeWidth ?? 1)}"`);
  }
  if (style.opacity !== undefined && style.opacity < 1) {
    attributes.push(`opacity="${number(style.opacity)}"`);
  }
  if (style.blendMode && style.blendMode !== "normal") {
    attributes.push(`style="mix-blend-mode:${escapeXml(style.blendMode)}"`);
  }
  return attributes.join(" ");
}

function transformAttributes(element: DesignElement): string {
  const { x, y, rotation, scaleX, scaleY, width, height } = element.transform;
  // Translation is always applied: element coordinates are document-space.
  const parts = [`translate(${number(x)} ${number(y)})`];
  if (rotation) parts.push(`rotate(${number(rotation)} ${number(width / 2)} ${number(height / 2)})`);
  if (scaleX !== 1 || scaleY !== 1) parts.push(`scale(${number(scaleX)} ${number(scaleY)})`);
  return ` transform="${parts.join(" ")}"`;
}

function filterFor(element: DesignElement): string | null {
  if (!element.effects || element.effects.length === 0) return null;
  return `filter="url(#fx-${escapeXml(element.id)})"`;
}

function effectDefinitions(element: DesignElement): string {
  if (!element.effects || element.effects.length === 0) return "";
  const filters: string[] = [];
  for (const effect of element.effects) {
    if (effect.type === "shadow") {
      const dx = Number(effect.dx ?? 0);
      const dy = Number(effect.dy ?? 4);
      const blur = Number(effect.blur ?? 8);
      const color = String(effect.color ?? "rgba(0,0,0,0.25)");
      filters.push(
        `<feDropShadow dx="${number(dx)}" dy="${number(dy)}" stdDeviation="${number(blur / 2)}" flood-color="${escapeXml(color)}"/>`,
      );
    } else if (effect.type === "blur") {
      const radius = Number(effect.radius ?? 4);
      filters.push(`<feGaussianBlur stdDeviation="${number(radius / 2)}"/>`);
    } else if (effect.type === "glow") {
      const radius = Number(effect.radius ?? 6);
      const color = String(effect.color ?? "rgba(255,255,255,0.6)");
      filters.push(
        `<feGaussianBlur stdDeviation="${number(radius / 2)}" result="glow-blur"/><feFlood flood-color="${escapeXml(color)}" result="glow-color"/><feComposite in="glow-color" in2="glow-blur" operator="in" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>`,
      );
    }
  }
  if (filters.length === 0) return "";
  return `<filter id="fx-${escapeXml(element.id)}" x="-30%" y="-30%" width="160%" height="160%">${filters.join("")}</filter>`;
}

function renderText(
  element: TextElement,
  measurer: TextMeasurer,
): string {
  const typography = element.typography;
  const bounds = elementBounds(element);
  const wrap = typography.wrap !== false;
  const measurement = measurer.measure(element.text, typography, {
    maxWidth: wrap ? bounds.width : undefined,
    wrap,
  });
  const anchor =
    typography.textAlign === "center" ? "middle" : typography.textAlign === "right" ? "end" : "start";
  const anchorX = anchor === "middle" ? bounds.width / 2 : anchor === "end" ? bounds.width : 0;
  const lineHeight = typography.fontSize * typography.lineHeight;
  const lines = measurement.lines.map((line, index) => {
    const y = typography.fontSize * 0.82 + index * lineHeight;
    return `<tspan x="${number(anchorX)}" y="${number(y)}">${escapeXml(line) || "&#160;"}</tspan>`;
  });
  const text = `<text clip-path="url(#clip-${escapeXml(element.id)})" font-family="${escapeXml(typography.fontFamily)}" font-size="${number(typography.fontSize)}" font-weight="${number(typography.fontWeight)}" fill="${escapeXml(element.style.fill ?? "#000000")}" letter-spacing="${number(typography.letterSpacing ?? 0)}" text-anchor="${anchor}"${typography.fontStyle === "italic" ? ' font-style="italic"' : ""}${typography.direction === "rtl" ? ' direction="rtl"' : ""}>${lines.join("")}</text>`;
  return `${text}<clipPath id="clip-${escapeXml(element.id)}"><rect x="0" y="0" width="${number(bounds.width)}" height="${number(bounds.height)}"/></clipPath>`;
}

function renderElement(
  element: DesignElement,
  document: DesignDocument,
  measurer: TextMeasurer,
): string {
  if (element.visible === false) return "";
  const attributes = [styleAttributes(element), transformAttributes(element)]
    .filter(Boolean)
    .join(" ");
  const filter = filterFor(element);
  const filterAttribute = filter ? ` ${filter}` : "";
  const { width, height } = elementBounds(element);

  switch (element.type) {
    case "text": {
      const text = renderText(element, measurer);
      return `<g${transformAttributes(element)}${filterAttribute}>${text}</g>`;
    }
    case "image": {
      const asset = document.assets?.find((candidate) => candidate.id === element.assetId);
      const src = asset?.src;
      if (src) {
        return `<image href="${escapeXml(src)}" x="0" y="0" width="${number(width)}" height="${number(height)}" preserveAspectRatio="${element.fit === "fill" ? "none" : element.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}"${transformAttributes(element)}${filterAttribute}/>`;
      }
      return `<g${transformAttributes(element)}${filterAttribute}><rect x="0" y="0" width="${number(width)}" height="${number(height)}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1" stroke-dasharray="6 4"/><text x="${number(width / 2)}" y="${number(height / 2)}" text-anchor="middle" font-family="Inter" font-size="${number(Math.max(10, Math.min(18, width / 12)))}" fill="#64748b">${escapeXml(element.assetId || "image")}</text></g>`;
    }
    case "circle":
    case "ellipse":
      return `<ellipse cx="${number(width / 2)}" cy="${number(height / 2)}" rx="${number(width / 2)}" ry="${number(height / 2)}"${filterAttribute} ${attributes}/>`;
    case "line":
      return `<line x1="${number(element.x1)}" y1="${number(element.y1)}" x2="${number(element.x2)}" y2="${number(element.y2)}"${filterAttribute} ${attributes}/>`;
    case "path":
      return `<path d="${escapeXml(element.pathData)}"${filterAttribute} ${attributes}/>`;
    case "group":
    case "clipPath":
    case "mask": {
      const children = (element.children ?? [])
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((child) => renderElement(child, document, measurer))
        .join("");
      const defs = element.type === "clipPath" ? `<clipPath id="clip-${escapeXml(element.id)}">${children}</clipPath>` : children;
      return element.type === "clipPath" ? defs : `<g${filterAttribute} ${attributes}>${children}</g>`;
    }
    case "polygon": {
      const points = element.points?.map((point) => `${number(point.x)},${number(point.y)}`).join(" ") ??
        `0,0 ${number(width)},0 ${number(width / 2)},${number(height)}`;
      return `<polygon points="${points}"${filterAttribute} ${attributes}/>`;
    }
    default:
      return `<rect x="0" y="0" width="${number(width)}" height="${number(height)}"${filterAttribute} ${attributes}/>`;
  }
}

export function generatePreview(
  document: DesignDocument,
  options: PreviewOptions = {},
): GeneratedPreview {
  const measurer = options.textMeasurer ?? defaultTextMeasurer;
  const order = paintOrder(document);
  const defs: string[] = [];
  const body: string[] = [];

  for (const element of order) {
    const definition = effectDefinitions(element);
    if (definition) defs.push(definition);
    const markup = renderElement(element, document, measurer);
    if (markup) body.push(markup);
  }

  const width = document.canvas.width;
  const height = document.canvas.height;
  const background = document.canvas.background ?? "#ffffff";

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}" height="${number(height)}" viewBox="0 0 ${number(width)} ${number(height)}" role="img" aria-label="${escapeXml(document.name ?? document.id)}">`,
    `<title>${escapeXml(document.name ?? document.id)}</title>`,
    `<rect x="0" y="0" width="${number(width)}" height="${number(height)}" fill="${escapeXml(background)}"/>`,
    defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "",
    `<g>${body.join("")}</g>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    preview: svg,
    format: "svg",
    width,
    height,
    fromSameDocument: true,
    generatedAt: new Date().toISOString(),
    elementIds: order.filter((element) => element.visible !== false).map((element) => element.id),
    approximateTextMetrics: options.exactFonts !== true,
  };
}
