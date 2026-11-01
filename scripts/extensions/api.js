// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID } from "../settings.js";
import { getContentEntries } from "../content-entries.js";
import {
  duplicateIlluminatedDocument,
  exportIlluminatedDocument,
  getJournalLiveMetadata,
  getLiveMetadata,
  importIlluminatedDocument,
  saveLiveMetadataToJournal
} from "../documents.js";
import { getPresets, savePresets } from "../presets.js";
import { EXTENSION_API_VERSION } from "./constants.js";
import { exportMetadataPayload, importMetadataPayload } from "./transfer.js";
import { extensionRuntime } from "./runtime.js";
import {
  getBlockExtensionData,
  getDocumentExtensionData,
  setBlockExtensionData,
  setDocumentExtensionData
} from "./metadata.js";
import { cloneSerializable, deepFreeze, satisfiesVersion } from "./utils.js";

function resolveJournal(documentOrUuid) {
  if (!documentOrUuid) return null;
  if (typeof documentOrUuid === "string") {
    const sync = globalThis.fromUuidSync?.(documentOrUuid);
    if (sync?.documentName === "JournalEntry") return sync;
    if (sync?.documentName === "JournalEntryPage") return sync.parent;
    return globalThis.game?.journal?.get?.(documentOrUuid) || null;
  }
  if (documentOrUuid.documentName === "JournalEntry") return documentOrUuid;
  if (documentOrUuid.documentName === "JournalEntryPage") return documentOrUuid.parent;
  return documentOrUuid.parent?.documentName === "JournalEntry" ? documentOrUuid.parent : null;
}

function assertIlluminatedJournal(documentOrUuid) {
  const journal = resolveJournal(documentOrUuid);
  const metadata = getJournalLiveMetadata(journal) || getLiveMetadata(documentOrUuid);
  if (!journal || !metadata) throw new Error("The target is not an Illuminated Document.");
  if (!globalThis.game?.user?.isGM) {
    const observerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
    if (!journal.testUserPermission?.(globalThis.game?.user, observerLevel)) {
      throw new Error("You do not have permission to read this Illuminated Document.");
    }
  }
  return { journal, metadata };
}

function assertCanUpdate(journal) {
  if (globalThis.game?.user?.isGM) return;
  const ownerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  if (!journal.testUserPermission?.(globalThis.game?.user, ownerLevel)) {
    throw new Error("You do not have Owner permission for this Illuminated Document.");
  }
}

async function updateExtensionData(journal, previous, next, extensionId, reason) {
  const extension = extensionRuntime.registry.getInternal(extensionId);
  if (!extension) throw new Error(`Extension "${extensionId}" is not registered.`);
  const validation = await extensionRuntime.validation.validate({
    document: journal,
    documentUuid: journal.uuid,
    currentUser: game.user,
    metadata: next,
    contentBlocks: getContentEntries(next, { documentUuid: journal.uuid }).entries,
    extensionData: next.extensions || {}
  });
  extensionRuntime.validation.assertNoBlockingErrors(validation);
  await saveLiveMetadataToJournal(journal, next, { reason, previousMetadata: previous });
  return cloneSerializable(next.extensions?.[extensionId] || {});
}

/** Build the stable public extension API. Internal services are intentionally not exposed. */
export function createExtensionApi(coreApi = {}) {
  const api = {
    ...coreApi,

    /** Extension API semantic version, independent from the module version. */
    version: EXTENSION_API_VERSION,

    /** Current lifecycle state: init, ready, or another documented transitional state. */
    get lifecycle() {
      return deepFreeze({ phase: extensionRuntime.phase, registrationAllowed: ["init", "ready"].includes(extensionRuntime.phase) });
    },

    /** Register one installed companion module. Throws for malformed or duplicate registrations. */
    registerExtension(extension, options = {}) {
      try {
        return extensionRuntime.registry.register(extension, options);
      } catch (error) {
        console.error(`${MODULE_ID} | Extension registration failed for ${extension?.id || "unknown extension"}`, error);
        throw error;
      }
    },

    /** Unregister an extension without deleting any stored metadata. */
    unregisterExtension(extensionId) {
      return extensionRuntime.registry.unregister(extensionId);
    },

    /** Return an immutable public descriptor, or null. */
    getExtension(extensionId) {
      return extensionRuntime.registry.get(extensionId);
    },

    /** Return immutable descriptors in deterministic priority and ID order. */
    getExtensions() {
      return extensionRuntime.registry.list();
    },

    /** Test whether an extension ID is currently registered. */
    hasExtension(extensionId) {
      return extensionRuntime.registry.has(extensionId);
    },

    /** Check a semantic API range such as ^1.0.0, ~1.0.0, >=1.0.0, or 1.x. */
    isApiVersionSupported(range) {
      return satisfiesVersion(EXTENSION_API_VERSION, range);
    },

    /** Throw an actionable compatibility error when the requested API range is unsupported. */
    assertApiVersion(range) {
      if (!satisfiesVersion(EXTENSION_API_VERSION, range)) {
        throw new Error(`Illuminated Documents extension API ${EXTENSION_API_VERSION} does not satisfy required range "${range}".`);
      }
      return true;
    },

    /** Read a deep-cloned extension-owned document payload. */
    getDocumentExtensionData(documentOrUuid, extensionId) {
      const { metadata } = assertIlluminatedJournal(documentOrUuid);
      return getDocumentExtensionData(metadata, extensionId);
    },

    /** Persist extension-owned document data. Requires Owner permission or GM status. */
    async setDocumentExtensionData(documentOrUuid, extensionId, data) {
      const { journal, metadata } = assertIlluminatedJournal(documentOrUuid);
      assertCanUpdate(journal);
      const extension = extensionRuntime.registry.getInternal(extensionId);
      if (!extension) throw new Error(`Extension "${extensionId}" is not registered.`);
      const next = setDocumentExtensionData(metadata, extensionId, data, { schemaVersion: extension.schemaVersion });
      return updateExtensionData(journal, metadata, next, extensionId, "extension-document-data");
    },

    /** Read a deep-cloned extension-owned payload for one stable content-block ID. */
    getBlockExtensionData(documentOrUuid, blockId, extensionId) {
      const { metadata } = assertIlluminatedJournal(documentOrUuid);
      return getBlockExtensionData(metadata, blockId, extensionId);
    },

    /** Persist extension-owned block data. Requires Owner permission or GM status. */
    async setBlockExtensionData(documentOrUuid, blockId, extensionId, data) {
      const { journal, metadata } = assertIlluminatedJournal(documentOrUuid);
      assertCanUpdate(journal);
      const extension = extensionRuntime.registry.getInternal(extensionId);
      if (!extension) throw new Error(`Extension "${extensionId}" is not registered.`);
      const next = setBlockExtensionData(metadata, blockId, extensionId, data, { schemaVersion: extension.schemaVersion });
      return updateExtensionData(journal, metadata, next, extensionId, "extension-block-data");
    },

    /** Run every active field and extension validator without mutating the document. */
    async validateExtensionData(documentOrUuid) {
      const { journal, metadata } = assertIlluminatedJournal(documentOrUuid);
      return extensionRuntime.validation.validate({
        document: journal,
        documentUuid: journal.uuid,
        currentUser: game.user,
        metadata,
        contentBlocks: getContentEntries(metadata, { documentUuid: journal.uuid }).entries,
        extensionData: metadata.extensions || {}
      });
    },

    /** Run registered extension migrations and persist only successfully migrated records. */
    async migrateExtensionData(documentOrUuid, { dryRun = false } = {}) {
      const { journal, metadata } = assertIlluminatedJournal(documentOrUuid);
      if (!dryRun) assertCanUpdate(journal);
      const result = await extensionRuntime.migrations.migrateMetadata(metadata, {
        document: journal,
        documentUuid: journal.uuid,
        dryRun
      });
      if (!dryRun && JSON.stringify(result.metadata) !== JSON.stringify(metadata)) {
        await saveLiveMetadataToJournal(journal, result.metadata, { reason: "extension-migration", previousMetadata: metadata });
      }
      return cloneSerializable(result);
    },

    /**
     * Invalidate host-owned viewer render state for one document and optional extension.
     *
     * This public extension-to-host call deliberately does not invoke extension
     * `invalidateCache` callbacks. Host-originated document changes invoke those
     * callbacks separately, preventing an extension from being called back by the
     * invalidation request it just submitted.
     */
    invalidateDocumentRender(documentUuid, extensionId = "") {
      extensionRuntime.rendering.invalidate(documentUuid, extensionId, {
        notifyExtensions: false,
        reason: "extension-api"
      });
    },

    /** Request rerendering of open Illuminated Document views, optionally limited to one UUID. */
    rerenderOpenDocumentViews(documentUuid = "") {
      return extensionRuntime.rendering.rerender(documentUuid);
    },

    /** Export a safe serializable Illuminated Document package including unknown extension data. */
    exportDocument(documentOrUuid) {
      return exportIlluminatedDocument(resolveJournal(documentOrUuid) || documentOrUuid);
    },

    /** Import a previously exported package. GM-only. */
    importDocument(payload, options = {}) {
      return importIlluminatedDocument(payload, options);
    },

    /** Duplicate a document with new block IDs and remapped extension block metadata. GM-only. */
    duplicateDocument(documentOrUuid, options = {}) {
      return duplicateIlluminatedDocument(resolveJournal(documentOrUuid) || documentOrUuid, options);
    },

    /** Export one preset, including registered and unknown extension defaults. */
    async exportPreset(presetId) {
      const preset = getPresets()[String(presetId || "")];
      if (!preset) throw new Error("The selected book preset does not exist.");
      const extensions = await exportMetadataPayload({ extensions: preset.extensions || {} }, extensionRuntime, {
        kind: "preset",
        presetId: preset.id,
        preset: cloneSerializable(preset)
      });
      return cloneSerializable({
        format: "runyth-illuminated-documents-preset",
        version: 1,
        apiVersion: EXTENSION_API_VERSION,
        preset: { ...preset, extensions }
      });
    },

    /** Import one preset while preserving unknown extension defaults. GM-only. */
    async importPreset(payload, { replace = false } = {}) {
      if (!game.user.isGM) throw new Error("Only a Game Master can import book presets.");
      if (payload?.format !== "runyth-illuminated-documents-preset" || Number(payload?.version) !== 1 || !payload?.preset?.id) {
        throw new Error("Unsupported Illuminated Documents preset export.");
      }
      const presets = getPresets();
      const id = String(payload.preset.id);
      if (presets[id] && !replace) throw new Error(`Book preset "${id}" already exists.`);
      const importedExtensions = await importMetadataPayload(payload.preset.extensions || {}, extensionRuntime, {
        kind: "preset",
        presetId: id
      });
      const migrationEnvelope = {
        extensions: Object.fromEntries(Object.entries(importedExtensions).map(([extensionId, record]) => [extensionId, {
          ...record,
          blocks: { __presetDefault: cloneSerializable(record?.blockDefaults || record?.blocks?.__presetDefault || {}) }
        }]))
      };
      const migration = await extensionRuntime.migrations.migrateMetadata(migrationEnvelope, {
        document: null,
        documentUuid: `Preset.${id}`,
        dryRun: false
      });
      const extensions = Object.fromEntries(Object.entries(migration.metadata.extensions || {}).map(([extensionId, record]) => [extensionId, {
        ...record,
        blockDefaults: cloneSerializable(record.blocks?.__presetDefault || record.blockDefaults || {}),
        blocks: undefined
      }]));
      for (const record of Object.values(extensions)) delete record.blocks;
      presets[id] = cloneSerializable({ ...payload.preset, extensions });
      await savePresets(presets);
      return cloneSerializable(presets[id]);
    },

    /** Return a sanitized diagnostics snapshot suitable for a GM-facing report. */
    getExtensionDiagnostics() {
      return cloneSerializable(extensionRuntime.diagnostics());
    }
  };

  return Object.freeze(api);
}

export function resolveApiJournal(documentOrUuid) {
  return resolveJournal(documentOrUuid);
}
