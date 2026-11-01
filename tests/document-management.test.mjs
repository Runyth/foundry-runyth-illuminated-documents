// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

const settings = new Map([
  ["templates", {}],
  ["presets", {
    "open-book": {
      id: "open-book",
      name: "Open Book",
      leftTemplateId: "parchment-page",
      rightTemplateId: "parchment-page",
      frontCoverTemplateId: "",
      backCoverTemplateId: "",
      namePrefix: "Chronicle — ",
      nameSuffix: "",
      nameFormat: ""
    }
  }],
  ["documentFolderMode", ""],
  ["documentFolderId", "folder-1"],
  ["globalNamePrefix", "Archive / "],
  ["globalNameSuffix", " [World]"],
  ["globalNameFormat", "{globalPrefix}{presetPrefix}{title}{presetSuffix}{globalSuffix}"]
]);

const owner = { id: "user-1", name: "Player", isGM: true };
const folder = { id: "folder-1", name: "Chronicles", type: "JournalEntry", folder: null, flags: {} };
const folders = new Map([[folder.id, folder]]);
let createdData = null;
let createdFolderData = null;

globalThis.foundry = {
  utils: {
    randomID: () => "random-id"
  }
};
globalThis.crypto ??= { randomUUID: () => "uuid" };
globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2, OWNER: 3 },
  JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 }
};
globalThis.game = {
  user: owner,
  users: new Map([[owner.id, owner]]),
  folders,
  settings: {
    get(_moduleId, key) {
      return settings.get(key);
    }
  }
};
globalThis.Folder = {
  async create(data) {
    createdFolderData = data;
    const created = {
      id: "default-folder",
      ...data
    };
    folders.set(created.id, created);
    return created;
  }
};
globalThis.JournalEntry = {
  async create(data) {
    createdData = data;
    return { id: "journal-1", ...data };
  }
};

const { createLiveJournal } = await import("../scripts/documents.js");

await createLiveJournal({
  rawTitle: "Session Twelve",
  text: "The party returned.",
  presetId: "open-book",
  includeFrontCover: false,
  includeBackCover: false,
  ownerId: owner.id
});

assert.equal(createdData.name, "Archive / Chronicle — Session Twelve [World]");
assert.equal(createdData.folder, folder.id);
assert.equal(createdData.pages[0].name, createdData.name);
assert.equal(createdData.flags["runyth-illuminated-documents"].liveDocument.sourceTitle, "Session Twelve");
assert.equal(createdData.flags["runyth-illuminated-documents"].liveDocument.title, createdData.name);

settings.set("documentFolderId", "missing-folder");
createdData = null;
await createLiveJournal({
  rawTitle: "Fallback Book",
  text: "Content",
  presetId: "open-book",
  ownerId: owner.id
});
assert.equal(createdData.folder, "default-folder", "a missing custom folder must fall back to the module default Journal folder");
assert.equal(createdFolderData.name, "Illuminated Documents");
assert.equal(createdFolderData.type, "JournalEntry");
assert.equal(createdFolderData.flags["runyth-illuminated-documents"].defaultDocumentFolder, true);

settings.set("documentFolderMode", "root");
createdData = null;
await createLiveJournal({
  rawTitle: "Root Book",
  text: "Content",
  presetId: "open-book",
  ownerId: owner.id
});
assert.equal(createdData.folder, null, "explicit Journal-root mode must create the document at the Journal root");

settings.set("documentFolderMode", "default");
createdData = null;
await createLiveJournal({
  rawTitle: "Default Book",
  text: "Content",
  presetId: "open-book",
  ownerId: owner.id
});
assert.equal(createdData.folder, "default-folder", "default mode must reuse the module default Journal folder");

console.log("document management tests passed");
