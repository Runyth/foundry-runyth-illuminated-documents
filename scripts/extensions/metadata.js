// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { CORE_DOCUMENT_SCHEMA_VERSION } from "./constants.js";
import {
  assertExtensionId,
  assertSerializable,
  cloneSerializable,
  deterministicId,
  randomStableId
} from "./utils.js";

function cleanObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? cloneSerializable(value) : {};
}

export function emptyExtensionRecord(schemaVersion = 0) {
  return {
    schemaVersion: Math.max(0, Number(schemaVersion || 0)),
    document: {},
    blocks: {},
    orphanedBlocks: {}
  };
}

export function normalizeExtensionRecord(record = {}) {
  const source = cleanObject(record);
  const schemaVersion = Number(source.schemaVersion || 0);
  return {
    ...source,
    schemaVersion: Number.isFinite(schemaVersion) ? Math.max(0, schemaVersion) : 0,
    document: cleanObject(source.document),
    blocks: Object.fromEntries(
      Object.entries(cleanObject(source.blocks)).map(([blockId, value]) => [String(blockId), cleanObject(value)])
    ),
    orphanedBlocks: Object.fromEntries(
      Object.entries(cleanObject(source.orphanedBlocks)).map(([blockId, value]) => [String(blockId), cleanObject(value)])
    )
  };
}

export function normalizeExtensions(extensions = {}) {
  const source = extensions && typeof extensions === "object" && !Array.isArray(extensions) ? extensions : {};
  const normalized = {};
  for (const [rawId, record] of Object.entries(source)) {
    try {
      const id = assertExtensionId(rawId);
      normalized[id] = normalizeExtensionRecord(record);
    } catch (_error) {
      // Malformed extension namespaces are isolated and omitted from active use.
    }
  }
  return normalized;
}

export function ensureDocumentExtensionEnvelope(metadata = {}) {
  const copy = cloneSerializable(metadata || {});
  const version = Number(copy.version || 0);
  const schemaVersion = Number(copy.schemaVersion || 0);
  copy.version = Math.max(Number.isFinite(version) ? version : 0, CORE_DOCUMENT_SCHEMA_VERSION);
  copy.schemaVersion = Math.max(Number.isFinite(schemaVersion) ? schemaVersion : 0, CORE_DOCUMENT_SCHEMA_VERSION);
  copy.extensions = normalizeExtensions(copy.extensions);
  return copy;
}

export function getExtensionRecord(metadata, extensionId) {
  const id = assertExtensionId(extensionId);
  return normalizeExtensionRecord(ensureDocumentExtensionEnvelope(metadata).extensions[id]);
}

export function getDocumentExtensionData(metadata, extensionId) {
  return cloneSerializable(getExtensionRecord(metadata, extensionId).document);
}

export function getBlockExtensionData(metadata, blockId, extensionId) {
  const id = assertExtensionId(extensionId);
  const key = String(blockId || "");
  if (!key) throw new Error("A stable block ID is required.");
  return cloneSerializable(getExtensionRecord(metadata, id).blocks[key] || {});
}

export function setDocumentExtensionData(metadata, extensionId, data, { schemaVersion = null } = {}) {
  const id = assertExtensionId(extensionId);
  assertSerializable(data, `${id}.document`);
  const copy = ensureDocumentExtensionEnvelope(metadata);
  const record = normalizeExtensionRecord(copy.extensions[id]);
  record.document = cleanObject(data);
  if (schemaVersion !== null) record.schemaVersion = Math.max(0, Number(schemaVersion || 0));
  copy.extensions[id] = record;
  return copy;
}

export function setBlockExtensionData(metadata, blockId, extensionId, data, { schemaVersion = null } = {}) {
  const id = assertExtensionId(extensionId);
  const key = String(blockId || "");
  if (!key) throw new Error("A stable block ID is required.");
  assertSerializable(data, `${id}.blocks.${key}`);
  const copy = ensureDocumentExtensionEnvelope(metadata);
  const record = normalizeExtensionRecord(copy.extensions[id]);
  record.blocks[key] = cleanObject(data);
  delete record.orphanedBlocks[key];
  if (schemaVersion !== null) record.schemaVersion = Math.max(0, Number(schemaVersion || 0));
  copy.extensions[id] = record;
  return copy;
}

export function mergeExtensionData(metadata, extensionId, {
  document = null,
  blocks = null,
  schemaVersion = null
} = {}) {
  const id = assertExtensionId(extensionId);
  const copy = ensureDocumentExtensionEnvelope(metadata);
  const record = normalizeExtensionRecord(copy.extensions[id]);
  if (document !== null) {
    assertSerializable(document, `${id}.document`);
    record.document = { ...record.document, ...cleanObject(document) };
  }
  if (blocks !== null) {
    assertSerializable(blocks, `${id}.blocks`);
    for (const [blockId, value] of Object.entries(cleanObject(blocks))) {
      record.blocks[String(blockId)] = { ...(record.blocks[String(blockId)] || {}), ...cleanObject(value) };
      delete record.orphanedBlocks[String(blockId)];
    }
  }
  if (schemaVersion !== null) record.schemaVersion = Math.max(0, Number(schemaVersion || 0));
  copy.extensions[id] = record;
  return copy;
}

export function orphanRemovedBlockMetadata(metadata, removedBlockIds = []) {
  const copy = ensureDocumentExtensionEnvelope(metadata);
  const removed = new Set((removedBlockIds || []).map(String));
  for (const record of Object.values(copy.extensions)) {
    for (const blockId of removed) {
      if (!Object.hasOwn(record.blocks, blockId)) continue;
      record.orphanedBlocks[blockId] = record.blocks[blockId];
      delete record.blocks[blockId];
    }
  }
  return copy;
}

export function restoreOrphanedBlockMetadata(metadata, blockId) {
  const copy = ensureDocumentExtensionEnvelope(metadata);
  const key = String(blockId || "");
  for (const record of Object.values(copy.extensions)) {
    if (!Object.hasOwn(record.orphanedBlocks, key)) continue;
    record.blocks[key] = record.orphanedBlocks[key];
    delete record.orphanedBlocks[key];
  }
  return copy;
}

export function remapExtensionBlockMetadata(metadata, blockIdMap) {
  const copy = ensureDocumentExtensionEnvelope(metadata);
  const mapping = blockIdMap instanceof Map ? blockIdMap : new Map(Object.entries(blockIdMap || {}));
  for (const record of Object.values(copy.extensions)) {
    const remapped = {};
    for (const [oldId, value] of Object.entries(record.blocks)) {
      const newId = mapping.get(oldId);
      if (newId) remapped[newId] = value;
    }
    const remappedOrphans = {};
    for (const [oldId, value] of Object.entries(record.orphanedBlocks)) {
      remappedOrphans[mapping.get(oldId) || oldId] = value;
    }
    record.blocks = remapped;
    record.orphanedBlocks = remappedOrphans;
  }
  return copy;
}

export function repairBlockIdentities(entries, {
  documentUuid = "",
  regenerateAll = false,
  preserveValid = true
} = {}) {
  const seen = new Set();
  const mapping = new Map();
  let changed = false;
  const repaired = (Array.isArray(entries) ? entries : []).map((entry, index) => {
    const original = String(entry?.id || "");
    let id = original;
    if (regenerateAll) {
      id = randomStableId();
    } else if (!id || seen.has(id) || !preserveValid) {
      const seed = `${documentUuid}:${index}:${entry?.createdAt || ""}:${entry?.text || ""}`;
      id = deterministicId(seed);
      let suffix = 1;
      while (seen.has(id)) {
        id = deterministicId(`${seed}:${suffix}`);
        suffix += 1;
      }
    }
    if (id !== original) changed = true;
    if (original && !mapping.has(original)) mapping.set(original, id);
    seen.add(id);
    return { ...cloneSerializable(entry), id };
  });
  return { entries: repaired, mapping, changed };
}

export function createIndependentBlockIdentityMap(entries) {
  const mapping = new Map();
  const duplicated = (Array.isArray(entries) ? entries : []).map((entry) => {
    const newId = randomStableId();
    mapping.set(String(entry.id), newId);
    return { ...cloneSerializable(entry), id: newId };
  });
  return { entries: duplicated, mapping };
}

export function extensionStorageSummary(metadata) {
  const envelope = ensureDocumentExtensionEnvelope(metadata);
  return Object.entries(envelope.extensions).map(([id, record]) => ({
    id,
    schemaVersion: record.schemaVersion,
    documentKeys: Object.keys(record.document).length,
    blockCount: Object.keys(record.blocks).length,
    orphanedBlockCount: Object.keys(record.orphanedBlocks).length
  }));
}
