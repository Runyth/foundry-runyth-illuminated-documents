// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

let metadata = {
  version: 6,
  schemaVersion: 6,
  title: "Book",
  sourceText: "Text",
  contentEntries: [{ id: "block-a", label: "Initial", kind: "initial", text: "Text" }],
  extensions: {}
};
const page = {
  id: "page-1",
  type: "text",
  documentName: "JournalEntryPage",
  getFlag: () => metadata
};
const journal = {
  id: "journal-1",
  uuid: "JournalEntry.journal-1",
  documentName: "JournalEntry",
  name: "Book",
  pages: [page],
  getFlag: () => metadata,
  testUserPermission: (user, level) => user?.id !== "blocked" && level <= 2,
  async update(changes) {
    metadata = changes["flags.runyth-illuminated-documents.liveDocument"] || metadata;
  },
  async updateEmbeddedDocuments(_type, changes) {
    metadata = changes[0]["flags.runyth-illuminated-documents.liveDocument"] || metadata;
  }
};
page.parent = journal;

globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2, OWNER: 3 },
  JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 }
};
globalThis.Hooks = { callAll: () => {} };
globalThis.game = {
  user: { id: "player", isGM: false },
  journal: new Map([[journal.id, journal]]),
  modules: new Map([["runyth-illuminated-documents", { version: "1.12.2" }]])
};
globalThis.fromUuidSync = (uuid) => uuid === journal.uuid ? journal : null;

const { createExtensionApi } = await import("../scripts/extensions/api.js");
const { extensionRuntime } = await import("../scripts/extensions/runtime.js");
extensionRuntime.setPhase("ready");
const api = createExtensionApi();
api.registerExtension({ id: "api-test", schemaVersion: 1 });

assert.equal(api.version, "1.0.0");
assert.equal(api.isApiVersionSupported("^1.0.0"), true);
assert.equal(api.isApiVersionSupported(">=2.0.0"), false);
assert.throws(() => api.assertApiVersion("2.x"), /does not satisfy/);
assert.equal(api.hasExtension("api-test"), true);
assert.throws(() => { api.getExtensions()[0].capabilities.push("bad"); }, TypeError);
assert.deepEqual(api.getDocumentExtensionData(journal, "api-test"), {});
game.user = { id: "blocked", isGM: false };
assert.throws(() => api.getDocumentExtensionData(journal, "api-test"), /permission to read/);
game.user = { id: "player", isGM: false };

await assert.rejects(
  () => api.setDocumentExtensionData(journal, "api-test", { value: 1 }),
  /Owner permission/
);

game.user = { id: "gm", isGM: true };
await api.setDocumentExtensionData(journal, "api-test", { value: 1 });
assert.deepEqual(api.getDocumentExtensionData(journal, "api-test"), { value: 1 });
const clone = api.getDocumentExtensionData(journal, "api-test");
clone.value = 99;
assert.deepEqual(api.getDocumentExtensionData(journal, "api-test"), { value: 1 }, "Public reads return independent data");
await api.setBlockExtensionData(journal, "block-a", "api-test", { value: "block" });
assert.deepEqual(api.getBlockExtensionData(journal, "block-a", "api-test"), { value: "block" });
assert.throws(() => api.getBlockExtensionData(journal, "", "api-test"), /stable block ID/);

let apiInvalidationCallbacks = 0;
api.registerExtension({
  id: "api-invalidation-test",
  hooks: { invalidateCache: () => { apiInvalidationCallbacks += 1; } }
});
const apiInvalidationBefore = extensionRuntime.rendering.cacheSignature(journal.uuid);
api.invalidateDocumentRender(journal.uuid, "api-invalidation-test");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(apiInvalidationCallbacks, 0, "Public invalidation must not invoke extension callbacks");
assert.notEqual(extensionRuntime.rendering.cacheSignature(journal.uuid), apiInvalidationBefore);

const diagnostics = api.getExtensionDiagnostics();
assert.equal(diagnostics.apiVersion, "1.0.0");
assert.ok(diagnostics.extensions.some((extension) => extension.id === "api-test"));

console.log("extension public API tests passed");
