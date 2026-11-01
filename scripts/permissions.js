// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, SETTINGS } from "./settings.js";
import { isResourceSharedWith } from "./access-model.js";

export const MODULE_PERMISSION_KEYS = Object.freeze({
  CREATE_DOCUMENTS: "createDocuments",
  MANAGE_PRESETS: "managePresets",
  MANAGE_TEMPLATES: "manageTemplates"
});

export function normalizePermissionRecord(record = {}) {
  return {
    createDocuments: Boolean(record.createDocuments),
    managePresets: Boolean(record.managePresets),
    manageTemplates: Boolean(record.manageTemplates)
  };
}

export function getPermissionMap() {
  const stored = game.settings.get(MODULE_ID, SETTINGS.userPermissions) || {};
  return Object.fromEntries(
    Object.entries(stored).map(([userId, record]) => [userId, normalizePermissionRecord(record)])
  );
}

export function getUserPermissions(user = game.user) {
  if (user?.isGM) {
    return { createDocuments: true, managePresets: true, manageTemplates: true };
  }
  const permissionMap = getPermissionMap();
  const record = normalizePermissionRecord(permissionMap[user?.id]);
  const legacyAllowed = game.settings.get(MODULE_ID, SETTINGS.allowedUsers) || [];
  if (!record.createDocuments && legacyAllowed.includes(user?.id)) record.createDocuments = true;
  return record;
}

export function canCreateDocuments(user = game.user) {
  return Boolean(user?.isGM || getUserPermissions(user).createDocuments);
}

export function canManagePresets(user = game.user) {
  return Boolean(user?.isGM || getUserPermissions(user).managePresets);
}

export function canManageTemplates(user = game.user) {
  return Boolean(user?.isGM || getUserPermissions(user).manageTemplates);
}

export function canUsePreset(preset, user = game.user) {
  return Boolean(user?.isGM || isResourceSharedWith(preset, user));
}

export function canManagePresetResource(preset, user = game.user) {
  return Boolean(user?.isGM || (canManagePresets(user) && canUsePreset(preset, user)));
}

export function canUseTemplate(template, user = game.user) {
  return Boolean(user?.isGM || isResourceSharedWith(template, user));
}

export function canManageTemplateResource(template, user = game.user) {
  return Boolean(user?.isGM || (canManageTemplates(user) && canUseTemplate(template, user)));
}

export async function savePermissionMap(permissionMap) {
  if (!game.user?.isGM) throw new Error("Only a Game Master can change module permissions.");
  const normalized = Object.fromEntries(
    Object.entries(permissionMap || {}).map(([userId, record]) => [userId, normalizePermissionRecord(record)])
  );
  await game.settings.set(MODULE_ID, SETTINGS.userPermissions, normalized);
  await game.settings.set(
    MODULE_ID,
    SETTINGS.allowedUsers,
    Object.entries(normalized).filter(([, record]) => record.createDocuments).map(([userId]) => userId)
  );
  return normalized;
}

export async function migrateGranularPermissions() {
  if (!game.user?.isActiveGM) return false;
  const version = Number(game.settings.get(MODULE_ID, SETTINGS.permissionModelVersion) || 0);
  if (version >= 1) return false;

  const legacyAllowedUsers = game.settings.get(MODULE_ID, SETTINGS.allowedUsers) || [];
  const permissionMap = getPermissionMap();
  for (const userId of legacyAllowedUsers) {
    permissionMap[userId] = {
      ...normalizePermissionRecord(permissionMap[userId]),
      createDocuments: true
    };
  }

  const rawPresets = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.presets) || {});
  for (const preset of Object.values(rawPresets)) {
    if (preset.accessMode) continue;
    preset.accessMode = legacyAllowedUsers.length ? "selected-users" : "gm-only";
    preset.allowedUserIds = legacyAllowedUsers.length ? [...legacyAllowedUsers] : [];
  }

  const rawTemplates = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.templates) || {});
  for (const template of Object.values(rawTemplates)) {
    if (template.accessMode) continue;
    template.accessMode = "gm-only";
    template.allowedUserIds = [];
  }

  await savePermissionMap(permissionMap);
  await game.settings.set(MODULE_ID, SETTINGS.presets, rawPresets);
  await game.settings.set(MODULE_ID, SETTINGS.templates, rawTemplates);
  await game.settings.set(MODULE_ID, SETTINGS.permissionModelVersion, 1);
  return true;
}
