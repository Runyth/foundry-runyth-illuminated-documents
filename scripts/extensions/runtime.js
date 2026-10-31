// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import {
  EXTENSION_API_VERSION,
  EXTENSION_CALLBACKS,
  EXTENSION_FIELD_SCOPES,
  EXTENSION_FIELD_TYPES,
  EXTENSION_HOOKS
} from "./constants.js";
import { ExtensionSafeExecutor } from "./safe-executor.js";
import { ExtensionValidationService } from "./validation.js";
import { ExtensionMigrationService } from "./migrations.js";
import { ExtensionRenderService } from "./rendering.js";
import {
  ensureDocumentExtensionEnvelope,
  extensionStorageSummary,
  getBlockExtensionData,
  getDocumentExtensionData,
  setBlockExtensionData,
  setDocumentExtensionData
} from "./metadata.js";
import {
  assertExtensionId,
  assertFieldKey,
  assertSerializable,
  cloneSerializable,
  deepFreeze,
  hookCallAll,
  immutableClone,
  satisfiesVersion
} from "./utils.js";

function normalizeField(field, scope, extensionId) {
  if (!field || typeof field !== "object" || Array.isArray(field)) {
    throw new Error(`${extensionId} ${scope} field definitions must be objects.`);
  }
  const key = assertFieldKey(field.key);
  const type = String(field.type || "text");
  if (!EXTENSION_FIELD_TYPES.includes(type)) {
    throw new Error(`${extensionId}.${key} uses unsupported field type "${type}".`);
  }
  const callbackKeys = [
    "choices",
    "visible",
    "disabled",
    "validate",
    "normalize",
    "serialize",
    "render"
  ];
  for (const callbackKey of callbackKeys) {
    if (field[callbackKey] !== undefined
      && typeof field[callbackKey] !== "function"
      && !(callbackKey === "choices" && (Array.isArray(field.choices) || typeof field.choices === "object"))) {
      throw new Error(`${extensionId}.${key}.${callbackKey} must be a function${callbackKey === "choices" ? " or choices collection" : ""}.`);
    }
  }
  if (type === "custom" && typeof field.render !== "function") {
    throw new Error(`${extensionId}.${key} custom fields require a render function.`);
  }
  if (field.default !== undefined && typeof field.default !== "function") {
    assertSerializable(field.default, `${extensionId}.${key}.default`);
  }
  return Object.freeze({
    key,
    type,
    label: String(field.label || `${extensionId}.${key}`),
    hint: String(field.hint || ""),
    default: field.default,
    required: Boolean(field.required),
    choices: field.choices,
    visible: field.visible,
    disabled: field.disabled,
    validate: field.validate,
    normalize: field.normalize,
    serialize: field.serialize,
    render: field.render,
    order: Number.isFinite(Number(field.order)) ? Number(field.order) : 0,
    group: String(field.group || ""),
    placement: String(field.placement || scope),
    placeholder: String(field.placeholder || ""),
    min: field.min,
    max: field.max,
    step: field.step,
    blocking: field.blocking !== false
  });
}

function normalizeExtension(extension) {
  if (!extension || typeof extension !== "object" || Array.isArray(extension)) {
    throw new Error("Extension registration must be an object.");
  }
  const id = assertExtensionId(extension.id);
  const version = String(extension.version || "0.0.0");
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`${id}.version must be a semantic version such as 1.0.0.`);
  }
  const requiredApiVersion = String(extension.requiredApiVersion || extension.apiVersionRange || "").trim();
  const compatible = !requiredApiVersion || satisfiesVersion(EXTENSION_API_VERSION, requiredApiVersion);
  const compatibilityWarning = compatible
    ? ""
    : `Requires Illuminated Documents extension API ${requiredApiVersion}; current API is ${EXTENSION_API_VERSION}.`;
  const callbacks = { ...(extension.hooks || {}), ...(extension.callbacks || {}) };
  for (const [name, callback] of Object.entries(callbacks)) {
    if (!EXTENSION_CALLBACKS.includes(name)) throw new Error(`${id} registered unsupported callback "${name}".`);
    if (typeof callback !== "function") throw new Error(`${id}.${name} must be a function.`);
  }
  const documentFields = (extension.documentFields || []).map((field) => normalizeField(field, "document", id));
  const blockFields = (extension.blockFields || []).map((field) => normalizeField(field, "block", id));
  const uniqueKeys = new Set();
  for (const field of [...documentFields, ...blockFields]) {
    const key = `${field.placement}:${field.key}`;
    if (uniqueKeys.has(key)) throw new Error(`${id} registered duplicate field key "${field.key}".`);
    uniqueKeys.add(key);
  }
  const capabilities = Array.from(new Set((extension.capabilities || []).map(String))).sort();
  return {
    id,
    version,
    schemaVersion: Number.isFinite(Number(extension.schemaVersion)) ? Math.max(0, Number(extension.schemaVersion || 0)) : 0,
    title: String(extension.title || id),
    priority: Number.isFinite(Number(extension.priority)) ? Number(extension.priority) : 0,
    capabilities,
    documentFields,
    blockFields,
    callbacks,
    compatibility: String(extension.compatibility || ""),
    requiredApiVersion,
    compatible,
    compatibilityWarning,
    registeredAt: Date.now(),
    lateRegistration: false
  };
}

function publicDescriptor(extension, lastError = null) {
  return deepFreeze({
    id: extension.id,
    title: extension.title,
    version: extension.version,
    schemaVersion: extension.schemaVersion,
    priority: extension.priority,
    capabilities: [...extension.capabilities],
    documentFieldCount: extension.documentFields.length,
    blockFieldCount: extension.blockFields.length,
    callbackCount: Object.keys(extension.callbacks).length,
    callbackNames: Object.keys(extension.callbacks).sort(),
    compatibility: extension.compatibility,
    requiredApiVersion: extension.requiredApiVersion,
    compatible: extension.compatible,
    compatibilityWarning: extension.compatibilityWarning,
    registeredAt: extension.registeredAt,
    lateRegistration: extension.lateRegistration,
    status: !extension.compatible ? "incompatible" : lastError ? "error" : "registered",
    lastError: lastError ? cloneSerializable(lastError) : null
  });
}

export class ExtensionRegistry {
  constructor({ executor, onChanged = null } = {}) {
    this.executor = executor;
    this.onChanged = onChanged;
    this.extensions = new Map();
    this.phase = "constructing";
    this.revision = 0;
  }

  setPhase(phase) {
    this.phase = String(phase || "unknown");
  }

  register(extension, { replace = false } = {}) {
    const normalized = normalizeExtension(extension);
    if (this.extensions.has(normalized.id) && !replace) {
      throw new Error(`Extension "${normalized.id}" is already registered.`);
    }
    if (replace && !globalThis.game?.release?.isDevelopment && !globalThis.CONFIG?.debug?.illuminatedDocuments) {
      throw new Error("Extension replacement is restricted to development environments.");
    }
    normalized.lateRegistration = this.phase === "ready";
    this.extensions.set(normalized.id, normalized);
    this.revision += 1;
    const descriptor = publicDescriptor(normalized, this.executor?.getLastError(normalized.id));
    hookCallAll(EXTENSION_HOOKS.REGISTERED, descriptor);
    this.onChanged?.({ type: "registered", extension: descriptor });
    return deepFreeze({
      extension: descriptor,
      unregister: () => this.unregister(normalized.id)
    });
  }

  unregister(extensionId) {
    const id = assertExtensionId(extensionId);
    const existing = this.extensions.get(id);
    if (!existing) return false;
    this.extensions.delete(id);
    this.revision += 1;
    const descriptor = publicDescriptor(existing, this.executor?.getLastError(id));
    hookCallAll(EXTENSION_HOOKS.UNREGISTERED, descriptor);
    this.onChanged?.({ type: "unregistered", extension: descriptor });
    return true;
  }

  get(extensionId) {
    const id = assertExtensionId(extensionId);
    const extension = this.extensions.get(id);
    return extension ? publicDescriptor(extension, this.executor?.getLastError(id)) : null;
  }

  getInternal(extensionId) {
    return this.extensions.get(String(extensionId || "").toLowerCase()) || null;
  }

  has(extensionId) {
    try {
      return this.extensions.has(assertExtensionId(extensionId));
    } catch (_error) {
      return false;
    }
  }

  list() {
    return Array.from(this.extensions.values())
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
      .map((extension) => publicDescriptor(extension, this.executor?.getLastError(extension.id)));
  }

  ordered() {
    return Array.from(this.extensions.values())
      .filter((extension) => extension.compatible)
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  }

  fields(scope) {
    const key = scope === "block" ? "blockFields" : "documentFields";
    return this.ordered().flatMap((extension) => extension[key].map((field) => ({ extension, field })));
  }

  snapshot() {
    return immutableClone({ phase: this.phase, revision: this.revision, extensions: this.list() });
  }
}


function localize(value) {
  const text = String(value ?? "");
  if (!text) return "";
  const i18n = globalThis.game?.i18n;
  return i18n?.has?.(text) ? i18n.localize(text) : text;
}

function fieldName(extensionId, scope, fieldKey, blockId = "") {
  return ["idocExt", extensionId, scope, blockId || "document", fieldKey].join("__");
}

function normalizeChoices(choices) {
  if (!choices) return [];
  if (Array.isArray(choices)) {
    return choices.map((choice) => typeof choice === "object"
      ? { value: String(choice.value ?? choice.id ?? ""), label: localize(choice.label ?? choice.name ?? choice.value ?? "") }
      : { value: String(choice), label: localize(choice) });
  }
  if (typeof choices === "object") return Object.entries(choices).map(([value, label]) => ({ value, label: localize(label) }));
  return [];
}

function resolvedValue(field, explicit, inherited, context) {
  if (explicit !== undefined) return explicit;
  if (inherited !== undefined) return inherited;
  return typeof field.default === "function" ? field.default(context) : cloneSerializable(field.default);
}

async function predicate(executor, extension, name, callback, context, fallback) {
  if (typeof callback !== "function") return fallback;
  return Boolean(await executor.invoke(extension, name, callback, context, { fallback }));
}

export class ExtensionFieldService {
  constructor({ registry, executor }) {
    this.registry = registry;
    this.executor = executor;
  }

  async prepareGroups({
    scope = EXTENSION_FIELD_SCOPES.DOCUMENT,
    metadata = {},
    preset = {},
    block = null,
    lifecycleContext = {}
  } = {}) {
    const isBlock = scope === EXTENSION_FIELD_SCOPES.BLOCK || scope === EXTENSION_FIELD_SCOPES.PRESET_BLOCK;
    const groups = [];
    for (const extension of this.registry.ordered()) {
      const fields = isBlock ? extension.blockFields : extension.documentFields;
      if (!fields.length) continue;
      const record = metadata.extensions?.[extension.id] || {};
      const presetRecord = preset.extensions?.[extension.id] || {};
      const explicit = isBlock
        ? record.blocks?.[block?.id] || {}
        : record.document || {};
      const inherited = isBlock
        ? {
            ...(presetRecord.document || {}),
            ...(presetRecord.blockDefaults || {}),
            ...(record.document || {})
          }
        : { ...(presetRecord.document || {}) };
      const prepared = [];
      for (const field of fields) {
        const context = {
          ...lifecycleContext,
          extensionId: extension.id,
          extension: this.registry.get(extension.id),
          field,
          block,
          metadata: cloneSerializable(metadata),
          preset: cloneSerializable(preset),
          value: resolvedValue(field, explicit[field.key], inherited[field.key], lifecycleContext)
        };
        const visible = await predicate(this.executor, extension, `field:${field.key}:visible`, field.visible, context, true);
        if (!visible) continue;
        const disabled = await predicate(this.executor, extension, `field:${field.key}:disabled`, field.disabled, context, false);
        const choiceSource = typeof field.choices === "function"
          ? await this.executor.invoke(extension, `field:${field.key}:choices`, field.choices, context, { fallback: [] })
          : field.choices;
        const value = context.value;
        prepared.push({
          key: field.key,
          type: field.type,
          label: localize(field.label),
          hint: localize(field.hint),
          required: field.required,
          disabled,
          placeholder: localize(field.placeholder),
          min: field.min,
          max: field.max,
          step: field.step,
          value: value ?? "",
          checked: Boolean(value),
          isSelect: field.type === "select",
          isCheckbox: field.type === "checkbox",
          isText: field.type === "text",
          isNumber: field.type === "number",
          isHidden: field.type === "hidden",
          isCustom: field.type === "custom",
          choices: normalizeChoices(choiceSource).map((choice) => ({ ...choice, selected: String(choice.value) === String(value ?? "") })),
          fieldName: fieldName(extension.id, scope, field.key, block?.id),
          extensionId: extension.id,
          blockId: block?.id || "",
          scope,
          order: field.order,
          group: field.group
        });
      }
      if (prepared.length) groups.push({
        extensionId: extension.id,
        title: localize(extension.title),
        version: extension.version,
        fields: prepared.sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
      });
    }
    return groups;
  }

  capture(root, groups, { metadata = {}, blockId = "" } = {}) {
    const copy = cloneSerializable(metadata || {});
    copy.extensions ||= {};
    for (const group of groups || []) {
      const extension = this.registry.getInternal(group.extensionId);
      if (!extension) continue;
      const record = copy.extensions[group.extensionId] ||= { schemaVersion: extension.schemaVersion, document: {}, blocks: {}, orphanedBlocks: {} };
      const target = blockId ? (record.blocks[blockId] ||= {}) : (record.document ||= {});
      for (const prepared of group.fields || []) {
        const field = (blockId ? extension.blockFields : extension.documentFields).find((candidate) => candidate.key === prepared.key);
        if (!field) continue;
        const escapedName = globalThis.CSS?.escape
          ? globalThis.CSS.escape(prepared.fieldName)
          : prepared.fieldName.replace(/["\\]/g, "\\$&");
        const element = root?.querySelector?.(`[name="${escapedName}"]`)
          || root?.querySelector?.(`[data-extension-field-name="${escapedName}"]`);
        const customMount = field.type === "custom"
          ? root?.querySelector?.(`[data-extension-custom="${escapedName}"]`)
          : null;
        if (!element && !customMount && field.type !== "custom") continue;
        let value;
        if (field.type === "checkbox") value = Boolean(element?.checked);
        else if (field.type === "number") value = element?.value === "" ? null : Number(element?.value);
        else if (field.type === "custom") value = customMount?.__idocExtensionValue !== undefined
          ? cloneSerializable(customMount.__idocExtensionValue)
          : target[field.key];
        else value = element?.value ?? "";
        if (typeof field.normalize === "function") {
          try { value = field.normalize(value, { field, blockId, extensionId: extension.id }); } catch (error) {
            this.executor.record(extension.id, `field:${field.key}:normalize`, error);
          }
        }
        if (typeof field.serialize === "function") {
          try { value = field.serialize(value, { field, blockId, extensionId: extension.id }); } catch (error) {
            this.executor.record(extension.id, `field:${field.key}:serialize`, error);
          }
        }
        target[field.key] = value;
      }
    }
    return copy;
  }

  async renderCustomFields(root, groups, lifecycleContext = {}) {
    for (const group of groups || []) {
      const extension = this.registry.getInternal(group.extensionId);
      if (!extension) continue;
      for (const prepared of group.fields || []) {
        if (!prepared.isCustom) continue;
        const field = [...extension.documentFields, ...extension.blockFields].find((candidate) => candidate.key === prepared.key);
        const mount = root?.querySelector?.(`[data-extension-custom="${prepared.fieldName}"]`);
        if (!mount || typeof field?.render !== "function") continue;
        mount.__idocExtensionValue = cloneSerializable(prepared.value);
        const previousError = this.executor.getLastError(extension.id);
        const callbackName = `field:${field.key}:render`;
        const rendered = await this.executor.invoke(extension, callbackName, field.render, {
          ...lifecycleContext,
          mount,
          field,
          value: cloneSerializable(prepared.value),
          setValue: (value) => { mount.__idocExtensionValue = cloneSerializable(value); },
          getValue: () => cloneSerializable(mount.__idocExtensionValue),
          blockId: prepared.blockId,
          extensionId: extension.id
        });
        const lastError = this.executor.getLastError(extension.id);
        if (lastError?.callback === callbackName && lastError.timestamp !== previousError?.timestamp) {
          mount.classList?.add?.("idoc-extension-field-error");
          mount.setAttribute?.("role", "alert");
          mount.textContent = localize("ILLUMINATED.Extensions.FieldRenderError") || "An extension field could not be rendered.";
          continue;
        }
        mount.classList?.remove?.("idoc-extension-field-error");
        mount.removeAttribute?.("role");
        if (typeof globalThis.HTMLElement !== "undefined" && rendered instanceof globalThis.HTMLElement) {
          mount.replaceChildren(rendered);
        }
      }
    }
  }
}


class IlluminatedExtensionRuntime {
  constructor() {
    this.executor = new ExtensionSafeExecutor();
    this.registry = new ExtensionRegistry({
      executor: this.executor,
      onChanged: () => {
        this.rendering.rerender("");
        this.interfaceRefreshHandler?.();
      }
    });
    this.fields = new ExtensionFieldService({ registry: this.registry, executor: this.executor });
    this.validation = new ExtensionValidationService({ registry: this.registry, executor: this.executor });
    this.migrations = new ExtensionMigrationService({ registry: this.registry, executor: this.executor });
    this.rendering = new ExtensionRenderService({ registry: this.registry, executor: this.executor });
    this.phase = "constructing";
    this.interfaceRefreshHandler = null;
  }

  setInterfaceRefreshHandler(handler) {
    this.interfaceRefreshHandler = typeof handler === "function" ? handler : null;
  }

  setPhase(phase) {
    this.phase = String(phase || "unknown");
    this.registry.setPhase(this.phase);
  }

  async runLifecycle(callbackName, context) {
    const results = [];
    for (const extension of this.registry.ordered()) {
      const result = await this.executor.invoke(extension, callbackName, extension.callbacks[callbackName], {
        ...context,
        extensionId: extension.id,
        extensionData: cloneSerializable(context.extensionData?.[extension.id] || {})
      });
      results.push({ extensionId: extension.id, result });
    }
    return results;
  }

  diagnostics() {
    return {
      apiVersion: EXTENSION_API_VERSION,
      phase: this.phase,
      registryRevision: this.registry.revision,
      extensions: this.registry.list().map((extension) => ({
        ...extension,
        fieldCount: extension.documentFieldCount + extension.blockFieldCount
      })),
      errors: this.executor.getErrors()
    };
  }

  diagnosticReport() {
    const diagnostics = this.diagnostics();
    return JSON.stringify({
      module: "runyth-illuminated-documents",
      moduleVersion: globalThis.game?.modules?.get?.("runyth-illuminated-documents")?.version || "unknown",
      apiVersion: diagnostics.apiVersion,
      phase: diagnostics.phase,
      registeredExtensions: diagnostics.extensions.map((extension) => ({
        id: extension.id,
        title: extension.title,
        version: extension.version,
        schemaVersion: extension.schemaVersion,
        capabilities: extension.capabilities,
        documentFieldCount: extension.documentFieldCount,
        blockFieldCount: extension.blockFieldCount,
        callbacks: extension.callbackNames,
        priority: extension.priority,
        lateRegistration: extension.lateRegistration,
        status: extension.status,
        lastError: extension.lastError
      }))
    }, null, 2);
  }

  clearTransientState() {
    this.executor.clear();
    this.rendering.cacheVersions.clear();
    for (const extension of this.registry.ordered()) {
      this.executor.invoke(extension, "invalidateCache", extension.callbacks.invalidateCache, {
        documentUuid: "",
        extensionId: extension.id,
        allDocuments: true
      });
    }
  }
}

export const extensionRuntime = new IlluminatedExtensionRuntime();

export function extensionApiCompatibility(range) {
  return satisfiesVersion(EXTENSION_API_VERSION, range);
}

export function announceApiInit(api) {
  extensionRuntime.setPhase("init");
  hookCallAll(EXTENSION_HOOKS.API_INIT, api);
}

export function announceApiReady(api) {
  extensionRuntime.setPhase("ready");
  hookCallAll(EXTENSION_HOOKS.API_READY, api);
}

export function metadataContext(metadata) {
  const envelope = ensureDocumentExtensionEnvelope(metadata);
  return {
    extensions: cloneSerializable(envelope.extensions),
    summary: extensionStorageSummary(envelope)
  };
}

export {
  EXTENSION_API_VERSION,
  getDocumentExtensionData,
  setDocumentExtensionData,
  getBlockExtensionData,
  setBlockExtensionData
};
