// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { DEFAULT_REGION, normalizeTemplate } from "./layout.js";
import { getTemplates } from "./settings.js";
import {
  getTemplateRevision,
  getTemplatesForUser,
  saveTemplatesForCurrentUser
} from "./template-library.js";
import { canManageTemplates } from "./permissions.js";
import { RESOURCE_ACCESS_MODES, normalizeResourceAccess, resourceAccessForCreator } from "./access-model.js";
import {
  IlluminatedApplicationV2,
  FilePicker,
  confirmV2,
  safeRenderV2,
  setApplicationBusy
} from "./application-v2.js";
import { checkedValue, checkedValues, query, queryAll, toggleClass } from "./dom.js";

export class TemplateManager extends IlluminatedApplicationV2 {
  static GEOMETRY_KEY = "templateManagerV2";

  static DEFAULT_OPTIONS = {
    id: "illuminated-template-manager",
    classes: ["illuminated-documents-window"],
    window: {
      title: "Illuminated Documents: Visual Templates",
      resizable: true
    },
    position: {
      width: 1120,
      height: 800
    },
    actions: {
      "select-template": this._onSelectTemplate,
      "new-template": this._onNewTemplate,
      "duplicate-template": this._onDuplicateTemplate,
      "delete-template": this._onDeleteTemplate,
      "pick-background": this._onPickBackground,
      "pick-font": this._onPickFont,
      "add-region": this._onAddRegion,
      "remove-region": this._onRemoveRegion,
      "apply-json": this._onApplyJson,
      save: this._onSave
    }
  };

  static PARTS = {
    main: {
      template: "modules/runyth-illuminated-documents/templates/template-manager.hbs"
    }
  };

  static _onSelectTemplate(_event, target) {
    this._captureCurrentForm();
    this.activeId = String(target.dataset.templateId || "");
    this.selectedRegion = 0;
    return this.render();
  }

  static _onNewTemplate() {
    return this._newTemplate();
  }

  static _onDuplicateTemplate() {
    return this._duplicateTemplate();
  }

  static _onDeleteTemplate() {
    return this._deleteTemplate();
  }

  static _onPickBackground() {
    return this._pickFile("background");
  }

  static _onPickFont() {
    return this._pickFile("fontFile");
  }

  static _onAddRegion() {
    return this._addRegion();
  }

  static _onRemoveRegion() {
    return this._removeRegion();
  }

  static _onApplyJson() {
    return this._applyJson();
  }

  static _onSave() {
    return this._save();
  }

  constructor(options = {}) {
    super(options);
    this.templates = getTemplatesForUser(game.user, { manage: true });
    this.originalIds = Object.keys(this.templates);
    this.expectedRevision = getTemplateRevision();
    this.activeId = Object.keys(this.templates)[0] || "";
    this.selectedRegion = 0;
    this._savePending = false;
    this._pointerAbortController = null;
  }

  _canRender() {
    if (!canManageTemplates()) {
      ui.notifications.error("You do not have permission to manage visual templates.");
      return false;
    }
  }

  _active() {
    return this.templates[this.activeId];
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const active = this.templates[this.activeId] || Object.values(this.templates)[0];
    if (active && active.id !== this.activeId) this.activeId = active.id;
    if (active && this.selectedRegion >= active.regions.length) this.selectedRegion = 0;
    const access = normalizeResourceAccess(active || {});
    const selected = new Set(access.allowedUserIds);
    const accessUsers = game.users
      .filter((user) => !user.isGM)
      .map((user) => ({ id: user.id, name: user.name, active: user.active, checked: selected.has(user.id) }))
      .sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name));

    return {
      ...context,
      templates: Object.values(this.templates),
      active,
      activeJson: active ? JSON.stringify(active, null, 2) : "",
      selectedRegion: this.selectedRegion,
      isGM: game.user.isGM,
      isGmOnly: access.accessMode === RESOURCE_ACCESS_MODES.GM_ONLY,
      isSelectedUsers: access.accessMode === RESOURCE_ACCESS_MODES.SELECTED_USERS,
      accessUsers,
      expectedRevision: this.expectedRevision
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this._html();

    const regionSelect = query(root, "[data-action='select-region']");
    this._listen(regionSelect, "change", (event) => {
      this._captureCurrentForm();
      this.selectedRegion = Number(event.currentTarget.value) || 0;
      void safeRenderV2(this, { force: true });
    });

    for (const input of queryAll(root, "input[name='accessMode'], input[name='allowedUserIds']")) {
      this._listen(input, "change", () => {
        this._captureAccess(root);
        const mode = checkedValue(root, "accessMode", RESOURCE_ACCESS_MODES.GM_ONLY);
        toggleClass(root, ".idoc-resource-user-grid", "is-disabled", mode !== RESOURCE_ACCESS_MODES.SELECTED_USERS);
      });
    }

    this._listen(query(root, ".idoc-preview-stage"), "mousedown", (event) => this._startRegionDraw(event, root));
    this._listen(query(root, ".idoc-region-overlay"), "mousedown", (event) => this._startRegionMove(event, root));
    for (const handle of queryAll(root, ".idoc-region-handle")) {
      this._listen(handle, "mousedown", (event) => this._startRegionResize(event, root));
    }
  }

  _collectFormData(formData) {
    const expanded = foundry.utils.expandObject(formData || {});
    const active = this._active();
    if (!active) return;
    const region = active.regions[this.selectedRegion] || active.regions[0];
    Object.assign(active, expanded.template || {});
    Object.assign(region, expanded.region || {});
    this.templates[this.activeId] = normalizeTemplate(active);
  }

  _captureCurrentForm() {
    if (!this.form || !this._active()) return;
    this._collectFormData(this._formDataObject());
    this._captureAccess(this._html());
  }

  _captureAccess(html) {
    const active = this._active();
    if (!active || !game.user.isGM) return;
    const mode = checkedValue(html, "accessMode", RESOURCE_ACCESS_MODES.GM_ONLY);
    const allowedUserIds = checkedValues(html, "allowedUserIds");
    Object.assign(active, normalizeResourceAccess({ accessMode: mode, allowedUserIds }));
  }

  _newTemplate() {
    this._captureCurrentForm();
    const id = `template-${foundry.utils.randomID(8).toLowerCase()}`;
    this.templates[id] = normalizeTemplate({
      id,
      name: "New visual template",
      background: "modules/runyth-illuminated-documents/assets/backgrounds/parchment.svg",
      regions: [{ ...DEFAULT_REGION }],
      ...resourceAccessForCreator(game.user)
    });
    this.activeId = id;
    this.selectedRegion = 0;
    return this.render();
  }

  _duplicateTemplate() {
    this._captureCurrentForm();
    const source = this._active();
    if (!source) return;
    const id = `${source.id}-copy-${foundry.utils.randomID(4).toLowerCase()}`;
    this.templates[id] = normalizeTemplate(foundry.utils.deepClone({
      ...source,
      ...resourceAccessForCreator(game.user),
      id,
      name: `${source.name} Copy`
    }));
    this.activeId = id;
    this.selectedRegion = 0;
    return this.render();
  }

  async _deleteTemplate() {
    this._captureCurrentForm();
    if (Object.keys(getTemplates()).length <= 1) {
      return ui.notifications.warn("At least one visual template must remain.");
    }
    const active = this._active();
    if (!active) return;
    const confirmed = await confirmV2({
      title: "Delete visual template",
      content: `<p>Delete <strong>${foundry.utils.escapeHTML(active.name)}</strong>?</p>`,
      yesLabel: "Delete",
      noLabel: "Cancel"
    });
    if (!confirmed) return;
    delete this.templates[this.activeId];
    this.activeId = Object.keys(this.templates)[0] || "";
    this.selectedRegion = 0;
    return this.render();
  }

  _addRegion() {
    this._captureCurrentForm();
    const active = this._active();
    if (!active) return;
    active.regions.push({ ...DEFAULT_REGION, id: `region-${active.regions.length + 1}` });
    this.selectedRegion = active.regions.length - 1;
    return this.render();
  }

  _removeRegion() {
    this._captureCurrentForm();
    const active = this._active();
    if (!active) return;
    if (active.regions.length <= 1) return ui.notifications.warn("A template needs at least one text region.");
    active.regions.splice(this.selectedRegion, 1);
    this.selectedRegion = Math.max(0, this.selectedRegion - 1);
    return this.render();
  }

  async _pickFile(target) {
    this._captureCurrentForm();
    const active = this._active();
    if (!active) return;
    const current = target === "background" ? active.background : active.regions[this.selectedRegion]?.fontFile;
    try {
      if (typeof FilePicker !== "function") throw new Error("Foundry's FilePicker implementation is unavailable.");
      const picker = new FilePicker({
        type: target === "background" ? "image" : "font",
        current: current || "",
        callback: (path) => {
          if (typeof path !== "string" || !path.trim()) return;
          if (target === "background") active.background = path;
          else {
            const region = active.regions[this.selectedRegion];
            if (!region) return;
            region.fontFile = path;
          }
          void safeRenderV2(this, { force: true });
        }
      });
      await picker.browse(current || "");
    } catch (error) {
      console.error("runyth-illuminated-documents | File picker failed", error);
      ui.notifications.error(`Unable to browse or upload files: ${error.message}`);
    }
  }

  _applyJson() {
    this._captureCurrentForm();
    try {
      const value = String(this.form?.elements?.templateJson?.value || "");
      const parsed = JSON.parse(value);
      this.templates[this.activeId] = normalizeTemplate({ ...parsed, id: this.activeId });
      this.selectedRegion = 0;
      return this.render();
    } catch (error) {
      ui.notifications.error(`Invalid template JSON: ${error.message}`);
    }
  }

  async _save() {
    if (this._savePending) return;
    this._savePending = true;
    setApplicationBusy(this, true);
    try {
      this._captureCurrentForm();
      const result = await saveTemplatesForCurrentUser(this.templates, this.originalIds, this.expectedRevision);
      this.templates = result.templates;
      this.originalIds = Object.keys(this.templates);
      this.expectedRevision = Number(result.revision || this.expectedRevision + 1);
      if (!this.templates[this.activeId]) this.activeId = Object.keys(this.templates)[0] || "";
      ui.notifications.info("Visual templates saved.");
      await this.render();
    } catch (error) {
      console.error("runyth-illuminated-documents | Template save failed", error);
      ui.notifications.error(error.message);
    } finally {
      this._savePending = false;
      setApplicationBusy(this, false);
    }
  }

  _regionPointer(event, rect) {
    return {
      x: Math.min(100, Math.max(0, (event.clientX - rect.left) / rect.width * 100)),
      y: Math.min(100, Math.max(0, (event.clientY - rect.top) / rect.height * 100))
    };
  }

  _updateOverlay(html, region) {
    const overlay = query(html, ".idoc-region-overlay");
    if (!overlay) return;
    Object.assign(overlay.style, {
      left: `${region.x}%`,
      top: `${region.y}%`,
      width: `${region.width}%`,
      height: `${region.height}%`
    });
  }

  _bindPointerSession(move, finish) {
    this._pointerAbortController?.abort();
    const controller = new AbortController();
    this._pointerAbortController = controller;
    window.addEventListener("mousemove", move, { signal: controller.signal });
    window.addEventListener("mouseup", () => {
      controller.abort();
      if (this._pointerAbortController === controller) this._pointerAbortController = null;
      finish();
    }, { signal: controller.signal, once: true });
  }

  _startRegionDraw(event, html) {
    const pointer = event;
    if (pointer.button !== 0 || pointer.target !== pointer.currentTarget) return;
    this._captureCurrentForm();
    const stage = pointer.currentTarget;
    const rect = stage.getBoundingClientRect();
    const start = this._regionPointer(pointer, rect);
    const region = this._active().regions[this.selectedRegion];
    let drawing = false;

    const move = (moveEvent) => {
      const end = this._regionPointer(moveEvent, rect);
      if (!drawing && Math.hypot(moveEvent.clientX - pointer.clientX, moveEvent.clientY - pointer.clientY) < 5) return;
      drawing = true;
      region.x = Math.min(start.x, end.x);
      region.y = Math.min(start.y, end.y);
      region.width = Math.max(1, Math.abs(end.x - start.x));
      region.height = Math.max(1, Math.abs(end.y - start.y));
      this._updateOverlay(html, region);
    };

    this._bindPointerSession(move, () => {
      if (drawing) void safeRenderV2(this, { force: true });
    });
  }

  _startRegionMove(event, html) {
    const pointer = event;
    if (pointer.button !== 0 || pointer.target.closest(".idoc-region-handle")) return;
    pointer.preventDefault();
    pointer.stopPropagation();
    this._captureCurrentForm();
    const stage = query(html, ".idoc-preview-stage");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const start = this._regionPointer(pointer, rect);
    const region = this._active().regions[this.selectedRegion];
    const original = { x: region.x, y: region.y };

    const move = (moveEvent) => {
      const point = this._regionPointer(moveEvent, rect);
      region.x = Math.min(100 - region.width, Math.max(0, original.x + point.x - start.x));
      region.y = Math.min(100 - region.height, Math.max(0, original.y + point.y - start.y));
      this._updateOverlay(html, region);
    };

    this._bindPointerSession(move, () => safeRenderV2(this, { force: true }));
  }

  _startRegionResize(event, html) {
    const pointer = event;
    if (pointer.button !== 0) return;
    pointer.preventDefault();
    pointer.stopPropagation();
    this._captureCurrentForm();
    const handle = pointer.currentTarget.dataset.handle;
    const stage = query(html, ".idoc-preview-stage");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const start = this._regionPointer(pointer, rect);
    const region = this._active().regions[this.selectedRegion];
    const original = { x: region.x, y: region.y, width: region.width, height: region.height };
    const minSize = 1;

    const move = (moveEvent) => {
      const point = this._regionPointer(moveEvent, rect);
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      let left = original.x;
      let top = original.y;
      let right = original.x + original.width;
      let bottom = original.y + original.height;

      if (handle.includes("w")) left = Math.min(right - minSize, Math.max(0, original.x + dx));
      if (handle.includes("e")) right = Math.max(left + minSize, Math.min(100, original.x + original.width + dx));
      if (handle.includes("n")) top = Math.min(bottom - minSize, Math.max(0, original.y + dy));
      if (handle.includes("s")) bottom = Math.max(top + minSize, Math.min(100, original.y + original.height + dy));

      region.x = left;
      region.y = top;
      region.width = right - left;
      region.height = bottom - top;
      this._updateOverlay(html, region);
    };

    this._bindPointerSession(move, () => safeRenderV2(this, { force: true }));
  }

  async _preClose(options) {
    this._pointerAbortController?.abort();
    this._pointerAbortController = null;
    return super._preClose(options);
  }
}
