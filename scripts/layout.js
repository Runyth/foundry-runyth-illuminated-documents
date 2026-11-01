// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { normalizeResourceAccess } from "./access-model.js";

export const DEFAULT_REGION = Object.freeze({
  id: "main",
  label: "Main text",
  x: 12,
  y: 11,
  width: 76,
  height: 78,
  padding: 2,
  fontFamily: "serif",
  fontFile: "",
  fontSize: 34,
  minFontSize: 18,
  lineHeight: 1.35,
  color: "#2b1b12",
  align: "left",
  verticalAlign: "top",
  fontWeight: "400",
  fontStyle: "normal"
});

export function normalizeRegion(region = {}, index = 0) {
  const numeric = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };

  const id = String(region.id || `region-${index + 1}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `region-${index + 1}`;

  return {
    ...DEFAULT_REGION,
    ...region,
    id,
    label: String(region.label || `Region ${index + 1}`).trim(),
    x: numeric(region.x, DEFAULT_REGION.x, 0, 100),
    y: numeric(region.y, DEFAULT_REGION.y, 0, 100),
    width: numeric(region.width, DEFAULT_REGION.width, 1, 100),
    height: numeric(region.height, DEFAULT_REGION.height, 1, 100),
    padding: numeric(region.padding, DEFAULT_REGION.padding, 0, 20),
    fontSize: numeric(region.fontSize, DEFAULT_REGION.fontSize, 6, 300),
    minFontSize: numeric(region.minFontSize, DEFAULT_REGION.minFontSize, 6, 300),
    lineHeight: numeric(region.lineHeight, DEFAULT_REGION.lineHeight, 0.8, 3),
    color: /^#[0-9a-f]{6}$/i.test(region.color || "") ? region.color : DEFAULT_REGION.color,
    align: ["left", "center", "right", "justify"].includes(region.align) ? region.align : "left",
    verticalAlign: ["top", "middle", "bottom"].includes(region.verticalAlign) ? region.verticalAlign : "top",
    fontWeight: ["300", "400", "500", "600", "700", "bold"].includes(String(region.fontWeight))
      ? String(region.fontWeight)
      : DEFAULT_REGION.fontWeight,
    fontStyle: ["normal", "italic"].includes(region.fontStyle) ? region.fontStyle : "normal",
    fontFamily: String(region.fontFamily || DEFAULT_REGION.fontFamily).trim(),
    fontFile: String(region.fontFile || "").trim()
  };
}

export function normalizeTemplate(template = {}) {
  const id = String(template.id || foundry?.utils?.randomID?.() || crypto.randomUUID())
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");

  const regions = Array.isArray(template.regions) && template.regions.length
    ? template.regions.map(normalizeRegion)
    : [normalizeRegion(DEFAULT_REGION)];

  const access = normalizeResourceAccess(template);

  return {
    id,
    ...access,
    name: String(template.name || "Untitled template").trim(),
    background: String(template.background || "modules/runyth-illuminated-documents/assets/backgrounds/parchment.svg").trim(),
    width: Math.max(320, Number(template.width) || 1200),
    height: Math.max(320, Number(template.height) || 1600),
    outputDirectory: String(template.outputDirectory || "runyth-illuminated-documents").trim().replace(/^\/+|\/+$/g, ""),
    imageFormat: template.imageFormat === "jpeg" ? "jpeg" : "png",
    jpegQuality: Math.min(1, Math.max(0.4, Number(template.jpegQuality) || 0.92)),
    regions
  };
}

export function splitParagraphs(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

function tokenizeParagraph(paragraph) {
  return paragraph.match(/\S+\s*/g) || [];
}

export function wrapText(ctx, text, maxWidth) {
  const paragraphs = splitParagraphs(text);
  const lines = [];

  for (const paragraph of paragraphs) {
    const tokens = tokenizeParagraph(paragraph);
    let line = "";

    for (const token of tokens) {
      const candidate = `${line}${token}`;
      if (!line || ctx.measureText(candidate.trimEnd()).width <= maxWidth) {
        line = candidate;
        continue;
      }

      lines.push({ text: line.trimEnd(), paragraphEnd: false });
      line = token;
    }

    if (line.trim()) lines.push({ text: line.trimEnd(), paragraphEnd: true });
  }

  return lines;
}

export function regionPixels(region, canvasWidth, canvasHeight) {
  const x = canvasWidth * region.x / 100;
  const y = canvasHeight * region.y / 100;
  const width = canvasWidth * region.width / 100;
  const height = canvasHeight * region.height / 100;
  const paddingX = canvasWidth * region.padding / 100;
  const paddingY = canvasHeight * region.padding / 100;

  return {
    x: x + paddingX,
    y: y + paddingY,
    width: Math.max(1, width - paddingX * 2),
    height: Math.max(1, height - paddingY * 2)
  };
}

export function fitLines(ctx, text, region, box) {
  const configuredSize = Math.max(region.minFontSize, region.fontSize);

  for (let size = configuredSize; size >= region.minFontSize; size -= 1) {
    ctx.font = `${region.fontStyle} ${region.fontWeight} ${size}px "${region.fontFamily}"`;
    const lineHeight = size * region.lineHeight;
    const lines = wrapText(ctx, text, box.width);
    const maxLines = Math.max(1, Math.floor(box.height / lineHeight));

    if (lines.length <= maxLines) {
      return { size, lineHeight, lines, consumed: lines.length, overflow: "" };
    }
  }

  const size = region.minFontSize;
  ctx.font = `${region.fontStyle} ${region.fontWeight} ${size}px "${region.fontFamily}"`;
  const lineHeight = size * region.lineHeight;
  const lines = wrapText(ctx, text, box.width);
  const maxLines = Math.max(1, Math.floor(box.height / lineHeight));
  const visible = lines.slice(0, maxLines);
  const overflow = lines.slice(maxLines).map((line) => line.text).join(" ");

  return { size, lineHeight, lines: visible, consumed: visible.length, overflow };
}
