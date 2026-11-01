// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
export const EXTENSION_API_VERSION = "1.0.0";
export const CORE_DOCUMENT_SCHEMA_VERSION = 6;
export const EXTENSION_STORAGE_KEY = "extensions";

export const EXTENSION_HOOKS = Object.freeze({
  API_INIT: "illuminatedDocumentsApiInit",
  API_READY: "illuminatedDocumentsApiReady",
  REGISTERED: "illuminatedDocumentsExtensionRegistered",
  UNREGISTERED: "illuminatedDocumentsExtensionUnregistered",
  BEFORE_TRANSFORM: "illuminatedDocumentsBeforeExtensionTransform",
  AFTER_TRANSFORM: "illuminatedDocumentsAfterExtensionTransform",
  VALIDATION: "illuminatedDocumentsExtensionValidation",
  DATA_CHANGED: "illuminatedDocumentsExtensionDataChanged"
});

export const EXTENSION_CALLBACKS = Object.freeze([
  "prepareCreationContext",
  "prepareEditorContext",
  "preparePresetContext",
  "prepareViewerContext",
  "transformRenderedDocument",
  "validateDocument",
  "onDocumentCreated",
  "onDocumentUpdated",
  "onDocumentDeleted",
  "exportMetadata",
  "importMetadata",
  "migrateMetadata",
  "invalidateCache"
]);

export const EXTENSION_FIELD_TYPES = Object.freeze([
  "select",
  "checkbox",
  "text",
  "number",
  "hidden",
  "custom"
]);

export const EXTENSION_FIELD_SCOPES = Object.freeze({
  DOCUMENT: "document",
  BLOCK: "block",
  PRESET_DOCUMENT: "preset-document",
  PRESET_BLOCK: "preset-block"
});

export const VALIDATION_SEVERITIES = Object.freeze(["error", "warning", "info"]);
