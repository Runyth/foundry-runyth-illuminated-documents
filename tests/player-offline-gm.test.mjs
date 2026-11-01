// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";


const studioSource = await readFile(new URL("../scripts/studio.js", import.meta.url), "utf8");
const editorSource = await readFile(new URL("../scripts/document-editor.js", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../scripts/main.js", import.meta.url), "utf8");
assert.match(studioSource, /createDocumentForCurrentUser/);
assert.match(studioSource, /extendDocumentForCurrentUser/);
assert.doesNotMatch(studioSource, /requestFromActiveGm/);
assert.match(editorSource, /editDocumentForCurrentUser/);
assert.doesNotMatch(editorSource, /requestFromActiveGm/);
assert.match(mainSource, /createDocumentForCurrentUser/);
assert.match(mainSource, /editDocumentForCurrentUser/);

const player = { id: "player-offline", name: "Offline Player", isGM: false, active: true };
const settings = new Map([
  ["templates", {
    "parchment-page": {
      id: "parchment-page",
      name: "Parchment Page",
      background: "modules/runyth-illuminated-documents/assets/backgrounds/parchment.svg",
      width: 1200,
      height: 1600,
      regions: [{ id: "main", x: 100, y: 100, width: 1000, height: 1400 }],
      accessMode: "selected-users",
      allowedUserIds: [player.id]
    }
  }],
  ["presets", {
    "offline-book": {
      id: "offline-book",
      name: "Offline Book",
      leftTemplateId: "parchment-page",
      rightTemplateId: "parchment-page",
      frontCoverTemplateId: "",
      backCoverTemplateId: "",
      accessMode: "selected-users",
      allowedUserIds: [player.id],
      extensions: {}
    }
  }],
  ["userPermissions", {
    [player.id]: { createDocuments: true, managePresets: false, manageTemplates: false }
  }],
  ["allowedUsers", [player.id]],
  ["documentFolderMode", "default"],
  ["documentFolderId", ""],
  ["globalNamePrefix", ""],
  ["globalNameSuffix", ""],
  ["globalNameFormat", "{title}"],
  ["windowGeometry", {}]
]);

const journalCollection = new Map();
let socketEmits = 0;
let createdData = null;

function setFlagPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
  cursor[parts.at(-1)] = structuredClone(value);
}

function makeJournal(data) {
  const pages = (data.pages || []).map((page, index) => ({
    id: `page-${index + 1}`,
    documentName: "JournalEntryPage",
    type: page.type,
    name: page.name,
    text: structuredClone(page.text),
    flags: structuredClone(page.flags || {}),
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; }
  }));
  const journal = {
    id: "journal-offline",
    uuid: "JournalEntry.journal-offline",
    documentName: "JournalEntry",
    name: data.name,
    folder: data.folder,
    ownership: structuredClone(data.ownership || {}),
    flags: structuredClone(data.flags || {}),
    pages,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    testUserPermission(user, level) {
      return user?.isGM || Number(this.ownership?.[user?.id] ?? this.ownership?.default ?? 0) >= Number(level);
    },
    canUserModify(user, action) {
      return action === "update" && this.testUserPermission(user, 3);
    },
    async update(changes) {
      for (const [path, value] of Object.entries(changes || {})) setFlagPath(this, path, value);
      return this;
    },
    async updateEmbeddedDocuments(_type, updates) {
      for (const update of updates) {
        const page = this.pages.find((candidate) => candidate.id === update._id);
        if (!page) continue;
        if (update.text) page.text = structuredClone(update.text);
        for (const [path, value] of Object.entries(update)) {
          if (path.startsWith("flags.")) setFlagPath(page, path, value);
        }
      }
      return this.pages;
    },
    async createEmbeddedDocuments(_type, entries) {
      const created = entries.map((entry, index) => ({
        id: `created-page-${index + 1}`,
        documentName: "JournalEntryPage",
        parent: this,
        ...structuredClone(entry),
        getFlag(scope, key) { return this.flags?.[scope]?.[key]; }
      }));
      this.pages.push(...created);
      return created;
    }
  };
  for (const page of pages) page.parent = journal;
  return journal;
}

globalThis.crypto ??= { randomUUID: () => `uuid-${Math.random()}` };
globalThis.foundry = {
  utils: {
    deepClone: structuredClone,
    randomID: () => "random-id",
    escapeHTML: (value) => String(value)
  }
};
globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 },
  JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 }
};
globalThis.Hooks = { callAll() {} };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.game = {
  user: player,
  users: new Map([[player.id, player]]),
  journal: journalCollection,
  folders: new Map(),
  settings: {
    get(_module, key) { return settings.get(key); },
    async set(_module, key, value) { settings.set(key, value); return value; }
  },
  socket: {
    emit() { socketEmits += 1; }
  },
  i18n: { localize: (key) => key, has: () => false }
};
Object.defineProperty(game.users, "activeGM", { configurable: true, get: () => null });

globalThis.JournalEntry = {
  canUserCreate(user) { return user?.id === player.id; },
  async create(data) {
    createdData = structuredClone(data);
    const journal = makeJournal(data);
    journalCollection.set(journal.id, journal);
    return journal;
  }
};
globalThis.CONFIG = { JournalEntry: { documentClass: globalThis.JournalEntry } };
globalThis.Folder = { async create() { throw new Error("A non-GM must not attempt to create the managed folder directly."); } };

const { extensionRuntime } = await import(`../scripts/extensions/runtime.js?offline-gm=${Date.now()}`);
extensionRuntime.setPhase("init");
extensionRuntime.registry.register({
  id: "offline-extension",
  version: "1.0.0",
  documentFields: [{ key: "classification", type: "text", label: "Classification", default: "draft" }],
  blockFields: [{ key: "marked", type: "checkbox", label: "Marked", default: false }]
});

const documentGroups = await extensionRuntime.fields.prepareGroups({
  scope: "document",
  metadata: { extensions: {} },
  preset: {},
  lifecycleContext: { currentUser: player, mode: "create" }
});
const documentInput = { value: "field-notes", checked: false };
const extensionMetadata = extensionRuntime.fields.capture({
  querySelector(selector) { return selector.includes("classification") ? documentInput : null; }
}, documentGroups, { metadata: { extensions: {} } });
assert.equal(extensionMetadata.extensions["offline-extension"].document.classification, "field-notes");

const {
  canCreateJournalDirectly,
  canUpdateJournalDirectly,
  createDocumentForCurrentUser,
  editDocumentForCurrentUser,
  extendDocumentForCurrentUser
} = await import(`../scripts/document-operations.js?offline-gm=${Date.now()}`);
const { getJournalLiveMetadata, canEditJournal } = await import("../scripts/documents.js");

assert.equal(canCreateJournalDirectly(player), true, "Foundry create permission must allow a direct player path.");
const created = await createDocumentForCurrentUser({
  rawTitle: "Player Journal",
  text: "Original text",
  presetId: "offline-book",
  includeFrontCover: false,
  includeBackCover: false,
  initialBlockId: "block-original",
  initialBlockLabel: "Opening",
  sectionsAsChapters: true,
  extensions: extensionMetadata.extensions
});
assert.equal(created.delegated, false, "an authorized player must not require GM delegation");
assert.equal(socketEmits, 0, "offline direct creation must not emit a GM request");
assert.equal(created.journal.id, "journal-offline");
assert.equal(createdData.folder, null, "without a GM, an absent managed folder must gracefully fall back to Journal root");
assert.equal(createdData.ownership[player.id], CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
assert.equal(createdData.pages.length, 1);
assert.equal(createdData.pages[0].name, "Opening");
assert.deepEqual(createdData.pages[0].flags["runyth-illuminated-documents"].sectionChapter, { blockId: "block-original" });
assert.equal(created.journal.testUserPermission(player, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER), true);
assert.equal(canEditJournal(created.journal, player), true);
assert.equal(canUpdateJournalDirectly(created.journal, player), true);

let reopened = game.journal.get(created.journal.id);
let metadata = getJournalLiveMetadata(reopened);
assert.equal(metadata.sourceText, "Original text");
assert.equal(metadata.sectionsAsChapters, true);
assert.equal(metadata.extensions["offline-extension"].document.classification, "field-notes");

const edited = await editDocumentForCurrentUser({
  journalId: reopened.id,
  entries: metadata.contentEntries.map((entry) => ({ ...entry, text: "Edited while the GM is offline" })),
  presetId: metadata.presetId,
  includeFrontCover: metadata.includeFrontCover,
  includeBackCover: metadata.includeBackCover,
  sectionsAsChapters: true,
  extensions: metadata.extensions,
  expectedRevision: metadata.revision
});
assert.equal(edited.delegated, false, "owned Journal edits must be direct while the GM is offline");
assert.equal(socketEmits, 0, "offline direct editing must not emit a GM request");

reopened = game.journal.get(created.journal.id);
metadata = getJournalLiveMetadata(reopened);
assert.equal(metadata.sourceText, "Edited while the GM is offline");
assert.equal(metadata.revision, 1);
assert.equal(metadata.extensions["offline-extension"].document.classification, "field-notes");
assert.equal(reopened.testUserPermission(player, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER), true);

const extended = await extendDocumentForCurrentUser({
  journalId: reopened.id,
  appendedText: "Appended while no GM is connected",
  expectedRevision: metadata.revision,
  blockId: "block-offline-append",
  blockExtensions: { "offline-extension": { marked: true } },
  startOnNewPage: true,
  label: "Offline Appendix"
});
assert.equal(extended.delegated, false);
assert.equal(socketEmits, 0);
metadata = getJournalLiveMetadata(game.journal.get(reopened.id));
assert.equal(metadata.revision, 2);
assert.equal(metadata.contentEntries.at(-1).text, "Appended while no GM is connected");
assert.equal(metadata.contentEntries.at(-1).startOnNewPage, true);
assert.equal(metadata.extensions["offline-extension"].blocks["block-offline-append"].marked, true);
assert.equal(reopened.pages.length, 2, "offline chapter-mode append must create a new Journal page directly");
assert.equal(reopened.pages.at(-1).name, "Offline Appendix");
assert.deepEqual(reopened.pages.at(-1).flags["runyth-illuminated-documents"].sectionChapter, { blockId: "block-offline-append" });

JournalEntry.canUserCreate = () => false;
await assert.rejects(
  () => createDocumentForCurrentUser({ rawTitle: "Blocked", text: "x", presetId: "offline-book" }),
  /cannot create Journal Entries directly.*no active Game Master/i
);
assert.equal(socketEmits, 0, "an offline failure must not emit an impossible delegation request");

console.log("Offline-GM player creation/edit persistence tests passed");
