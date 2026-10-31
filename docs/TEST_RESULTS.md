# Illuminated Documents 1.12.0 Test Results

Validation date: 2026-10-10
Runtime: Node.js 22-compatible ES modules
Foundry target: V13

## Automated result

All automated test files passed before packaging.

## Journal section chapter coverage

- chapter mode defaults off for existing and ordinary new documents;
- chapter-enabled metadata produces one Journal page source per structured content section;
- section labels become Journal page names;
- chapter pages store stable block IDs instead of duplicated full live-document metadata;
- the existing single module page is reused for the first chapter during conversion where possible;
- adding sections creates missing managed chapter pages;
- renaming and reordering sections preserve the same Journal page IDs;
- deleting a section removes its managed chapter page;
- unrelated Journal pages remain untouched during split, synchronization, and collapse operations;
- disabling chapter mode collapses managed section pages back to one traditional live page;
- duplication preserves chapter mode while using remapped independent block IDs;
- creation exposes the chapter-mode option and initial section name;
- extension exposes the appended section name;
- editing exposes the chapter-mode option;
- chapter rendering scopes the extension/render pipeline to the selected block and retains first/last cover overrides.

## Existing feature coverage

The suite continues to cover ApplicationV2 behavior, Foundry V13 Journal sheet APIs, virtualized long-book rendering, native DOM/listener lifecycle, document creation/editing/extension, offline-GM player writes, section page flow, permissions, sockets, presets, visual templates, naming, storage, stable block IDs, extension registration/metadata/transformations/validation/migrations/diagnostics, import/export, duplication, compatibility isolation, and browser ESM graph integrity.

## Repository and archive validation

The deterministic release pipeline performs formatting, syntax, manifest/import/reference validation, all tests, runtime-only build, installable/source ZIP verification, development-file exclusion checks, single-root archive checks, and browser-module-graph validation. The final release is rebuilt from the extracted source ZIP and compared byte-for-byte with the delivered artifacts.

## Live acceptance

A live Foundry VTT V13 world is not available in this build environment. Final in-world acceptance should create a chapter-enabled document, append at least two named sections, confirm the left Journal page list mirrors those labels, rename/reorder/delete sections in the editor, toggle chapter mode off and on, and verify unrelated manually-created Journal pages survive. Repeat as GM and a permitted player, including a no-GM player write path. Confirm first/last covers, extensions, Show Players, the complete-book dedicated viewer, and virtualized long-book rendering remain correct.
