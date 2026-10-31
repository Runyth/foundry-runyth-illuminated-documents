# Illuminated Documents

Illuminated Documents creates reusable, visually rendered books, scrolls, letters, journals, and other in-world handouts for Foundry VTT v13.

## Version 1.12.0 highlights

- Added optional **content sections as Journal chapters** mode for new and existing Illuminated Documents.
- When enabled, every structured content section is represented by its own managed Foundry Journal page, so the Journal chapter/page navigation on the left mirrors the section list in the Illuminated Documents editor.
- Section labels are the Journal chapter names. New-document creation exposes the first section name, Extend Existing exposes the appended section name, and later label edits rename the same Journal page in place.
- Adding, deleting, renaming, and reordering sections synchronizes only module-managed chapter pages; unrelated user-created Journal pages are preserved. Stable section IDs keep direct chapter page identities stable across rename and reorder operations.
- Existing single-page Journals remain the default. Enabling chapter mode converts the module-owned page into section chapters; disabling it collapses those managed chapters back into the traditional single live page.
- Chapter pages render only their own content section while retaining viewer-specific extensions, virtualized rendering, and first/last cover behavior. The dedicated Illuminated Book Viewer and editor previews continue to show the complete book.
- No manual migration is required and extension API version remains `1.0.0`.

See [Journal Section Chapters](docs/JOURNAL_SECTION_CHAPTERS_V1.12.0.md), [Journal V13 Integration](docs/JOURNAL_V13_INTEGRATION_V1.11.1.md), [Scalable Virtualized Rendering](docs/VIRTUAL_RENDERING_V1.11.0.md), [Offline GM Player Writes](docs/PLAYER_OFFLINE_GM_WRITES_V1.10.3.md), [Player Creation Bootstrap Fix](docs/PLAYER_CREATION_BOOTSTRAP_FIX_V1.10.2.md), [Quality and Resilience Audit](docs/QUALITY_AUDIT_V1.10.1.md), [Section Page Flow](docs/SECTION_PAGE_FLOW_V1.10.0.md), [Invalidation Patch Notes](docs/INVALIDATION_RECURSION_FIX_V1.9.3.md), [Compatibility Audit](docs/COMPATIBILITY_AUDIT_V1.9.2.md), [Manual Compatibility Checklist](docs/MANUAL_COMPATIBILITY_CHECKLIST.md), [Extension API](docs/EXTENSION_API.md), [Architecture](docs/EXTENSION_ARCHITECTURE.md), [Migration Notes](docs/EXTENSION_MIGRATION_NOTES.md), [Modified Files](docs/MODIFIED_FILES.md), and [Test Results](docs/TEST_RESULTS.md).

## Foundry V13 application architecture

All Illuminated Documents interfaces are native V2 applications:

- Document Studio
- Document Storage & Naming
- Player Permissions
- Book Presets
- Visual Templates
- Edit Book
- Illuminated Book Viewer

The module uses one top-level V2 form per editable window. Explicit `data-action` buttons perform previews, saves, creation, deletion, navigation, and file selection; all buttons that are not submissions are declared as `type="button"`. Draft values are captured before rerendering so switching modes, presets, templates, or sections does not discard unsaved input. Create and save operations are guarded against duplicate execution.

Journal rendering is identified through the module's stored Journal Entry and Journal Entry Page flags. Unrelated Journals are ignored. Module-initiated Foundry views resolve only through `foundry.applications.sheets.journal`: `JournalEntrySheet` for whole Journals, `JournalEntryPageProseMirrorSheet` for the module's HTML text pages, and `JournalEntryPageMarkdownSheet` for Markdown pages. Legacy global or V1 sheet fallbacks are not used. The dedicated Illuminated Book Viewer remains available as before.

## Granular Player Permissions

Open:

**Configure Settings → Module Settings → Illuminated Documents → Player Permissions**

The permission matrix grants three capabilities independently:

| Capability | Grants |
|---|---|
| **Create documents** | Open ID Studio; preview and create books; extend and edit illuminated Journals owned by the player. The player can select only book presets shared with their account. |
| **Manage presets** | Open the Book Preset manager; create presets; edit or delete only presets shared with the player. This permission does not itself grant document creation. |
| **Manage templates** | Open the Visual Template manager; create templates; edit or delete only templates shared with the player. Foundry's own file-browser and upload permissions still apply. |

Game Masters always have all three capabilities. Granting one capability does not implicitly grant either of the others.

### Per-preset availability

Every book preset has one availability mode:

- **GM only:** only Game Masters may use or edit the preset.
- **Selected players:** the selected players may use it in ID Studio when they have **Create documents**. Selected players who also have **Manage presets** may edit it.

Only a Game Master can change the selected-player list. A player-created preset is initially shared only with its creator. Creating a new preset requires at least one visual template directly shared with that player.

A shared preset remains a complete usable book definition. Its referenced page and cover templates can render for an authorized user even when those underlying templates are not separately shared for direct template management.

### Per-template availability

Every visual template also has one availability mode:

- **GM only:** only Game Masters may directly use or manage it.
- **Selected players:** selected players may use it while composing presets. Selected players who also have **Manage templates** may edit it.

Only a Game Master can change template sharing. A player-created visual template is initially shared only with its creator. The module refuses to delete a visual template while any book preset still references it.

### Active-GM validation

Book preset and visual-template collections are world settings. A permitted player edits them through the module UI, but the designated active GM validates and applies the change. This prevents a modified client from:

- Editing a resource that was not shared with that player
- Changing its sharing list
- Replacing a shared preset with a hidden preset
- Referencing a new unshared visual template
- Deleting or overwriting inaccessible resources

At least one active GM must therefore be connected when a player saves preset or template changes.

### Upgrade behavior

When upgrading from v1.6.x:

- Existing players previously allowed to create documents retain **Create documents**.
- Existing presets are shared with those previously allowed players, preserving their current ID Studio workflow.
- Existing visual templates remain **GM only** until explicitly shared.
- Game Masters can then grant the two new management capabilities and refine individual resource availability.

## Document Management

Open:

**Configure Settings → Module Settings → Illuminated Documents → Configure Storage & Naming**

The same window is also available from the **ID Store** button in the Journal sidebar. It controls three global areas.

### Destination Journal folder

Choose one of three explicit destination modes:

| Mode | Behaviour |
|---|---|
| **Module default folder** | Uses a top-level Journal folder named **Illuminated Documents**. The folder is created automatically when needed. |
| **Custom Journal folder** | Uses any existing folder selected from the Journal tab's folder hierarchy. |
| **Journal root** | Creates new books directly at the top level of the Journal tab. |

The window always displays the currently resolved destination. If custom-folder mode is selected but the folder is empty, deleted, or otherwise unavailable, new books safely fall back to the module default **Illuminated Documents** folder rather than being scattered at the Journal root.

The folder selection affects only newly created books:

- Existing books are not moved.
- Extending or editing a book keeps it in its current folder.
- The custom-folder button creates and selects a new root-level Journal folder.
- **Prepare default folder** creates the module default folder immediately; otherwise it is created on first use.

No rendered page-image files are created. This setting chooses a Foundry Journal folder, not a disk directory.

### Global document naming

The management window provides:

- Optional global prefix
- Optional global suffix
- Editable global name-format string
- Live example of the resulting Journal name

Prefixes and suffixes are exact text. Include spaces, punctuation, dashes, or brackets as required.

The default format is:

```text
{globalPrefix}{presetPrefix}{title}{presetSuffix}{globalSuffix}
```

Available tokens:

| Token | Meaning |
|---|---|
| `{title}` | Title entered in Document Studio |
| `{globalPrefix}` | Global prefix |
| `{globalSuffix}` | Global suffix |
| `{presetPrefix}` | Prefix from the selected preset |
| `{presetSuffix}` | Suffix from the selected preset |
| `{preset}` | Preset name |
| `{date}` | Creation date as `YYYY-MM-DD` |
| `{time}` | Creation time as `HH-mm` |
| `{user}` | Creating user's Foundry name |

Unknown, malformed, or incomplete tokens prevent saving or document creation. A format that produces an empty name is also rejected.

### Per-preset naming

Each Book Preset now has:

- Preset prefix
- Preset suffix
- Optional format override
- Live final-name preview

When the format override is empty, the global format is used. When supplied, the preset format becomes the final format for documents created with that preset. It supports the same tokens as the global format.

Changing naming rules affects new documents only. Existing Journals retain their names, including when extended.

## Default Journal view

Document Management offers three opening modes:

| Mode | Behaviour |
|---|---|
| **Foundry Journal Entry** | Opens the normal multipage Foundry Journal window. |
| **Foundry single-page view** | Opens the illuminated text page directly. |
| **Illuminated book viewer** | Opens a clean module-owned reader containing the rendered pages and book actions. |

The selected mode is used when:

- A document is created.
- A document is extended.
- An illuminated Journal is opened through the module API.
- An illuminated Journal is double-clicked in the Journal directory.

The dedicated viewer includes actions to show the book to players, extend it, edit its sections or preset, and open the normal Foundry Journal.

## Show Players

When a Game Master opens an existing Illuminated Document, **Show Players** is available in:

- The rendered-book toolbar inside Foundry Journal views
- The dedicated Illuminated Book Viewer
- Supported Foundry ApplicationV2 Journal window header controls

A normal click uses Foundry's Journal permissions, targets connected players who may observe the book, and opens it using the configured preferred view. Hold **Shift** while clicking to force-show it to all connected players through Foundry's native forced Journal display. Forced display intentionally uses the core Journal view because it can reveal a document to a player who does not normally possess it.

## Editing an existing book

Open an existing illuminated Journal and select **Edit Book**, or select **Edit sections, order, or preset** from Document Studio's **Extend existing** view.

The editor has three areas:

1. **Book appearance** selects the reusable preset and optional covers.
2. **Content sections** lists the initial input and every appended input as independent Markdown blocks.
3. **Preview** renders the complete unsaved result without creating image files.

Each content section provides:

- An editable label used only for management
- Its origin, author, and creation time
- A Markdown text editor
- A per-section option to begin on a new body page
- Up and down controls
- A drag handle for reordering
- A remove action

The **Section page flow** panel can mark every section after the first to begin on a new body page. Each later section also has its own checkbox, so individual sections can be switched between continuous flow and a forced page start. These changes remain unsaved until **Save book changes** is used.

Removing or reordering a section changes the final rendered Markdown order. The module updates the same Journal and retains its ID, name, folder, ownership, and existing links. Changing the preset therefore re-renders the same content on a different book, scroll, letter, or document background without copying the Journal.

### Older-book migration

Books created before v1.6.0 stored one combined Markdown string plus lightweight append records. When exact append character counts are available, the editor reconstructs the initial input and historical appends into separate sections. If the old audit history is incomplete, the unrecoverable earlier portion remains as one clearly labelled combined section while reconstructible recent appends remain separate.

Saving an edited older book converts it to the structured v1.6 format. No original text is discarded automatically.

### Edit permissions and conflicts

- A Game Master can edit every Illuminated Document.
- A player must have the **Create documents** capability and Owner permission for that Journal.
- Player edits are validated and saved by the designated active Game Master client.
- The editor records the revision it opened. Saving is rejected if another user changed the book meanwhile.
- Edit audit metadata records the type of change without storing a second copy of the text.

## Extending an existing book

There are two supported entry points:

1. Open **Document Studio**, select **Extend existing**, and choose an illuminated Journal.
2. Open an existing illuminated Journal and select **Extend this book** above the rendered pages.

The extension editor shows the selected book's preset, current source length, revision, extension count, cover state, and last-update time. Before entering the new Markdown, enable **Start the new section on a new page** when the addition should begin on the next body page instead of using remaining space after the preceding section. Paste the next session log, chapter, diary entry, or other Markdown into **Additional text or Markdown**.

**Preview updated book** composes the full document from the stored text plus the new text. **Append and update** modifies the same Journal Entry. It does not create a copy and does not generate permanent page-image files.

Extending preserves:

- Journal identity and links
- Journal folder
- Current Journal name
- Ownership
- Preset and covers
- Existing source Markdown
- Existing section page-flow choices
- Revision history

### Extension permissions

- A Game Master can extend every Illuminated Document.
- A player must have the **Create documents** capability and Owner permission for the selected Journal.
- A permitted player writes directly when Foundry grants the required Journal capability; active-GM delegation is only a fallback when elevation is genuinely required.
- Revision checks reject stale updates instead of overwriting newer content.

## Storage model

The module stores only:

- Ordered Markdown content sections, stable section IDs, and per-section page-flow metadata, plus a derived complete source text for backward compatibility
- Selected preset ID
- Front/back cover choices
- Original unformatted title and final Journal name
- Revision and lightweight extension-audit metadata
- Normal Journal folder and ownership data

Background images and optional font files remain ordinary Foundry assets. Illuminated Documents does not persist rendered page images. Opening, previewing, editing, or extending a Journal first computes lightweight logical page plans in the viewer's browser and then rasterizes only pages near the visible scroll viewport.

Large books therefore do not allocate one full-size canvas per logical page. A 1,000-page book keeps lightweight page/layout metadata for navigation while normally retaining only a small, bounded set of nearby raster canvases. The raster cache is limited by both a device-aware memory budget and a hard resident-page count, and evicted canvases are explicitly released.


## Scalable virtualized rendering

Version 1.11.0 separates **logical pagination** from **page rasterization**. The pagination pass uses one reusable measurement canvas and can describe up to 10,000 body pages before the independent pathological-pagination guard stops processing. This guard exists to catch malformed layouts or runaway input; it is not the former practical 50-page viewer limit.

The module-owned Journal renderer, dedicated reader, New Document preview, Extend preview, and existing-document editor preview all use the same virtualized page view:

- `IntersectionObserver` tracks pages near the current scroll viewport with overscan so the next pages are ready before they are visibly needed.
- Only nearby pages receive full-size raster canvases. Off-screen pages remain lightweight placeholders with fixed aspect ratios, so scrolling does not jump when a page is materialized or evicted.
- Raster canvases are retained in an LRU cache bounded by memory and by a maximum resident-page count. Low-memory devices automatically use a smaller budget.
- Pages that move out of the overscan window are removed from the pending queue; obsolete in-flight work receives an abort signal. Closing or rerendering the owning application cancels all remaining work and releases cached canvases.
- Pagination yields cooperatively during very large documents instead of monopolizing the browser event loop.
- `content-visibility: auto` allows Chromium to skip additional layout and paint work for off-screen logical page placeholders.
- Extension transformations still execute locally for the current viewer **before** pagination. If a viewer-specific transformation changes text length, that viewer receives the correct independent pagination.

The legacy `renderDocumentPages`, `renderBookPages`, and `renderBookPageEntries` helpers remain available for compatibility and intentionally keep their conservative eager-render safety behavior. Module-owned user interfaces use the scalable planner and virtualized renderer instead.

## Setup

1. Configure visual templates under **Manage Visual Templates**.
2. Create reusable books under **Manage Book Presets**.
3. Configure folder, naming, and viewer behaviour under **Configure Storage & Naming**.
4. Grant player capabilities under **Player Permissions**.
5. Share the required presets and, where appropriate, visual templates with selected players.
6. Open ID Studio from the Journal sidebar or Scene Notes controls.

## Book presets

A preset contains:

- Left-page visual template
- Right-page visual template
- Optional front-cover template
- Optional back-cover template
- Optional naming prefix and suffix
- Optional naming-format override

The first body page uses the left template, the second uses the right template, and the sequence repeats. To begin on a right-hand page, reverse the selected templates in the preset.

## Image dimensions

Each visual template declares an exact output width and height. The ideal uploaded image dimensions are exactly those dimensions. A 1200 × 1600 template should use a 1200 × 1600 background. Mismatched images are scaled to the configured canvas and can appear stretched or softened.

For a coherent book preset, left and right pages should normally share identical dimensions. Covers may differ because each live page is rendered independently.

## Markdown support

The deterministic canvas renderer supports:

- Headings
- Bold and italic text
- Bulleted and numbered lists
- Block quotations
- Horizontal rules
- Inline code
- Strikethrough

HTML is not executed. The Markdown subset is rendered directly to canvas to preserve deterministic pagination and safe client-side viewing.

## Public API

The module API is available through:

```js
const api = game.modules.get("runyth-illuminated-documents")?.api;
```

Relevant document-management and access functions include:

- `api.openDocumentManagement()`
- `api.openJournal(journalOrId, { mode })`
- `api.showToPlayers(journalOrId, { force })`
- `api.editJournal(journalId)`
- `api.editLiveJournal(payload)`
- `api.listEditableJournals()`
- `api.canCreateDocuments(user)`
- `api.canManagePresets(user)`
- `api.canManageTemplates(user)`
- `api.canUsePreset(preset, user)`
- `api.canManagePresetResource(preset, user)`
- `api.canUseTemplate(template, user)`
- `api.canManageTemplateResource(template, user)`
- `api.getUserPermissions(user)`
- `api.JOURNAL_VIEW_MODES`

Existing template, preset, rendering, creation, extension, and permission APIs remain available.


## Player-to-GM creation

Players with **Create documents** preview locally and write directly when Foundry grants their role permission to create Journal Entries or when they already own the target Journal. Illuminated Documents checks Foundry's native create/update capabilities before writing. The active-GM socket is used only as a fallback when the player lacks the required Foundry capability. Therefore an authorized player can create, extend, and edit owned Illuminated Documents while no GM is connected. Preset and visual-template collection saves still require an active GM because those operations write restricted world settings.


## Installation

Download `runyth-illuminated-documents-v<version>-mod.zip`, extract it into Foundry's `Data/modules/` directory, and verify that the resulting directory is `Data/modules/runyth-illuminated-documents/`. Restart Foundry or return to Setup before enabling the module in a world.

## Supported platform

- Foundry VTT: minimum 13, verified 13.350, maximum 13
- Game systems: system-independent runtime; tested primarily with the supported D&D 5e environment used by the project
- Node.js for source development: 22 or newer

Foundry VTT is required only to run the module. The repository test suite uses focused mocks for APIs that are unavailable outside Foundry.

## Source repository layout

```text
.
├── module.json                 # Authoritative Foundry manifest
├── scripts/                    # Directly executed editable JavaScript source
├── templates/                  # Handlebars application templates
├── styles/                     # Runtime CSS
├── lang/                       # English and German localization
├── assets/                     # Module-owned distributable assets
├── tests/                      # Automated behavior and compatibility tests
├── tools/                      # Validation, build and deterministic packaging
├── docs/                       # User and extension-developer documentation
├── build/                      # Generated unpacked runtime tree; ignored
└── dist/                       # Generated installable/source archives; ignored
```

The runtime is directly authored JavaScript, Handlebars, CSS and JSON. There is no transpilation, bundler, or generated runtime source.

## Development workflow

```text
npm ci
npm run format:check
npm run lint
npm test
npm run build
npm run package
```

`npm run release:check` performs the complete sequence.

### Validation

`npm run validate` checks:

- Manifest identity, version and Foundry compatibility
- Required socket capability
- Manifest-referenced scripts, styles, localization and license files
- Relative JavaScript import targets
- JSON validity
- Localization-key parity

### Tests

`npm test` executes every `tests/*.test.mjs` file in deterministic filename order. The suite covers rendering, Markdown, document creation and extension, structured editing, permissions, ApplicationV2 usage, native DOM and listener lifecycle, naming, folders, Scene Controls, player-to-GM socket replay protection, CSS and hook isolation, and the public extension framework.

### Build

`npm run build` copies the runtime allowlist into `build/runyth-illuminated-documents/`. No compilation occurs.

### Packaging

`npm run package` creates byte-reproducible archives with fixed ZIP timestamps and sorted entries:

```text
dist/runyth-illuminated-documents-v1.12.1-mod.zip
dist/runyth-illuminated-documents-v1.12.1-src.zip
dist/runyth-illuminated-documents-v1.12.1-doc.zip
```

The installable archive contains only:

- `module.json`
- Runtime scripts, templates, styles and localization
- Module-owned assets
- The runtime license

Tests, tools, package-manager files, repository settings, developer documentation, build output and source archives are excluded from the installable package.

The source archive contains the complete repository but excludes generated `build/`, `dist/`, `.git/`, `node_modules/`, and generated archives. It does not contain the installable ZIP nested inside it.

## Release procedure

1. Update `module.json`, `package.json`, `package-lock.json`, `README.md`, and `CHANGELOG.md` to the same semantic version.
2. Update documentation and tests for the release.
3. Run `npm ci`.
4. Run `npm run release:check`.
5. Verify both ZIP checksums.
6. Install the generated module ZIP in a cloned Foundry world and complete GM/player browser acceptance testing.
7. Publish both the installable and source ZIPs for the same version.

## Settings, flags, sockets and hooks

The authoritative extension API, hooks, lifecycle, storage model, permissions, migrations and diagnostics are documented in [docs/EXTENSION_API.md](docs/EXTENSION_API.md) and [docs/EXTENSION_ARCHITECTURE.md](docs/EXTENSION_ARCHITECTURE.md).

Core settings, permission behavior, destination-folder configuration, naming formats, Journal viewing modes, content-section flags, and player-to-GM workflows are documented throughout this README. The module manifest enables the reserved `module.runyth-illuminated-documents` socket namespace.

## Licence
Copyright © 2026  [Daniel Braniewski](https://brani.dev/)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.

## Licensing and attribution

The module source and module-owned parchment asset are distributed under the AGPL licence in [LICENSE](LICENSE). Foundry VTT and runtime-provided Font Awesome resources are not included. Review [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before adding or publishing third-party assets.
