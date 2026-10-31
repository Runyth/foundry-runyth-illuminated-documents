// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import {
  ensureDocumentExtensionEnvelope,
  getBlockExtensionData,
  getDocumentExtensionData,
  orphanRemovedBlockMetadata,
  repairBlockIdentities,
  setBlockExtensionData,
  setDocumentExtensionData
} from "../scripts/extensions/metadata.js";
import {
  buildDocumentExport,
  duplicateMetadata,
  normalizeDocumentImport
} from "../scripts/extensions/transfer.js";
import { buildEditedMetadata, createLiveMetadata } from "../scripts/documents.js";

const original = createLiveMetadata({
  title: "Book",
  text: "First",
  presetId: "book",
  ownerId: "u1",
  initialBlockId: "block-a",
  extensions: {}
});
let metadata = setDocumentExtensionData(original, "example-extension", { language: "common" }, { schemaVersion: 1 });
metadata = setBlockExtensionData(metadata, "block-a", "example-extension", { language: "elvish" }, { schemaVersion: 1 });
assert.deepEqual(getDocumentExtensionData(metadata, "example-extension"), { language: "common" });
assert.deepEqual(getBlockExtensionData(metadata, "block-a", "example-extension"), { language: "elvish" });
assert.deepEqual(original.extensions, {}, "Metadata setters must not mutate their input");

const unknown = ensureDocumentExtensionEnvelope({
  extensions: {
    "missing-extension": {
      schemaVersion: 7,
      document: { preserved: true },
      blocks: { x: { value: 2 } },
      vendorMetadata: { opaque: "kept" }
    }
  }
});
assert.deepEqual(unknown.extensions["missing-extension"].vendorMetadata, { opaque: "kept" });

const repaired = repairBlockIdentities([
  { id: "same", text: "A", createdAt: 1 },
  { id: "same", text: "B", createdAt: 2 },
  { id: "", text: "C", createdAt: 3 }
], { documentUuid: "JournalEntry.test" });
assert.equal(new Set(repaired.entries.map((entry) => entry.id)).size, 3);
assert.equal(repaired.entries[0].id, "same");
assert.equal(repaired.changed, true);
const reordered = repairBlockIdentities([repaired.entries[2], repaired.entries[0], repaired.entries[1]], { documentUuid: "JournalEntry.test" });
assert.deepEqual(reordered.entries.map((entry) => entry.id), [repaired.entries[2].id, "same", repaired.entries[1].id]);

const orphaned = orphanRemovedBlockMetadata(metadata, ["block-a"]);
assert.deepEqual(orphaned.extensions["example-extension"].blocks, {});
assert.deepEqual(orphaned.extensions["example-extension"].orphanedBlocks["block-a"], { language: "elvish" });

const duplicate = duplicateMetadata(metadata);
assert.notEqual(duplicate.metadata.contentEntries[0].id, "block-a");
assert.deepEqual(
  duplicate.metadata.extensions["example-extension"].blocks[duplicate.metadata.contentEntries[0].id],
  { language: "elvish" }
);
assert.equal(duplicate.blockIdMap["block-a"], duplicate.metadata.contentEntries[0].id);

const runtime = {
  registry: { ordered: () => [] },
  executor: { invoke: async () => undefined }
};
const journal = { name: "Book", uuid: "JournalEntry.book", ownership: { default: 2 } };
const exported = await buildDocumentExport({ journal, metadata: unknown, runtime });
const imported = await normalizeDocumentImport(exported, runtime, { documentUuid: "JournalEntry.imported" });
assert.deepEqual(imported.metadata.extensions["missing-extension"].vendorMetadata, { opaque: "kept" });
assert.equal(imported.metadata.extensions["missing-extension"].schemaVersion, 7);

const edited = buildEditedMetadata(metadata, {
  entries: metadata.contentEntries,
  presetId: "different-preset",
  includeFrontCover: true,
  includeBackCover: false,
  extensions: metadata.extensions
}, { userId: "u1", userName: "Player", documentUuid: "JournalEntry.book", now: 100 });
assert.equal(edited.contentEntries[0].id, "block-a");
assert.deepEqual(edited.extensions["example-extension"].blocks["block-a"], { language: "elvish" });

console.log("extension metadata tests passed");
