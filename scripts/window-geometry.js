// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, SETTINGS } from "./settings.js";

const MIN_VISIBLE_PIXELS = 80;

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampGeometry(geometry = {}) {
  const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
  const width = Math.min(Math.max(finite(geometry.width) ?? 400, 360), Math.max(360, viewportWidth));
  const height = Math.min(Math.max(finite(geometry.height) ?? 300, 280), Math.max(280, viewportHeight));
  const left = Math.min(
    Math.max(finite(geometry.left) ?? Math.round((viewportWidth - width) / 2), -width + MIN_VISIBLE_PIXELS),
    viewportWidth - MIN_VISIBLE_PIXELS
  );
  const top = Math.min(
    Math.max(finite(geometry.top) ?? Math.round((viewportHeight - height) / 2), 0),
    viewportHeight - MIN_VISIBLE_PIXELS
  );
  return { left, top, width, height };
}

export function savedWindowOptions(key, defaults) {
  const all = game.settings.get(MODULE_ID, SETTINGS.windowGeometry) || {};
  const saved = all[key];
  return saved ? { ...defaults, ...clampGeometry(saved) } : defaults;
}

export async function saveWindowGeometry(key, position) {
  if (!position) return;
  const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.windowGeometry) || {});
  all[key] = clampGeometry(position);
  await game.settings.set(MODULE_ID, SETTINGS.windowGeometry, all);
}
