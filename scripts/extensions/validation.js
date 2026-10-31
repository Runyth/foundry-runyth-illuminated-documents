// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { EXTENSION_HOOKS, VALIDATION_SEVERITIES } from "./constants.js";
import { hookCallAll } from "./utils.js";

function localize(value) {
  const text = String(value ?? "");
  if (!text) return "";
  const i18n = globalThis.game?.i18n;
  return i18n?.has?.(text) ? i18n.localize(text) : text;
}

export function normalizeValidationResult(result, extensionId = "") {
  if (!result) return [];
  const source = Array.isArray(result) ? result : [result];
  return source.filter(Boolean).map((entry) => {
    if (typeof entry === "string") return {
      extensionId,
      severity: "error",
      message: entry,
      blocking: true
    };
    const severity = VALIDATION_SEVERITIES.includes(entry.severity) ? entry.severity : "error";
    return {
      extensionId,
      severity,
      blocking: entry.blocking !== undefined ? Boolean(entry.blocking) : severity === "error",
      fieldPath: String(entry.fieldPath || ""),
      blockId: String(entry.blockId || ""),
      message: String(entry.message || ""),
      localizationKey: String(entry.localizationKey || ""),
      repairAction: entry.repairAction && typeof entry.repairAction === "object" ? { ...entry.repairAction } : null
    };
  });
}

export class ExtensionValidationService {
  constructor({ registry, executor }) {
    this.registry = registry;
    this.executor = executor;
  }

  async validate(context, { includeFields = true } = {}) {
    const results = [];
    for (const extension of this.registry.ordered()) {
      if (includeFields) {
        for (const field of extension.documentFields) {
          const value = context.extensionData?.[extension.id]?.document?.[field.key];
          if (field.required && (value === undefined || value === null || value === "")) {
            results.push(normalizeValidationResult({
              severity: "error",
              blocking: field.blocking,
              fieldPath: `extensions.${extension.id}.document.${field.key}`,
              message: `${localize(field.label)} is required.`
            }, extension.id)[0]);
          }
          if (typeof field.validate === "function") {
            const fieldResult = await this.executor.invoke(extension, `field:${field.key}:validate`, field.validate, {
              ...context,
              value,
              field,
              extensionId: extension.id
            });
            results.push(...normalizeValidationResult(fieldResult, extension.id));
          }
        }
        for (const block of context.contentBlocks || []) {
          for (const field of extension.blockFields) {
            const value = context.extensionData?.[extension.id]?.blocks?.[block.id]?.[field.key];
            if (field.required && (value === undefined || value === null || value === "")) {
              results.push(normalizeValidationResult({
                severity: "error",
                blocking: field.blocking,
                blockId: block.id,
                fieldPath: `extensions.${extension.id}.blocks.${block.id}.${field.key}`,
                message: `${localize(field.label)} is required for ${block.label || block.id}.`
              }, extension.id)[0]);
            }
            if (typeof field.validate === "function") {
              const fieldResult = await this.executor.invoke(extension, `blockField:${field.key}:validate`, field.validate, {
                ...context,
                block,
                value,
                field,
                extensionId: extension.id
              });
              results.push(...normalizeValidationResult(fieldResult, extension.id));
            }
          }
        }
      }

      const callback = extension.callbacks.validateDocument;
      const extensionResult = await this.executor.invoke(extension, "validateDocument", callback, {
        ...context,
        extensionId: extension.id,
        extensionData: context.extensionData?.[extension.id] || { document: {}, blocks: {} }
      }, { fallback: [] });
      results.push(...normalizeValidationResult(extensionResult, extension.id));
    }
    hookCallAll(EXTENSION_HOOKS.VALIDATION, Object.freeze({
      documentUuid: String(context.documentUuid || ""),
      results: results.map((result) => Object.freeze({ ...result }))
    }));
    return results;
  }

  assertNoBlockingErrors(results) {
    const blocking = (results || []).filter((result) => result.severity === "error" && result.blocking !== false);
    if (!blocking.length) return;
    throw new Error(blocking.map((result) => result.message || result.localizationKey || "Extension validation failed.").join("\n"));
  }
}
