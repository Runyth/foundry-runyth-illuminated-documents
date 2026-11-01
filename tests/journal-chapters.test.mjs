// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let uuidCounter = 0;
globalThis.foundry = undefined;
Object.defineProperty(globalThis, "crypto", {
  value: { randomUUID: () => `chapter-uuid-${++uuidCounter}` },
  configurable: true
});
globalThis.CONST = {
  SORT_INTEGER_DENSITY: 100000,
  JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 }
};

const {
  buildEditedMetadata,
  buildExtendedMetadata,
  buildJournalPagesForMetadata,
  createLiveMetadata,
  getSectionChapterBlockId,
  syncJournalPagesForMetadata,
  usesSectionChapters
} = await import("../scripts/documents.js");
const { duplicateMetadata } = await import("../scripts/extensions/transfer.js");

let metadata = createLiveMetadata({
  title: "Velia Chronicle",
  sourceTitle: "Velia Chronicle",
  text: "The party reaches Velia.",
  presetId: "open-book",
  ownerId: "user-1",
  ownerName: "Player",
  initialBlockId: "section-prologue",
  initialBlockLabel: "Prologue",
  sectionsAsChapters: true,
  now: 1000
});
metadata = buildExtendedMetadata(metadata, "The road south becomes dangerous.", {
  blockId: "section-road",
  label: "The Road South",
  userId: "user-1",
  userName: "Player",
  now: 2000
});
metadata = buildExtendedMetadata(metadata, "A hidden ledger is recovered.", {
  blockId: "section-ledger",
  label: "The Hidden Ledger",
  userId: "user-1",
  userName: "Player",
  now: 3000
});

assert.equal(usesSectionChapters(metadata), true);
const sources = buildJournalPagesForMetadata(metadata, metadata.title);
assert.equal(sources.length, 3);
assert.deepEqual(sources.map((page) => page.name), ["Prologue", "The Road South", "The Hidden Ledger"]);
assert.deepEqual(sources.map((page) => page.sort), [100000, 200000, 300000]);
assert.match(sources[0].text.content, /data-idoc-chapter-block-id="section-prologue"/);
assert.deepEqual(sources[1].flags["runyth-illuminated-documents"].sectionChapter, { blockId: "section-road" });
assert.equal(sources[0].flags["runyth-illuminated-documents"].liveDocument, undefined, "chapter pages must not duplicate full document metadata");

let nextPageId = 1;
function makePage(source, id = `page-${nextPageId++}`) {
  return {
    id,
    name: source.name,
    type: source.type,
    sort: source.sort ?? 0,
    text: structuredClone(source.text || {}),
    flags: structuredClone(source.flags || {}),
    getFlag(moduleId, key) {
      return this.flags?.[moduleId]?.[key] ?? null;
    }
  };
}

function applyFlatUpdate(page, update) {
  for (const [key, value] of Object.entries(update)) {
    if (key === "_id") continue;
    if (key.startsWith("flags.runyth-illuminated-documents.")) {
      const flagKey = key.split(".").at(-1);
      page.flags["runyth-illuminated-documents"] ??= {};
      page.flags["runyth-illuminated-documents"][flagKey] = structuredClone(value);
    } else {
      page[key] = structuredClone(value);
    }
  }
}

const unrelated = makePage({ name: "GM Notes", type: "text", sort: 900000, text: { content: "Unrelated" }, flags: {} }, "unrelated");
const legacy = makePage({
  name: metadata.title,
  type: "text",
  sort: 100000,
  text: { content: "legacy" },
  flags: { "runyth-illuminated-documents": { liveDocument: metadata } }
}, "legacy-page");

const journal = {
  id: "journal-1",
  uuid: "JournalEntry.journal-1",
  name: metadata.title,
  pages: [legacy, unrelated],
  async updateEmbeddedDocuments(type, updates) {
    assert.equal(type, "JournalEntryPage");
    for (const update of updates) {
      const page = this.pages.find((candidate) => candidate.id === update._id);
      assert.ok(page, `missing page ${update._id}`);
      applyFlatUpdate(page, update);
    }
    return updates.map((update) => this.pages.find((page) => page.id === update._id));
  },
  async createEmbeddedDocuments(type, creates) {
    assert.equal(type, "JournalEntryPage");
    const pages = creates.map((source) => makePage(source));
    this.pages.push(...pages);
    return pages;
  },
  async deleteEmbeddedDocuments(type, ids) {
    assert.equal(type, "JournalEntryPage");
    this.pages = this.pages.filter((page) => !ids.includes(page.id));
    return ids;
  }
};

await syncJournalPagesForMetadata(journal, metadata);
const managed = () => journal.pages.filter((page) => getSectionChapterBlockId(page));
assert.equal(managed().length, 3);
assert.equal(journal.pages.includes(unrelated), true, "unrelated Journal pages must remain untouched");
assert.equal(getSectionChapterBlockId(legacy), "section-prologue", "the existing module page should be reused for the first chapter");
const stableIds = Object.fromEntries(managed().map((page) => [getSectionChapterBlockId(page), page.id]));

const editedEntries = [
  { ...metadata.contentEntries[1], label: "Road to Heidel" },
  { ...metadata.contentEntries[0], label: "Opening" }
];
const edited = buildEditedMetadata(metadata, {
  entries: editedEntries,
  presetId: metadata.presetId,
  includeFrontCover: metadata.includeFrontCover,
  includeBackCover: metadata.includeBackCover,
  sectionsAsChapters: true
}, { userId: "user-1", userName: "Player", now: 4000, documentUuid: journal.uuid });

await syncJournalPagesForMetadata(journal, edited);
assert.deepEqual(managed().sort((a, b) => a.sort - b.sort).map((page) => page.name), ["Road to Heidel", "Opening"]);
assert.equal(managed().find((page) => getSectionChapterBlockId(page) === "section-road").id, stableIds["section-road"], "renaming/reordering must preserve the chapter page ID");
assert.equal(managed().find((page) => getSectionChapterBlockId(page) === "section-prologue").id, stableIds["section-prologue"], "reordering must preserve the chapter page ID");
assert.equal(journal.pages.some((page) => getSectionChapterBlockId(page) === "section-ledger"), false, "removing a section must remove its managed chapter page");
assert.equal(journal.pages.includes(unrelated), true);

const collapsed = buildEditedMetadata(edited, {
  entries: edited.contentEntries,
  presetId: edited.presetId,
  includeFrontCover: edited.includeFrontCover,
  includeBackCover: edited.includeBackCover,
  sectionsAsChapters: false
}, { userId: "user-1", userName: "Player", now: 5000, documentUuid: journal.uuid });
assert.equal(collapsed.editHistory.at(-1).chapterModeChanged, true);
await syncJournalPagesForMetadata(journal, collapsed);
assert.equal(managed().length, 0);
assert.equal(journal.pages.filter((page) => page.getFlag("runyth-illuminated-documents", "liveDocument")).length, 1);
assert.equal(journal.pages.includes(unrelated), true, "collapsing chapters must not delete unrelated pages");

const duplicated = duplicateMetadata(metadata).metadata;
assert.equal(duplicated.sectionsAsChapters, true, "duplication must preserve chapter mode");
assert.equal(buildJournalPagesForMetadata(duplicated).length, 3);
assert.notEqual(duplicated.contentEntries[0].id, metadata.contentEntries[0].id, "duplicate chapter markers must follow remapped block IDs");

const mainSource = await readFile(new URL("../scripts/main.js", import.meta.url), "utf8");
const liveRenderSource = await readFile(new URL("../scripts/live-render.js", import.meta.url), "utf8");
const studioTemplate = await readFile(new URL("../templates/studio.hbs", import.meta.url), "utf8");
const editorTemplate = await readFile(new URL("../templates/document-editor.hbs", import.meta.url), "utf8");
assert.match(mainSource, /dataset\.idocChapterBlockId/);
assert.match(liveRenderSource, /contentBlockIds/);
assert.match(liveRenderSource, /includeFrontCoverOverride/);
assert.match(studioTemplate, /name="sectionsAsChapters"/);
assert.match(studioTemplate, /name="initialSectionLabel"/);
assert.match(studioTemplate, /name="appendLabel"/);
assert.match(editorTemplate, /name="sectionsAsChapters"/);

console.log("Journal section chapter tests passed");
