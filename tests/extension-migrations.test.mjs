// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { ExtensionRegistry } from "../scripts/extensions/registry.js";
import { ExtensionSafeExecutor } from "../scripts/extensions/safe-executor.js";
import { ExtensionMigrationService } from "../scripts/extensions/migrations.js";

const originalError = console.error;
console.error = () => {};
globalThis.Hooks = { callAll: () => {} };
globalThis.game = { release: { isDevelopment: false } };
globalThis.CONFIG = {};

const executor = new ExtensionSafeExecutor();
const registry = new ExtensionRegistry({ executor });
let migrations = 0;
registry.register({
  id: "migrating",
  schemaVersion: 2,
  hooks: {
    migrateMetadata: ({ storedSchemaVersion, documentData }) => {
      migrations += 1;
      return { documentData: { ...documentData, migratedFrom: storedSchemaVersion } };
    }
  }
});
registry.register({
  id: "failing",
  schemaVersion: 3,
  hooks: { migrateMetadata: () => { throw new Error("migration failed"); } }
});
registry.register({ id: "pending", schemaVersion: 4 });

const service = new ExtensionMigrationService({ registry, executor });
const source = {
  extensions: {
    migrating: { schemaVersion: 1, document: { keep: true }, blocks: {}, orphanedBlocks: {} },
    failing: { schemaVersion: 1, document: { safe: true }, blocks: {}, orphanedBlocks: {} },
    pending: { schemaVersion: 1, document: { untouched: true }, blocks: {}, orphanedBlocks: {} },
    "missing-extension": { schemaVersion: 9, document: { opaque: true }, blocks: {}, orphanedBlocks: {} }
  }
};
const result = await service.migrateMetadata(source, { documentUuid: "JournalEntry.test" });
assert.equal(result.metadata.extensions.migrating.schemaVersion, 2);
assert.deepEqual(result.metadata.extensions.migrating.document, { keep: true, migratedFrom: 1 });
assert.equal(result.metadata.extensions.failing.schemaVersion, 1, "Failed migration must not advance schema version");
assert.deepEqual(result.metadata.extensions.failing.document, { safe: true });
assert.equal(result.metadata.extensions.pending.schemaVersion, 1, "Missing migration callback remains pending");
assert.equal(result.metadata.extensions["missing-extension"].schemaVersion, 9, "Unknown extension data remains untouched");
assert.equal(migrations, 1);

const again = await service.migrateMetadata(result.metadata, { documentUuid: "JournalEntry.test" });
assert.equal(migrations, 1, "Successful migrations are idempotent once schema version advances");
assert.equal(again.metadata.extensions.migrating.schemaVersion, 2);

const dryRunSource = {
  extensions: { migrating: { schemaVersion: 0, document: {}, blocks: {}, orphanedBlocks: {} } }
};
const dryRun = await service.migrateMetadata(dryRunSource, { dryRun: true });
assert.equal(dryRun.metadata.extensions.migrating.schemaVersion, 0, "Dry runs do not return mutated authoritative metadata");
assert.equal(dryRun.preview.extensions.migrating.schemaVersion, 2);

console.error = originalError;
console.log("extension migration tests passed");
