// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { planBookPageEntries } from "./renderer.js";
import { VirtualBookView } from "./virtual-book.js";
import { getTemplates, MODULE_ID, SETTINGS } from "./settings.js";
import { firstPreset, resolveBookDefinition } from "./book-definition.js";
import { getPresets, getPresetsForUser } from "./presets.js";
import { canCreateDocuments, canManagePresets, canManageTemplates } from "./permissions.js";
import {
  combineDocumentText,
  getJournalLiveMetadata,
  listExtendableJournals
} from "./documents.js";
import {
  createDocumentForCurrentUser,
  extendDocumentForCurrentUser
} from "./document-operations.js";
import { TemplateManager } from "./template-manager.js";
import { PresetManager } from "./preset-manager.js";
import {
  IlluminatedApplicationV2,
  renderV2,
  safeRenderV2,
  setApplicationBusy
} from "./application-v2.js";
import { buildDocumentName, DEFAULT_NAME_FORMAT } from "./naming.js";
import { openIlluminatedJournal } from "./viewer.js";
import { DocumentEditor } from "./document-editor.js";
import { booleanFormValue } from "./form-values.js";
import { extensionRuntime } from "./extensions/runtime.js";
import { ensureDocumentExtensionEnvelope, mergeExtensionData } from "./extensions/metadata.js";
import { randomStableId } from "./extensions/utils.js";
import { combineContentEntries, getContentEntries } from "./content-entries.js";
import { transformIlluminatedContentBlocks } from "./live-render.js";
import { query, queryAll, setText, toggleClass } from "./dom.js";

function formatTimestamp(value) {
  if (!value) return "Not recorded";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (_error) {
    return "Not recorded";
  }
}


function extensionDocumentData(journal, presets, selectedId) {
  const metadata = getJournalLiveMetadata(journal);
  const preset = presets[metadata?.presetId];
  return {
    id: journal.id,
    name: journal.name,
    selected: journal.id === selectedId,
    presetName: preset?.name || metadata?.presetId || "Missing preset",
    sourceLength: String(metadata?.sourceText || "").length.toLocaleString(),
    revision: Number(metadata?.revision || 0),
    extensionCount: Array.isArray(metadata?.extensionHistory) ? metadata.extensionHistory.length : 0,
    updatedAtLabel: formatTimestamp(metadata?.updatedAt || metadata?.createdAt),
    includesFrontCover: Boolean(metadata?.includeFrontCover),
    includesBackCover: Boolean(metadata?.includeBackCover),
    metadata
  };
}

export class DocumentStudio extends IlluminatedApplicationV2 {
  static GEOMETRY_KEY = "studioV2";

  static DEFAULT_OPTIONS = {
    id: "illuminated-document-studio",
    classes: ["illuminated-documents-window"],
    window: {
      title: "Illuminated Documents: Document Studio",
      resizable: true
    },
    position: {
      width: 1100,
      height: 780
    },
    actions: {
      preview: this._onPreview,
      render: this._onCreateOrExtend,
      "manage-templates": this._onManageTemplates,
      "manage-presets": this._onManagePresets,
      "edit-selected": this._onEditSelected
    }
  };

  static PARTS = {
    main: {
      template: "modules/runyth-illuminated-documents/templates/studio.hbs"
    }
  };

  static _onPreview() {
    return this._preview(this._html());
  }

  static _onCreateOrExtend() {
    return this._submit(this._html());
  }

  static _onManageTemplates() {
    return renderV2(new TemplateManager());
  }

  static _onManagePresets() {
    return renderV2(new PresetManager());
  }

  static _onEditSelected() {
    const html = this._html();
    this._capture(html);
    if (this.extension.journalId) DocumentEditor.open(this.extension.journalId);
  }

  static openForJournal(journalId) {
    const studio = new DocumentStudio();
    studio.mode = "extend";
    studio.extension.journalId = journalId;
    renderV2(studio);
    return studio;
  }

  constructor(...args) {
    super(...args);
    this.mode = "create";
    this.presets = {};
    this.presetId = "";
    this.previewPlans = [];
    this.previewView = null;
    this.previewDescription = "";
    this.draft = {
      title: "Illuminated Document",
      initialSectionLabel: "Initial content",
      text: "",
      includeFrontCover: false,
      includeBackCover: false,
      sectionsAsChapters: false
    };
    this.extension = {
      journalId: "",
      appendLabel: "",
      appendText: "",
      startOnNewPage: false
    };
    this._operationPending = false;
    this.extensionMetadata = ensureDocumentExtensionEnvelope({ extensions: {} });
    this.initialBlockId = randomStableId();
    this.appendBlockId = randomStableId();
    this.creationDocumentGroups = [];
    this.creationBlockGroups = [];
    this.appendBlockGroups = [];
    this.extensionContributions = [];
    this._refreshPresets();
  }

  _canRender() {
    if (!canCreateDocuments()) {
      ui.notifications.error("You do not have permission to create illuminated documents.");
      return false;
    }
  }

  _refreshPresets() {
    const templates = getTemplates();
    const allStored = getPresets();
    const accessible = getPresetsForUser(game.user);
    this.presets = Object.keys(allStored).length ? accessible : { "single-page": firstPreset(templates) };
    if (!this.presets[this.presetId]) this.presetId = Object.keys(this.presets)[0] || "";
  }

  _extensionDocuments() {
    const journals = listExtendableJournals();
    if (!journals.some((journal) => journal.id === this.extension.journalId)) {
      this.extension.journalId = journals[0]?.id || "";
    }
    return journals.map((journal) => extensionDocumentData(journal, this.presets, this.extension.journalId));
  }


  _documentNamePreview() {
    const preset = this.presets[this.presetId];
    if (!preset) return { value: "No book preset is shared with this account.", error: "No book preset is shared with this account." };
    try {
      return {
        value: buildDocumentName({
          title: this.draft.title,
          preset,
          globalPrefix: game.settings.get(MODULE_ID, SETTINGS.globalNamePrefix) || "",
          globalSuffix: game.settings.get(MODULE_ID, SETTINGS.globalNameSuffix) || "",
          globalFormat: game.settings.get(MODULE_ID, SETTINGS.globalNameFormat) || DEFAULT_NAME_FORMAT,
          userName: game.user?.name || ""
        }),
        error: ""
      };
    } catch (error) {
      return { value: "", error: error.message };
    }
  }

  _applyCreationDefaults(contributions, blockId) {
    for (const contribution of contributions || []) {
      const result = contribution?.result;
      if (!result || typeof result !== "object") continue;
      const extensionId = contribution.extensionId;
      const extension = extensionRuntime.registry.getInternal(extensionId);
      if (!extension) continue;
      const record = this.extensionMetadata.extensions[extensionId] || {
        schemaVersion: extension.schemaVersion,
        document: {},
        blocks: {},
        orphanedBlocks: {}
      };
      const documentDefaults = result.documentDefaults || result.documentData || {};
      const blockDefaults = result.blockDefaults || result.blockData || {};
      record.document = { ...documentDefaults, ...(record.document || {}) };
      if (blockId) record.blocks = {
        ...(record.blocks || {}),
        [blockId]: { ...blockDefaults, ...(record.blocks?.[blockId] || {}) }
      };
      record.schemaVersion = Math.max(Number(record.schemaVersion || 0), Number(extension.schemaVersion || 0));
      this.extensionMetadata.extensions[extensionId] = record;
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this._refreshPresets();
    const preset = this.presets[this.presetId];
    const existingDocuments = this._extensionDocuments();
    const selectedDocument = existingDocuments.find((document) => document.id === this.extension.journalId) || null;
    const namePreview = this._documentNamePreview();
    const lifecycleContext = {
      application: this,
      mode: this.mode,
      currentUser: game.user,
      isGM: game.user.isGM,
      preset: preset || null,
      document: selectedDocument ? game.journal.get(selectedDocument.id) : null,
      documentUuid: selectedDocument ? game.journal.get(selectedDocument.id)?.uuid || "" : "",
      contentBlocks: this.mode === "create"
        ? [{ id: this.initialBlockId, label: this.draft.initialSectionLabel || "Initial content", kind: "initial", text: this.draft.text }]
        : [{
          id: this.appendBlockId,
          label: this.extension.appendLabel || "New appended content",
          kind: "append",
          text: this.extension.appendText,
          startOnNewPage: this.extension.startOnNewPage
        }],
      extensionData: this.extensionMetadata.extensions
    };
    this.extensionContributions = await extensionRuntime.runLifecycle("prepareCreationContext", lifecycleContext);
    this._applyCreationDefaults(this.extensionContributions, this.mode === "create" ? this.initialBlockId : this.appendBlockId);
    this.creationDocumentGroups = await extensionRuntime.fields.prepareGroups({
      scope: "document",
      metadata: this.extensionMetadata,
      preset: preset || {},
      lifecycleContext
    });
    this.creationBlockGroups = await extensionRuntime.fields.prepareGroups({
      scope: "block",
      metadata: this.extensionMetadata,
      preset: preset || {},
      block: lifecycleContext.contentBlocks[0],
      lifecycleContext
    });
    const selectedMetadata = selectedDocument?.metadata || {};
    this.appendBlockGroups = await extensionRuntime.fields.prepareGroups({
      scope: "block",
      metadata: ensureDocumentExtensionEnvelope({ ...selectedMetadata, extensions: this.extensionMetadata.extensions }),
      preset: this.presets[selectedMetadata.presetId] || {},
      block: {
        id: this.appendBlockId,
        label: "New appended content",
        kind: "append",
        text: this.extension.appendText,
        startOnNewPage: this.extension.startOnNewPage
      },
      lifecycleContext
    });

    return {
      ...context,
      mode: this.mode,
      isCreateMode: this.mode === "create",
      isExtendMode: this.mode === "extend",
      presets: Object.values(this.presets),
      hasPresets: Object.keys(this.presets).length > 0,
      presetId: this.presetId,
      activePreset: preset || {},
      existingDocuments,
      hasExistingDocuments: existingDocuments.length > 0,
      selectedDocument,
      hasPreview: this.previewPlans.length > 0,
      previewCount: this.previewPlans.length,
      previewDescription: this.previewDescription,
      draft: this.draft,
      documentNamePreview: namePreview.value,
      documentNamePreviewError: namePreview.error,
      extension: this.extension,
      canManagePresets: canManagePresets(),
      canManageTemplates: canManageTemplates(),
      creationDocumentExtensionGroups: this.creationDocumentGroups,
      creationBlockExtensionGroups: this.creationBlockGroups,
      appendBlockExtensionGroups: this.appendBlockGroups,
      hasCreationExtensions: this.creationDocumentGroups.length > 0 || this.creationBlockGroups.length > 0,
      hasAppendExtensions: this.appendBlockGroups.length > 0
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this._html();
    const updateNamePreview = () => {
      this._capture(root);
      const preview = this._documentNamePreview();
      toggleClass(root, "[data-document-name-preview]", "is-error", Boolean(preview.error));
      setText(root, "[data-document-name-preview]", preview.error || preview.value);
    };
    for (const element of queryAll(root, "input, textarea")) {
      this._listen(element, "input", updateNamePreview);
      this._listen(element, "change", updateNamePreview);
    }
    for (const element of queryAll(root, "[data-mode]")) {
      this._listen(element, "click", (event) => this._switchMode(root, event.currentTarget.dataset.mode));
    }
    const presetSelect = query(root, "select[name='presetId']");
    this._listen(presetSelect, "change", (event) => {
      this._capture(root);
      this.presetId = event.currentTarget.value;
      this._clearPreviews();
      void safeRenderV2(this, { force: true });
    });
    const journalSelect = query(root, "select[name='journalId']");
    this._listen(journalSelect, "change", (event) => {
      this._capture(root);
      this.extension.journalId = event.currentTarget.value;
      this._clearPreviews();
      void safeRenderV2(this, { force: true });
    });
    await extensionRuntime.fields.renderCustomFields(root, [
      ...this.creationDocumentGroups,
      ...this.creationBlockGroups,
      ...this.appendBlockGroups
    ], { application: this, mode: this.mode });
    this._mountPreview(root);
  }

  _switchMode(html, mode) {
    if (!["create", "extend"].includes(mode) || mode === this.mode) return;
    this._capture(html);
    this.mode = mode;
    this._clearPreviews();
    void safeRenderV2(this);
  }

  _capture(html) {
    const form = this.form;
    if (!form) return;
    const data = this._formDataObject(form);

    if (this.mode === "create") {
      this.presetId = data.presetId || this.presetId;
      this.draft = {
        title: String(data.title || "Illuminated Document"),
        initialSectionLabel: String(data.initialSectionLabel || "Initial content"),
        text: String(data.text || ""),
        includeFrontCover: booleanFormValue(data.includeFrontCover),
        includeBackCover: booleanFormValue(data.includeBackCover),
        sectionsAsChapters: booleanFormValue(data.sectionsAsChapters)
      };
      this.extensionMetadata = extensionRuntime.fields.capture(this.element, this.creationDocumentGroups, {
        metadata: this.extensionMetadata
      });
      this.extensionMetadata = extensionRuntime.fields.capture(this.element, this.creationBlockGroups, {
        metadata: this.extensionMetadata,
        blockId: this.initialBlockId
      });
    } else {
      this.extension = {
        journalId: String(data.journalId || this.extension.journalId || ""),
        appendLabel: String(data.appendLabel || ""),
        appendText: String(data.appendText || ""),
        startOnNewPage: booleanFormValue(data.startOnNewPage)
      };
      this.extensionMetadata = extensionRuntime.fields.capture(this.element, this.appendBlockGroups, {
        metadata: this.extensionMetadata,
        blockId: this.appendBlockId
      });
    }
  }

  _createValues(html) {
    this._capture(html);
    if (!this.presetId || !this.presets[this.presetId]) {
      throw new Error("No usable book preset is available. Ask a Game Master to share one with your account.");
    }
    const title = this.draft.title.trim() || "Illuminated Document";
    const text = this.draft.text.trim();
    const namePreview = this._documentNamePreview();
    if (namePreview.error) throw new Error(namePreview.error);
    return {
      ...resolveBookDefinition({ presetId: this.presetId, ...this.draft }),
      presetId: this.presetId,
      title,
      documentName: namePreview.value,
      text,
      initialSectionLabel: this.draft.initialSectionLabel.trim() || "Initial content",
      includeFrontCover: this.draft.includeFrontCover,
      includeBackCover: this.draft.includeBackCover,
      sectionsAsChapters: this.draft.sectionsAsChapters,
      initialBlockId: this.initialBlockId,
      extensions: this.extensionMetadata.extensions
    };
  }

  _extensionValues(html) {
    this._capture(html);
    const journal = game.journal.get(this.extension.journalId);
    const metadata = getJournalLiveMetadata(journal);
    if (!journal || !metadata) throw new Error("Select an existing Illuminated Document first.");
    const appendedText = this.extension.appendText.trim();
    if (!appendedText) throw new Error("Enter additional text before extending the book.");

    return {
      journal,
      metadata,
      appendedText,
      combinedText: combineDocumentText(metadata.sourceText, appendedText),
      expectedRevision: Number(metadata.revision || 0),
      blockId: this.appendBlockId,
      label: this.extension.appendLabel.trim(),
      startOnNewPage: this.extension.startOnNewPage,
      blockExtensions: Object.fromEntries(
        Object.entries(this.extensionMetadata.extensions || {})
          .map(([extensionId, record]) => [extensionId, record.blocks?.[this.appendBlockId] || {}])
          .filter(([, value]) => Object.keys(value).length)
      ),
      ...resolveBookDefinition(metadata)
    };
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

  async _previewBlocks(values) {
    if (this.mode === "create") {
      const metadata = ensureDocumentExtensionEnvelope({
        presetId: values.presetId,
        includeFrontCover: values.includeFrontCover,
        includeBackCover: values.includeBackCover,
        sectionsAsChapters: values.sectionsAsChapters,
        contentEntries: [{
          id: values.initialBlockId,
          label: values.initialSectionLabel || "Initial content",
          kind: "initial",
          text: values.text
        }],
        extensions: values.extensions
      });
      const blocks = await transformIlluminatedContentBlocks({
        metadata,
        contentBlocks: metadata.contentEntries,
        application: this,
        renderMode: "creation-preview",
        editable: true
      });
      return blocks;
    }

    let metadata = ensureDocumentExtensionEnvelope(values.metadata);
    for (const [extensionId, blockData] of Object.entries(values.blockExtensions || {})) {
      metadata = mergeExtensionData(metadata, extensionId, { blocks: { [values.blockId]: blockData } });
    }
    const blocks = [
      ...getContentEntries(metadata, { documentUuid: values.journal.uuid }).entries,
      {
        id: values.blockId,
        label: values.label || "New appended content",
        kind: "append",
        text: values.appendedText,
        startOnNewPage: values.startOnNewPage
      }
    ];
    const transformed = await transformIlluminatedContentBlocks({
      journal: values.journal,
      metadata: { ...metadata, contentEntries: blocks },
      contentBlocks: blocks,
      application: this,
      renderMode: "append-preview",
      editable: true
    });
    return transformed;
  }

  async _preview(html) {
    try {
      this._clearPreviews();
      const values = this.mode === "extend" ? this._extensionValues(html) : this._createValues(html);
      const contentEntries = await this._previewBlocks(values);
      const text = combineContentEntries(contentEntries);
      if (!text) return ui.notifications.warn("Enter document text first.");

      this.previewPlans = await planBookPageEntries({
        ...values,
        text,
        contentEntries,
        signal: this._renderAbortController?.signal
      });
      this.previewDescription = this.mode === "extend"
        ? `Complete updated book preview · revision ${values.expectedRevision + 1}`
        : "Complete new book preview";
      await safeRenderV2(this);
    } catch (error) {
      console.error(`${MODULE_ID} | Preview failed`, error);
      ui.notifications.error(error.message);
    }
  }

  async _submit(html) {
    if (this._operationPending) return;
    if (!canCreateDocuments()) return ui.notifications.error("You do not have permission to create illuminated documents.");
    this._operationPending = true;
    setApplicationBusy(this, true);
    try {
      if (this.mode === "extend") await this._extend(html);
      else await this._create(html);
    } catch (error) {
      console.error(`${MODULE_ID} | Document operation failed`, error);
      ui.notifications.error(error.message);
    } finally {
      this._operationPending = false;
      if (this.rendered) setApplicationBusy(this, false);
    }
  }

  async _create(html) {
    const values = this._createValues(html);
    if (!values.text) throw new Error("Enter document text first.");
    const payload = {
      rawTitle: values.title,
      text: values.text,
      presetId: values.presetId,
      includeFrontCover: values.includeFrontCover,
      includeBackCover: values.includeBackCover,
      sectionsAsChapters: values.sectionsAsChapters,
      ownerId: game.user.id,
      initialBlockId: values.initialBlockId,
      initialBlockLabel: values.initialSectionLabel,
      extensions: values.extensions
    };

    const { journal } = await createDocumentForCurrentUser(payload);

    ui.notifications.info(`Created illuminated document: ${journal?.name || values.documentName}`);
    if (journal) {
      try {
        await openIlluminatedJournal(journal);
      } catch (error) {
        console.error(`${MODULE_ID} | Created document could not be opened automatically`, error);
        ui.notifications.warn("The document was created, but its viewer could not be opened automatically.");
      }
    } else {
      ui.notifications.warn("The document was created, but it has not synchronized to this client yet. Open it from the Journal tab.");
    }
    await this.close();
  }

  async _extend(html) {
    const values = this._extensionValues(html);
    const payload = {
      journalId: values.journal.id,
      appendedText: values.appendedText,
      requesterId: game.user.id,
      expectedRevision: values.expectedRevision,
      blockId: values.blockId,
      blockExtensions: values.blockExtensions,
      startOnNewPage: values.startOnNewPage,
      label: values.label
    };

    const { journal } = await extendDocumentForCurrentUser(payload);

    ui.notifications.info(`Extended illuminated document: ${values.journal.name}`);
    if (journal) {
      try {
        await openIlluminatedJournal(journal);
      } catch (error) {
        console.error(`${MODULE_ID} | Extended document could not be opened automatically`, error);
        ui.notifications.warn("The book was extended, but its viewer could not be opened automatically.");
      }
    }
    await this.close();
  }

  async _preClose(options) {
    this._clearPreviews();
    return super._preClose(options);
  }
}

export { resolveBookDefinition };
