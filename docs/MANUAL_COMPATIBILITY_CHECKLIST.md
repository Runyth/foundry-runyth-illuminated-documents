# Manual Compatibility Checklist — v1.9.2

Use a cloned Foundry VTT v13 world. Record Foundry build, game-system version, browser, active modules, and result for each item. Keep the browser console open on both clients.

## Startup and lifecycle

- [ ] Start the world as GM; no warning/error originates from `modules/runyth-illuminated-documents/`.
- [ ] Connect a permitted player and a player without permission.
- [ ] Refresh each browser; no duplicate hooks, sidebar buttons, or Scene Control tools appear.
- [ ] Reload the world; settings, permissions, folders, presets, templates, documents, and window geometry persist.
- [ ] Disable and re-enable the module; existing Journals and flags remain intact.

## Module-owned windows

For ID Studio, ID Store, Player Permissions, Presets, Visual Templates, Edit Book, and the dedicated viewer:

- [ ] Open, resize, move, close, and reopen.
- [ ] Confirm position and dimensions persist.
- [ ] Rerender/switch modes repeatedly; actions execute once and draft values remain.
- [ ] Check ordinary, narrow, and large window sizes in Foundry light and dark themes.
- [ ] Confirm native ellipsis and close controls remain farthest right.

## Document workflow

- [ ] Create a document as GM.
- [ ] Create a document as an allowed player with an active GM connected; confirm the client still writes directly when its Foundry role permits Journal creation.
- [ ] Confirm a player without Create Documents cannot create one.
- [ ] Preview with and without covers and with alternating page templates.
- [ ] Append text, edit sections, remove a section, reorder sections, and change preset.
- [ ] Duplicate, export, and import a document; confirm block IDs and extension metadata remain valid.
- [ ] Confirm configured Journal folder, prefix, suffix, format string, and view method.
- [ ] Open existing pre-v1.9.2 Journals without manual migration.
- [ ] Use Show Players in normal and Shift-force modes; confirm each player renders locally.

## Journal and Scene integration

- [ ] Journal sidebar contains exactly one ID Studio and one ID Store button where permitted.
- [ ] Double-click an illuminated Journal in each configured viewing mode.
- [ ] Open unrelated Journals; no Illuminated Documents toolbar, header control, or renderer appears.
- [ ] Notes Scene Controls contain exactly one Illuminated Documents tool after repeated rerenders.

## D&D 5e and sheet isolation

Illuminated Documents intentionally has no Actor/Item sheet integration. Confirm no module control appears in:

- [ ] Core D&D 5e character sheet.
- [ ] Core D&D 5e NPC sheet.
- [ ] Tidy 5e Modern character/NPC/item sheets.
- [ ] Tidy 5e Classic character/NPC/item sheets.
- [ ] Character level-up and advancement selection.
- [ ] Rest dialogs.
- [ ] Attack, damage, save, skill, and activity-use roll popups.
- [ ] Active Effect editors and configuration dialogs.
- [ ] Linked and unlinked Token synthetic-Actor sheets.
- [ ] Unsupported/custom sheets; ID Studio, settings, Scene Controls, and public API remain functional.

## Token HUD, Chat, and canvas isolation

- [ ] Open and rerender Token HUDs for owned/unowned, linked/unlinked, controlled, and targeted Tokens; no Illuminated Documents control appears.
- [ ] Select multiple Tokens; no module listener or action is duplicated.
- [ ] Create representative Chat cards through core D&D 5e and other active modules; Illuminated Documents registers no Chat renderer and creates no duplicate card.
- [ ] Change Scenes and refresh canvas; no Illuminated Documents PIXI overlay/nameplate exists or accumulates.

## Permissions and sockets

- [ ] Grant and revoke Create Documents, Manage Presets, and Manage Templates independently.
- [ ] Verify shared-resource boundaries for each player.
- [ ] Disconnect all GM clients while a permitted player retains Foundry permission to create Journal Entries; confirm create, edit, and extend continue directly with no socket dependency.
- [ ] Reconnect and repeat; exactly one state change occurs.
- [ ] With two GM accounts connected, only the designated active GM processes a player request.

## Representative coexistence

Repeat core creation/open/show operations with a representative active set, such as D&D 5e, Tidy 5e, Midi-QOL, DAE, Token HUD modules, Journal enhancements, and Scene Control modules. Record external errors by package path; do not attribute another package's warning to Illuminated Documents unless its stack enters this module.

## v1.10.1 quality and lifecycle checks

- [ ] Create a valid new document and confirm ID Studio closes only after the Journal is created and the preferred viewer has been requested.
- [ ] Trigger a validation or permission failure and confirm ID Studio remains open with title, text, preset, covers, extension fields, and preview state intact.
- [ ] Extend an existing book successfully and confirm ID Studio closes after the authoritative update.
- [ ] Repeat create and extend as a permitted player with an active GM; confirm no GM request occurs when Foundry grants direct Journal write capability, and the resulting Journal opens normally.
- [ ] Save permissions, presets, visual templates, document settings, and an edited book; confirm all action controls are temporarily disabled and a second click cannot start another save.
- [ ] Move and resize every module window, close it, and confirm a simulated or real client-setting failure does not prevent closing.
- [ ] Browse and upload a visual-template background and font file; test cancellation, spaces and special characters, inaccessible directories, and a region removed while the picker is open.
- [ ] Inspect all icon-only controls with keyboard focus and a screen-reader accessibility tree; confirm each has an accessible name.
- [ ] Resize every module window below its normal width and confirm inputs retain padding, buttons wrap inside their borders, and no legacy minimum width forces content outside the viewport.

## v1.10.2 permitted-player extension bootstrap checks

- [ ] Connect a non-GM player with **Create documents** permission and at least one shared preset.
- [ ] Keep an active GM connected and enable a companion extension that contributes creation fields.
- [ ] Open ID Studio on the player client and confirm the extension fields render.
- [ ] Change extension field values, preview the document, and confirm values remain through rerenders.
- [ ] Create the document and confirm the resulting Journal is owned by the player. If the player has Foundry Journal creation permission, confirm no active-GM request is emitted; otherwise confirm exactly one delegated request is processed.
- [ ] Confirm the player console contains no request for `scripts/extensions/registry.js` or `scripts/extensions/fields.js` during normal module startup or document creation.
- [ ] Confirm no `net::ERR_FAILED`, missing-module, or ESM-resolution error originates from `modules/runyth-illuminated-documents/`.
- [ ] Reload the player browser and repeat creation with extension fields enabled.

## v1.10.3 offline-GM player write checks

- [ ] Grant the player Illuminated Documents **Create documents** permission and Foundry role permission to create Journal Entries.
- [ ] Disconnect every GM client.
- [ ] Open ID Studio as the player and confirm presets and extension-contributed fields render.
- [ ] Create a document and confirm it appears in the Journal collection without a GM connection.
- [ ] Confirm the player is Owner of the created Journal and can reopen it.
- [ ] Edit existing source text and extension metadata, save, close, and reopen; confirm persistence.
- [ ] Extend the same book, including a block extension field and **Start the new section on a new page**; confirm persistence.
- [ ] Reload the browser and reopen the book; confirm source, section IDs, extension metadata, revision, and ownership survive.
- [ ] Remove the Foundry role permission to create Journal Entries while keeping the module permission, leave all GMs offline, and confirm creation fails with an actionable Foundry-permission message rather than an active-GM timeout.
- [ ] Reconnect a GM with the player's Foundry creation permission still removed; confirm the existing delegated fallback creates exactly one document.

## v1.11.0 scalable long-book rendering checks

- [ ] Open a document exceeding 50 logical pages in the normal Illuminated Journal view; confirm no 50-page error occurs.
- [ ] Open the same document in the dedicated Illuminated book viewer.
- [ ] Create or use a test document exceeding 1,000 logical pages and confirm the logical page count is displayed without allocating all pages at once.
- [ ] Scroll slowly through several pages and confirm nearby pages appear before or as they enter view.
- [ ] Drag the scrollbar or scroll rapidly hundreds of pages forward; confirm stale page work does not visibly stall the UI.
- [ ] Scroll back to recently viewed pages and confirm normal rendering/cache reuse.
- [ ] Leave enough pages behind to exceed the raster cache, then return and confirm evicted pages rerender correctly.
- [ ] Close the viewer during page rendering and confirm no subsequent console errors or detached rendering activity.
- [ ] Rerender/reopen the same document repeatedly and confirm no duplicate virtual page surfaces or observers accumulate.
- [ ] Preview a long New Document in Document Studio; confirm only nearby preview pages rasterize.
- [ ] Preview a long Extend operation and confirm existing plus appended content paginate correctly.
- [ ] Preview a long edited book in Document Editor and verify section order and forced new-page settings.
- [ ] Repeat with alternating left/right templates and optional front/back covers.
- [ ] Repeat with Illuminated Languages or another extension that changes viewer-visible text length; confirm each client gets independent pagination.
- [ ] Test a missing/inaccessible background asset and confirm page errors are visible without console-error flooding or document-data loss.
- [ ] Test narrow and large viewer widths and confirm aspect-ratio placeholders prevent layout jumps or clipping.


## v1.11.1 Journal V13 deprecation checks

- [ ] Start Foundry V13 with browser compatibility warnings visible and confirm no warning names `modules/runyth-illuminated-documents/` as the origin of `JournalTextPageSheet`, `JournalSheet`, or `JournalPageSheet` access.
- [ ] Open ID Studio and create a document, then open the resulting whole Journal through the configured Journal view.
- [ ] Open the same illuminated document using the Page view and confirm the HTML page opens correctly.
- [ ] Open Document Management and use its document-opening workflow.
- [ ] Open the dedicated Illuminated Book Viewer and use **Open in Foundry**.
- [ ] Open an unrelated normal Journal and Journal page and confirm no Illuminated Documents controls or rendering leak into it.
- [ ] Repeat as a permitted non-GM player and confirm no deprecated-global warning appears.
- [ ] Repeat with a custom V2 Journal sheet if one is installed and confirm it remains functional.

## v1.12.0 Journal section chapter checks

- Create a new document with **Create one Journal chapter per content section** enabled and give the initial section a distinctive name. Confirm the Journal page list shows that name.
- Extend the document twice with distinctive section names. Confirm each append creates exactly one new Journal page and the chapter order matches the section order.
- Open a chapter directly. Confirm it renders only that section rather than the complete book.
- With a front and back cover enabled, confirm the first chapter includes the front cover and the last chapter includes the back cover; middle chapters do not repeat covers.
- In Edit Book, rename and reorder sections. Confirm the Journal page names/order follow the editor while direct page identities remain stable.
- Delete a section. Confirm only its managed Journal page is removed.
- Manually add an unrelated Journal page, then repeat rename/reorder/delete and toggle chapter mode off/on. Confirm the unrelated page is preserved.
- Disable **Use content sections as Journal chapters** and save. Confirm the module-managed chapters collapse to one live page and the complete book still renders.
- Re-enable chapter mode and save. Confirm the structured section list is restored as Journal chapters.
- Repeat creation, extension, and editing as a permitted non-GM player with no GM connected when Foundry permissions allow direct Journal writes.
- Verify the dedicated Illuminated Book Viewer, Show Players, export/import, duplication, section page-flow controls, and Illuminated Languages/other extension transforms still behave correctly.
