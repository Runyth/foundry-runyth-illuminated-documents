// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
function tokenizeInline(text) {
  const source = String(text || "");
  const runs = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~)/g;
  let cursor = 0;

  for (const match of source.matchAll(pattern)) {
    if (match.index > cursor) runs.push({ text: source.slice(cursor, match.index) });
    const value = match[0];
    if (value.startsWith("`")) runs.push({ text: value.slice(1, -1), code: true });
    else if (value.startsWith("**") || value.startsWith("__")) runs.push({ text: value.slice(2, -2), bold: true });
    else if (value.startsWith("~~")) runs.push({ text: value.slice(2, -2), strike: true });
    else runs.push({ text: value.slice(1, -1), italic: true });
    cursor = match.index + value.length;
  }

  if (cursor < source.length) runs.push({ text: source.slice(cursor) });
  return runs;
}

function runsToTokens(runs) {
  const tokens = [];
  for (const run of runs) {
    const parts = run.text.match(/\S+\s*|\s+/g) || [];
    for (const part of parts) tokens.push({ ...run, text: part });
  }
  return tokens;
}

export function parseMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const paragraphs = [];
  let buffer = [];

  const flush = () => {
    const text = buffer.join(" ").trim();
    if (text) paragraphs.push({ kind: "paragraph", tokens: runsToTokens(tokenizeInline(text)) });
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      paragraphs.push({
        kind: "heading",
        level: heading[1].length,
        tokens: runsToTokens(tokenizeInline(heading[2].trim()))
      });
      continue;
    }

    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    if (unordered) {
      flush();
      paragraphs.push({ kind: "list", prefix: "• ", tokens: runsToTokens(tokenizeInline(unordered[1].trim())) });
      continue;
    }

    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (ordered) {
      flush();
      paragraphs.push({ kind: "list", prefix: `${ordered[1]}. `, tokens: runsToTokens(tokenizeInline(ordered[2].trim())) });
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flush();
      paragraphs.push({ kind: "quote", tokens: runsToTokens(tokenizeInline(quote[1].trim())) });
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flush();
      paragraphs.push({ kind: "rule", tokens: [] });
      continue;
    }

    buffer.push(line.trim());
  }

  flush();
  return paragraphs;
}

export function markdownToPlainText(markdown) {
  return parseMarkdown(markdown)
    .map((paragraph) => `${paragraph.prefix || ""}${paragraph.tokens.map((token) => token.text).join("").trim()}`)
    .filter(Boolean)
    .join("\n\n");
}
