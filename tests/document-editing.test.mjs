// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

let uuidCounter = 0;
globalThis.foundry = undefined;
Object.defineProperty(globalThis, "crypto", { value: { randomUUID: () => `uuid-${++uuidCounter}` }, configurable: true });

const {
  buildEditedMetadata,
  buildExtendedMetadata,
  createLiveMetadata,
  editLiveJournal
} = await import("../scripts/documents.js");
const {
  combineContentEntries,
  getContentEntries
} = await import("../scripts/content-entries.js");

let metadata = createLiveMetadata({
  title: "Campaign Chronicle",
  sourceTitle: "Campaign Chronicle",
  text: "# Session One\n\nArrival in Velia.",
  presetId: "open-book",
  includeFrontCover: true,
  includeBackCover: true,
  ownerId: "user-1",
  ownerName: "Player",
  now: 1000
});
metadata = buildExtendedMetadata(metadata, "# Session Two\n\nThe sawmill investigation.", {
  userId: "user-1",
  userName: "Player",
  now: 2000
});
metadata = buildExtendedMetadata(metadata, "# Session Three\n\nThe hidden ledger.", {
  userId: "user-1",
  userName: "Player",
  now: 3000
});
metadata = buildExtendedMetadata(metadata, "# Session Four\n\nReturn to Velia.", {
  userId: "user-1",
  userName: "Player",
  now: 4000
});

const structured = getContentEntries(metadata);
assert.equal(structured.migrationMode, "structured");
assert.equal(structured.entries.length, 4);
assert.equal(structured.entries[2].text.includes("Session Three"), true);

// Remove the third input and place Session Four before Session Two.
const editedEntries = [
  structured.entries[0],
  { ...structured.entries[3], startOnNewPage: true },
  { ...structured.entries[1], label: "Sawmill session", startOnNewPage: true }
];
const edited = buildEditedMetadata(metadata, {
  entries: editedEntries,
  presetId: "torn-ledger",
  includeFrontCover: false,
  includeBackCover: false
}, {
  userId: "user-1",
  userName: "Player",
  now: 5000
});

assert.equal(edited.contentEntries.length, 3);
assert.equal(edited.sourceText.includes("Session Three"), false);
assert.equal(edited.sourceText.indexOf("Session Four") < edited.sourceText.indexOf("Session Two"), true);
assert.equal(edited.contentEntries[2].label, "Sawmill session");
assert.deepEqual(edited.contentEntries.map((entry) => entry.startOnNewPage), [false, true, true]);
assert.equal(edited.presetId, "torn-ledger");
assert.equal(edited.includeFrontCover, false);
assert.equal(edited.includeBackCover, false);
assert.equal(edited.revision, 4);
assert.equal(edited.editHistory.length, 1);
assert.equal(edited.editHistory[0].removedEntryIds.length, 1);
assert.equal(edited.editHistory[0].orderChanged, true);
assert.equal(edited.editHistory[0].presetChanged, true);
assert.equal(edited.editHistory[0].pageFlowChanged, true);
assert.equal(combineContentEntries(edited.contentEntries), edited.sourceText);

// Version 4 books can be reconstructed because append history stores exact lengths.
const legacyInitial = "Initial text";
const legacyAppendOne = "First append";
const legacyAppendTwo = "Second append";
const legacy = {
  version: 4,
  sourceText: `${legacyInitial}\n\n${legacyAppendOne}\n\n${legacyAppendTwo}`,
  createdAt: 100,
  updatedAt: 300,
  createdBy: { userId: "user-1", userName: "Player" },
  extensionHistory: [
    { id: "append-1", userId: "user-1", userName: "Player", appendedAt: 200, characterCount: legacyAppendOne.length },
    { id: "append-2", userId: "user-1", userName: "Player", appendedAt: 300, characterCount: legacyAppendTwo.length }
  ]
};
const reconstructed = getContentEntries(legacy);
assert.equal(reconstructed.migrationMode, "reconstructed");
assert.deepEqual(reconstructed.entries.map((entry) => entry.text), [legacyInitial, legacyAppendOne, legacyAppendTwo]);

const requester = { id: "user-1", name: "Player", isGM: false };
const journalUpdates = [];
const pageUpdates = [];
const page = { id: "page-1", type: "text", getFlag: () => metadata };
const journal = {
  id: "journal-1",
  name: "Campaign Chronicle",
  pages: [page],
  getFlag: () => metadata,
  testUserPermission: () => true,
  async update(update) { journalUpdates.push(update); },
  async updateEmbeddedDocuments(type, updates) {
    assert.equal(type, "JournalEntryPage");
    pageUpdates.push(...updates);
    return [];
  }
};

globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 },
  JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 }
};
globalThis.game = {
  user: requester,
  users: new Map([[requester.id, requester]]),
  journal: new Map([[journal.id, journal]]),
  settings: { get: () => [requester.id] }
};

const saved = await editLiveJournal({
  journalId: journal.id,
  entries: editedEntries,
  presetId: "torn-ledger",
  includeFrontCover: false,
  includeBackCover: false,
  requesterId: requester.id,
  expectedRevision: metadata.revision
});
assert.equal(saved.metadata.presetId, "torn-ledger");
assert.equal(journalUpdates.length, 1);
assert.equal(pageUpdates.length, 1);
assert.equal(pageUpdates[0]["flags.runyth-illuminated-documents.liveDocument"].contentEntries.length, 3);

await assert.rejects(
  () => editLiveJournal({
    journalId: journal.id,
    entries: editedEntries,
    presetId: "torn-ledger",
    includeFrontCover: false,
    includeBackCover: false,
    requesterId: requester.id,
    expectedRevision: 99
  }),
  /changed after it was selected or opened/
);

console.log("document editing tests passed");
