// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { normalizeTemplate, regionPixels } from "./layout.js";
import { parseMarkdown } from "./markdown.js";

export const DEFAULT_EAGER_MAX_PAGES = 50;
export const DEFAULT_LOGICAL_MAX_PAGES = 10000;
export const DEFAULT_RASTER_CACHE_BYTES = 128 * 1024 * 1024;
export const DEFAULT_RASTER_CACHE_PAGES = 24;
export const DEFAULT_PAGINATION_YIELD_PAGES = 100;

const IMAGE_PROMISE_CACHE = new Map();
const FONT_PROMISE_CACHE = new Map();

function abortError() {
  return new DOMException("Rendering was cancelled.", "AbortError");
}

async function cooperativeYield(signal) {
  if (signal?.aborted) throw abortError();
  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
  if (signal?.aborted) throw abortError();
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function loadImage(src) {
  const key = String(src || "");
  if (IMAGE_PROMISE_CACHE.has(key)) return IMAGE_PROMISE_CACHE.get(key);
  const pending = new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load background image: ${key}`));
    image.src = key;
  }).catch((error) => {
    IMAGE_PROMISE_CACHE.delete(key);
    throw error;
  });
  IMAGE_PROMISE_CACHE.set(key, pending);
  return pending;
}

async function loadRegionFont(region) {
  if (!region.fontFile) return;
  const key = String(region.fontFile);
  const family = `Illuminated-${region.id}-${stableHash(key)}`;
  region.fontFamily = family;
  if (!FONT_PROMISE_CACHE.has(key)) {
    const pending = (async () => {
      const face = new FontFace(family, `url("${key}")`);
      await face.load();
      document.fonts.add(face);
      return face;
    })().catch((error) => {
      FONT_PROMISE_CACHE.delete(key);
      throw error;
    });
    FONT_PROMISE_CACHE.set(key, pending);
  }
  await FONT_PROMISE_CACHE.get(key);
}

function fontFor(region, size, token = {}, paragraph = {}) {
  const headingWeight = paragraph.kind === "heading" ? "700" : region.fontWeight;
  const weight = token.bold ? "700" : headingWeight;
  const italic = token.italic || paragraph.kind === "quote" ? "italic" : region.fontStyle;
  const family = token.code ? "monospace" : `"${region.fontFamily}"`;
  return `${italic} ${weight} ${size}px ${family}`;
}

function paragraphMetrics(region, paragraph) {
  if (paragraph.kind === "heading") {
    const multipliers = [1.75, 1.5, 1.3, 1.15, 1.05, 1];
    return { size: region.fontSize * multipliers[paragraph.level - 1], before: 0.45, after: 0.4 };
  }
  if (paragraph.kind === "list") return { size: region.fontSize, before: 0.05, after: 0.2 };
  if (paragraph.kind === "quote") return { size: region.fontSize, before: 0.15, after: 0.3 };
  if (paragraph.kind === "rule") return { size: region.fontSize, before: 0.35, after: 0.45 };
  return { size: region.fontSize, before: 0, after: 0.45 };
}

function measureToken(ctx, token, region, size, paragraph) {
  ctx.font = fontFor(region, size, token, paragraph);
  return ctx.measureText(token.text).width;
}

function makePrefixTokens(paragraph) {
  if (!paragraph.prefix) return [];
  return [{ text: paragraph.prefix, bold: paragraph.kind === "list" }];
}

function paragraphsForContent(text, contentEntries = null) {
  const entries = Array.isArray(contentEntries)
    ? contentEntries.filter((entry) => String(entry?.text || "").trim())
    : [];
  if (!entries.length) return parseMarkdown(text);

  const paragraphs = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const parsed = parseMarkdown(String(entry.text || ""));
    if (parsed.length && index > 0 && entry.startOnNewPage) {
      parsed[0] = { ...parsed[0], illuminatedPageBreakBefore: true };
    }
    paragraphs.push(...parsed);
  }
  return paragraphs;
}

function layoutRegion(ctx, paragraphs, startCursor, region, box, { pageHasContent = false } = {}) {
  const lines = [];
  const cursor = { paragraph: startCursor.paragraph, token: startCursor.token };
  let usedHeight = 0;

  while (cursor.paragraph < paragraphs.length) {
    const paragraph = paragraphs[cursor.paragraph];
    if (cursor.token === 0 && paragraph.illuminatedPageBreakBefore && (pageHasContent || lines.length > 0)) {
      return { lines, cursor, usedHeight, complete: false, pageBreak: true };
    }
    const metrics = paragraphMetrics(region, paragraph);
    const size = Math.max(region.minFontSize, metrics.size);
    const lineHeight = size * region.lineHeight;
    const before = metrics.before * lineHeight;
    const after = metrics.after * lineHeight;

    if (paragraph.kind === "rule") {
      if (usedHeight + before + lineHeight * 0.35 + after > box.height && lines.length) break;
      usedHeight += before;
      lines.push({ kind: "rule", y: usedHeight, height: lineHeight * 0.35, paragraph });
      usedHeight += lineHeight * 0.35 + after;
      cursor.paragraph += 1;
      cursor.token = 0;
      continue;
    }

    const sourceTokens = [...makePrefixTokens(paragraph), ...paragraph.tokens];
    let tokenIndex = cursor.token;
    if (tokenIndex === 0 && usedHeight > 0) usedHeight += before;

    while (tokenIndex < sourceTokens.length) {
      if (usedHeight + lineHeight > box.height && lines.length) {
        cursor.token = tokenIndex;
        return { lines, cursor, usedHeight, complete: false };
      }

      const lineTokens = [];
      let width = 0;
      while (tokenIndex < sourceTokens.length) {
        const token = sourceTokens[tokenIndex];
        const tokenWidth = measureToken(ctx, token, region, size, paragraph);
        if (lineTokens.length && width + tokenWidth > box.width) break;
        lineTokens.push(token);
        width += tokenWidth;
        tokenIndex += 1;
      }

      if (!lineTokens.length) {
        const token = sourceTokens[tokenIndex];
        lineTokens.push(token);
        width = measureToken(ctx, token, region, size, paragraph);
        tokenIndex += 1;
      }

      lines.push({ kind: "text", tokens: lineTokens, width, y: usedHeight, size, lineHeight, paragraph });
      usedHeight += lineHeight;
    }

    usedHeight += after;
    cursor.paragraph += 1;
    cursor.token = 0;
  }

  return { lines, cursor, usedHeight, complete: cursor.paragraph >= paragraphs.length, pageBreak: false };
}

function drawTextLine(ctx, line, box, region) {
  let x = box.x;
  if (line.paragraph.kind === "quote") x += line.size * 0.7;
  if (region.align === "center") x = box.x + (box.width - line.width) / 2;
  if (region.align === "right") x = box.x + box.width - line.width;

  for (const token of line.tokens) {
    ctx.font = fontFor(region, line.size, token, line.paragraph);
    ctx.fillStyle = region.color;
    ctx.fillText(token.text, x, box.y + line.y);
    const width = ctx.measureText(token.text).width;
    if (token.strike) {
      const strikeY = box.y + line.y + line.size * 0.55;
      ctx.beginPath();
      ctx.moveTo(x, strikeY);
      ctx.lineTo(x + width, strikeY);
      ctx.strokeStyle = region.color;
      ctx.lineWidth = Math.max(1, line.size / 18);
      ctx.stroke();
    }
    x += width;
  }
}

function verticalOffsetFor(region, box, usedHeight) {
  if (region.verticalAlign === "middle") return Math.max(0, (box.height - usedHeight) / 2);
  if (region.verticalAlign === "bottom") return Math.max(0, box.height - usedHeight);
  return 0;
}

function drawPlannedRegion(ctx, regionPlan) {
  const { region, box, lines, usedHeight } = regionPlan;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();
  ctx.textBaseline = "top";
  const verticalOffset = verticalOffsetFor(region, box, usedHeight);

  for (const line of lines) {
    const shifted = { ...line, y: line.y + verticalOffset };
    if (line.kind === "rule") {
      const y = box.y + shifted.y + shifted.height / 2;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.width, y);
      ctx.strokeStyle = region.color;
      ctx.lineWidth = Math.max(1, region.fontSize / 16);
      ctx.stroke();
    } else {
      drawTextLine(ctx, shifted, box, region);
    }
  }
  ctx.restore();
}

function createMeasurementContext() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("This browser cannot create a 2D canvas context for document pagination.");
  return ctx;
}

async function prepareTemplates(templateInputs) {
  const templates = templateInputs.filter(Boolean).map(normalizeTemplate);
  if (!templates.length) throw new Error("At least one body-page template is required.");
  for (const template of templates) await Promise.all(template.regions.map(loadRegionFont));
  return templates;
}

function logicalLimitError(maxPages) {
  return new Error(`Document exceeds the logical safety limit of ${maxPages} pages. This protects against pathological pagination loops; normal viewing rasterizes only nearby pages.`);
}

/**
 * Paginate text across alternating page templates without allocating page-sized canvases.
 * The returned plans contain only layout instructions and template metadata.
 */
export async function planAlternatingPages(templateInputs, text, {
  maxPages = DEFAULT_LOGICAL_MAX_PAGES,
  contentEntries = null,
  signal = null,
  yieldEvery = DEFAULT_PAGINATION_YIELD_PAGES
} = {}) {
  const templates = await prepareTemplates(templateInputs);
  const paragraphs = paragraphsForContent(text, contentEntries);
  const ctx = createMeasurementContext();
  const plans = [];
  let cursor = { paragraph: 0, token: 0 };

  if (!paragraphs.length) {
    plans.push({
      kind: "body",
      bodyIndex: 0,
      template: templates[0],
      regions: [],
      label: describeBookPage("body", 0)
    });
    return plans;
  }

  for (let page = 0; page < maxPages && cursor.paragraph < paragraphs.length; page += 1) {
    if (signal?.aborted) throw abortError();
    if (page > 0 && yieldEvery > 0 && page % yieldEvery === 0) await cooperativeYield(signal);
    const template = templates[page % templates.length];
    const pageStart = `${cursor.paragraph}:${cursor.token}`;
    let pageHasContent = false;
    let pageBreak = false;
    const regions = [];

    for (const region of template.regions) {
      const box = regionPixels(region, template.width, template.height);
      const layout = layoutRegion(ctx, paragraphs, cursor, region, box, { pageHasContent });
      regions.push({
        region,
        box,
        lines: layout.lines,
        usedHeight: layout.usedHeight
      });
      cursor = layout.cursor;
      pageHasContent ||= layout.lines.length > 0;
      pageBreak = Boolean(layout.pageBreak);
      if (pageBreak || cursor.paragraph >= paragraphs.length) break;
    }

    if (`${cursor.paragraph}:${cursor.token}` === pageStart && !pageBreak) {
      throw new Error("A configured page cannot fit any text. Increase a text region or reduce its font size.");
    }

    plans.push({
      kind: "body",
      bodyIndex: page,
      template,
      regions,
      label: describeBookPage("body", page)
    });
  }

  if (cursor.paragraph < paragraphs.length) throw logicalLimitError(maxPages);
  return plans;
}

export function describeBookPage(kind, bodyIndex = 0) {
  if (kind === "front-cover") return "Front cover";
  if (kind === "back-cover") return "Back cover";
  return `Page ${bodyIndex + 1} · ${bodyIndex % 2 === 0 ? "left template" : "right template"}`;
}

/** Build lightweight cover/body page plans for a complete book. */
export async function planBookPageEntries({
  leftTemplate,
  rightTemplate,
  frontCoverTemplate,
  backCoverTemplate,
  text,
  contentEntries = null,
  includeFrontCover = false,
  includeBackCover = false,
  maxPages = DEFAULT_LOGICAL_MAX_PAGES,
  signal = null,
  yieldEvery = DEFAULT_PAGINATION_YIELD_PAGES
}) {
  if (!leftTemplate) throw new Error("The selected preset has no valid left-page template.");
  const pages = [];

  if (includeFrontCover && frontCoverTemplate) {
    const template = normalizeTemplate(frontCoverTemplate);
    pages.push({ kind: "front-cover", template, regions: [], label: describeBookPage("front-cover") });
  }

  pages.push(...await planAlternatingPages([leftTemplate, rightTemplate || leftTemplate], text, {
    maxPages,
    contentEntries,
    signal,
    yieldEvery
  }));

  if (includeBackCover && backCoverTemplate) {
    const template = normalizeTemplate(backCoverTemplate);
    pages.push({ kind: "back-cover", template, regions: [], label: describeBookPage("back-cover") });
  }
  return pages;
}

/** Rasterize exactly one lightweight page plan. */
export async function renderPlannedPage(plan, { signal = null } = {}) {
  if (!plan?.template) throw new Error("A valid page plan is required.");
  if (signal?.aborted) throw abortError();
  const template = plan.template;
  await Promise.all(template.regions.map(loadRegionFont));
  const background = await loadImage(template.background);
  if (signal?.aborted) throw abortError();

  const canvas = document.createElement("canvas");
  canvas.width = template.width;
  canvas.height = template.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("This browser cannot create a 2D canvas context for page rendering.");
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  for (const regionPlan of plan.regions || []) drawPlannedRegion(ctx, regionPlan);
  return { canvas, template, kind: plan.kind, bodyIndex: plan.bodyIndex, label: plan.label };
}

export function estimatePageRasterBytes(plan) {
  const width = Math.max(1, Number(plan?.template?.width) || 1);
  const height = Math.max(1, Number(plan?.template?.height) || 1);
  return width * height * 4;
}

export function releaseCanvas(canvas) {
  if (!canvas) return;
  try {
    canvas.remove?.();
    canvas.width = 0;
    canvas.height = 0;
  } catch (_error) {
    // Best-effort release only. Dropping all references still permits GC.
  }
}

export async function renderDocumentPages(templateInput, text, { maxPages = DEFAULT_EAGER_MAX_PAGES } = {}) {
  const plans = await planAlternatingPages([templateInput], text, { maxPages });
  const pages = [];
  for (const plan of plans) pages.push((await renderPlannedPage(plan)).canvas);
  return pages;
}

/**
 * Compatibility eager renderer. New module UI uses planAlternatingPages plus virtual rasterization.
 */
export async function renderAlternatingPages(templateInputs, text, {
  maxPages = DEFAULT_EAGER_MAX_PAGES,
  contentEntries = null
} = {}) {
  const plans = await planAlternatingPages(templateInputs, text, { maxPages, contentEntries });
  const pages = [];
  for (const plan of plans) pages.push(await renderPlannedPage(plan));
  return pages;
}

export async function renderBookPageEntries(options) {
  const plans = await planBookPageEntries({
    ...options,
    maxPages: options.maxPages ?? DEFAULT_EAGER_MAX_PAGES
  });
  const pages = [];
  for (const plan of plans) pages.push(await renderPlannedPage(plan));
  return pages;
}

export async function renderBookPages(options) {
  return (await renderBookPageEntries(options)).map((entry) => entry.canvas);
}

export function canvasToBlob(canvas, template = {}) {
  const mime = template.imageFormat === "jpeg" ? "image/jpeg" : "image/png";
  const quality = template.imageFormat === "jpeg" ? template.jpegQuality : undefined;
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas export failed.")), mime, quality);
  });
}
