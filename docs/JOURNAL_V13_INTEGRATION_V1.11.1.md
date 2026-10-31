# Journal V13 Integration — v1.11.1

## Purpose

This patch makes the Journal opening and rendering boundary explicit and testable. Illuminated Documents must not access Foundry's deprecated global `JournalTextPageSheet`, legacy V1 Journal sheet classes, `journal.sheet`, or `page.sheet`.

## Supported classes

All class lookup is centralized in `scripts/journal-integration.js` and uses only `foundry.applications.sheets.journal`:

- `JournalEntrySheet` for a whole Journal Entry;
- `JournalEntryPageProseMirrorSheet` for HTML text pages created by Illuminated Documents;
- `JournalEntryPageMarkdownSheet` for Markdown text pages;
- the current V2 image/PDF/video page sheets for non-text page types when explicitly opened.

Resolved classes must advertise `isV2 === true`. A legacy class is rejected instead of being used as a compatibility fallback.

## Render-hook eligibility

The generic `renderApplicationV2`, `closeApplicationV2`, and `getHeaderControlsApplicationV2` hooks remain intentionally narrow:

1. the backing document must be a `JournalEntry` or `JournalEntryPage`;
2. the application must own that document directly;
3. the application must be V2;
4. Illuminated Documents flags must positively identify the Journal before live rendering or controls are added.

Custom V2 Journal sheets remain compatible through Foundry's supported `DocumentSheetV2` base.

## Regression protection

`tests/journal-v13-integration.test.mjs` performs both static and runtime checks. During runtime tests, the deprecated global alias and legacy V1 namespace are replaced with throwing getters. Supported Journal and page sheets must still construct and render successfully without reading either getter.

No stored-data migration is required.
