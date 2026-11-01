// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { getTemplates } from "./settings.js";
import { getPresets } from "./presets.js";

export function firstPreset(templates = getTemplates()) {
  const id = Object.keys(templates)[0];
  return {
    id: "single-page",
    name: "Single Page",
    leftTemplateId: id,
    rightTemplateId: id,
    frontCoverTemplateId: "",
    backCoverTemplateId: ""
  };
}

export function resolveBookDefinition(data) {
  const templates = getTemplates();
  const presets = getPresets();
  const preset = presets[data?.presetId] || firstPreset(templates);
  const leftTemplate = templates[preset.leftTemplateId];

  if (!leftTemplate) {
    throw new Error(`Preset "${preset.name}" references a missing left-page template.`);
  }

  return {
    preset,
    leftTemplate,
    rightTemplate: templates[preset.rightTemplateId] || leftTemplate,
    frontCoverTemplate: templates[preset.frontCoverTemplateId] || null,
    backCoverTemplate: templates[preset.backCoverTemplateId] || null,
    includeFrontCover: Boolean(data?.includeFrontCover && preset.frontCoverTemplateId),
    includeBackCover: Boolean(data?.includeBackCover && preset.backCoverTemplateId)
  };
}
