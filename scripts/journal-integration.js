// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
/**
 * Supported Foundry V13 Journal sheet integration.
 *
 * Keep every Journal sheet class lookup in this module so runtime code never
 * falls back to deprecated global aliases or legacy V1 document sheets.
 */

function journalNamespace() {
  const namespace = foundry.applications?.sheets?.journal;
  if (!namespace) throw new Error("Foundry's ApplicationV2 Journal sheet namespace is unavailable.");
  return namespace;
}

function assertV2SheetClass(SheetClass, label) {
  if (typeof SheetClass !== "function" || SheetClass.isV2 !== true) {
    throw new Error(`Foundry's supported ${label} ApplicationV2 sheet is unavailable.`);
  }
  return SheetClass;
}

/** Resolve the supported Foundry V13 JournalEntry ApplicationV2 sheet class. */
export function journalEntrySheetClass() {
  return assertV2SheetClass(journalNamespace().JournalEntrySheet, "JournalEntrySheet");
}

/**
 * Resolve the concrete supported Foundry V13 ApplicationV2 sheet for a page.
 * Illuminated Documents creates HTML text pages, which use ProseMirror in V13.
 */
export function journalEntryPageSheetClass(page) {
  const namespace = journalNamespace();
  const type = String(page?.type || "");

  if (type === "text") {
    const markdown = Number(page?.text?.format) === Number(CONST.JOURNAL_ENTRY_PAGE_FORMATS?.MARKDOWN);
    const SheetClass = markdown
      ? namespace.JournalEntryPageMarkdownSheet
      : namespace.JournalEntryPageProseMirrorSheet;
    return assertV2SheetClass(SheetClass, markdown ? "JournalEntryPageMarkdownSheet" : "JournalEntryPageProseMirrorSheet");
  }

  const className = {
    image: "JournalEntryPageImageSheet",
    pdf: "JournalEntryPagePDFSheet",
    video: "JournalEntryPageVideoSheet"
  }[type];
  if (!className) throw new Error(`No supported JournalEntryPage ApplicationV2 sheet is available for page type '${type || "unknown"}'.`);
  return assertV2SheetClass(namespace[className], className);
}

/**
 * Test whether an application is a supported primary V2 sheet for its Journal
 * document. Custom V2 Journal sheets remain supported through DocumentSheetV2.
 */
export function isPrimaryJournalV2Application(app, document) {
  if (!app || !document || app.document !== document || app.constructor?.isV2 !== true) return false;
  if (!["JournalEntry", "JournalEntryPage"].includes(document.documentName)) return false;

  const DocumentSheetV2 = foundry.applications?.api?.DocumentSheetV2;
  if (typeof DocumentSheetV2 === "function" && app instanceof DocumentSheetV2) return true;

  const namespace = foundry.applications?.sheets?.journal || {};
  const supportedClasses = document.documentName === "JournalEntry"
    ? [namespace.JournalEntrySheet]
    : [
        namespace.JournalEntryPageSheet,
        namespace.JournalEntryPageTextSheet,
        namespace.JournalEntryPageProseMirrorSheet,
        namespace.JournalEntryPageMarkdownSheet,
        namespace.JournalEntryPageImageSheet,
        namespace.JournalEntryPagePDFSheet,
        namespace.JournalEntryPageVideoSheet
      ];
  return supportedClasses.some((SheetClass) => typeof SheetClass === "function" && SheetClass.isV2 === true && app instanceof SheetClass);
}

/** Construct and render the supported V13 JournalEntry ApplicationV2 sheet. */
export async function renderJournalEntryV2(journal, options = {}) {
  if (!journal || journal.documentName !== "JournalEntry") throw new Error("A JournalEntry document is required.");
  const SheetClass = journalEntrySheetClass();
  const application = new SheetClass({ document: journal });
  await application.render({ force: true, ...options });
  return application;
}

/** Construct and render the supported V13 JournalEntryPage ApplicationV2 sheet. */
export async function renderJournalEntryPageV2(page, options = {}) {
  if (!page || page.documentName !== "JournalEntryPage") throw new Error("A JournalEntryPage document is required.");
  const SheetClass = journalEntryPageSheetClass(page);
  const application = new SheetClass({ document: page });
  await application.render({ force: true, ...options });
  return application;
}
