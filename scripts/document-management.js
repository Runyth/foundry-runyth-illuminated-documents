// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import {
  DEFAULT_DOCUMENT_FOLDER_NAME,
  DOCUMENT_FOLDER_MODES,
  MODULE_ID,
  SETTINGS
} from "./settings.js";
import { DEFAULT_NAME_FORMAT, buildDocumentName } from "./naming.js";
import { getPresets } from "./presets.js";
import { JOURNAL_VIEW_MODES } from "./viewer.js";
import {
  describeDocumentFolderDestination,
  ensureDefaultDocumentFolder,
  getDocumentFolderConfiguration,
  journalFolderById
} from "./journal-folders.js";
import { IlluminatedApplicationV2, promptV2, setApplicationBusy } from "./application-v2.js";
import { extensionRuntime } from "./extensions/runtime.js";
import { getJournalLiveMetadata } from "./documents.js";
import { getContentEntries } from "./content-entries.js";
import { query, queryAll, setDisabled, setText, toggleClass } from "./dom.js";

function journalFolders() {
  const folders = Array.from(game.folders || []).filter((folder) => folder.type === "JournalEntry");
  const byId = new Map(folders.map((folder) => [folder.id, folder]));

  const pathFor = (folder) => {
    const parts = [folder.name];
    const seen = new Set([folder.id]);
    let parent = folder.folder;
    while (parent) {
      const parentFolder = typeof parent === "string" ? byId.get(parent) : parent;
      if (!parentFolder || seen.has(parentFolder.id)) break;
      seen.add(parentFolder.id);
      parts.unshift(parentFolder.name);
      parent = parentFolder.folder;
    }
    return parts.join(" / ");
  };

  return folders
    .map((folder) => ({ id: folder.id, name: folder.name, path: pathFor(folder) }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function currentSettings() {
  const folderConfiguration = getDocumentFolderConfiguration();
  const configuredView = game.settings.get(MODULE_ID, SETTINGS.defaultJournalView);
  return {
    folderMode: folderConfiguration.mode,
    folderId: folderConfiguration.folder?.id || folderConfiguration.folderId || "",
    globalPrefix: game.settings.get(MODULE_ID, SETTINGS.globalNamePrefix) || "",
    globalSuffix: game.settings.get(MODULE_ID, SETTINGS.globalNameSuffix) || "",
    globalFormat: game.settings.get(MODULE_ID, SETTINGS.globalNameFormat) || DEFAULT_NAME_FORMAT,
    journalViewMode: Object.values(JOURNAL_VIEW_MODES).includes(configuredView)
      ? configuredView
      : JOURNAL_VIEW_MODES.JOURNAL
  };
}

function previewName(settings) {
  const configuredPreset = Object.values(getPresets())[0] || { name: "Open Book" };
  const preset = { ...configuredPreset, nameFormat: "" };
  return buildDocumentName({
    title: "Session Chronicle",
    preset,
    globalPrefix: settings.globalPrefix,
    globalSuffix: settings.globalSuffix,
    globalFormat: settings.globalFormat,
    userName: game.user?.name || "Game Master",
    now: new Date(2026, 6, 24, 19, 30)
  });
}

function destinationStatus(settings) {
  return describeDocumentFolderDestination({
    mode: settings.folderMode,
    folderId: settings.folderId
  });
}

export class DocumentManagement extends IlluminatedApplicationV2 {
  static GEOMETRY_KEY = "documentManagement";

  static DEFAULT_OPTIONS = {
    id: "illuminated-document-management",
    classes: ["illuminated-documents-window"],
    window: {
      title: "Illuminated Documents: Storage & Naming",
      resizable: true
    },
    position: {
      width: 780,
      height: 760
    },
    actions: {
      "create-folder": this._onCreateFolder,
      "create-default-folder": this._onCreateDefaultFolder,
      "reset-format": this._onResetFormat,
      "copy-extension-diagnostics": this._onCopyExtensionDiagnostics,
      "validate-extensions": this._onValidateExtensions,
      "rerender-extensions": this._onRerenderExtensions,
      "clear-extension-caches": this._onClearExtensionCaches,
      save: this._onSave
    }
  };

  static PARTS = {
    main: {
      template: "modules/runyth-illuminated-documents/templates/document-management.hbs"
    }
  };

  static _onCreateFolder() {
    return this._createFolder(this._html());
  }

  static _onCreateDefaultFolder() {
    return this._createDefaultFolder(this._html());
  }

  static _onResetFormat() {
    const html = this._html();
    this._capture(html);
    this.settings.globalFormat = DEFAULT_NAME_FORMAT;
    const formatInput = query(html, "[name='globalFormat']");
    if (formatInput) formatInput.value = DEFAULT_NAME_FORMAT;
    this._updateDerivedValues();
    this._paintDerivedValues(html);
  }

  static _onSave() {
    return this._save(this._html());
  }

  static _onCopyExtensionDiagnostics() {
    return this._copyExtensionDiagnostics();
  }

  static _onValidateExtensions() {
    return this._validateExtensions();
  }

  static _onRerenderExtensions() {
    return this._rerenderExtensions();
  }

  static _onClearExtensionCaches() {
    return this._clearExtensionCaches();
  }

  constructor(...args) {
    super(...args);
    this.settings = currentSettings();
    this.preview = "";
    this.previewError = "";
    this.destination = "";
    this._savePending = false;
    this._updateDerivedValues();
  }

  _canRender() {
    if (!game.user.isGM) {
      ui.notifications.error("Only a Game Master can configure Illuminated Documents storage and naming.");
      return false;
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const folders = journalFolders();
    const customFolderAvailable = Boolean(journalFolderById(this.settings.folderId));
    return {
      ...context,
      settings: this.settings,
      folders: folders.map((folder) => ({ ...folder, selected: folder.id === this.settings.folderId })),
      preview: this.preview,
      previewError: this.previewError,
      destination: this.destination,
      customFolderAvailable,
      defaultFolderName: DEFAULT_DOCUMENT_FOLDER_NAME,
      defaultFormat: DEFAULT_NAME_FORMAT,
      folderModes: [
        {
          id: DOCUMENT_FOLDER_MODES.DEFAULT,
          name: `Module default folder (${DEFAULT_DOCUMENT_FOLDER_NAME})`,
          description: "Created automatically in the Journal tab when needed.",
          selected: this.settings.folderMode === DOCUMENT_FOLDER_MODES.DEFAULT
        },
        {
          id: DOCUMENT_FOLDER_MODES.CUSTOM,
          name: "Custom Journal folder",
          description: "Use any existing Journal folder. If it disappears, the module default folder is used safely.",
          selected: this.settings.folderMode === DOCUMENT_FOLDER_MODES.CUSTOM
        },
        {
          id: DOCUMENT_FOLDER_MODES.ROOT,
          name: "Journal root",
          description: "Create books directly at the top level of the Journal tab.",
          selected: this.settings.folderMode === DOCUMENT_FOLDER_MODES.ROOT
        }
      ],
      viewModes: [
        { id: JOURNAL_VIEW_MODES.JOURNAL, name: "Foundry Journal Entry", selected: this.settings.journalViewMode === JOURNAL_VIEW_MODES.JOURNAL },
        { id: JOURNAL_VIEW_MODES.PAGE, name: "Foundry single-page view", selected: this.settings.journalViewMode === JOURNAL_VIEW_MODES.PAGE },
        { id: JOURNAL_VIEW_MODES.VIEWER, name: "Illuminated book viewer", selected: this.settings.journalViewMode === JOURNAL_VIEW_MODES.VIEWER }
      ],
      extensionDiagnostics: extensionRuntime.diagnostics(),
      hasRegisteredExtensions: extensionRuntime.registry.list().length > 0
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this._html();
    const update = () => {
      this._capture(root);
      this._updateDerivedValues();
      this._paintDerivedValues(root);
    };
    for (const element of queryAll(root, "input, select")) {
      this._listen(element, "input", update);
      this._listen(element, "change", update);
    }
    this._paintDerivedValues(root);
  }

  _capture(html) {
    const form = this.form;
    if (!form) return;
    const data = this._formDataObject(form);
    const previousFolderId = this.settings.folderId;
    this.settings = {
      folderMode: String(data.folderMode || DOCUMENT_FOLDER_MODES.DEFAULT),
      folderId: data.folderId === undefined ? previousFolderId : String(data.folderId || ""),
      globalPrefix: String(data.globalPrefix || ""),
      globalSuffix: String(data.globalSuffix || ""),
      globalFormat: String(data.globalFormat || DEFAULT_NAME_FORMAT),
      journalViewMode: String(data.journalViewMode || JOURNAL_VIEW_MODES.JOURNAL)
    };
  }

  _updateDerivedValues() {
    try {
      this.preview = previewName(this.settings);
      this.previewError = "";
    } catch (error) {
      this.preview = "";
      this.previewError = error.message;
    }
    this.destination = destinationStatus(this.settings);
  }

  _paintDerivedValues(root) {
    toggleClass(root, "[data-name-preview]", "is-error", Boolean(this.previewError));
    setText(root, "[data-name-preview]", this.previewError || this.preview);
    setText(root, "[data-destination-preview]", this.destination);

    const custom = this.settings.folderMode === DOCUMENT_FOLDER_MODES.CUSTOM;
    toggleClass(root, "[data-custom-folder-fields]", "is-disabled", !custom);
    setDisabled(root, "[name='folderId']", !custom);
    setDisabled(root, "[data-action='create-folder']", !custom);
  }

  async _createFolder(html) {
    this._capture(html);
    const name = await promptV2({
      title: "Create Journal folder",
      content: '<div class="form-group"><label>Folder name</label><input type="text" name="folderName" value="Illuminated Documents" autofocus></div>',
      okLabel: "Create folder",
      callback: (_event, button) => String(button.form.elements.folderName?.value || "").trim()
    });
    if (!name) return;

    try {
      const folder = await Folder.create({ name, type: "JournalEntry", folder: null });
      this.settings.folderMode = DOCUMENT_FOLDER_MODES.CUSTOM;
      this.settings.folderId = folder.id;
      await this.render();
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to create Journal folder`, error);
      ui.notifications.error(error.message || "Unable to create the Journal folder.");
    }
  }

  async _createDefaultFolder(html) {
    this._capture(html);
    try {
      const folder = await ensureDefaultDocumentFolder();
      if (!folder) return ui.notifications.error("Only a GM can create the default Journal folder.");
      this.settings.folderMode = DOCUMENT_FOLDER_MODES.DEFAULT;
      ui.notifications.info(`Default Journal folder ready: ${folder.name}`);
      await this.render();
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to prepare the default Journal folder`, error);
      ui.notifications.error(error.message || "Unable to prepare the default Journal folder.");
    }
  }

  async _copyExtensionDiagnostics() {
    const report = extensionRuntime.diagnosticReport();
    try {
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(report);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = report;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        const copied = document.execCommand?.("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard access is unavailable.");
      }
      ui.notifications.info(game.i18n.localize("ILLUMINATED.Extensions.DiagnosticsCopied"));
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to copy extension diagnostics`, error);
      ui.notifications.error(game.i18n.localize("ILLUMINATED.Extensions.DiagnosticsCopyFailed"));
    }
  }

  async _validateExtensions() {
    const journals = Array.from(game.journal || []).filter((journal) => getJournalLiveMetadata(journal));
    let resultCount = 0;
    let errorCount = 0;
    for (const journal of journals) {
      const metadata = getJournalLiveMetadata(journal);
      const results = await extensionRuntime.validation.validate({
        document: journal,
        documentUuid: journal.uuid,
        currentUser: game.user,
        metadata,
        contentBlocks: getContentEntries(metadata, { documentUuid: journal.uuid }).entries,
        extensionData: metadata?.extensions || {}
      });
      resultCount += results.length;
      errorCount += results.filter((result) => result.severity === "error").length;
    }
    ui.notifications.info(game.i18n.format("ILLUMINATED.Extensions.ValidationComplete", {
      documents: journals.length,
      results: resultCount,
      errors: errorCount
    }));
    await this.render({ force: true });
  }

  async _rerenderExtensions() {
    await extensionRuntime.rendering.rerender("");
    ui.notifications.info(game.i18n.localize("ILLUMINATED.Extensions.Rerendered"));
  }

  async _clearExtensionCaches() {
    extensionRuntime.clearTransientState();
    await extensionRuntime.rendering.rerender("");
    ui.notifications.info(game.i18n.localize("ILLUMINATED.Extensions.CachesCleared"));
    await this.render({ force: true });
  }

  async _save(html) {
    if (this._savePending) return;
    this._savePending = true;
    setApplicationBusy(this, true);
    this._capture(html);
    this._updateDerivedValues();
    try {
      if (this.previewError) {
        ui.notifications.error(this.previewError);
        return;
      }

      if (this.settings.folderMode === DOCUMENT_FOLDER_MODES.DEFAULT) {
        await ensureDefaultDocumentFolder();
      }

      await Promise.all([
        game.settings.set(MODULE_ID, SETTINGS.documentFolderMode, this.settings.folderMode),
        game.settings.set(MODULE_ID, SETTINGS.documentFolderId, this.settings.folderId),
        game.settings.set(MODULE_ID, SETTINGS.globalNamePrefix, this.settings.globalPrefix),
        game.settings.set(MODULE_ID, SETTINGS.globalNameSuffix, this.settings.globalSuffix),
        game.settings.set(MODULE_ID, SETTINGS.globalNameFormat, this.settings.globalFormat),
        game.settings.set(MODULE_ID, SETTINGS.defaultJournalView, this.settings.journalViewMode)
      ]);
      ui.notifications.info("Illuminated Documents storage and naming settings saved.");
      this.settings = currentSettings();
      this._updateDerivedValues();
      await this.render();
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to save storage and naming settings`, error);
      ui.notifications.error(error.message || "Unable to save Illuminated Documents settings.");
    } finally {
      this._savePending = false;
      setApplicationBusy(this, false);
    }
  }
}
