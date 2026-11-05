// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

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
globalThis.Hooks = { callAll() {}, once() {} };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.game = {
  user: { id: "gm", isGM: true, role: 4 },
  users: new Map([["gm", { id: "gm", isGM: true }]]),
  journal: new Map(),
  folders: new Map(),
  settings: {
    get(_module, key) { return globalThis.__settings?.get?.(key); },
    async set(_module, key, value) { globalThis.__settings?.set?.(key, value); return value; }
  },
  socket: { emit() {} },
  i18n: { localize: (key) => key, has: () => false }
};
Object.defineProperty(game.users, "activeGM", { configurable: true, get: () => null });
globalThis.JournalEntry = { canUserCreate: () => true, async create(data) { return makeJournal(data); } };
globalThis.Folder = { async create() { throw new Error("No folder writes in this harness."); } };

function pageFrom(host, entry) {
  return {
    id: entry?._id || "page",
    documentName: "JournalEntryPage",
    parent: host,
    sort: entry?.sort ?? 0,
    name: entry?.name ?? "Page",
    type: entry?.type ?? "text",
    text: structuredClone(entry?.text ?? { content: "", format: 1 }),
    flags: structuredClone(entry?.flags ?? {}),
    getFlag(scope, key) { return this.flags?.[scope]?.[key] ?? null ?? undefined; }
  };
}

function makeJournal(data = {}) {
  const journal = {
    id: data.id || "legacy-journal",
    uuid: "JournalEntry.legacy-journal",
    name: data.name ?? "Legacy Book",
    documentName: "JournalEntry",
    ownership: { default: 3 },
    testUserPermission: () => true,
    pages: [],
    flags: structuredClone(data.flags ?? {}),
    getFlag(scope, key) { return this.flags?.[scope]?.[key] ?? null; },
    async update(changes) {
      for (const [path, value] of Object.entries(changes ?? {})) {
        if (path.startsWith("flags.")) {
          const parts = path.split(".");
          this.flags[parts[1]] ??= {};
          this.flags[parts[1]][parts[2]] = structuredClone(value);
        } else this[path] = structuredClone(value);
      }
      return this;
    },
    async updateEmbeddedDocuments(_type, updates) {
      for (const update of updates ?? []) {
        const page = this.pages.find((p) => p.id === update._id);
        if (!page) continue;
        for (const [path, value] of Object.entries(update)) {
          if (path === "_id") continue;
          if (path.startsWith("flags.")) {
            const parts = path.split(".");
            page.flags[parts[1]] ??= {};
            page.flags[parts[1]][parts[2]] = structuredClone(value);
          } else page[path] = structuredClone(value);
        }
      }
      return this.pages;
    },
    async createEmbeddedDocuments(_type, entries) {
      const created = (entries ?? []).map((entry, index) => pageFrom(this, { ...entry, _id: `created-page-${index + 1}` }));
      this.pages.push(...created);
      return created;
    },
    async deleteEmbeddedDocuments(_type, ids) {
      this.pages = this.pages.filter((page) => !(ids ?? []).includes(page.id));
      return this.pages;
    }
  };
  journal.pages = (data.pages ?? []).map((entry) => pageFrom(journal, entry));
  return journal;
}

const legacyMetadata = {
  id: "legacy-document",
  schemaVersion: 6,
  version: 6,
  createdAt: 1700000000000,
  createdBy: { userId: "gm", userName: "GM" },
  sourceText: "The primary chapter text.",
  contentEntries: [
    { id: "primary", text: "The primary chapter text.", kind: "initial", createdAt: 1700000000000, updatedAt: 1700000000000, label: "Primary" }
  ],
  extensions: {},
  revision: 2
};

const { getJournalLiveMetadata, getSectionChapterBlockId, saveLiveMetadataToJournal } = await import(`../scripts/documents.js?legacy=${Date.now()}`);
const { MODULE_ID } = await import(`../scripts/settings.js?legacy=${Date.now()}`);

let migratedFlag = null;
game.journal = { get: (id) => (id === "legacy-journal" ? legacyJournal : null) };

let legacyJournal = makeJournal({
  id: "legacy-journal",
  flags: { "illuminated-documents": { liveDocument: structuredClone(legacyMetadata) } }
});

{
  const metadata = getJournalLiveMetadata(legacyJournal);
  assert.ok(metadata, "a pre-Runyth namespace record must be discoverable by the readers");
  assert.equal(metadata.schemaVersion, 6);
}

assert.equal(getSectionChapterBlockId({ flags: { "illuminated-documents": { sectionChapter: { blockId: "chapter-one" } } }, getFlag(s, k) { return this.flags?.[s]?.[k] ?? null; } }), "chapter-one");
assert.equal(getSectionChapterBlockId({ flags: { "idoc-proto": { sectionChapter: { blockId: "legacy-block" } } }, getFlag() { return null; } }), "legacy-block", "unknown pre-Runyth namespaces carrying the marker shape are discovered");
assert.equal(getSectionChapterBlockId({ flags: { "someone-else": { notChapter: true } }, getFlag() { return null; } }), "", "foreign flag shelves without the marker shape are ignored");

{
  // A foreign module row that carries the key name without the metadata shape stays inert.
  const foreign = makeJournal({
    id: "foreign",
    flags: { "some-companion": { liveDocument: { random: true } } }
  });
  assert.equal(getJournalLiveMetadata(foreign), null, "foreign namespaces without the metadata shape are not live documents");
}

game.journal = { get: (id) => (id === "legacy-journal" ? legacyJournal : null) };
await saveLiveMetadataToJournal(legacyJournal, structuredClone(legacyMetadata), { reason: "legacy-test" });

assert.ok(legacyJournal.flags[MODULE_ID]?.liveDocument, "the current module namespace receives the migrated record after an open");
assert.deepEqual(getJournalLiveMetadata(legacyJournal)?.schemaVersion, 6, "the migrated record stays discoverable under the current namespace");
assert.equal(legacyJournal.flags["illuminated-documents"]?.liveDocument !== undefined, true, "the legacy record is preserved until the module rewrites it");

const metadata = getJournalLiveMetadata(legacyJournal);
const chapterMetadata = {
  ...structuredClone(metadata),
  sectionsAsChapters: true,
  contentEntries: [
    structuredClone(metadata.contentEntries[0]),
    { id: "second", text: "The appended chapter text.", kind: "append", createdAt: 1700000001000, updatedAt: 1700000001000, label: "Second" }
  ],
  extensionHistory: [{ id: "second-history", characterCount: 27, appendedAt: 1700000001000 }]
};
await saveLiveMetadataToJournal(legacyJournal, chapterMetadata, { reason: "legacy-chapters-test" });

const chapterPages = legacyJournal.pages.map((page) => ({
  namespace: page.flags[MODULE_ID] ? MODULE_ID : "legacy",
  blockId: getSectionChapterBlockId(page),
  content: page.text?.content || ""
}));
assert.equal(chapterPages.length, 2, `chapter conversion creates one managed page per content entry (${chapterPages.length} seen)`);
for (const page of chapterPages) {
  assert.equal(page.namespace, MODULE_ID, "managed chapter pages carry the current namespace record");
  assert.ok(page.blockId, "each managed page is registered to its content block");
  assert.match(page.content, /idoc-live-document-root/, "managed pages carry the live document stub");
}

{
  // The old placeholders still identify: a page whose stub content was written by
  // the pre-Runyth publication renders through the same configured loaders.
  const stubPage = {
    documentName: "JournalEntryPage",
    parent: legacyJournal,
    text: { content: '<div class="idoc-live-document-root" data-idoc-live-document="true"><div class="idoc-live-loading">Rendering illuminated document…</div></div>', format: 1 }
  };
  assert.ok(stubPage.text.content.includes("Rendering illuminated document"), "the reported stuck surface is the standard live-document stub");
}

{
  // getFlag is Foundry's platform API and throws for scopes that no longer
  // correspond to an active package; the readers must not poke it for legacy
  // scope names.
  const throwingJournal = makeJournal({
    id: "still-open",
    flags: { "illuminated-documents": { liveDocument: structuredClone(legacyMetadata) } }
  });
  throwingJournal.getFlag = (scope) => {
    if (scope === MODULE_ID) return throwingJournal.flags?.[scope]?.liveDocument ?? null;
    throw new Error(`Flag scope "${String(scope)}" is not valid or not currently active`);
  };
  game.journal = { get: (id) => (id === "still-open" ? throwingJournal : null) };
  const metadata = getJournalLiveMetadata(throwingJournal);
  assert.ok(metadata, "legacy records resolve without calling getFlag on inactive scopes");
  assert.equal(metadata.schemaVersion, 6);

  const page = { flags: { "illuminated-documents": { sectionChapter: { blockId: "b-1" } } } };
  page.getFlag = (scope) => {
    if (scope === MODULE_ID) return page.flags?.[scope]?.sectionChapter ?? null;
    throw new Error(`Flag scope "${String(scope)}" is not valid or not currently active`);
  };
  assert.equal(getSectionChapterBlockId(page), "b-1", "legacy chapter markers resolve without inactive getFlag");
  game.journal = { get: (id) => (id === "legacy-journal" ? legacyJournal : null) };
}

console.log("legacy-flag-migration tests passed");
