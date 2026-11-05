// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, SETTINGS } from "./settings.js";
import { getPresets } from "./presets.js";
import { canCreateDocuments, canUsePreset } from "./permissions.js";
import { buildDocumentName, DEFAULT_NAME_FORMAT } from "./naming.js";
import { resolveDocumentFolderDestination } from "./journal-folders.js";
import {
  combineContentEntries,
  createContentEntry,
  getContentEntries,
  prepareEditedEntries
} from "./content-entries.js";
import { extensionRuntime } from "./extensions/runtime.js";
import {
  ensureDocumentExtensionEnvelope,
  mergeExtensionData,
  normalizeExtensions,
  orphanRemovedBlockMetadata,
  repairBlockIdentities
} from "./extensions/metadata.js";
import {
  buildDocumentExport,
  duplicateMetadata,
  normalizeDocumentImport
} from "./extensions/transfer.js";
import { cloneSerializable, hookCallAll } from "./extensions/utils.js";
import { EXTENSION_HOOKS } from "./extensions/constants.js";

const HISTORY_LIMIT = 100;

const LEGACY_FLAG_NAMESPACES = "illuminated-documents";

function metadataLooksValid(metadata) {
  return metadata.schemaVersion !== undefined
    || metadata.sourceText !== undefined
    || metadata.contentEntries !== undefined
    || metadata.extensionHistory !== undefined
    || metadata.templateId !== undefined
    || metadata.presetId !== undefined;
}

export function liveDocumentContent({ blockId = "" } = {}) {
  const chapterAttribute = blockId ? ` data-idoc-chapter-block-id="${String(blockId).replaceAll('"', "&quot;")}"` : "";
  return `
    <div class="idoc-live-document-root" data-idoc-live-document="true"${chapterAttribute}>
      <div class="idoc-live-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Rendering illuminated document…
      </div>
    </div>
  `;
}

export function getLiveMetadata(document) {
  // The active module scope is the only safe getFlag target; Foundry throws
  // for scopes that no longer correspond to an active package, so legacy
  // namespaces are read through the raw flag shelf instead.
  const direct = document?.getFlag?.(MODULE_ID, "liveDocument")
    ?? metadataFlag(document, MODULE_ID, "liveDocument")
    ?? metadataFlag(document, LEGACY_FLAG_NAMESPACES, "liveDocument");
  if (direct) return direct;
  return discoverLegacyFlag(document, metadataLooksValid, "liveDocument");
}

export function getSectionChapterBlockId(page) {
  const direct = page?.getFlag?.(MODULE_ID, "sectionChapter")
    ?? metadataFlag(page, MODULE_ID, "sectionChapter")
    ?? metadataFlag(page, LEGACY_FLAG_NAMESPACES, "sectionChapter");
  const record = direct ?? discoverLegacyFlag(page, value => value && typeof value === "object" && typeof value.blockId === "string", "sectionChapter");
  return String(record?.blockId || "");
}

/**
 * The pre-Runyth publication of this module shipped under other module ids, so
 * long-lived worlds still store their document metadata under those legacy
 * flag namespaces. The readers resolve the document's own stored record from
 * any namespace carrying a marker shape, and the module's lazy metadata
 * migration (prepareMetadata) then persists it under the current module id so
 * the document is self-healing after the first open.
 */
function metadataFlag(document, namespace, key) {
  return document?.flags?.[namespace]?.[key] ?? null;
}

function discoverLegacyFlag(document, validate, key) {
  const flags = document?.flags;
  if (!flags || typeof flags !== "object") return null;
  for (const [namespace, record] of Object.entries(flags)) {
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const value = record[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (namespace === MODULE_ID) continue;
    if (validate(value)) return value;
  }
  return null;
}

export function usesSectionChapters(metadata) {
  return Boolean(metadata?.sectionsAsChapters);
}

function journalPageSort(index) {
  const density = Number(globalThis.CONST?.SORT_INTEGER_DENSITY || 100000);
  return (index + 1) * density;
}

function sectionChapterName(entry, index) {
  return String(entry?.label || "").trim() || `Chapter ${index + 1}`;
}

function chapterPageSource(entry, index) {
  return {
    name: sectionChapterName(entry, index),
    type: "text",
    sort: journalPageSort(index),
    text: { content: liveDocumentContent({ blockId: entry.id }), format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
    flags: { [MODULE_ID]: { sectionChapter: { blockId: String(entry.id) } } }
  };
}

function singlePageSource(metadata, documentName) {
  return {
    name: documentName,
    type: "text",
    sort: journalPageSort(0),
    text: { content: liveDocumentContent(), format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
    flags: { [MODULE_ID]: { liveDocument: metadata } }
  };
}

export function buildJournalPagesForMetadata(metadata, documentName = metadata?.title || "Illuminated Document") {
  const normalized = ensureDocumentExtensionEnvelope(metadata || {});
  if (!usesSectionChapters(normalized)) return [singlePageSource(normalized, documentName)];
  const entries = getContentEntries(normalized).entries;
  return entries.map(chapterPageSource);
}

export function getJournalLiveMetadata(journal) {
  if (!journal) return null;
  return getLiveMetadata(journal)
    || Array.from(journal.pages || []).map(getLiveMetadata).find(Boolean)
    || null;
}

export function combineDocumentText(existingText, appendedText) {
  const existing = String(existingText || "").trimEnd();
  const appended = String(appendedText || "").trim();
  if (!appended) return existing;
  if (!existing) return appended;
  return `${existing}\n\n${appended}`;
}

export function createLiveMetadata({
  title,
  sourceTitle = title,
  text,
  presetId,
  includeFrontCover,
  includeBackCover,
  ownerId,
  ownerName = "",
  initialBlockId = "",
  initialBlockLabel = "",
  extensions = {},
  sectionsAsChapters = false,
  now = Date.now()
}) {
  const initialEntry = createContentEntry(text, {
    id: initialBlockId || undefined,
    kind: "initial",
    label: String(initialBlockLabel || "").trim() || "Initial content",
    userId: ownerId || "",
    userName: ownerName,
    createdAt: now
  });

  return ensureDocumentExtensionEnvelope({
    version: 6,
    schemaVersion: 6,
    title,
    sourceTitle: String(sourceTitle || title || ""),
    sourceText: initialEntry.text,
    contentEntries: [initialEntry],
    presetId,
    includeFrontCover: Boolean(includeFrontCover),
    includeBackCover: Boolean(includeBackCover),
    sectionsAsChapters: Boolean(sectionsAsChapters),
    revision: 0,
    createdAt: now,
    updatedAt: now,
    extensionHistory: [],
    editHistory: [],
    extensions: normalizeExtensions(extensions),
    createdBy: {
      userId: ownerId || "",
      userName: ownerName || ""
    }
  });
}

export function buildExtendedMetadata(currentMetadata, appendedText, {
  userId = "",
  userName = "",
  blockId = "",
  blockExtensions = {},
  startOnNewPage = false,
  label = "",
  now = Date.now(),
  documentUuid = ""
} = {}) {
  const append = String(appendedText || "").trim();
  if (!append) throw new Error("Enter additional text before extending the book.");

  const current = ensureDocumentExtensionEnvelope(currentMetadata || {});
  const history = Array.isArray(current.extensionHistory) ? current.extensionHistory : [];
  const entryId = String(blockId || globalThis.crypto?.randomUUID?.() || `${now}-${history.length + 1}`);
  const historyEntry = {
    id: entryId,
    userId,
    userName,
    appendedAt: now,
    characterCount: append.length,
    startOnNewPage: Boolean(startOnNewPage)
  };
  const { entries } = getContentEntries(current, { documentUuid });
  const contentEntry = createContentEntry(append, {
    id: entryId,
    kind: "append",
    label: String(label || "").trim() || `Appended content ${entries.filter((entry) => entry.kind === "append").length + 1}`,
    userId,
    userName,
    createdAt: now,
    startOnNewPage: Boolean(startOnNewPage)
  });
  const contentEntries = [...entries, contentEntry];
  let next = {
    ...current,
    version: 6,
    schemaVersion: 6,
    sourceTitle: String(current.sourceTitle || current.title || ""),
    sourceText: combineContentEntries(contentEntries),
    contentEntries,
    revision: Number(current.revision || 0) + 1,
    updatedAt: now,
    extensionHistory: [...history, historyEntry].slice(-HISTORY_LIMIT),
    editHistory: Array.isArray(current.editHistory) ? current.editHistory : []
  };
  for (const [extensionId, data] of Object.entries(blockExtensions || {})) {
    next = mergeExtensionData(next, extensionId, { blocks: { [entryId]: data } });
  }
  return next;
}

function sameOrder(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function buildEditedMetadata(currentMetadata, {
  entries,
  presetId,
  includeFrontCover,
  includeBackCover,
  sectionsAsChapters = null,
  extensions = null
}, {
  userId = "",
  userName = "",
  now = Date.now(),
  documentUuid = ""
} = {}) {
  const current = ensureDocumentExtensionEnvelope(currentMetadata || {});
  const { entries: currentEntries } = getContentEntries(current, { documentUuid });
  const preparedSource = prepareEditedEntries(entries, currentEntries, { userId, userName, now });
  const repaired = repairBlockIdentities(preparedSource, { documentUuid });
  const preparedEntries = repaired.entries;
  const sourceText = combineContentEntries(preparedEntries);
  if (!sourceText) throw new Error("An illuminated document must contain text.");

  const oldIds = currentEntries.map((entry) => entry.id);
  const newIds = preparedEntries.map((entry) => entry.id);
  const removedEntryIds = oldIds.filter((id) => !newIds.includes(id));
  const currentById = new Map(currentEntries.map((entry) => [entry.id, entry]));
  const contentChanged = preparedEntries.some((entry) => {
    const previous = currentById.get(entry.id);
    return !previous || previous.text !== entry.text || previous.label !== entry.label;
  });
  const pageFlowChanged = preparedEntries.some((entry) => {
    const previous = currentById.get(entry.id);
    return !previous || Boolean(previous.startOnNewPage) !== Boolean(entry.startOnNewPage);
  });
  const presetChanged = String(current.presetId || "") !== String(presetId || "");
  const coverChanged = Boolean(current.includeFrontCover) !== Boolean(includeFrontCover)
    || Boolean(current.includeBackCover) !== Boolean(includeBackCover);
  const chapterModeChanged = sectionsAsChapters !== null
    && Boolean(current.sectionsAsChapters) !== Boolean(sectionsAsChapters);
  const orderChanged = !sameOrder(oldIds.filter((id) => newIds.includes(id)), newIds.filter((id) => oldIds.includes(id)));
  const migrationChanged = !Array.isArray(current.contentEntries) || current.contentEntries.length === 0 || repaired.changed;
  const extensionChanged = extensions !== null && JSON.stringify(normalizeExtensions(extensions)) !== JSON.stringify(current.extensions || {});
  const changed = migrationChanged || contentChanged || pageFlowChanged || removedEntryIds.length > 0 || oldIds.length !== newIds.length
    || presetChanged || coverChanged || chapterModeChanged || orderChanged || extensionChanged;
  if (!changed) throw new Error("No document changes were detected.");

  const editHistory = Array.isArray(current.editHistory) ? current.editHistory : [];
  const editEntry = {
    id: globalThis.crypto?.randomUUID?.() || `edit-${now}-${editHistory.length + 1}`,
    userId,
    userName,
    editedAt: now,
    entryCountBefore: currentEntries.length,
    entryCountAfter: preparedEntries.length,
    removedEntryIds,
    orderChanged,
    contentChanged,
    pageFlowChanged,
    presetChanged,
    coverChanged,
    chapterModeChanged,
    extensionChanged,
    migratedToStructuredContent: migrationChanged,
    previousPresetId: String(current.presetId || ""),
    presetId: String(presetId || "")
  };

  let next = ensureDocumentExtensionEnvelope({
    ...current,
    version: 6,
    schemaVersion: 6,
    sourceTitle: String(current.sourceTitle || current.title || ""),
    sourceText,
    contentEntries: preparedEntries,
    presetId: String(presetId || current.presetId || ""),
    includeFrontCover: Boolean(includeFrontCover),
    includeBackCover: Boolean(includeBackCover),
    sectionsAsChapters: sectionsAsChapters === null ? Boolean(current.sectionsAsChapters) : Boolean(sectionsAsChapters),
    revision: Number(current.revision || 0) + 1,
    updatedAt: now,
    extensions: extensions === null ? current.extensions : normalizeExtensions(extensions),
    extensionHistory: Array.isArray(current.extensionHistory) ? current.extensionHistory : [],
    editHistory: [...editHistory, editEntry].slice(-HISTORY_LIMIT)
  });
  next = orphanRemovedBlockMetadata(next, removedEntryIds);
  return next;
}

function hasModuleAccess(user) {
  return canCreateDocuments(user);
}

function assertPresetAvailableToUser(presetId, user) {
  const presets = getPresets();
  if (!Object.keys(presets).length) return;
  const preset = presets[presetId];
  if (!preset) throw new Error("The selected book preset no longer exists.");
  if (!canUsePreset(preset, user)) throw new Error("The selected book preset is not shared with this player.");
}

export function canExtendJournal(journal, user = game.user) {
  if (!journal || !getJournalLiveMetadata(journal) || !hasModuleAccess(user)) return false;
  if (user?.isGM) return true;
  return Boolean(journal.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
}

export function canEditJournal(journal, user = game.user) {
  return canExtendJournal(journal, user);
}

export function listExtendableJournals(user = game.user) {
  return Array.from(game.journal || [])
    .filter((journal) => canExtendJournal(journal, user))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function listEditableJournals(user = game.user) {
  return Array.from(game.journal || [])
    .filter((journal) => canEditJournal(journal, user))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function configuredDocumentName(rawTitle, presetId, owner) {
  const preset = getPresets()[presetId] || { id: presetId, name: presetId || "" };
  return buildDocumentName({
    title: rawTitle,
    preset,
    globalPrefix: game.settings.get(MODULE_ID, SETTINGS.globalNamePrefix) || "",
    globalSuffix: game.settings.get(MODULE_ID, SETTINGS.globalNameSuffix) || "",
    globalFormat: game.settings.get(MODULE_ID, SETTINGS.globalNameFormat) || DEFAULT_NAME_FORMAT,
    userName: owner?.name || ""
  });
}

async function validateMetadata(metadata, context = {}) {
  const entries = getContentEntries(metadata, { documentUuid: context.documentUuid || "" }).entries;
  const results = await extensionRuntime.validation.validate({
    ...context,
    metadata,
    contentBlocks: entries,
    extensionData: metadata.extensions || {}
  });
  extensionRuntime.validation.assertNoBlockingErrors(results);
  return results;
}

export async function createLiveJournal({
  title,
  rawTitle = title,
  text,
  presetId,
  includeFrontCover,
  includeBackCover,
  ownerId = game.user.id,
  initialBlockId = "",
  initialBlockLabel = "",
  extensions = {},
  sectionsAsChapters = false
}) {
  if (!game.user?.isGM && String(ownerId || "") !== String(game.user?.id || "")) {
    throw new Error("Players may create Illuminated Documents only for their own user account.");
  }
  const owner = game.users.get(ownerId);
  if (!owner || !canCreateDocuments(owner)) throw new Error("The selected owner is not allowed to create illuminated documents.");
  assertPresetAvailableToUser(presetId, owner);
  const documentName = configuredDocumentName(rawTitle, presetId, owner);
  const destination = await resolveDocumentFolderDestination();
  const metadata = createLiveMetadata({
    title: documentName,
    sourceTitle: rawTitle,
    text,
    presetId,
    includeFrontCover,
    includeBackCover,
    ownerId,
    ownerName: owner?.name || "",
    initialBlockId,
    initialBlockLabel,
    extensions,
    sectionsAsChapters
  });
  await validateMetadata(metadata, { currentUser: owner, isCreation: true, preset: getPresets()[presetId] || null });

  const journal = await JournalEntry.create({
    name: documentName,
    folder: destination.folderId,
    ownership: {
      default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
      [ownerId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    },
    pages: buildJournalPagesForMetadata(metadata, documentName),
    flags: { [MODULE_ID]: { liveDocument: metadata } }
  });

  await extensionRuntime.runLifecycle("onDocumentCreated", {
    document: journal,
    documentUuid: journal.uuid,
    metadata: cloneSerializable(metadata),
    extensionData: metadata.extensions,
    contentBlocks: metadata.contentEntries
  });
  extensionRuntime.rendering.invalidate(journal.uuid);
  return journal;
}

function findLivePage(journal) {
  return Array.from(journal.pages || []).find((page) => getLiveMetadata(page)) || null;
}

function managedJournalPages(journal) {
  return Array.from(journal?.pages || []).filter((page) => getLiveMetadata(page) || getSectionChapterBlockId(page));
}

async function syncSingleJournalPage(journal, metadata) {
  const managed = managedJournalPages(journal);
  let page = findLivePage(journal) || managed[0] || null;
  const source = singlePageSource(metadata, journal.name);
  if (!page) {
    [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [source]);
  } else {
    await journal.updateEmbeddedDocuments("JournalEntryPage", [{
      _id: page.id,
      name: source.name,
      type: source.type,
      sort: source.sort,
      text: source.text,
      [`flags.${MODULE_ID}.liveDocument`]: metadata,
      [`flags.${MODULE_ID}.sectionChapter`]: null
    }]);
  }
  const removeIds = managed.filter((candidate) => candidate.id !== page?.id).map((candidate) => candidate.id);
  if (removeIds.length) await journal.deleteEmbeddedDocuments("JournalEntryPage", removeIds);
  return page;
}

async function syncSectionChapterPages(journal, metadata) {
  const entries = getContentEntries(metadata, { documentUuid: journal.uuid }).entries;
  const managed = managedJournalPages(journal);
  const byBlockId = new Map(managed.map((page) => [getSectionChapterBlockId(page), page]).filter(([blockId]) => blockId));
  const legacy = findLivePage(journal);
  const updates = [];
  const creates = [];
  const retained = new Set();

  for (const [index, entry] of entries.entries()) {
    const source = chapterPageSource(entry, index);
    let page = byBlockId.get(entry.id) || null;
    if (!page && index === 0 && legacy && !retained.has(legacy.id)) page = legacy;
    if (page) {
      retained.add(page.id);
      updates.push({
        _id: page.id,
        name: source.name,
        type: source.type,
        sort: source.sort,
        text: source.text,
        [`flags.${MODULE_ID}.liveDocument`]: null,
        [`flags.${MODULE_ID}.sectionChapter`]: { blockId: String(entry.id) }
      });
    } else {
      creates.push(source);
    }
  }

  if (updates.length) await journal.updateEmbeddedDocuments("JournalEntryPage", updates);
  const created = creates.length ? await journal.createEmbeddedDocuments("JournalEntryPage", creates) : [];
  for (const page of created) retained.add(page.id);
  const removeIds = managed
    .filter((page) => !retained.has(page.id))
    .map((page) => page.id);
  if (removeIds.length) await journal.deleteEmbeddedDocuments("JournalEntryPage", removeIds);
  return Array.from(journal.pages || []).find((page) => getSectionChapterBlockId(page) === String(entries[0]?.id || "")) || created[0] || null;
}

export async function syncJournalPagesForMetadata(journal, metadata) {
  const normalized = ensureDocumentExtensionEnvelope(metadata);
  return usesSectionChapters(normalized)
    ? syncSectionChapterPages(journal, normalized)
    : syncSingleJournalPage(journal, normalized);
}

export async function saveLiveMetadataToJournal(journal, metadata, { reason = "update", previousMetadata = null } = {}) {
  const normalized = ensureDocumentExtensionEnvelope(metadata);
  await journal.update({ [`flags.${MODULE_ID}.liveDocument`]: normalized });

  const page = await syncJournalPagesForMetadata(journal, normalized);

  extensionRuntime.rendering.invalidate(journal.uuid);
  hookCallAll(EXTENSION_HOOKS.DATA_CHANGED, Object.freeze({
    documentUuid: journal.uuid,
    reason,
    extensionIds: Object.keys(normalized.extensions || {})
  }));
  await extensionRuntime.runLifecycle("onDocumentUpdated", {
    document: journal,
    documentUuid: journal.uuid,
    reason,
    metadata: cloneSerializable(normalized),
    previousMetadata: previousMetadata ? cloneSerializable(previousMetadata) : null,
    extensionData: normalized.extensions,
    contentBlocks: normalized.contentEntries || []
  });
  return page;
}

function assertRevision(current, expectedRevision) {
  const currentRevision = Number(current?.revision || 0);
  if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== currentRevision) {
    throw new Error("This book changed after it was selected or opened. Reopen it before saving to avoid overwriting newer content.");
  }
}

export async function extendLiveJournal({
  journalId,
  appendedText,
  requesterId = game.user.id,
  expectedRevision = null,
  blockId = "",
  blockExtensions = {},
  startOnNewPage = false,
  label = ""
}) {
  if (!game.user?.isGM && String(requesterId || "") !== String(game.user?.id || "")) {
    throw new Error("Players may extend Illuminated Documents only as their own user account.");
  }
  const journal = game.journal.get(journalId);
  if (!journal) throw new Error("The selected illuminated document no longer exists.");
  const requester = game.users.get(requesterId);
  if (!requester || !canExtendJournal(journal, requester)) throw new Error("You do not have permission to extend this illuminated document.");
  const current = getJournalLiveMetadata(journal);
  if (!current) throw new Error("The selected Journal is not an Illuminated Document.");
  assertRevision(current, expectedRevision);

  const metadata = buildExtendedMetadata(current, appendedText, {
    userId: requester.id,
    userName: requester.name,
    blockId,
    blockExtensions,
    startOnNewPage,
    label,
    documentUuid: journal.uuid
  });
  await validateMetadata(metadata, { document: journal, documentUuid: journal.uuid, currentUser: requester, isExtension: true });
  await saveLiveMetadataToJournal(journal, metadata, { reason: "extend", previousMetadata: current });
  return { journal, metadata };
}

export async function editLiveJournal({
  journalId,
  entries,
  presetId,
  includeFrontCover,
  includeBackCover,
  sectionsAsChapters = null,
  extensions = null,
  requesterId = game.user.id,
  expectedRevision = null
}) {
  if (!game.user?.isGM && String(requesterId || "") !== String(game.user?.id || "")) {
    throw new Error("Players may edit Illuminated Documents only as their own user account.");
  }
  const journal = game.journal.get(journalId);
  if (!journal) throw new Error("The selected illuminated document no longer exists.");
  const requester = game.users.get(requesterId);
  if (!requester || !canEditJournal(journal, requester)) throw new Error("You do not have permission to edit this illuminated document.");
  const current = getJournalLiveMetadata(journal);
  if (!current) throw new Error("The selected Journal is not an Illuminated Document.");
  assertRevision(current, expectedRevision);
  if (String(presetId || "") !== String(current.presetId || "")) assertPresetAvailableToUser(presetId, requester);

  const metadata = buildEditedMetadata(current, {
    entries,
    presetId,
    includeFrontCover,
    includeBackCover,
    sectionsAsChapters,
    extensions
  }, {
    userId: requester.id,
    userName: requester.name,
    documentUuid: journal.uuid
  });
  await validateMetadata(metadata, { document: journal, documentUuid: journal.uuid, currentUser: requester, isEdit: true });
  await saveLiveMetadataToJournal(journal, metadata, { reason: "edit", previousMetadata: current });
  return { journal, metadata };
}

export async function exportIlluminatedDocument(journalOrId) {
  const journal = typeof journalOrId === "string" ? game.journal.get(journalOrId) : journalOrId;
  const metadata = getJournalLiveMetadata(journal);
  if (!journal || !metadata) throw new Error("The selected Journal is not an Illuminated Document.");
  if (!journal.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) && !game.user.isGM) {
    throw new Error("You do not have permission to export this Illuminated Document.");
  }
  return buildDocumentExport({ journal, metadata, runtime: extensionRuntime });
}

export async function importIlluminatedDocument(payload, {
  ownerId = game.user.id,
  folderId = null,
  name = ""
} = {}) {
  if (!game.user.isGM) throw new Error("Only a Game Master can import Illuminated Documents.");
  const normalized = await normalizeDocumentImport(payload, extensionRuntime);
  const metadata = ensureDocumentExtensionEnvelope(normalized.metadata);
  const owner = game.users.get(ownerId) || game.user;
  await validateMetadata(metadata, { currentUser: owner, isImport: true });
  const destination = folderId === null ? await resolveDocumentFolderDestination() : { folderId };
  const documentName = String(name || normalized.name || metadata.title || "Imported Illuminated Document");
  metadata.title = documentName;
  const journal = await JournalEntry.create({
    name: documentName,
    folder: destination.folderId,
    ownership: Object.keys(normalized.ownership || {}).length ? normalized.ownership : {
      default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
      [owner.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    },
    pages: buildJournalPagesForMetadata(metadata, documentName),
    flags: { [MODULE_ID]: { liveDocument: metadata } }
  });
  await extensionRuntime.runLifecycle("onDocumentCreated", {
    document: journal,
    documentUuid: journal.uuid,
    imported: true,
    metadata: cloneSerializable(metadata),
    extensionData: metadata.extensions,
    contentBlocks: metadata.contentEntries || []
  });
  return journal;
}

export async function duplicateIlluminatedDocument(journalOrId, { name = "", folderId = null } = {}) {
  if (!game.user.isGM) throw new Error("Only a Game Master can duplicate Illuminated Documents through the extension API.");
  const journal = typeof journalOrId === "string" ? game.journal.get(journalOrId) : journalOrId;
  const current = getJournalLiveMetadata(journal);
  if (!journal || !current) throw new Error("The selected Journal is not an Illuminated Document.");
  const { metadata, blockIdMap } = duplicateMetadata(current);
  const documentName = String(name || `${journal.name} Copy`);
  metadata.title = documentName;
  metadata.sourceTitle = String(metadata.sourceTitle || documentName);
  const duplicate = await JournalEntry.create({
    name: documentName,
    folder: folderId === null ? journal.folder?.id || journal.folder || null : folderId,
    ownership: cloneSerializable(journal.ownership || {}),
    pages: buildJournalPagesForMetadata(metadata, documentName),
    flags: { [MODULE_ID]: { liveDocument: metadata } }
  });
  await extensionRuntime.runLifecycle("onDocumentCreated", {
    document: duplicate,
    documentUuid: duplicate.uuid,
    duplicatedFrom: journal.uuid,
    blockIdMap,
    metadata: cloneSerializable(metadata),
    extensionData: metadata.extensions,
    contentBlocks: metadata.contentEntries || []
  });
  return { journal: duplicate, blockIdMap };
}
