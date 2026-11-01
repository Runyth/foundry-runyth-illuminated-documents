// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, SETTINGS, getTemplates } from "./settings.js";
import { normalizeResourceAccess, resourceAccessForCreator } from "./access-model.js";
import {
  canManagePresetResource,
  canManagePresets,
  canUsePreset,
  canUseTemplate
} from "./permissions.js";
import { requestFromActiveGm } from "./socket.js";
import { cloneSerializable } from "./extensions/utils.js";


function referencedTemplateIds(preset = {}) {
  return [
    preset.leftTemplateId,
    preset.rightTemplateId,
    preset.frontCoverTemplateId,
    preset.backCoverTemplateId
  ].filter(Boolean);
}

function assertPlayerMayUsePresetTemplates(candidate, existing, requester) {
  if (requester?.isGM) return;
  const templates = getTemplates();
  const existingIds = new Set(referencedTemplateIds(existing));
  for (const templateId of referencedTemplateIds(candidate)) {
    const template = templates[templateId];
    if (!template) throw new Error(`Visual template "${templateId}" no longer exists.`);
    if (!canUseTemplate(template, requester) && !existingIds.has(templateId)) {
      throw new Error(`Visual template "${template.name}" is not shared with this player.`);
    }
  }
}

export function normalizePreset(preset = {}, id = "") {
  const templates = getTemplates();
  const fallback = Object.keys(templates)[0] || "parchment-page";
  const cleanId = String(id || preset.id || foundry.utils.randomID()).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const access = normalizeResourceAccess(preset);
  return {
    id: cleanId,
    ...access,
    name: String(preset.name || "Untitled Book Preset").trim(),
    leftTemplateId: templates[preset.leftTemplateId] ? preset.leftTemplateId : fallback,
    rightTemplateId: templates[preset.rightTemplateId] ? preset.rightTemplateId : (templates[preset.leftTemplateId] ? preset.leftTemplateId : fallback),
    frontCoverTemplateId: templates[preset.frontCoverTemplateId] ? preset.frontCoverTemplateId : "",
    backCoverTemplateId: templates[preset.backCoverTemplateId] ? preset.backCoverTemplateId : "",
    namePrefix: String(preset.namePrefix || ""),
    nameSuffix: String(preset.nameSuffix || ""),
    nameFormat: String(preset.nameFormat || "").trim(),
    extensions: cloneSerializable(preset.extensions || {})
  };
}

export function getPresets() {
  const value = game.settings.get(MODULE_ID, SETTINGS.presets);
  const stored = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(stored).map(([id, preset]) => [id, normalizePreset(preset, id)]));
}

export function getPresetRevision() {
  return Number(game.settings.get(MODULE_ID, SETTINGS.presetRevision) || 0);
}

export function getPresetsForUser(user = game.user, { manage = false } = {}) {
  const presets = getPresets();
  const predicate = manage ? canManagePresetResource : canUsePreset;
  return Object.fromEntries(Object.entries(presets).filter(([, preset]) => predicate(preset, user)));
}

export async function savePresets(presets, { expectedRevision = null } = {}) {
  if (!game.user.isGM) throw new Error(game.i18n.localize("ILLUMINATED.GMOnly"));
  const currentRevision = getPresetRevision();
  if (expectedRevision !== null && Number(expectedRevision) !== currentRevision) {
    throw new Error("Book presets changed while this window was open. Reopen the manager before saving.");
  }
  const normalized = Object.fromEntries(Object.entries(presets).map(([id, preset]) => [id, normalizePreset(preset, id)]));
  await game.settings.set(MODULE_ID, SETTINGS.presets, normalized);
  await game.settings.set(MODULE_ID, SETTINGS.presetRevision, currentRevision + 1);
  return normalized;
}

export async function applyPresetChangesForUser({ presets, originalIds, expectedRevision }, requester) {
  if (!game.user?.isGM) throw new Error("Preset changes must be applied by a Game Master.");
  if (!requester || !canManagePresets(requester)) {
    throw new Error("The requesting player may not manage book presets.");
  }

  const currentRevision = getPresetRevision();
  if (Number(expectedRevision) !== currentRevision) {
    throw new Error("Book presets changed while this window was open. Reopen the manager before saving.");
  }

  const current = getPresets();
  const submitted = presets || {};
  const merged = foundry.utils.deepClone(current);
  const original = new Set((originalIds || []).map(String));

  for (const id of original) {
    const existing = current[id];
    if (!existing || !canManagePresetResource(existing, requester)) continue;
    if (!Object.prototype.hasOwnProperty.call(submitted, id)) delete merged[id];
  }

  for (const [id, candidate] of Object.entries(submitted)) {
    const existing = current[id];
    if (existing && !canManagePresetResource(existing, requester)) {
      throw new Error(`You may not modify book preset "${existing.name}".`);
    }

    assertPlayerMayUsePresetTemplates(candidate, existing, requester);
    const access = requester.isGM
      ? normalizeResourceAccess(candidate)
      : (existing ? normalizeResourceAccess(existing) : resourceAccessForCreator(requester));
    merged[id] = normalizePreset({ ...candidate, ...access, id }, id);
  }

  const saved = await savePresets(merged, { expectedRevision: currentRevision });
  return {
    presets: Object.fromEntries(
      Object.entries(saved).filter(([, preset]) => canManagePresetResource(preset, requester))
    ),
    revision: getPresetRevision()
  };
}

export async function savePresetsForCurrentUser(presets, originalIds, expectedRevision) {
  if (game.user?.isGM) {
    return applyPresetChangesForUser({ presets, originalIds, expectedRevision }, game.user);
  }
  return requestFromActiveGm("saveBookPresets", { presets, originalIds, expectedRevision });
}
