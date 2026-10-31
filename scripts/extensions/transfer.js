// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import {
  createIndependentBlockIdentityMap,
  ensureDocumentExtensionEnvelope,
  remapExtensionBlockMetadata,
  repairBlockIdentities
} from "./metadata.js";
import { cloneSerializable } from "./utils.js";

export const EXPORT_FORMAT = "runyth-illuminated-documents-export";
export const EXPORT_VERSION = 1;

export async function exportMetadataPayload(metadata, runtime, context = {}) {
  const envelope = ensureDocumentExtensionEnvelope(metadata);
  const extensions = cloneSerializable(envelope.extensions);
  for (const extension of runtime.registry.ordered()) {
    const record = extensions[extension.id];
    if (!record || typeof extension.callbacks.exportMetadata !== "function") continue;
    const exported = await runtime.executor.invoke(extension, "exportMetadata", extension.callbacks.exportMetadata, {
      ...context,
      extensionId: extension.id,
      metadata: cloneSerializable(record)
    });
    if (exported !== undefined) extensions[extension.id] = cloneSerializable(exported);
  }
  return extensions;
}

export async function importMetadataPayload(extensions, runtime, context = {}) {
  const imported = cloneSerializable(extensions || {});
  for (const extension of runtime.registry.ordered()) {
    if (!Object.hasOwn(imported, extension.id) || typeof extension.callbacks.importMetadata !== "function") continue;
    const value = await runtime.executor.invoke(extension, "importMetadata", extension.callbacks.importMetadata, {
      ...context,
      extensionId: extension.id,
      metadata: cloneSerializable(imported[extension.id])
    });
    if (value !== undefined && value !== null) imported[extension.id] = cloneSerializable(value);
  }
  return imported;
}

export async function buildDocumentExport({ journal, metadata, runtime }) {
  const entries = cloneSerializable(metadata.contentEntries || []);
  return {
    format: EXPORT_FORMAT,
    exportVersion: EXPORT_VERSION,
    exportedAt: Date.now(),
    core: {
      name: journal?.name || metadata.title || "Illuminated Document",
      ownership: cloneSerializable(journal?.ownership || {}),
      metadata: {
        ...ensureDocumentExtensionEnvelope(metadata),
        extensions: await exportMetadataPayload(metadata, runtime, {
          document: journal,
          documentUuid: journal?.uuid || ""
        })
      },
      contentEntries: entries
    }
  };
}

export async function normalizeDocumentImport(payload, runtime, { documentUuid = "import" } = {}) {
  if (!payload || payload.format !== EXPORT_FORMAT || Number(payload.exportVersion) !== EXPORT_VERSION) {
    throw new Error("Unsupported Illuminated Documents export format.");
  }
  const source = cloneSerializable(payload.core?.metadata || {});
  const entriesSource = Array.isArray(payload.core?.contentEntries) ? payload.core.contentEntries : source.contentEntries || [];
  const repaired = repairBlockIdentities(entriesSource, { documentUuid });
  source.contentEntries = repaired.entries;
  source.extensions = await importMetadataPayload(source.extensions || {}, runtime, { documentUuid });
  if (repaired.changed) source.extensions = remapExtensionBlockMetadata(source, repaired.mapping).extensions;
  let metadata = ensureDocumentExtensionEnvelope(source);
  if (runtime.migrations?.migrateMetadata) {
    const migration = await runtime.migrations.migrateMetadata(metadata, {
      document: null,
      documentUuid,
      dryRun: false
    });
    metadata = migration.metadata;
  }
  return {
    name: String(payload.core?.name || source.title || "Imported Illuminated Document"),
    ownership: cloneSerializable(payload.core?.ownership || {}),
    metadata,
    repairedBlockIds: repaired.changed
  };
}

export function duplicateMetadata(metadata) {
  const envelope = ensureDocumentExtensionEnvelope(metadata);
  const { entries, mapping } = createIndependentBlockIdentityMap(envelope.contentEntries || []);
  const duplicated = remapExtensionBlockMetadata({ ...envelope, contentEntries: entries }, mapping);
  duplicated.revision = 0;
  duplicated.createdAt = Date.now();
  duplicated.updatedAt = duplicated.createdAt;
  duplicated.extensionHistory = [];
  duplicated.editHistory = [];
  return { metadata: duplicated, blockIdMap: Object.fromEntries(mapping) };
}
