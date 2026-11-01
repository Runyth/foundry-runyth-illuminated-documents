// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, SETTINGS, getTemplates, saveTemplates } from "./settings.js";
import {
  canManageTemplateResource,
  canManageTemplates,
  canUseTemplate
} from "./permissions.js";
import { normalizeTemplate } from "./layout.js";
import { normalizeResourceAccess, resourceAccessForCreator } from "./access-model.js";
import { requestFromActiveGm } from "./socket.js";
import { getPresets } from "./presets.js";

export function getTemplateRevision() {
  return Number(game.settings.get(MODULE_ID, SETTINGS.templateRevision) || 0);
}

export function getTemplatesForUser(user = game.user, { manage = false } = {}) {
  const templates = getTemplates();
  const predicate = manage ? canManageTemplateResource : canUseTemplate;
  return Object.fromEntries(Object.entries(templates).filter(([, template]) => predicate(template, user)));
}

export async function applyTemplateChangesForUser({ templates, originalIds, expectedRevision }, requester) {
  if (!game.user?.isGM) throw new Error("Template changes must be applied by a Game Master.");
  if (!requester || !canManageTemplates(requester)) {
    throw new Error("The requesting player may not manage visual templates.");
  }

  const currentRevision = getTemplateRevision();
  if (Number(expectedRevision) !== currentRevision) {
    throw new Error("Visual templates changed while this window was open. Reopen the manager before saving.");
  }

  const current = getTemplates();
  const submitted = templates || {};
  const merged = foundry.utils.deepClone(current);
  const original = new Set((originalIds || []).map(String));

  for (const id of original) {
    const existing = current[id];
    if (!existing || !canManageTemplateResource(existing, requester)) continue;
    if (!Object.prototype.hasOwnProperty.call(submitted, id)) {
      const references = Object.values(getPresets()).filter((preset) => [
        preset.leftTemplateId,
        preset.rightTemplateId,
        preset.frontCoverTemplateId,
        preset.backCoverTemplateId
      ].includes(id));
      if (references.length) {
        throw new Error(`Visual template "${existing.name}" is still used by: ${references.map((preset) => preset.name).join(", ")}.`);
      }
      delete merged[id];
    }
  }

  for (const [id, candidate] of Object.entries(submitted)) {
    const existing = current[id];
    if (existing && !canManageTemplateResource(existing, requester)) {
      throw new Error(`You may not modify visual template "${existing.name}".`);
    }

    const access = requester.isGM
      ? normalizeResourceAccess(candidate)
      : (existing ? normalizeResourceAccess(existing) : resourceAccessForCreator(requester));
    merged[id] = normalizeTemplate({ ...candidate, ...access, id });
  }

  const saved = await saveTemplates(merged, { expectedRevision: currentRevision });
  return {
    templates: Object.fromEntries(
      Object.entries(saved).filter(([, template]) => canManageTemplateResource(template, requester))
    ),
    revision: getTemplateRevision()
  };
}

export async function saveTemplatesForCurrentUser(templates, originalIds, expectedRevision) {
  if (game.user?.isGM) {
    return applyTemplateChangesForUser({ templates, originalIds, expectedRevision }, game.user);
  }
  return requestFromActiveGm("saveVisualTemplates", { templates, originalIds, expectedRevision });
}
