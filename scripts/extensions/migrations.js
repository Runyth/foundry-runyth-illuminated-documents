// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { ensureDocumentExtensionEnvelope, normalizeExtensionRecord } from "./metadata.js";
import { cloneSerializable } from "./utils.js";

export class ExtensionMigrationService {
  constructor({ registry, executor }) {
    this.registry = registry;
    this.executor = executor;
  }

  async migrateMetadata(metadata, {
    document = null,
    documentUuid = "",
    dryRun = false
  } = {}) {
    const original = ensureDocumentExtensionEnvelope(metadata);
    const migrated = cloneSerializable(original);
    const results = [];

    for (const extension of this.registry.ordered()) {
      const stored = normalizeExtensionRecord(migrated.extensions[extension.id]);
      if (!migrated.extensions[extension.id] && !extension.schemaVersion) continue;
      if (stored.schemaVersion >= extension.schemaVersion) continue;
      if (typeof extension.callbacks.migrateMetadata !== "function") {
        results.push({ extensionId: extension.id, status: "pending", from: stored.schemaVersion, to: extension.schemaVersion });
        continue;
      }
      const backup = cloneSerializable(stored);
      const response = await this.executor.invoke(extension, "migrateMetadata", extension.callbacks.migrateMetadata, {
        extensionId: extension.id,
        storedSchemaVersion: stored.schemaVersion,
        targetSchemaVersion: extension.schemaVersion,
        documentData: cloneSerializable(stored.document),
        blockData: cloneSerializable(stored.blocks),
        orphanedBlockData: cloneSerializable(stored.orphanedBlocks),
        document,
        documentUuid,
        dryRun
      }, { fallback: null });
      if (!response) {
        migrated.extensions[extension.id] = backup;
        results.push({ extensionId: extension.id, status: "failed", from: stored.schemaVersion, to: extension.schemaVersion });
        continue;
      }
      const next = normalizeExtensionRecord({
        ...stored,
        ...(response.documentData !== undefined ? { document: response.documentData } : {}),
        ...(response.blockData !== undefined ? { blocks: response.blockData } : {}),
        ...(response.orphanedBlockData !== undefined ? { orphanedBlocks: response.orphanedBlockData } : {}),
        schemaVersion: extension.schemaVersion
      });
      migrated.extensions[extension.id] = next;
      results.push({ extensionId: extension.id, status: dryRun ? "dry-run" : "migrated", from: stored.schemaVersion, to: extension.schemaVersion });
    }

    return { metadata: dryRun ? original : migrated, preview: migrated, results };
  }
}
