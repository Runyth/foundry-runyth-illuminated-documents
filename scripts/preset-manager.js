// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { getTemplates, MODULE_ID, SETTINGS } from "./settings.js";
import {
  getPresetsForUser,
  getPresetRevision,
  normalizePreset,
  savePresetsForCurrentUser
} from "./presets.js";
import { buildDocumentName, DEFAULT_NAME_FORMAT } from "./naming.js";
import { IlluminatedApplicationV2, setApplicationBusy } from "./application-v2.js";
import { canManagePresets, canUseTemplate } from "./permissions.js";
import { RESOURCE_ACCESS_MODES, normalizeResourceAccess, resourceAccessForCreator } from "./access-model.js";
import { extensionRuntime } from "./extensions/runtime.js";
import { ensureDocumentExtensionEnvelope } from "./extensions/metadata.js";
import { cloneSerializable } from "./extensions/utils.js";
import { checkedValue, checkedValues, queryAll, setText, toggleClass } from "./dom.js";

function accessUsers(resource) {
  const selected = new Set(normalizeResourceAccess(resource).allowedUserIds);
  return game.users
    .filter((user) => !user.isGM)
    .map((user) => ({ id: user.id, name: user.name, active: user.active, checked: selected.has(user.id) }))
    .sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name));
}

export class PresetManager extends IlluminatedApplicationV2 {
  static GEOMETRY_KEY = "presetManagerV3";

  static DEFAULT_OPTIONS = {
    id: "illuminated-preset-manager",
    classes: ["illuminated-documents-window"],
    window: {
      title: "Illuminated Documents: Book Presets",
      resizable: true
    },
    position: {
      width: 980,
      height: 760
    },
    actions: {
      select: this._onSelect,
      new: this._onNew,
      delete: this._onDelete,
      save: this._onSave
    }
  };

  static PARTS = {
    main: {
      template: "modules/runyth-illuminated-documents/templates/preset-manager.hbs"
    }
  };

  static _onSelect(_event, target) {
    const html = this._html();
    this._capture(html);
    this.activeId = target.dataset.id;
    return this.render();
  }

  static _onNew() {
    return this._newPreset(this._html());
  }

  static _onDelete() {
    return this._deletePreset(this._html());
  }

  static _onSave() {
    return this._save(this._html());
  }

  constructor(...args) {
    super(...args);
    this.presets = getPresetsForUser(game.user, { manage: true });
    this.originalIds = Object.keys(this.presets);
    this.expectedRevision = getPresetRevision();
    this.activeId = Object.keys(this.presets)[0] || "";
    this._savePending = false;
    this.presetDocumentGroups = [];
    this.presetBlockGroups = [];
    this.extensionPresetDraft = ensureDocumentExtensionEnvelope({ extensions: {} });
  }

  _canRender(options) {
    if (!canManagePresets()) {
      ui.notifications.error("You do not have permission to manage book presets.");
      return false;
    }
    return super._canRender(options);
  }

  _namePreview() {
    const preset = this.presets[this.activeId];
    if (!preset) return { value: "", error: "" };
    try {
      return {
        value: buildDocumentName({
          title: "Session Chronicle",
          preset,
          globalPrefix: game.settings.get(MODULE_ID, SETTINGS.globalNamePrefix),
          globalSuffix: game.settings.get(MODULE_ID, SETTINGS.globalNameSuffix),
          globalFormat: game.settings.get(MODULE_ID, SETTINGS.globalNameFormat) || DEFAULT_NAME_FORMAT,
          userName: game.user?.name || "Game Master",
          now: new Date(2026, 6, 24, 19, 30)
        }),
        error: ""
      };
    } catch (error) {
      return { value: "", error: error.message };
    }
  }

  _templateChoices() {
    const all = getTemplates();
    const active = this.presets[this.activeId] || {};
    const referenced = new Set([
      active.leftTemplateId,
      active.rightTemplateId,
      active.frontCoverTemplateId,
      active.backCoverTemplateId
    ].filter(Boolean));
    return Object.values(all).filter((template) => canUseTemplate(template) || referenced.has(template.id));
  }

  _loadExtensionPresetDraft(active) {
    const extensions = {};
    for (const [extensionId, record] of Object.entries(active?.extensions || {})) {
      extensions[extensionId] = {
        schemaVersion: Number(record?.schemaVersion || 0),
        document: cloneSerializable(record?.document || {}),
        blocks: { __presetDefault: cloneSerializable(record?.blockDefaults || {}) },
        orphanedBlocks: cloneSerializable(record?.orphanedBlocks || {})
      };
    }
    this.extensionPresetDraft = ensureDocumentExtensionEnvelope({ extensions });
  }

  _saveExtensionPresetDraft(active) {
    const preserved = cloneSerializable(active?.extensions || {});
    for (const [extensionId, record] of Object.entries(this.extensionPresetDraft.extensions || {})) {
      const { blocks: _blocks, ...recordExtras } = record;
      preserved[extensionId] = {
        ...(preserved[extensionId] || {}),
        ...cloneSerializable(recordExtras),
        schemaVersion: Number(record.schemaVersion || preserved[extensionId]?.schemaVersion || 0),
        document: cloneSerializable(record.document || {}),
        blockDefaults: cloneSerializable(record.blocks?.__presetDefault || {})
      };
    }
    return preserved;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const preview = this._namePreview();
    const active = this.presets[this.activeId];
    const access = normalizeResourceAccess(active || {});
    this._loadExtensionPresetDraft(active);
    const migration = await extensionRuntime.migrations.migrateMetadata(this.extensionPresetDraft, {
      document: null,
      documentUuid: `Preset.${this.activeId || "new"}`,
      dryRun: false
    });
    this.extensionPresetDraft = migration.metadata;
    const lifecycleContext = {
      application: this,
      preset: active || {},
      currentUser: game.user,
      isGM: game.user.isGM,
      extensionData: this.extensionPresetDraft.extensions
    };
    await extensionRuntime.runLifecycle("preparePresetContext", lifecycleContext);
    this.presetDocumentGroups = await extensionRuntime.fields.prepareGroups({
      scope: "preset-document",
      metadata: this.extensionPresetDraft,
      preset: {},
      lifecycleContext
    });
    this.presetBlockGroups = await extensionRuntime.fields.prepareGroups({
      scope: "preset-block",
      metadata: this.extensionPresetDraft,
      preset: {},
      block: { id: "__presetDefault", label: "Default content block", kind: "preset" },
      lifecycleContext
    });
    const activeExtensionIds = new Set(extensionRuntime.registry.ordered().map((extension) => extension.id));
    const unavailablePresetExtensionIds = Object.keys(active?.extensions || {})
      .filter((extensionId) => !activeExtensionIds.has(extensionId))
      .sort();
    return {
      ...context,
      presets: Object.values(this.presets),
      active,
      templates: this._templateChoices(),
      hasTemplates: this._templateChoices().length > 0,
      namePreview: preview.value,
      namePreviewError: preview.error,
      isGM: game.user.isGM,
      accessMode: access.accessMode,
      isGmOnly: access.accessMode === RESOURCE_ACCESS_MODES.GM_ONLY,
      isSelectedUsers: access.accessMode === RESOURCE_ACCESS_MODES.SELECTED_USERS,
      accessUsers: accessUsers(active),
      expectedRevision: this.expectedRevision,
      presetDocumentExtensionGroups: this.presetDocumentGroups,
      presetBlockExtensionGroups: this.presetBlockGroups,
      hasPresetExtensions: this.presetDocumentGroups.length > 0 || this.presetBlockGroups.length > 0,
      unavailablePresetExtensionIds,
      hasUnavailablePresetExtensions: unavailablePresetExtensionIds.length > 0
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this._html();
    const update = () => {
      this._capture(root);
      const preview = this._namePreview();
      toggleClass(root, "[data-preset-name-preview]", "is-error", Boolean(preview.error));
      setText(root, "[data-preset-name-preview]", preview.error || preview.value);
      const accessMode = checkedValue(root, "accessMode", RESOURCE_ACCESS_MODES.GM_ONLY);
      toggleClass(root, ".idoc-resource-user-grid", "is-disabled", accessMode !== RESOURCE_ACCESS_MODES.SELECTED_USERS);
    };
    for (const element of queryAll(root, "input, select")) {
      this._listen(element, "input", update);
      this._listen(element, "change", update);
    }
    await extensionRuntime.fields.renderCustomFields(this.element, [
      ...this.presetDocumentGroups,
      ...this.presetBlockGroups
    ], { application: this, preset: this.presets[this.activeId] || {} });
  }

  _newPreset(html) {
    this._capture(html);
    const usableTemplates = Object.values(getTemplates()).filter((template) => canUseTemplate(template));
    if (!usableTemplates.length) {
      return ui.notifications.warn("No visual template is shared with your account. Ask a Game Master to share one before creating a preset.");
    }
    const templateId = usableTemplates[0].id;
    const id = `book-${foundry.utils.randomID(6).toLowerCase()}`;
    this.presets[id] = normalizePreset({
      id,
      name: "New Book Preset",
      leftTemplateId: templateId,
      rightTemplateId: templateId,
      ...resourceAccessForCreator(game.user)
    }, id);
    this.activeId = id;
    return this.render();
  }

  _deletePreset(html) {
    this._capture(html);
    if (!this.activeId) return;
    delete this.presets[this.activeId];
    this.activeId = Object.keys(this.presets)[0] || "";
    return this.render();
  }

  _capture(html) {
    if (!this.activeId) return;
    const form = this.form;
    if (!form) return;
    const data = this._formDataObject(form);
    const current = this.presets[this.activeId] || {};
    let access = normalizeResourceAccess(current);
    if (game.user.isGM) {
      const mode = checkedValue(html, "accessMode", RESOURCE_ACCESS_MODES.GM_ONLY);
      const allowedUserIds = checkedValues(html, "allowedUserIds");
      access = normalizeResourceAccess({ accessMode: mode, allowedUserIds });
    }
    this.extensionPresetDraft = extensionRuntime.fields.capture(this.element, this.presetDocumentGroups, {
      metadata: this.extensionPresetDraft
    });
    this.extensionPresetDraft = extensionRuntime.fields.capture(this.element, this.presetBlockGroups, {
      metadata: this.extensionPresetDraft,
      blockId: "__presetDefault"
    });
    const extensions = this._saveExtensionPresetDraft(current);
    this.presets[this.activeId] = normalizePreset({ ...current, ...data, ...access, extensions, id: this.activeId }, this.activeId);
  }

  async _save(html) {
    if (this._savePending) return;
    this._savePending = true;
    setApplicationBusy(this, true);
    this._capture(html);
    const preview = this._namePreview();
    try {
      if (preview.error) {
        ui.notifications.error(preview.error);
        return;
      }
      const result = await savePresetsForCurrentUser(this.presets, this.originalIds, this.expectedRevision);
      this.presets = result.presets;
      this.originalIds = Object.keys(this.presets);
      this.expectedRevision = Number(result.revision || this.expectedRevision + 1);
      if (!this.presets[this.activeId]) this.activeId = Object.keys(this.presets)[0] || "";
      ui.notifications.info("Book presets saved.");
      await this.render();
    } catch (error) {
      console.error("runyth-illuminated-documents | Preset save failed", error);
      ui.notifications.error(error.message);
    } finally {
      this._savePending = false;
      setApplicationBusy(this, false);
    }
  }
}
