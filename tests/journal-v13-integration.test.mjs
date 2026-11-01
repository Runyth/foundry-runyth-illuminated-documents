// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { walkFiles } from "../tools/repository.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scripts = (await walkFiles(path.join(root, "scripts"))).filter((file) => file.endsWith(".js"));
const combined = (await Promise.all(scripts.map((file) => readFile(file, "utf8")))).join("\n");

for (const forbidden of [
  /\bJournalTextPageSheet\b/,
  /foundry\.appv1/,
  /Hooks\.(?:on|once)\(["']renderDocumentSheet["']/,
  /Hooks\.(?:on|once)\(["']renderJournalTextPageSheet["']/,
  /\bjournal\.sheet\b/,
  /\bpage\.sheet\b/
]) {
  assert.doesNotMatch(combined, forbidden, `Deprecated Journal integration remained: ${forbidden}`);
}

class MockV2Sheet {
  static isV2 = true;

  constructor(options = {}) {
    this.options = options;
    this.document = options.document;
    this.renderCalls = [];
  }

  async render(options = {}) {
    this.renderCalls.push(options);
    return this;
  }
}

class JournalEntrySheet extends MockV2Sheet {}
class JournalEntryPageSheet extends MockV2Sheet {}
class JournalEntryPageTextSheet extends JournalEntryPageSheet {}
class JournalEntryPageProseMirrorSheet extends JournalEntryPageTextSheet {}
class JournalEntryPageMarkdownSheet extends JournalEntryPageTextSheet {}
class JournalEntryPageImageSheet extends JournalEntryPageSheet {}
class JournalEntryPagePDFSheet extends JournalEntryPageSheet {}
class JournalEntryPageVideoSheet extends JournalEntryPageSheet {}
class DocumentSheetV2 extends MockV2Sheet {}

let legacyGlobalReads = 0;
Object.defineProperty(globalThis, "JournalTextPageSheet", {
  configurable: true,
  get() {
    legacyGlobalReads += 1;
    throw new Error("Deprecated global JournalTextPageSheet was accessed.");
  }
});

globalThis.CONST = {
  JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1, MARKDOWN: 2 }
};

globalThis.foundry = {
  applications: {
    api: { DocumentSheetV2 },
    sheets: {
      journal: {
        JournalEntrySheet,
        JournalEntryPageSheet,
        JournalEntryPageTextSheet,
        JournalEntryPageProseMirrorSheet,
        JournalEntryPageMarkdownSheet,
        JournalEntryPageImageSheet,
        JournalEntryPagePDFSheet,
        JournalEntryPageVideoSheet
      }
    }
  }
};
let legacyNamespaceReads = 0;
Object.defineProperty(globalThis.foundry, "appv1", {
  configurable: true,
  get() {
    legacyNamespaceReads += 1;
    throw new Error("Deprecated foundry.appv1 namespace was accessed.");
  }
});

const integration = await import("../scripts/journal-integration.js");

const journal = { documentName: "JournalEntry", id: "journal-1" };
const htmlPage = {
  documentName: "JournalEntryPage",
  type: "text",
  text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
  id: "page-html"
};
const markdownPage = {
  documentName: "JournalEntryPage",
  type: "text",
  text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN },
  id: "page-md"
};

assert.equal(integration.journalEntrySheetClass(), JournalEntrySheet);
assert.equal(integration.journalEntryPageSheetClass(htmlPage), JournalEntryPageProseMirrorSheet);
assert.equal(integration.journalEntryPageSheetClass(markdownPage), JournalEntryPageMarkdownSheet);

const journalApp = await integration.renderJournalEntryV2(journal, { mode: "view" });
assert.ok(journalApp instanceof JournalEntrySheet);
assert.equal(journalApp.document, journal);
assert.deepEqual(journalApp.renderCalls, [{ force: true, mode: "view" }]);

const pageApp = await integration.renderJournalEntryPageV2(htmlPage, { mode: "view" });
assert.ok(pageApp instanceof JournalEntryPageProseMirrorSheet);
assert.equal(pageApp.document, htmlPage);
assert.deepEqual(pageApp.renderCalls, [{ force: true, mode: "view" }]);

assert.equal(legacyGlobalReads, 0, "opening supported Journal sheets must never touch the deprecated global alias");
assert.equal(legacyNamespaceReads, 0, "opening supported Journal sheets must never touch foundry.appv1");

const customJournalApp = new DocumentSheetV2({ document: journal });
assert.equal(integration.isPrimaryJournalV2Application(customJournalApp, journal), true);
const unrelated = { documentName: "Actor", id: "actor-1" };
const customActorApp = new DocumentSheetV2({ document: unrelated });
assert.equal(integration.isPrimaryJournalV2Application(customActorApp, unrelated), false);

const originalJournalSheet = foundry.applications.sheets.journal.JournalEntrySheet;
class LegacyJournalSheet extends MockV2Sheet {}
LegacyJournalSheet.isV2 = false;
foundry.applications.sheets.journal.JournalEntrySheet = LegacyJournalSheet;
assert.throws(
  () => integration.journalEntrySheetClass(),
  /ApplicationV2 sheet is unavailable/,
  "the resolver must reject a legacy/V1 Journal sheet rather than silently falling back"
);
foundry.applications.sheets.journal.JournalEntrySheet = originalJournalSheet;

delete globalThis.JournalTextPageSheet;
