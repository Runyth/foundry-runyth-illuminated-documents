// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
export const DEFAULT_NAME_FORMAT = "{globalPrefix}{presetPrefix}{title}{presetSuffix}{globalSuffix}";

export const NAME_FORMAT_TOKENS = Object.freeze([
  "title",
  "globalPrefix",
  "globalSuffix",
  "presetPrefix",
  "presetSuffix",
  "preset",
  "date",
  "time",
  "user"
]);

function pad(value) {
  return String(value).padStart(2, "0");
}

export function formatNamingDate(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatNamingTime(now = new Date()) {
  return `${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

export function renderNameFormat(format, values = {}) {
  const source = String(format || DEFAULT_NAME_FORMAT);
  const unknown = new Set();
  const result = source.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, token) => {
    if (!NAME_FORMAT_TOKENS.includes(token)) {
      unknown.add(token);
      return match;
    }
    return String(values[token] ?? "");
  });

  if (unknown.size) {
    throw new Error(`Unknown document-name token${unknown.size === 1 ? "" : "s"}: ${Array.from(unknown).map((token) => `{${token}}`).join(", ")}`);
  }
  if (/[{}]/.test(result)) {
    throw new Error("The document name format contains an invalid or incomplete token.");
  }

  const normalized = result.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("The document name format produced an empty name.");
  return normalized;
}

export function buildDocumentName({
  title,
  preset = {},
  globalPrefix = "",
  globalSuffix = "",
  globalFormat = DEFAULT_NAME_FORMAT,
  userName = "",
  now = new Date()
} = {}) {
  const format = String(preset.nameFormat || "").trim() || globalFormat || DEFAULT_NAME_FORMAT;
  return renderNameFormat(format, {
    title: String(title || "Illuminated Document").trim() || "Illuminated Document",
    globalPrefix: String(globalPrefix || ""),
    globalSuffix: String(globalSuffix || ""),
    presetPrefix: String(preset.namePrefix || ""),
    presetSuffix: String(preset.nameSuffix || ""),
    preset: String(preset.name || ""),
    date: formatNamingDate(now),
    time: formatNamingTime(now),
    user: String(userName || "")
  });
}
