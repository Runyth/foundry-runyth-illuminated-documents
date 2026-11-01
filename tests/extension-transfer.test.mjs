// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { ExtensionRegistry } from "../scripts/extensions/registry.js";
import { ExtensionSafeExecutor } from "../scripts/extensions/safe-executor.js";
import { ExtensionMigrationService } from "../scripts/extensions/migrations.js";
import {
  buildDocumentExport,
  normalizeDocumentImport
} from "../scripts/extensions/transfer.js";

globalThis.Hooks = { callAll: () => {} };
globalThis.game = { release: { isDevelopment: false } };
globalThis.CONFIG = {};
const executor = new ExtensionSafeExecutor();
const registry = new ExtensionRegistry({ executor });
registry.register({
  id: "transfer-extension",
  schemaVersion: 2,
  hooks: {
    exportMetadata: ({ metadata }) => ({ ...metadata, document: { ...metadata.document, exported: true } }),
    importMetadata: ({ metadata }) => ({ ...metadata, document: { ...metadata.document, imported: true } }),
    migrateMetadata: ({ documentData }) => ({ documentData: { ...documentData, migratedAfterImport: true } })
  }
});
const runtime = { registry, executor, migrations: new ExtensionMigrationService({ registry, executor }) };
const metadata = {
  title: "Book",
  contentEntries: [
    { id: "duplicate", label: "One", kind: "initial", text: "One", startOnNewPage: false },
    { id: "duplicate", label: "Two", kind: "append", text: "Two", startOnNewPage: true }
  ],
  extensions: {
    "transfer-extension": {
      schemaVersion: 1,
      document: { value: 1 },
      blocks: { duplicate: { attached: true } },
      orphanedBlocks: {}
    },
    "unknown-extension": {
      schemaVersion: 4,
      document: { preserved: true },
      blocks: {},
      orphanedBlocks: {},
      opaque: { vendor: 9 }
    }
  }
};
const exported = await buildDocumentExport({
  journal: { name: "Book", uuid: "JournalEntry.source", ownership: {} },
  metadata,
  runtime
});
assert.equal(exported.core.metadata.extensions["transfer-extension"].document.exported, true);
assert.deepEqual(exported.core.metadata.extensions["unknown-extension"].opaque, { vendor: 9 });
const imported = await normalizeDocumentImport(exported, runtime, { documentUuid: "JournalEntry.import" });
assert.equal(imported.metadata.extensions["transfer-extension"].document.imported, true);
assert.equal(imported.metadata.extensions["transfer-extension"].document.migratedAfterImport, true);
assert.equal(imported.metadata.extensions["transfer-extension"].schemaVersion, 2);
assert.equal(new Set(imported.metadata.contentEntries.map((entry) => entry.id)).size, 2);
assert.deepEqual(imported.metadata.contentEntries.map((entry) => entry.startOnNewPage), [false, true]);
assert.deepEqual(imported.metadata.extensions["unknown-extension"].opaque, { vendor: 9 });
await assert.rejects(
  () => normalizeDocumentImport({ format: "wrong", exportVersion: 1 }, runtime),
  /Unsupported/
);
console.log("extension transfer tests passed");
