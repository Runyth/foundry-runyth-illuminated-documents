# Section Page Flow — v1.10.0

## Purpose

Illuminated Documents normally lays content sections into one continuous body-page stream. Version 1.10.0 adds an optional section boundary that starts a section on the next body page.

## Append workflow

Document Studio's **Extend existing** mode includes **Start the new section on a new page**. When enabled, only the newly appended section receives the page-start flag. Existing sections and their page flow remain unchanged.

The checkbox is off by default, preserving the established continuous-flow behavior.

## Existing-book editor

Each section after the first has its own **Start this section on a new page** checkbox. The **Section page flow** panel also provides **Start every section on a new page**, which marks every section after the first in the unsaved editor state. The user must save the book to persist the change.

The first section always begins on the first body page, so it does not need a separate page-break flag.

## Storage and compatibility

The optional Boolean is stored as `startOnNewPage` on the existing structured content entry. It does not modify Markdown, content IDs, extension namespaces, or preset data.

Existing books without the property normalize it to `false`. No eager world migration or manual recreation is required.

The property is preserved through:

- ordinary edits;
- section reordering;
- preset and cover changes;
- document extension;
- extension viewer transformations;
- import and export;
- duplication and block-ID remapping.

## Rendering

The renderer converts section boundaries into internal paragraph metadata. A requested page break ends the current body page and resumes the section on the next alternating body template. No marker is inserted into source text or persisted rendered HTML.

Front and back covers remain outside the body-page sequence and do not affect left/right alternation.
