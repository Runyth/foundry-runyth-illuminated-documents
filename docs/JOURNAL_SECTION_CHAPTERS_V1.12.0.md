# Journal Section Chapters — v1.12.0

## Purpose

Illuminated Documents traditionally stores a complete live document in one Foundry Journal page. Version 1.12.0 adds an optional structural mode in which each structured content section is represented by its own Foundry `JournalEntryPage`, allowing Foundry's Journal page navigation to act as the document's chapter list.

The Journal-level `flags.runyth-illuminated-documents.liveDocument` record remains authoritative. Chapter pages do **not** duplicate the full document metadata.

## Stored model

The document metadata adds one backwards-compatible optional boolean:

```text
sectionsAsChapters: true | false
```

Older documents without the property behave exactly as `false`.

A managed chapter page stores only the stable section identity:

```text
flags.runyth-illuminated-documents.sectionChapter.blockId
```

The existing structured section ID is therefore the durable relationship between a content section and its Journal page.

## Synchronization rules

When chapter mode is enabled:

- every content section has exactly one module-managed Journal page;
- the section label is the Journal page name;
- the section order determines the managed Journal page sort order;
- renaming or reordering a section updates the existing page instead of recreating it;
- adding a section creates one new page;
- deleting a section deletes only the page carrying that section's block ID;
- unrelated Journal pages without Illuminated Documents management flags are never deleted or rewritten.

When enabling chapter mode on an older single-page book, the existing module page is reused for the first section when possible. When disabling chapter mode, one managed page is reused as the traditional complete-book page and the remaining module-managed chapter pages are removed.

## Rendering

A chapter page still uses the standard live-render placeholder but includes its block ID. The Journal-level metadata is loaded, then the live renderer receives only the matching content block for transformation and pagination.

This keeps:

- viewer-specific extension transformations;
- Illuminated Languages-style block metadata;
- virtualized page rendering;
- normal permission and ownership behavior;
- no duplicated authoritative Markdown or extension state.

The first chapter may render the configured front cover and the last chapter may render the configured back cover. Intermediate chapters render body content only. The dedicated Illuminated Book Viewer and Studio/Editor previews continue to render the complete book as one continuous logical document.

## Creation and extension UX

New Document adds:

- **Create one Journal chapter per content section**;
- **Initial content section name**.

Extend Existing adds:

- **New content section name**.

If chapter mode is already enabled on the target document, the appended section is synchronized into a new Journal chapter automatically after save.

The existing document editor adds **Journal chapter structure → Use content sections as Journal chapters**. Section labels in the editor are chapter names while the mode is enabled.

## Compatibility

No eager migration is required. Existing single-page documents remain unchanged until the option is explicitly enabled. Import/export and duplication preserve the mode because it is part of core document metadata, while duplicated stable block IDs are remapped before chapter pages are created.

Extension API remains `1.0.0`.
