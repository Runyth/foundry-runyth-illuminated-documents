// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { IlluminatedApplicationV2, setApplicationBusy } from "./application-v2.js";
import { getPresets } from "./presets.js";
import { getTemplates } from "./settings.js";
import { isResourceSharedWith } from "./access-model.js";
import {
  canCreateDocuments,
  getPermissionMap,
  normalizePermissionRecord,
  savePermissionMap
} from "./permissions.js";
import { query, queryAll } from "./dom.js";

export function canUseModule(user = game.user) {
  return canCreateDocuments(user);
}

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase() || "?";
}

export class PermissionManager extends IlluminatedApplicationV2 {
  static GEOMETRY_KEY = "permissionsV3";

  static DEFAULT_OPTIONS = {
    id: "illuminated-permissions",
    classes: ["illuminated-documents-window"],
    window: {
      title: "Illuminated Documents: Player Permissions",
      resizable: true
    },
    position: {
      width: 980,
      height: 700
    },
    actions: {
      save: this._onSave,
      close: this._onCloseAction,
      "set-column": this._onSetColumn
    }
  };

  static PARTS = {
    main: {
      template: "modules/runyth-illuminated-documents/templates/permissions.hbs"
    }
  };

  static _onSave() {
    return this._save(this._html());
  }

  static _onCloseAction() {
    return this.close();
  }

  constructor(options = {}) {
    super(options);
    this._savePending = false;
  }

  static _onSetColumn(_event, target) {
    const root = this._html();
    const permission = target.dataset.permission;
    const checked = target.dataset.checked === "true";
    for (const input of queryAll(root, `input[data-permission='${permission}']`)) input.checked = checked;
    this._updateCounts(root);
  }


  _canRender() {
    if (!game.user.isGM) {
      ui.notifications.error("Only a Game Master can manage Illuminated Documents permissions.");
      return false;
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const permissionMap = getPermissionMap();
    const presets = Object.values(getPresets());
    const templates = Object.values(getTemplates());
    const users = game.users
      .filter((user) => !user.isGM)
      .map((user) => {
        const permissions = normalizePermissionRecord(permissionMap[user.id]);
        return {
          id: user.id,
          name: user.name,
          initials: initials(user.name),
          active: user.active,
          status: user.active ? "Online" : "Offline",
          ...permissions,
          permissionCount: Object.values(permissions).filter(Boolean).length,
          sharedPresetCount: presets.filter((preset) => isResourceSharedWith(preset, user)).length,
          sharedTemplateCount: templates.filter((template) => isResourceSharedWith(template, user)).length
        };
      })
      .sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name));

    return {
      ...context,
      users,
      userCount: users.length,
      onlineCount: users.filter((user) => user.active).length,
      createCount: users.filter((user) => user.createDocuments).length,
      presetCount: users.filter((user) => user.managePresets).length,
      templateCount: users.filter((user) => user.manageTemplates).length
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this._html();
    for (const input of queryAll(root, "input[data-permission]")) {
      this._listen(input, "change", () => this._updateCounts(root));
    }
    this._updateCounts(root);
  }

  _updateCounts(root) {
    for (const permission of ["createDocuments", "managePresets", "manageTemplates"]) {
      const count = queryAll(root, `input[data-permission='${permission}']:checked`).length;
      const output = query(root, `[data-count='${permission}']`);
      if (output) output.textContent = String(count);
    }
    for (const row of queryAll(root, "[data-user-row]")) {
      const count = row.querySelectorAll("input[data-permission]:checked").length;
      row.dataset.grantCount = String(count);
      const output = row.querySelector("[data-row-grant-count]");
      if (output) output.textContent = String(count);
    }
  }

  async _save(html) {
    if (this._savePending) return;
    this._savePending = true;
    setApplicationBusy(this, true);
    const permissionMap = {};
    for (const row of queryAll(html, "[data-user-row]")) {
      const userId = String(row.dataset.userId || "");
      if (!userId) continue;
      permissionMap[userId] = {
        createDocuments: Boolean(row.querySelector("input[data-permission='createDocuments']")?.checked),
        managePresets: Boolean(row.querySelector("input[data-permission='managePresets']")?.checked),
        manageTemplates: Boolean(row.querySelector("input[data-permission='manageTemplates']")?.checked)
      };
    }

    try {
      await savePermissionMap(permissionMap);
      ui.notifications.info("Illuminated Documents permissions saved.");
      await this.render();
    } catch (error) {
      console.error("runyth-illuminated-documents | Failed to save permissions", error);
      ui.notifications.error(error.message || "Unable to save Illuminated Documents permissions.");
    } finally {
      this._savePending = false;
      setApplicationBusy(this, false);
    }
  }
}
