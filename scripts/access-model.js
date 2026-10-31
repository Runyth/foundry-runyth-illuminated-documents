// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
export const RESOURCE_ACCESS_MODES = Object.freeze({
  GM_ONLY: "gm-only",
  SELECTED_USERS: "selected-users"
});

export function normalizeUserIds(values) {
  const source = Array.isArray(values) ? values : (values ? [values] : []);
  return [...new Set(source.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function normalizeResourceAccess(resource = {}, {
  defaultMode = RESOURCE_ACCESS_MODES.GM_ONLY,
  defaultUserIds = []
} = {}) {
  const requestedMode = String(resource.accessMode || "");
  const mode = Object.values(RESOURCE_ACCESS_MODES).includes(requestedMode)
    ? requestedMode
    : defaultMode;
  const allowedUserIds = mode === RESOURCE_ACCESS_MODES.SELECTED_USERS
    ? normalizeUserIds(resource.allowedUserIds?.length ? resource.allowedUserIds : defaultUserIds)
    : [];

  return { accessMode: mode, allowedUserIds };
}

export function resourceAccessForCreator(user) {
  if (user?.isGM) {
    return { accessMode: RESOURCE_ACCESS_MODES.GM_ONLY, allowedUserIds: [] };
  }
  return {
    accessMode: RESOURCE_ACCESS_MODES.SELECTED_USERS,
    allowedUserIds: normalizeUserIds([user?.id])
  };
}

export function isResourceSharedWith(resource, user) {
  if (user?.isGM) return true;
  const access = normalizeResourceAccess(resource);
  return access.accessMode === RESOURCE_ACCESS_MODES.SELECTED_USERS
    && access.allowedUserIds.includes(user?.id);
}
