// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../styles/runyth-illuminated-documents.css", import.meta.url), "utf8");
const studio = await readFile(new URL("../templates/studio.hbs", import.meta.url), "utf8");
const permissions = await readFile(new URL("../templates/permissions.hbs", import.meta.url), "utf8");
const main = await readFile(new URL("../scripts/main.js", import.meta.url), "utf8");

assert.match(css, /\.idoc-preview-pane\s*\{[\s\S]*?overflow:\s*auto;/);
assert.match(css, /\.idoc-preview-page-list\s*\{[\s\S]*?flex-direction:\s*column;/);
assert.match(studio, /{{#if hasPreview}}[\s\S]*data-virtual-preview/);
assert.doesNotMatch(studio, /{{#each previews}}/);
assert.match(css, /\.idoc-permissions\s*\{[\s\S]*?flex-direction:\s*column;/);
assert.match(permissions, /data-action="set-column"/);
assert.match(permissions, /data-permission="createDocuments"/);
assert.match(permissions, /data-permission="managePresets"/);
assert.match(permissions, /data-permission="manageTemplates"/);
assert.match(permissions, /class="idoc-permission-row"/);
assert.match(main, /Hooks\.on\("renderApplicationV2"/);
assert.match(main, /illuminatedJournalFromDocument/);
assert.doesNotMatch(main, /renderJournalTextPageSheet/);
assert.match(main, /idoc-live-document-root/);

assert.match(studio, /data-mode="extend"/);
assert.match(studio, /name="journalId"/);
assert.match(studio, /name="appendText"/);
assert.match(studio, /Append and update/);
assert.match(css, /\.idoc-extension-summary\s*\{/);
assert.match(css, /\.idoc-live-toolbar\s*\{/);
assert.match(main, /DocumentStudio\.openForJournal/);
assert.match(main, /extendLiveJournal/);

const management = await readFile(new URL("../templates/document-management.hbs", import.meta.url), "utf8");
const presetManager = await readFile(new URL("../templates/preset-manager.hbs", import.meta.url), "utf8");
const templateManager = await readFile(new URL("../templates/template-manager.hbs", import.meta.url), "utf8");
const viewer = await readFile(new URL("../templates/viewer.hbs", import.meta.url), "utf8");
const settingsScript = await readFile(new URL("../scripts/settings.js", import.meta.url), "utf8");
const documentsScript = await readFile(new URL("../scripts/documents.js", import.meta.url), "utf8");
const viewerScript = await readFile(new URL("../scripts/viewer.js", import.meta.url), "utf8");

assert.match(settingsScript, /registerMenu\(MODULE_ID, "documentManagement"/);
assert.match(management, /name="folderMode"/);
assert.match(management, /name="folderId"/);
assert.match(management, /data-destination-preview/);
assert.match(management, /name="globalFormat"/);
assert.match(management, /name="journalViewMode"/);
assert.match(presetManager, /name="namePrefix"/);
assert.match(presetManager, /name="nameSuffix"/);
assert.match(presetManager, /name="nameFormat"/);
assert.match(presetManager, /name="accessMode"/);
assert.match(presetManager, /name="allowedUserIds"/);
assert.match(studio, /data-document-name-preview/);
assert.match(studio, /canManagePresets/);
assert.match(studio, /canManageTemplates/);
assert.match(templateManager, /name="accessMode"/);
assert.match(templateManager, /name="allowedUserIds"/);
assert.match(documentsScript, /resolveDocumentFolderDestination/);
assert.match(main, /installPreferredViewHandler/);
assert.match(main, /illuminated-document-settings/);
assert.match(main, /getHeaderControlsApplicationV2/);
assert.match(main, /Show Players/);
assert.match(viewer, /data-action="show-players"/);
assert.match(viewerScript, /showIlluminatedJournal/);
assert.match(viewerScript, /journal\.show\(Boolean\(force\)\)/);
assert.match(main, /message\?\.action === "showIlluminatedJournal"/);

const editorTemplate = await readFile(new URL("../templates/document-editor.hbs", import.meta.url), "utf8");
const editorScript = await readFile(new URL("../scripts/document-editor.js", import.meta.url), "utf8");
const contentEntriesScript = await readFile(new URL("../scripts/content-entries.js", import.meta.url), "utf8");

assert.match(editorTemplate, /data-entry-list/);
assert.match(editorTemplate, /data-action="move-up"/);
assert.match(editorTemplate, /data-action="move-down"/);
assert.match(editorTemplate, /data-action="delete-entry"/);
assert.match(editorTemplate, /name="presetId"/);
assert.match(editorTemplate, /Save book changes/);
assert.match(editorScript, /editDocumentForCurrentUser/);
assert.match(editorScript, /data-drag-entry/);
assert.match(contentEntriesScript, /reconstructFromExtensionHistory/);
assert.match(contentEntriesScript, /combineContentEntries/);
assert.match(main, /DocumentEditor\.open/);
assert.match(main, /editLiveJournal/);
assert.match(viewer, /data-action="edit"/);
assert.match(studio, /data-action="edit-selected"/);
assert.match(css, /\.idoc-document-editor\s*\{/);
assert.match(css, /\.idoc-entry-card\s*\{/);

assert.match(main, /ILLUMINATED\.SidebarStudio/);
assert.match(main, /ILLUMINATED\.SidebarStore/);
assert.match(css, /\.idoc-destination-preview\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content;/);
assert.match(css, /\.idoc-destination-preview button\s*\{[\s\S]*?width:\s*auto;[\s\S]*?white-space:\s*nowrap;/);
assert.doesNotMatch(css, /\.idoc-destination-preview strong\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/);

// New Document preset controls remain beside the flexible preset selector at normal widths.
assert.match(studio, /class="idoc-preset-control-row"[\s\S]*?<select id="idoc-book-preset"[\s\S]*?class="idoc-preset-actions"/);
assert.match(studio, /data-action="manage-templates"[\s\S]*?ILLUMINATED\.Studio\.VisualTemplatesAction/);
assert.match(studio, /data-action="manage-presets"[\s\S]*?ILLUMINATED\.Studio\.PresetsAction/);
assert.match(css, /\.idoc-preset-control-row\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content;/);
assert.match(css, /\.idoc-preset-actions\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?white-space:\s*nowrap;/);
assert.match(css, /@media \(max-width:\s*560px\)[\s\S]*?\.idoc-preset-control-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);

// The title has an explicit localized label, visible hint, useful placeholder and keyboard focus styling.
assert.match(studio, /class="idoc-studio-field idoc-document-title-field"/);
assert.match(studio, /<label id="idoc-document-title-label" for="idoc-document-title">/);
assert.match(studio, /ILLUMINATED\.Studio\.DocumentTitleLabel/);
assert.match(studio, /ILLUMINATED\.Studio\.DocumentTitleHint/);
assert.match(studio, /id="idoc-document-title"[\s\S]*?name="title"[\s\S]*?ILLUMINATED\.Studio\.DocumentTitlePlaceholder[\s\S]*?aria-describedby="idoc-document-title-hint"/);
assert.match(css, /\.idoc-document-title-field input\s*\{[\s\S]*?height:\s*42px;[\s\S]*?font-size:\s*1\.05rem;/);
assert.match(css, /\.idoc-document-title-field input:focus,[\s\S]*?outline:\s*2px solid/);

console.log("UI regression tests passed");

// Long-book previews and viewers use the shared virtualized page surface rather than eager image lists.
const virtualBook = await readFile(new URL("../scripts/virtual-book.js", import.meta.url), "utf8");
const liveRender = await readFile(new URL("../scripts/live-render.js", import.meta.url), "utf8");
assert.match(editorTemplate, /{{#if hasPreview}}[\s\S]*data-virtual-preview/);
assert.doesNotMatch(editorTemplate, /{{#each previews}}/);
assert.match(virtualBook, /IntersectionObserver/);
assert.match(virtualBook, /DEFAULT_RASTER_CACHE_BYTES/);
assert.match(virtualBook, /rootMargin:/);
assert.match(liveRender, /planBookPageEntries/);
assert.match(liveRender, /new VirtualBookView/);
assert.match(css, /\.idoc-virtual-page-frame\s*\{[\s\S]*?content-visibility:\s*auto;/);
assert.match(css, /\.idoc-virtual-page-surface\s*\{[\s\S]*?aspect-ratio:/);
