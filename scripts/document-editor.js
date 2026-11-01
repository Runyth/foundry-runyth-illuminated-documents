// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { planBookPageEntries } from "./renderer.js";
import { VirtualBookView } from "./virtual-book.js";
import { MODULE_ID } from "./settings.js";
import { getPresets, getPresetsForUser } from "./presets.js";
import { firstPreset, resolveBookDefinition } from "./book-definition.js";
import {
  canEditJournal,
  getJournalLiveMetadata
} from "./documents.js";
import { editDocumentForCurrentUser } from "./document-operations.js";
import {
  combineContentEntries,
  createContentEntry,
  describeEntryKind,
  getContentEntries
} from "./content-entries.js";
import { openIlluminatedJournal } from "./viewer.js";
import {
  IlluminatedApplicationV2,
  confirmV2,
  renderV2,
  safeRenderV2,
  setApplicationBusy
} from "./application-v2.js";
import { extensionRuntime } from "./extensions/runtime.js";
import { ensureDocumentExtensionEnvelope } from "./extensions/metadata.js";
import { transformIlluminatedContentBlocks } from "./live-render.js";
import { escapeSelectorValue, query, queryAll } from "./dom.js";

function cloneEntries(entries) {
  return entries.map((entry) => ({
    ...entry,
    createdBy: { ...(entry.createdBy || {}) },
    ...(entry.lastEditedBy ? { lastEditedBy: { ...entry.lastEditedBy } } : {})
  }));
}

function formatTimestamp(value) {
  if (!value) return "Unknown time";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (_error) {
    return "Unknown time";
  }
}

function migrationMessage(mode) {
  if (mode === "reconstructed") {
    return "This older book was reconstructed into its initial input and individual appended inputs. Saving converts it permanently to structured content sections.";
  }
  if (mode === "partially-reconstructed") {
    return "Recent appended inputs were reconstructed individually. Older inputs whose audit history was no longer available remain together in the first combined section.";
  }
  if (mode === "legacy-combined") {
    return "The old book does not contain enough append history to separate prior inputs. Its existing text is available as one editable legacy section; all future additions remain separate.";
  }
  return "";
}

async function confirmSectionRemoval(entry) {
  const escapedLabel = foundry.utils.escapeHTML(entry?.label || "this content section");
  return confirmV2({
    title: "Remove content section",
    content: `<p>Remove <strong>${escapedLabel}</strong> from the book?</p><p>The text is removed only after you save the document.</p>`,
    yesLabel: "Remove",
    noLabel: "Keep section"
  });
}

export class DocumentEditor extends IlluminatedApplicationV2 {
  static GEOMETRY_KEY = "documentEditor";

  static DEFAULT_OPTIONS = {
    id: "illuminated-document-editor",
    classes: ["illuminated-documents-window"],
    window: {
      title: "Illuminated Documents: Edit Book",
      resizable: true
    },
    position: {
      width: 1280,
      height: 840
    },
    actions: {
      reload: this._onReload,
      "move-up": this._onMoveUp,
      "move-down": this._onMoveDown,
      "delete-entry": this._onDeleteEntry,
      "add-entry": this._onAddEntry,
      "start-all-new-pages": this._onStartAllNewPages,
      preview: this._onPreview,
      save: this._onSave
    }
  };

  static PARTS = {
    main: {
      template: "modules/runyth-illuminated-documents/templates/document-editor.hbs"
    }
  };

  static _onReload() {
    return this._reload();
  }

  static _onMoveUp(_event, target) {
    return this._moveEntry(this._html(), target.dataset.entryId, -1);
  }

  static _onMoveDown(_event, target) {
    return this._moveEntry(this._html(), target.dataset.entryId, 1);
  }

  static _onDeleteEntry(_event, target) {
    return this._deleteEntry(this._html(), target.dataset.entryId);
  }

  static _onAddEntry() {
    return this._addEntry(this._html());
  }

  static _onStartAllNewPages() {
    return this._startAllSectionsOnNewPages(this._html());
  }

  static _onPreview() {
    return this._preview(this._html());
  }

  static _onSave() {
    return this._save(this._html());
  }

  constructor(journalId, options = {}) {
    const journal = game.journal.get(journalId);
    super({
      ...options,
      window: {
        ...(options.window || {}),
        title: journal ? `Edit Illuminated Document: ${journal.name}` : "Edit Illuminated Document"
      }
    });
    this.journalId = journalId;
    this.previewPlans = [];
    this.previewView = null;
    this.previewDescription = "";
    this.draggedEntryId = "";
    this._savePending = false;
    this._loadFromJournal();
  }

  static open(journalId) {
    const journal = game.journal.get(journalId);
    if (!journal || !canEditJournal(journal)) {
      ui.notifications.error("You do not have permission to edit this illuminated document.");
      return null;
    }
    const editor = new DocumentEditor(journalId);
    renderV2(editor);
    return editor;
  }

  get journal() {
    return game.journal.get(this.journalId);
  }

  _canRender() {
    if (!this.journal || !canEditJournal(this.journal)) {
      ui.notifications.error("You do not have permission to edit this illuminated document.");
      return false;
    }
  }

  _loadFromJournal() {
    const metadata = getJournalLiveMetadata(this.journal);
    if (!metadata) throw new Error("The selected Journal is not an Illuminated Document.");
    if (!canEditJournal(this.journal)) throw new Error("You do not have permission to edit this illuminated document.");

    const content = getContentEntries(metadata, { documentUuid: this.journal?.uuid || "" });
    this.entries = cloneEntries(content.entries);
    this.extensionMetadata = ensureDocumentExtensionEnvelope(metadata);
    this.documentExtensionGroups = [];
    this.blockExtensionGroups = new Map();
    this.migrationMode = content.migrationMode;
    this.presetId = String(metadata.presetId || "");
    this.includeFrontCover = Boolean(metadata.includeFrontCover);
    this.includeBackCover = Boolean(metadata.includeBackCover);
    this.sectionsAsChapters = Boolean(metadata.sectionsAsChapters);
    this.expectedRevision = Number(metadata.revision || 0);
  }

  _presets() {
    const stored = getPresets();
    if (!Object.keys(stored).length) {
      const fallback = firstPreset();
      return { [fallback.id]: fallback };
    }
    const accessible = getPresetsForUser(game.user);
    if (stored[this.presetId]) accessible[this.presetId] = stored[this.presetId];
    return accessible;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const journal = this.journal;
    const metadata = getJournalLiveMetadata(journal);
    const presets = this._presets();
    if (!presets[this.presetId]) this.presetId = Object.keys(presets)[0] || "";
    const activePreset = presets[this.presetId] || {};
    const migrationNotice = migrationMessage(this.migrationMode);
    const lifecycleContext = {
      application: this,
      document: journal,
      journal,
      documentUuid: journal?.uuid || "",
      currentUser: game.user,
      isGM: game.user.isGM,
      editable: true,
      preset: activePreset,
      metadata: this.extensionMetadata,
      extensionData: this.extensionMetadata.extensions,
      contentBlocks: cloneEntries(this.entries)
    };
    this.extensionContributions = await extensionRuntime.runLifecycle("prepareEditorContext", lifecycleContext);
    this.documentExtensionGroups = await extensionRuntime.fields.prepareGroups({
      scope: "document",
      metadata: this.extensionMetadata,
      preset: activePreset,
      lifecycleContext
    });
    this.blockExtensionGroups = new Map();
    for (const entry of this.entries) {
      this.blockExtensionGroups.set(entry.id, await extensionRuntime.fields.prepareGroups({
        scope: "block",
        metadata: this.extensionMetadata,
        preset: activePreset,
        block: entry,
        lifecycleContext
      }));
    }

    return {
      ...context,
      journalName: journal?.name || "Missing Journal",
      revision: this.expectedRevision,
      sourceLength: combineContentEntries(this.entries).length.toLocaleString(),
      entryCount: this.entries.length,
      presets: Object.values(presets),
      presetId: this.presetId,
      activePreset,
      includeFrontCover: this.includeFrontCover,
      includeBackCover: this.includeBackCover,
      sectionsAsChapters: this.sectionsAsChapters,
      migrationNotice,
      allSectionsStartOnNewPage: this.entries.length <= 1
        || this.entries.slice(1).every((entry) => Boolean(entry.startOnNewPage)),
      entries: this.entries.map((entry, index) => ({
        ...entry,
        position: index + 1,
        kindLabel: describeEntryKind(entry.kind),
        authorLabel: entry.createdBy?.userName || "Unknown author",
        createdAtLabel: formatTimestamp(entry.createdAt),
        canMoveUp: index > 0,
        canMoveDown: index < this.entries.length - 1,
        canDelete: this.entries.length > 1,
        canSetPageBreak: index > 0,
        startOnNewPage: Boolean(entry.startOnNewPage),
        extensionGroups: this.blockExtensionGroups.get(entry.id) || [],
        hasExtensionGroups: (this.blockExtensionGroups.get(entry.id) || []).length > 0
      })),
      hasPreview: this.previewPlans.length > 0,
      previewCount: this.previewPlans.length,
      previewDescription: this.previewDescription,
      updatedAtLabel: formatTimestamp(metadata?.updatedAt || metadata?.createdAt),
      documentExtensionGroups: this.documentExtensionGroups,
      hasDocumentExtensions: this.documentExtensionGroups.length > 0
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this._html();
    for (const element of queryAll(root, "[data-entry-label], [data-entry-text], [data-entry-page-break], select[name='presetId'], input[name='includeFrontCover'], input[name='includeBackCover']")) {
      this._listen(element, "input", () => this._capture(root));
      this._listen(element, "change", () => this._capture(root));
    }
    const presetSelect = query(root, "select[name='presetId']");
    this._listen(presetSelect, "change", () => {
      this._capture(root);
      this._clearPreviews();
      void safeRenderV2(this, { force: true });
    });
    this._activateDragAndDrop(root);
    await extensionRuntime.fields.renderCustomFields(this.element, this.documentExtensionGroups, {
      application: this,
      document: this.journal,
      documentUuid: this.journal?.uuid || ""
    });
    for (const groups of this.blockExtensionGroups.values()) {
      await extensionRuntime.fields.renderCustomFields(this.element, groups, {
        application: this,
        document: this.journal,
        documentUuid: this.journal?.uuid || ""
      });
    }
    this._mountPreview(root);
  }

  _capture(root) {
    const preset = query(root, "select[name='presetId']")?.value;
    if (preset) this.presetId = String(preset);
    this.includeFrontCover = Boolean(query(root, "input[name='includeFrontCover']")?.checked);
    this.includeBackCover = Boolean(query(root, "input[name='includeBackCover']")?.checked);
    this.sectionsAsChapters = Boolean(query(root, "input[name='sectionsAsChapters']")?.checked);

    const currentById = new Map(this.entries.map((entry) => [entry.id, entry]));
    const entries = [];
    for (const card of queryAll(root, "[data-entry-card]")) {
      const id = String(card.dataset.entryId || "");
      const previous = currentById.get(id) || {};
      entries.push({
        ...previous,
        id,
        label: String(card.querySelector("[data-entry-label]")?.value || ""),
        text: String(card.querySelector("[data-entry-text]")?.value || ""),
        startOnNewPage: Boolean(card.querySelector("[data-entry-page-break]")?.checked)
      });
    }
    if (entries.length) this.entries = entries;
    this.extensionMetadata = extensionRuntime.fields.capture(this.element, this.documentExtensionGroups, {
      metadata: this.extensionMetadata
    });
    for (const entry of entries) {
      this.extensionMetadata = extensionRuntime.fields.capture(this.element, this.blockExtensionGroups.get(entry.id) || [], {
        metadata: this.extensionMetadata,
        blockId: entry.id
      });
    }
  }

  _values(html) {
    this._capture(html);
    const definition = resolveBookDefinition({
      presetId: this.presetId,
      includeFrontCover: this.includeFrontCover,
      includeBackCover: this.includeBackCover
    });
    const text = combineContentEntries(this.entries);
    if (!text) throw new Error("An illuminated document must contain text.");
    const emptyIndex = this.entries.findIndex((entry) => !String(entry.text || "").trim());
    if (emptyIndex >= 0) throw new Error(`Content section ${emptyIndex + 1} is empty. Add text or remove the section.`);

    return {
      ...definition,
      presetId: this.presetId,
      includeFrontCover: definition.includeFrontCover,
      includeBackCover: definition.includeBackCover,
      sectionsAsChapters: this.sectionsAsChapters,
      entries: cloneEntries(this.entries),
      extensions: this.extensionMetadata.extensions,
      text
    };
  }

  _moveEntry(html, entryId, direction) {
    this._capture(html);
    const index = this.entries.findIndex((entry) => entry.id === entryId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.entries.length) return;
    const [entry] = this.entries.splice(index, 1);
    this.entries.splice(target, 0, entry);
    this._clearPreviews();
    return this.render();
  }

  async _deleteEntry(html, entryId) {
    this._capture(html);
    if (this.entries.length <= 1) return ui.notifications.warn("An illuminated document must keep at least one content section.");
    const entry = this.entries.find((candidate) => candidate.id === entryId);
    const confirmed = await confirmSectionRemoval(entry);
    if (!confirmed) return;
    this.entries = this.entries.filter((candidate) => candidate.id !== entryId);
    this._clearPreviews();
    return this.render();
  }

  _startAllSectionsOnNewPages(html) {
    this._capture(html);
    this.entries = this.entries.map((entry, index) => ({
      ...entry,
      startOnNewPage: index > 0
    }));
    this._clearPreviews();
    return this.render({ force: true });
  }

  async _addEntry(html) {
    this._capture(html);
    const now = Date.now();
    const id = globalThis.crypto?.randomUUID?.() || `manual-${now}`;
    this.entries.push({
      ...createContentEntry("New content", {
        id,
        kind: "manual",
        label: `Content section ${this.entries.length + 1}`,
        userId: game.user.id,
        userName: game.user.name,
        createdAt: now
      }),
      text: ""
    });
    this._clearPreviews();
    await this.render();
    this.element?.querySelector(`[data-entry-card][data-entry-id='${globalThis.CSS?.escape ? globalThis.CSS.escape(id) : id}'] [data-entry-text]`)?.focus();
  }

  _activateDragAndDrop(root) {
    for (const handle of queryAll(root, "[data-drag-entry]")) {
      this._listen(handle, "dragstart", (event) => {
        const entryId = String(event.currentTarget.dataset.entryId || "");
        this._capture(root);
        this.draggedEntryId = entryId;
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", entryId);
        }
        query(root, `[data-entry-card][data-entry-id="${escapeSelectorValue(entryId)}"]`)?.classList.add("is-dragging");
      });
      this._listen(handle, "dragend", () => {
        for (const card of queryAll(root, "[data-entry-card]")) {
          card.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
        }
        this.draggedEntryId = "";
      });
    }

    for (const card of queryAll(root, "[data-entry-card]")) {
      this._listen(card, "dragover", (event) => {
        if (!this.draggedEntryId) return;
        event.preventDefault();
        const rect = card.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        card.classList.toggle("is-drop-before", before);
        card.classList.toggle("is-drop-after", !before);
      });
      this._listen(card, "dragleave", () => {
        card.classList.remove("is-drop-before", "is-drop-after");
      });
      this._listen(card, "drop", (event) => {
        event.preventDefault();
        const targetId = String(card.dataset.entryId || "");
        const sourceId = this.draggedEntryId || event.dataTransfer?.getData("text/plain") || "";
        if (!sourceId || !targetId || sourceId === targetId) return;
        this._capture(root);
        const sourceIndex = this.entries.findIndex((entry) => entry.id === sourceId);
        const targetIndex = this.entries.findIndex((entry) => entry.id === targetId);
        if (sourceIndex < 0 || targetIndex < 0) return;
        const rect = card.getBoundingClientRect();
        const insertBefore = event.clientY < rect.top + rect.height / 2;
        const [entry] = this.entries.splice(sourceIndex, 1);
        let destination = this.entries.findIndex((candidate) => candidate.id === targetId);
        if (!insertBefore) destination += 1;
        this.entries.splice(destination, 0, entry);
        this.draggedEntryId = "";
        this._clearPreviews();
        void safeRenderV2(this, { force: true });
      });
    }
  }

  _clearPreviews() {
    this.previewView?.destroy();
    this.previewView = null;
    this.previewPlans = [];
    this.previewDescription = "";
  }

  _mountPreview(root = this._html()) {
    this.previewView?.destroy();
    this.previewView = null;
    if (!this.previewPlans.length) return;
    const target = query(root, "[data-virtual-preview]");
    if (!target) return;
    this.previewView = new VirtualBookView({
      rootElement: target,
      pagePlans: this.previewPlans,
      signal: this._renderAbortController?.signal,
      canvasClass: "idoc-rendered-preview",
      showStatus: false
    });
    this.previewView.mount();
  }

  async _preview(html) {
    try {
      this._clearPreviews();
      const values = this._values(html);
      const previewMetadata = ensureDocumentExtensionEnvelope({
        ...getJournalLiveMetadata(this.journal),
        presetId: values.presetId,
        includeFrontCover: values.includeFrontCover,
        includeBackCover: values.includeBackCover,
        sectionsAsChapters: values.sectionsAsChapters,
        contentEntries: values.entries,
        extensions: values.extensions
      });
      const transformedBlocks = await transformIlluminatedContentBlocks({
        journal: this.journal,
        metadata: previewMetadata,
        contentBlocks: values.entries,
        application: this,
        renderMode: "editor-preview",
        editable: true
      });
      this.previewPlans = await planBookPageEntries({
        ...values,
        text: combineContentEntries(transformedBlocks),
        contentEntries: transformedBlocks,
        signal: this._renderAbortController?.signal
      });
      this.previewDescription = `Unsaved edit preview · revision ${this.expectedRevision + 1}`;
      await this.render();
    } catch (error) {
      console.error(`${MODULE_ID} | Edit preview failed`, error);
      ui.notifications.error(error.message);
    }
  }

  async _save(html) {
    if (this._savePending) return;
    this._savePending = true;
    setApplicationBusy(this, true);
    try {
      const values = this._values(html);
      const payload = {
        journalId: this.journalId,
        entries: values.entries,
        presetId: values.presetId,
        includeFrontCover: values.includeFrontCover,
        includeBackCover: values.includeBackCover,
        sectionsAsChapters: values.sectionsAsChapters,
        extensions: values.extensions,
        requesterId: game.user.id,
        expectedRevision: this.expectedRevision
      };

      const { journal, metadata } = await editDocumentForCurrentUser(payload);

      this.expectedRevision = Number(metadata?.revision || this.expectedRevision + 1);
      this.entries = cloneEntries(getContentEntries(metadata, { documentUuid: journal?.uuid || this.journal?.uuid || "" }).entries);
      this.extensionMetadata = ensureDocumentExtensionEnvelope(metadata);
      this.migrationMode = "structured";
      this.presetId = metadata.presetId;
      this.includeFrontCover = Boolean(metadata.includeFrontCover);
      this.includeBackCover = Boolean(metadata.includeBackCover);
      this.sectionsAsChapters = Boolean(metadata.sectionsAsChapters);
      this._clearPreviews();
      await this.render();
      ui.notifications.info(`Updated illuminated document: ${journal?.name || this.journal?.name}`);
      if (journal) await openIlluminatedJournal(journal);
    } catch (error) {
      console.error(`${MODULE_ID} | Document edit failed`, error);
      ui.notifications.error(error.message);
    } finally {
      this._savePending = false;
      setApplicationBusy(this, false);
    }
  }

  async _reload() {
    this._clearPreviews();
    this._loadFromJournal();
    await this.render();
    ui.notifications.info("Reloaded the current saved book revision.");
  }

  async _preClose(options) {
    this._clearPreviews();
    return super._preClose(options);
  }
}
