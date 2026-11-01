// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { repairBlockIdentities } from "./extensions/metadata.js";

const ENTRY_HISTORY_LIMIT = 100;

function generatedId(prefix = "entry") {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanLabel(value, fallback) {
  return String(value || "").trim() || fallback;
}

export function combineContentEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => cleanText(entry?.text))
    .filter(Boolean)
    .join("\n\n");
}

export function createContentEntry(text, {
  id = generatedId(),
  kind = "append",
  label = "",
  userId = "",
  userName = "",
  createdAt = Date.now(),
  updatedAt = createdAt,
  startOnNewPage = false
} = {}) {
  const content = cleanText(text);
  if (!content) throw new Error("A content section cannot be empty.");

  const fallbackLabel = kind === "initial" ? "Initial content" : "Appended content";
  return {
    id: String(id || generatedId()),
    kind: ["initial", "append", "manual", "legacy"].includes(kind) ? kind : "manual",
    label: cleanLabel(label, fallbackLabel),
    text: content,
    startOnNewPage: Boolean(startOnNewPage),
    createdAt: Number(createdAt || Date.now()),
    updatedAt: Number(updatedAt || createdAt || Date.now()),
    createdBy: {
      userId: String(userId || ""),
      userName: String(userName || "")
    }
  };
}

function normalizedStoredEntries(entries, documentUuid = "") {
  const normalized = entries.map((entry, index) => {
    const normalized = createContentEntry(entry?.text, {
      id: entry?.id || "",
      kind: entry?.kind || (index === 0 ? "initial" : "append"),
      label: entry?.label || (index === 0 ? "Initial content" : `Appended content ${index}`),
      userId: entry?.createdBy?.userId || entry?.userId || "",
      userName: entry?.createdBy?.userName || entry?.userName || "",
      createdAt: entry?.createdAt || entry?.appendedAt || Date.now(),
      updatedAt: entry?.updatedAt || entry?.createdAt || entry?.appendedAt || Date.now(),
      startOnNewPage: Boolean(entry?.startOnNewPage)
    });
    if (entry?.lastEditedBy) normalized.lastEditedBy = { ...entry.lastEditedBy };
    return normalized;
  });
  return repairBlockIdentities(normalized, { documentUuid }).entries;
}

function reconstructedEntryId(historyEntry, index) {
  return String(historyEntry?.id || `legacy-append-${index + 1}`);
}

function reconstructFromExtensionHistory(metadata) {
  const sourceText = String(metadata?.sourceText || "");
  const history = Array.isArray(metadata?.extensionHistory) ? metadata.extensionHistory : [];
  if (!sourceText.trim()) return { entries: [], migrationMode: "empty" };
  if (!history.length) {
    return {
      entries: [createContentEntry(sourceText, {
        id: `legacy-content-${metadata?.createdAt || "unknown"}`,
        kind: "legacy",
        label: "Legacy combined content",
        userId: metadata?.createdBy?.userId || "",
        userName: metadata?.createdBy?.userName || "",
        createdAt: metadata?.createdAt || Date.now(),
        updatedAt: metadata?.updatedAt || metadata?.createdAt || Date.now()
      })],
      migrationMode: "legacy-combined"
    };
  }

  let remaining = sourceText;
  const reconstructed = [];
  let complete = true;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const historyEntry = history[index] || {};
    const characterCount = Number(historyEntry.characterCount);
    if (!Number.isInteger(characterCount) || characterCount <= 0 || characterCount > remaining.length) {
      complete = false;
      break;
    }

    const text = remaining.slice(-characterCount);
    let prefix = remaining.slice(0, -characterCount);
    if (prefix.endsWith("\n\n")) prefix = prefix.slice(0, -2);
    else if (prefix.length) {
      complete = false;
      break;
    }

    reconstructed.unshift(createContentEntry(text, {
      id: reconstructedEntryId(historyEntry, index),
      kind: "append",
      label: `Appended content ${index + 1}`,
      userId: historyEntry.userId || "",
      userName: historyEntry.userName || "",
      createdAt: historyEntry.appendedAt || metadata?.updatedAt || Date.now(),
      updatedAt: historyEntry.appendedAt || metadata?.updatedAt || Date.now(),
      startOnNewPage: Boolean(historyEntry.startOnNewPage)
    }));
    remaining = prefix;
  }

  if (!complete) {
    return {
      entries: [createContentEntry(sourceText, {
        id: `legacy-content-${metadata?.createdAt || "unknown"}`,
        kind: "legacy",
        label: "Legacy combined content",
        userId: metadata?.createdBy?.userId || "",
        userName: metadata?.createdBy?.userName || "",
        createdAt: metadata?.createdAt || Date.now(),
        updatedAt: metadata?.updatedAt || metadata?.createdAt || Date.now()
      })],
      migrationMode: "legacy-combined"
    };
  }

  if (remaining.trim()) {
    reconstructed.unshift(createContentEntry(remaining, {
      id: `legacy-initial-${metadata?.createdAt || "unknown"}`,
      kind: history.length >= ENTRY_HISTORY_LIMIT ? "legacy" : "initial",
      label: history.length >= ENTRY_HISTORY_LIMIT ? "Original and earlier combined content" : "Initial content",
      userId: metadata?.createdBy?.userId || "",
      userName: metadata?.createdBy?.userName || "",
      createdAt: metadata?.createdAt || Date.now(),
      updatedAt: metadata?.createdAt || Date.now()
    }));
  }

  return {
    entries: reconstructed,
    migrationMode: history.length >= ENTRY_HISTORY_LIMIT ? "partially-reconstructed" : "reconstructed"
  };
}

export function getContentEntries(metadata, { documentUuid = "" } = {}) {
  const stored = Array.isArray(metadata?.contentEntries)
    ? metadata.contentEntries.filter((entry) => String(entry?.text || "").trim())
    : [];

  if (stored.length) {
    return {
      entries: normalizedStoredEntries(stored, documentUuid),
      migrationMode: "structured"
    };
  }

  return reconstructFromExtensionHistory(metadata || {});
}

export function prepareEditedEntries(entries, currentEntries, {
  userId = "",
  userName = "",
  now = Date.now()
} = {}) {
  const source = Array.isArray(entries) ? entries : [];
  if (!source.length) throw new Error("An illuminated document must contain at least one content section.");

  const currentById = new Map((currentEntries || []).map((entry) => [entry.id, entry]));
  return source.map((entry, index) => {
    const text = cleanText(entry?.text);
    if (!text) throw new Error(`Content section ${index + 1} is empty. Add text or remove the section.`);

    const id = String(entry?.id || generatedId("manual"));
    const previous = currentById.get(id);
    const kind = previous?.kind || entry?.kind || "manual";
    const fallbackLabel = kind === "initial" ? "Initial content" : `Content section ${index + 1}`;
    const label = cleanLabel(entry?.label, fallbackLabel);
    const startOnNewPage = Boolean(entry?.startOnNewPage);
    const changed = !previous
      || previous.text !== text
      || previous.label !== label
      || Boolean(previous.startOnNewPage) !== startOnNewPage;

    return {
      id,
      kind,
      label,
      text,
      startOnNewPage,
      createdAt: Number(previous?.createdAt || entry?.createdAt || now),
      updatedAt: changed ? now : Number(previous?.updatedAt || previous?.createdAt || now),
      createdBy: {
        userId: String(previous?.createdBy?.userId || entry?.createdBy?.userId || userId || ""),
        userName: String(previous?.createdBy?.userName || entry?.createdBy?.userName || userName || "")
      },
      ...(changed ? { lastEditedBy: { userId: String(userId || ""), userName: String(userName || "") } } : previous?.lastEditedBy ? { lastEditedBy: previous.lastEditedBy } : {})
    };
  });
}

export function describeEntryKind(kind) {
  return {
    initial: "Initial",
    append: "Appended",
    manual: "Added in editor",
    legacy: "Legacy content"
  }[kind] || "Content";
}
