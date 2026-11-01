// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { DEFAULT_REGION, normalizeTemplate } from "./layout.js";

export const MODULE_ID = "runyth-illuminated-documents";
export const SETTINGS = Object.freeze({
  templates: "templates",
  defaultTemplate: "defaultTemplate",
  outputSource: "outputSource",
  createJournal: "createJournal",
  windowGeometry: "windowGeometry",
  presets: "presets",
  allowedUsers: "allowedUsers",
  userPermissions: "userPermissions",
  permissionModelVersion: "permissionModelVersion",
  presetRevision: "presetRevision",
  templateRevision: "templateRevision",
  documentFolderId: "documentFolderId",
  documentFolderMode: "documentFolderMode",
  globalNamePrefix: "globalNamePrefix",
  globalNameSuffix: "globalNameSuffix",
  globalNameFormat: "globalNameFormat",
  defaultJournalView: "defaultJournalView"
});

export const DOCUMENT_FOLDER_MODES = Object.freeze({
  DEFAULT: "default",
  CUSTOM: "custom",
  ROOT: "root"
});

export const DEFAULT_DOCUMENT_FOLDER_NAME = "Illuminated Documents";

export const BUILTIN_TEMPLATE = normalizeTemplate({
  id: "parchment-page",
  name: "Parchment Page",
  background: "modules/runyth-illuminated-documents/assets/backgrounds/parchment.svg",
  width: 1200,
  height: 1600,
  outputDirectory: "runyth-illuminated-documents",
  regions: [{ ...DEFAULT_REGION, id: "main", label: "Main text" }]
});

export function registerSettings(TemplateManager, PresetManager, PermissionManager, DocumentManagement) {
  game.settings.register(MODULE_ID, SETTINGS.templates, {
    scope: "world",
    config: false,
    type: Object,
    default: { [BUILTIN_TEMPLATE.id]: BUILTIN_TEMPLATE }
  });

  game.settings.register(MODULE_ID, SETTINGS.presets, {
    scope: "world", config: false, type: Object, default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.allowedUsers, {
    scope: "world", config: false, type: Array, default: []
  });

  game.settings.register(MODULE_ID, SETTINGS.userPermissions, {
    scope: "world", config: false, type: Object, default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.permissionModelVersion, {
    scope: "world", config: false, type: Number, default: 0
  });

  game.settings.register(MODULE_ID, SETTINGS.presetRevision, {
    scope: "world", config: false, type: Number, default: 0
  });

  game.settings.register(MODULE_ID, SETTINGS.templateRevision, {
    scope: "world", config: false, type: Number, default: 0
  });

  game.settings.register(MODULE_ID, SETTINGS.documentFolderId, {
    scope: "world", config: false, type: String, default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.documentFolderMode, {
    scope: "world", config: false, type: String, default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.globalNamePrefix, {
    scope: "world", config: false, type: String, default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.globalNameSuffix, {
    scope: "world", config: false, type: String, default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.globalNameFormat, {
    scope: "world", config: false, type: String,
    default: "{globalPrefix}{presetPrefix}{title}{presetSuffix}{globalSuffix}"
  });

  game.settings.register(MODULE_ID, SETTINGS.defaultJournalView, {
    scope: "world", config: false, type: String, default: "journal"
  });

  game.settings.register(MODULE_ID, SETTINGS.defaultTemplate, {
    name: "Default visual template",
    hint: "Template selected when the document studio opens.",
    scope: "world",
    config: true,
    type: String,
    default: BUILTIN_TEMPLATE.id,
    choices: { [BUILTIN_TEMPLATE.id]: BUILTIN_TEMPLATE.name },
    restricted: true
  });

  game.settings.register(MODULE_ID, SETTINGS.outputSource, {
    name: "Output file source",
    hint: "Legacy v1.2 setting retained for migration compatibility.",
    scope: "world",
    config: false,
    type: String,
    default: "data",
    choices: { data: "Data" },
    restricted: true
  });

  game.settings.register(MODULE_ID, SETTINGS.windowGeometry, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.createJournal, {
    name: "Create a Journal Entry after rendering",
    hint: "Legacy pre-live-render setting retained for migration compatibility.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "documentManagement", {
    name: "Document Storage & Naming",
    label: "Configure Storage & Naming",
    hint: "Choose the Journal-tab destination, fallback folder, global name format, optional prefix and suffix, and preferred viewer.",
    icon: "fa-solid fa-folder-gear",
    type: DocumentManagement,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "presetManager", {
    name: "Manage Book Presets", label: "Manage Book Presets", hint: "Manage book presets shared with your account. Game Masters control per-preset sharing.", icon: "fa-solid fa-book", type: PresetManager, restricted: false
  });

  game.settings.registerMenu(MODULE_ID, "permissionManager", {
    name: "Player Permissions", label: "Player Permissions", hint: "Grant separate rights to create documents, manage shared book presets, and manage shared visual templates.", icon: "fa-solid fa-user-shield", type: PermissionManager, restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "templateManager", {
    name: game.i18n.localize("ILLUMINATED.ManageTemplates"),
    label: game.i18n.localize("ILLUMINATED.ManageTemplates"),
    hint: game.i18n.localize("ILLUMINATED.TemplateManagerHint"),
    icon: "fa-solid fa-layer-group",
    type: TemplateManager,
    restricted: false
  });
}

export function getTemplates() {
  const value = game.settings.get(MODULE_ID, SETTINGS.templates);
  const stored = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const templates = { [BUILTIN_TEMPLATE.id]: BUILTIN_TEMPLATE, ...stored };
  return Object.fromEntries(Object.entries(templates).map(([id, template]) => [id, normalizeTemplate({ ...template, id })]));
}

export async function saveTemplates(templates, { expectedRevision = null } = {}) {
  if (!game.user.isGM) throw new Error(game.i18n.localize("ILLUMINATED.GMOnly"));
  const currentRevision = Number(game.settings.get(MODULE_ID, SETTINGS.templateRevision) || 0);
  if (expectedRevision !== null && Number(expectedRevision) !== currentRevision) {
    throw new Error("Visual templates changed while this window was open. Reopen the manager before saving.");
  }
  const normalized = Object.fromEntries(
    Object.entries(templates).map(([id, template]) => [id, normalizeTemplate({ ...template, id })])
  );
  await game.settings.set(MODULE_ID, SETTINGS.templates, normalized);
  await game.settings.set(MODULE_ID, SETTINGS.templateRevision, currentRevision + 1);
  return normalized;
}
