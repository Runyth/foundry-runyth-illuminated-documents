# Changelog

## 1.12.1

- Licensed the program under AGPL-3.0-or-later.
- Aligned the unpublished module id with `runyth-illuminated-documents`.
- Published install, source, and documentation archives as `-mod`, `-src`, and `-doc`.

## 1.12.0

- Added optional **one Journal chapter per content section** structure for new and existing Illuminated Documents.
- Added creation and editor controls for chapter mode, plus explicit initial-section and appended-section labels so generated Journal chapter names are meaningful immediately.
- Added stable section-to-Journal-page mapping via existing block IDs; renaming and reordering update the same Journal page IDs, adding sections creates only missing managed pages, and deleting sections removes only their associated managed pages.
- Preserved unrelated user-created Journal pages while converting between chapter mode and the traditional single-page mode.
- Added chapter-aware Journal rendering so each chapter page renders only its own section, with viewer-local extension transforms and virtualized rasterization; the first and last chapters retain configured front/back cover behavior.
- Preserved the complete-book dedicated viewer and Studio/Editor previews, existing section page-flow metadata, extension metadata, imports, exports, duplication, player permissions, offline-GM writes, and Foundry V13 Journal integration.
- Added chapter lifecycle, conversion, stable-page-identity, unrelated-page preservation, duplication, UI, and rendering-isolation regression coverage. No manual migration is required; extension API remains `1.0.0`.

## 1.11.1

- Centralized all Foundry Journal sheet resolution in a dedicated V13-only integration layer under `foundry.applications.sheets.journal`.
- Removed duplicated Journal sheet class lookup logic from the dedicated viewer and generic Journal render hooks.
- Explicitly reject legacy/non-ApplicationV2 Journal sheet classes instead of falling back through deprecated compatibility paths.
- Open HTML text pages with the supported V13 `JournalEntryPageProseMirrorSheet` and Markdown text pages with `JournalEntryPageMarkdownSheet`; Journal entries use `JournalEntrySheet`.
- Preserved custom ApplicationV2 Journal sheets through the supported `DocumentSheetV2` eligibility path while continuing to ignore unrelated documents and applications.
- Added regression coverage that makes the deprecated `JournalTextPageSheet` global alias and legacy V1 namespace throw if accessed, then verifies Journal and Journal-page opening still succeeds.
- Extended the codebase audit to forbid deprecated Journal globals, legacy Journal render hooks, and `journal.sheet` / `page.sheet` access.
- Preserved all existing document data, virtualized rendering, extension API `1.0.0`, permissions, Show Players, studio/management workflows, and viewer modes without migration.

## 1.11.0

- Replaced the module-owned eager all-pages rendering path with two-stage logical pagination plus viewport-driven page rasterization for live Journals, the dedicated reader, Document Studio previews, and existing-document editor previews.
- Added a 10,000-page logical pathological-input guard while removing the former 50-page practical limit from normal module viewing and preview workflows.
- Added `VirtualBookView` using `IntersectionObserver` overscan so only nearby pages are rasterized; distant pages remain lightweight aspect-ratio placeholders.
- Added device-aware, byte-budgeted LRU raster caching plus a hard resident-canvas count cap, explicit canvas disposal, and per-template error-log deduplication.
- Added cancellable page work: stale queued pages are dropped, in-flight page renders are aborted when they leave the overscan window, and whole render trees cancel cleanly on rerender or close.
- Added cooperative pagination yielding every 100 logical pages so very large books do not monopolize the Foundry UI thread while pagination is calculated.
- Fixed duplicate-signature render handling so a harmless duplicate render request no longer aborts an already active virtualized reader.
- Added `content-visibility: auto`, intrinsic placeholder sizing, and stable page aspect ratios to reduce off-screen layout/paint cost without clipping or scroll jumps.
- Preserved viewer-specific extension transformation before pagination, section page-break metadata, alternating templates, covers, source Markdown, stable block IDs, Show Players, and all existing persistence workflows.
- Kept legacy eager renderer helpers for API compatibility and safety; module-owned UI no longer uses them for long-document rendering. Extension API remains `1.0.0`.
- Added long-book, cache-budget, viewport-laziness, cancellation, alternating-template, and archive regression coverage. No data migration is required.

## 1.10.3

- Removed the hard active-GM dependency from permitted player document creation, extension, and editing.
- Added direct-first Foundry V13 capability routing using `JournalEntry.canUserCreate(user)` for creation and `journal.canUserModify(user, "update")` for existing Journal writes.
- Retained active-GM socket delegation only as a fallback when the requesting client genuinely lacks the required Foundry write capability.
- Added graceful offline-GM errors for players whose Foundry role lacks Journal creation/update capability instead of attempting an impossible socket request.
- Updated the supported public create/edit/extend methods to use the same direct-first routing without changing method signatures or extension API `1.0.0`.
- Prevented non-GM callers from forging `ownerId` or `requesterId` when invoking document persistence helpers directly.
- Added offline-GM regression coverage for extension fields, direct document creation, Owner permission, reopening, editing, extending, section page flow, block metadata, persistence, and zero GM socket traffic.
- Preserved GM delegation for preset and visual-template saves because those operations write restricted world settings. No data migration is required.

## 1.10.2

- Removed `scripts/extensions/registry.js` and `scripts/extensions/fields.js` from the production browser module graph so permitted non-GM document creation no longer depends on those two independent ESM requests.
- Consolidated the runtime registry and extension-field service into the already-required `scripts/extensions/runtime.js`; retained the old files as compatibility re-exports for source consumers.
- Added a non-GM extension bootstrap regression covering registration, dynamic field choices, document/block field preparation, field capture, validation, and the existing player-to-GM creation transport.
- Extended installable-archive verification to recursively validate the manifest-rooted browser ESM graph and reject missing runtime imports.
- Added a release guard preventing `registry.js` or `fields.js` from becoming creation-critical browser requests again.
- Preserved extension API `1.0.0`, public method signatures, socket payloads, stored data, permissions, presets, templates, page-flow metadata, and all existing workflows. No migration is required.

## 1.10.1

- Added a shared ApplicationV2 busy state that disables all module action controls during authoritative writes and restores their original state afterwards.
- Made Document Studio close after successful create and extend operations while retaining the complete form and draft on validation, permission, socket, or persistence failure.
- Added a bounded player-client Journal synchronization wait before attempting to open a GM-created or GM-updated book.
- Prevented failed window-geometry persistence from blocking ApplicationV2 close operations.
- Added rejection-safe rerender handling for module DOM callbacks, open document sheets, dedicated viewers, and Scene Control or sidebar launchers.
- Resolved Foundry V13's concrete namespaced FilePicker implementation and hardened selected-path, cancellation, and removed-region handling.
- Standardized module-scoped window-content sizing, input and textarea padding, button wrapping, busy feedback, and responsive narrow-window layouts.
- Added accessible names to every icon-only Handlebars control.
- Added a dedicated quality/resilience regression suite and updated release documentation.
- Preserved all existing Journals, flags, section page-flow metadata, extensions, presets, templates, settings, permissions, sockets, and public API signatures. Extension API version remains `1.0.0`.

## 1.10.0

- Added an append-time **Start the new section on a new page** option to Document Studio.
- Added per-section page-flow checkboxes to the existing-document editor.
- Added a bulk editor action that marks every section after the first to begin on a new body page.
- Added section-owned `startOnNewPage` metadata that remains stable through editing, reordering, preset changes, extension transformations, duplication, import, and export.
- Updated the alternating-page renderer to honor section boundaries without changing authoritative Markdown or inserting visible control tokens.
- Preserved continuous section flow as the default for existing books and new appends unless explicitly enabled.
- Added English and German localization with exact key parity, focused renderer/data/UI regression tests, and updated documentation.
- Preserved extension API version `1.0.0` and all existing permissions, sockets, presets, visual templates, covers, naming, folders, viewers, and stored extension metadata.

## 1.9.3

- Fixed an infinite cache-invalidation recursion between Illuminated Documents and companion extensions such as Illuminated Languages.
- Made the public `invalidateDocumentRender` API directional: it invalidates host-owned render state without invoking the requesting extension's `invalidateCache` callback.
- Preserved host-originated extension cache notifications for document updates and other core invalidation events.
- Added a defensive per-document/per-extension re-entrancy guard around `invalidateCache` callbacks.
- Added runtime and public-API regression tests covering synchronous recursive invalidation and callback-free extension-to-host invalidation.
- Preserved extension API version `1.0.0`, all existing documents and metadata, and every existing creation, editing, rendering, permission, preset, template, and viewer workflow.

## 1.9.2

- Removed the remaining jQuery facade from every ApplicationV2 window and Journal-directory integration; all DOM work now uses native V13-compatible APIs.
- Added render-scoped listener cleanup and abortable visual-template drag sessions to prevent duplicate or stale listeners after rerenders and closes.
- Narrowed Journal rendering, header controls, and close cleanup to positively identified primary illuminated Journal V2 sheets.
- Hardened the Notes Scene Control registration for the V13 record-based tool structure and stable one-tool replacement.
- Added idempotent Journal-directory controls and preferred-view listener registration.
- Added malformed-request rejection, one-time GM socket execution, replay protection, targeted GM-response validation, and authenticated custom Show Players messages.
- Aligned direct public mutation helpers with existing permission and GM-authoritative boundaries without changing API signatures or extension API version.
- Added complete compatibility/isolation regression tests, an interference audit report, and a multi-client manual acceptance checklist.
- Preserved all existing documents, flags, presets, templates, settings, extensions, workflows, and window geometry without data migration.

## 1.9.1

- Restored a stable horizontal New Document preset row using a flexible selector column and content-sized Visual Templates and Presets actions.
- Added a narrow-window responsive fallback that stacks the selector and keeps both preset actions aligned without overlap or clipping.
- Redesigned the New Document title as a prominent, high-contrast, fully labelled control with a visible hint, localized placeholder, comfortable sizing, and explicit keyboard focus treatment.
- Added exact English and German localization parity for the new title and preset controls.
- Added static UI regression checks for the preset-row structure, responsive behavior, semantic title labelling, and title focus styling.
- Preserved all existing ApplicationV2 workflows, field names, extension contributions, preset selection, template management, document creation, metadata, and saved window geometry.

## 1.9.0

- Added extension API `1.0.0` under `game.illuminatedDocuments.api`, with deterministic `init` and `ready` lifecycle hooks and late registration.
- Added validated extension registration, immutable diagnostics, priority ordering, compatibility ranges, unregistering, and isolated callback execution.
- Added namespaced document, block, orphaned-block, and preset metadata with independent extension schema versions and preservation of unknown extension payloads.
- Added stable content-block IDs, lazy repair for old or colliding IDs, deletion orphaning, import collision repair, and duplication remapping.
- Added document and block fields to creation, append, editor, and preset workflows, including dynamic choices and safe custom components.
- Added client-local viewer preparation and render transformations for Journal views, the dedicated viewer, creation previews, edit previews, and Show Players recipients.
- Added structured validation, extension migrations, import/export callbacks, preset transfer, cache invalidation, rerender APIs, and lifecycle callbacks for document creation, update, and deletion.
- Added GM extension diagnostics with copy, validation, rerender, and transient-cache actions.
- Added developer API, architecture, migration documentation, and a minimal companion module example.
- Added registry, field, metadata, transfer, rendering, validation, migration, API permission, compatibility, and static framework tests.
- Added normal Foundry read-permission enforcement to public metadata getters and validation methods.
- Added localized extension field labels, hints, choices, placeholders, and visible custom-field render errors.
- Added unavailable-extension warnings in the preset editor while preserving inactive preset metadata.
- Added automatic extension migration after document and preset imports.
- Preserved all existing books, presets, templates, settings, permissions, folders, naming, editing, extension, viewing, and window geometry without manual migration.

## 1.8.0

- Migrated `DocumentStudio`, `DocumentManagement`, `PermissionManager`, `PresetManager`, `TemplateManager`, `DocumentEditor`, and `IlluminatedDocumentViewer` to `foundry.applications.api.ApplicationV2` with `HandlebarsApplicationMixin`.
- Replaced every V1 `defaultOptions`, `getData`, `activateListeners`, `_updateObject`, and nested-form lifecycle with V2 `DEFAULT_OPTIONS`, `PARTS`, `_prepareContext`, `_onRender`, explicit actions, and one top-level form.
- Replaced the deprecated global `FormDataExtended` with `foundry.applications.ux.FormDataExtended` and added consistent checkbox and numeric normalization.
- Replaced the deprecated global `FilePicker` with `foundry.applications.apps.FilePicker`, retaining existing-file selection, uploads, cancellation, paths with spaces, and permission/error reporting.
- Replaced all V1 confirmation/prompt dialogs with `foundry.applications.api.DialogV2`.
- Removed deprecated `JournalTextPageSheet` access and V1 Journal hooks; journal integration is now driven by Illuminated Documents flags through `renderApplicationV2` and `getHeaderControlsApplicationV2`.
- Avoided `journal.sheet` and `page.sheet`; module-initiated Foundry Journal views now construct the supported V2 `JournalEntrySheet` and `JournalEntryPageTextSheet` classes directly.
- Preserved all stored settings, flags, presets, templates, permissions, folder selections, naming rules, structured text sections, revisions, and window geometry without a data migration.
- Added duplicate-operation locks, draft capture before rerenders, explicit non-submit buttons, supported V2 sheet rerendering, and a runtime import/instantiation smoke test.
- Added codebase-wide deprecation, template structure, action, socket, permission, journal isolation, backward-compatibility, and archive validation.

## 1.7.0

- Replaced the single player-access checkbox with independent **Create documents**, **Manage presets**, and **Manage templates** capabilities.
- Added a responsive permission matrix with per-capability counts and column-wide grant/clear controls.
- Added GM-controlled availability to every book preset and visual template: **GM only** or **Selected players**.
- Filtered ID Studio to presets shared with the current user and added a clear empty-state when no preset is available.
- Allowed authorized players to open the preset and template managers without granting unrelated module capabilities.
- Limited player managers to resources explicitly shared with them; inaccessible resources are preserved server-side even when omitted from a player submission.
- Made player-created presets and visual templates private to their creator until a GM changes sharing.
- Routed player preset/template saves through the designated active GM and added global revision checks against stale manager windows.
- Prevented players from changing resource sharing, referencing new unshared templates, modifying hidden resources, or deleting templates still referenced by presets.
- Preserved v1.6.x creation access by migrating existing allowed users and sharing existing presets with them; existing visual templates remain GM-only.
- Added granular permission, migration, resource merge, authorization, revision, and UI regression tests.

## 1.6.3

- Enabled the Foundry module socket namespace required for player-to-GM document creation.
- Targeted privileged requests to the designated active GM.
- Registered pending requests before transmission to avoid fast-response races.
- Added clearer errors for missing, unavailable, or mismatched GM clients.
- Added regression coverage for permitted-player creation transport.

## 1.6.2

- Renamed the Journal-sidebar buttons to **ID Studio** and **ID Store**.
- Corrected the resolved-destination row so the destination receives the flexible width and the preparation action remains content-sized.
- Prevented destination names from collapsing into one character per line while retaining safe wrapping for long folder paths.
- Retained a stacked, full-width action layout for narrow windows.

## 1.6.1

- Renamed and clarified the global module menu as **Document Storage & Naming** under Configure Settings.
- Added explicit destination modes for the module default folder, a selected custom Journal folder, or the Journal root.
- Added automatic creation and reuse of the top-level **Illuminated Documents** Journal folder.
- Changed missing or deleted custom-folder handling to fall back to the module default folder rather than the Journal root.
- Added a resolved-destination preview and a **Prepare default folder** action.
- Added a GM-only **Storage & Naming** button directly to the Journal sidebar.
- Clarified that global prefix and suffix are optional and kept the editable tokenized document-name format with live validation.
- Preserved legacy v1.5/v1.6 custom-folder selections during upgrade.
- Added regression coverage for custom, default, fallback, and explicit Journal-root placement.

## 1.6.0

- Added a dedicated structured **Edit Book** window for existing Illuminated Documents.
- Stored new documents and appends as independently editable Markdown content sections while retaining a derived combined source for backward compatibility.
- Added editing of section labels and Markdown bodies.
- Added section deletion with a safeguard preventing an entirely empty book.
- Added explicit move-up/move-down controls and drag-and-drop section ordering.
- Added preset replacement and front/back-cover changes without replacing or renaming the Journal.
- Added complete unsaved-book preview from edited section order and selected appearance.
- Added reconstruction of older v1.4/v1.5 inputs from append character-count audit data, with a safe combined-section fallback when exact reconstruction is impossible.
- Added revision conflict protection, edit audit metadata, owner-aware player editing, and active-GM socket handling.
- Added **Edit Book** actions to rendered Journal toolbars, the dedicated viewer, compatible Journal headers, and Document Studio's extension view.
- Added document editing, migration, preset-change, deletion, ordering, socket integration, and UI regression tests.

## 1.5.0

- Added a global **Document Management** module menu.
- Added configurable destination Journal folder selection with safe root fallback when a configured folder no longer exists.
- Added global document-name prefixes, suffixes, and tokenized format strings.
- Added per-preset prefixes, suffixes, and optional format overrides.
- Added live resulting-name previews and strict validation for unknown, malformed, empty, or incomplete formats.
- Preserved existing Journal names and folders when extending books or changing global settings.
- Added selectable default opening modes: full Foundry Journal, single-page Foundry view, or dedicated Illuminated Book Viewer.
- Applied the preferred view to module opens and illuminated Journal double-clicks in the Journal directory.
- Added a dedicated viewer with persistent window geometry and actions for Show Players, Extend, and Foundry Journal.
- Added Show Players to rendered-book toolbars and compatible Foundry V1/V2 Journal header controls.
- Added permission-aware Show Players delivery through the configured preferred viewer, with Shift-click retaining Foundry's native force-show behavior for users without access.
- Hid obsolete generated-image settings retained only for backward compatibility.
- Added document naming, folder placement, preferred-view, and UI regression tests.

## 1.4.0

- Added a dedicated **Extend existing** workflow to Document Studio.
- Added an **Extend this book** action to live-rendered illuminated Journals.
- Added full-book extension preview using the existing source plus appended Markdown.
- Updated the original Journal in place while preserving its preset, covers, ownership, identity, and existing links.
- Added owner-aware player permissions for extensions and GM-mediated remote updates.
- Added revision conflict detection to prevent stale updates from overwriting newer book content.
- Added lightweight extension audit metadata without storing duplicate appended text.
- Added backward-compatible metadata upgrade for books created by v1.3.x.
- Added automated tests for text combination, metadata preservation, revision increments, extension history, UI controls, and Journal extension actions.

## 1.3.1

- Rebuilt the Player Permissions window with correct vertical layout, useful default dimensions, clear player cards, online status, selection counts, and bulk controls.
- Fixed Document Studio preview so covers and every alternating body page remain visible in a scrollable page list.
- Added page labels and a rendered-page count to preview and live Journal views.
- Fixed live Journal rendering for Foundry v13 sheet variants by using a dedicated render mount and both page-sheet and full-Journal hooks.
- Added backward-compatible rendering for Journals created by v1.3.0.
- Refreshed presets whenever Document Studio renders, preventing stale preset data after editing presets.
- Added rendering and UI regression tests for cover preservation, left/right alternation, multi-page visibility, permission layout, and Journal hooks.

## 1.3.0

- Added per-player module permissions managed by the GM.
- Added reusable book presets.
- Added alternating left/right body-page rendering.
- Added optional front and back covers.
- Replaced persistent generated page images with live client-side Journal rendering.
- Added GM-mediated Journal creation for permitted players.
- Preserved existing Markdown, template, preview, geometry, contrast, and adjustable-region behavior.

## Source distribution refresh — 2026-07-25

- Added a complete Git-ready source repository for v1.9.0.
- Added locked, dependency-free Node.js 22 package metadata.
- Added deterministic runtime build and ZIP packaging tools.
- Added manifest, import, JSON, localization, syntax, formatting and archive validation.
- Added repository layout, development, testing, packaging and release documentation.
- Added third-party and asset licensing review notes.
- Runtime module behavior and stored-data formats are unchanged.
