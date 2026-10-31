// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

globalThis.foundry = undefined;
globalThis.crypto ??= { randomUUID: () => "extension-id" };

const {
  buildExtendedMetadata,
  combineDocumentText,
  createLiveMetadata
} = await import("../scripts/documents.js");

assert.equal(combineDocumentText("Chapter one", "Chapter two"), "Chapter one\n\nChapter two");
assert.equal(combineDocumentText("Chapter one\n\n", "\nChapter two\n"), "Chapter one\n\nChapter two");
assert.equal(combineDocumentText("", "First entry"), "First entry");
assert.equal(combineDocumentText("Existing", "   "), "Existing");

const original = createLiveMetadata({
  title: "Campaign Chronicle",
  text: "# Session One\n\nThe party arrived.",
  presetId: "open-book",
  includeFrontCover: true,
  includeBackCover: true,
  ownerId: "user-1",
  ownerName: "Akito",
  now: 1000
});

const extended = buildExtendedMetadata(original, "# Session Two\n\nThe party returned.", {
  userId: "user-1",
  userName: "Akito",
  startOnNewPage: true,
  now: 2000
});

assert.equal(extended.sourceText, "# Session One\n\nThe party arrived.\n\n# Session Two\n\nThe party returned.");
assert.equal(extended.presetId, "open-book");
assert.equal(extended.includeFrontCover, true);
assert.equal(extended.includeBackCover, true);
assert.equal(extended.revision, 1);
assert.equal(extended.updatedAt, 2000);
assert.equal(extended.extensionHistory.length, 1);
assert.equal(extended.extensionHistory[0].userId, "user-1");
assert.equal(extended.extensionHistory[0].characterCount, 34);
assert.equal(extended.extensionHistory[0].startOnNewPage, true);
assert.equal(extended.contentEntries[1].startOnNewPage, true);
assert.equal(original.revision, 0, "the original metadata must not be mutated");
assert.equal(original.extensionHistory.length, 0, "the original history must not be mutated");

assert.throws(
  () => buildExtendedMetadata(original, "   "),
  /Enter additional text/
);

const requester = { id: "user-1", name: "Akito", isGM: false };
const journalUpdates = [];
const pageUpdates = [];
const page = {
  id: "page-1",
  type: "text",
  getFlag: () => original
};
const journal = {
  id: "journal-1",
  name: "Campaign Chronicle",
  pages: [page],
  getFlag: () => original,
  testUserPermission: () => true,
  async update(update) {
    journalUpdates.push(update);
  },
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
  settings: {
    get() {
      return [requester.id];
    }
  }
};

const { metadata: savedMetadata } = await (await import("../scripts/documents.js")).extendLiveJournal({
  journalId: journal.id,
  appendedText: "# Session Three",
  requesterId: requester.id,
  expectedRevision: 0,
  startOnNewPage: true
});

assert.equal(savedMetadata.revision, 1);
assert.equal(savedMetadata.contentEntries.at(-1).startOnNewPage, true);
assert.equal(journalUpdates.length, 1);
assert.equal(pageUpdates.length, 1);
assert.equal(pageUpdates[0]._id, page.id);
assert.match(pageUpdates[0].text.content, /idoc-live-document-root/);
assert.equal(pageUpdates[0]["flags.runyth-illuminated-documents.liveDocument"].sourceText.endsWith("# Session Three"), true);

await assert.rejects(
  () => (import("../scripts/documents.js")).then(({ extendLiveJournal }) => extendLiveJournal({
    journalId: journal.id,
    appendedText: "Conflicting append",
    requesterId: requester.id,
    expectedRevision: 9
  })),
  /changed after it was selected/
);

console.log("document extension tests passed");
