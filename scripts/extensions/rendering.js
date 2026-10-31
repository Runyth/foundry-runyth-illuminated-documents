// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { EXTENSION_HOOKS } from "./constants.js";
import { cloneSerializable, hookCallAll } from "./utils.js";

function safeBlock(block) {
  return {
    id: String(block?.id || ""),
    label: String(block?.label || ""),
    kind: String(block?.kind || "manual"),
    text: String(block?.text || ""),
    startOnNewPage: Boolean(block?.startOnNewPage),
    createdAt: Number(block?.createdAt || 0),
    updatedAt: Number(block?.updatedAt || 0)
  };
}

function createBlockStage(contentBlocks) {
  const stage = document.createElement("div");
  stage.className = "idoc-extension-block-stage";
  stage.setAttribute("aria-hidden", "true");
  for (const block of contentBlocks) {
    const section = document.createElement("section");
    section.dataset.illuminatedBlockId = block.id;
    section.dataset.illuminatedBlockKind = block.kind;
    const label = document.createElement("span");
    label.dataset.idocBlockLabel = "true";
    label.textContent = block.label;
    const text = document.createElement("span");
    text.dataset.idocBlockText = "true";
    text.textContent = block.text;
    section.append(label, text);
    stage.append(section);
  }
  return stage;
}

function collectBlocks(stage, originalBlocks) {
  const byId = new Map(originalBlocks.map((block) => [block.id, block]));
  return Array.from(stage.querySelectorAll("[data-illuminated-block-id]")).map((section) => {
    const id = String(section.dataset.illuminatedBlockId || "");
    const original = byId.get(id) || { id, kind: "manual", label: id, text: "" };
    return {
      ...original,
      label: section.querySelector("[data-idoc-block-label]")?.textContent ?? original.label,
      text: section.querySelector("[data-idoc-block-text]")?.textContent ?? original.text
    };
  });
}

export class ExtensionRenderService {
  constructor({ registry, executor }) {
    this.registry = registry;
    this.executor = executor;
    this.controllers = new WeakMap();
    this.signatures = new WeakMap();
    this.cacheVersions = new Map();
    this.activeInvalidationCallbacks = new Set();
    this.rerenderHandler = null;
  }

  setRerenderHandler(handler) {
    this.rerenderHandler = typeof handler === "function" ? handler : null;
  }

  cacheSignature(documentUuid) {
    const state = this.cacheVersions.get(String(documentUuid || "")) || { global: 0, extensions: {} };
    return `${state.global}:${Object.entries(state.extensions).sort().map(([id, version]) => `${id}:${version}`).join(",")}`;
  }

  invalidate(documentUuid, extensionId = "", { notifyExtensions = true, reason = "core" } = {}) {
    const uuid = String(documentUuid || "");
    if (!uuid) return;
    const normalizedExtensionId = String(extensionId || "");
    const state = this.cacheVersions.get(uuid) || { global: 0, extensions: {} };
    if (normalizedExtensionId) {
      state.extensions[normalizedExtensionId] = Number(state.extensions[normalizedExtensionId] || 0) + 1;
    } else {
      state.global += 1;
    }
    this.cacheVersions.set(uuid, state);
    if (!notifyExtensions) return;

    for (const extension of this.registry.ordered()) {
      if (normalizedExtensionId && extension.id !== normalizedExtensionId) continue;
      const callbackKey = `${uuid}::${extension.id}`;
      if (this.activeInvalidationCallbacks.has(callbackKey)) continue;
      this.activeInvalidationCallbacks.add(callbackKey);
      const invocation = this.executor.invoke(extension, "invalidateCache", extension.callbacks.invalidateCache, {
        documentUuid: uuid,
        extensionId: normalizedExtensionId || null,
        reason: String(reason || "core")
      });
      void Promise.resolve(invocation).finally(() => this.activeInvalidationCallbacks.delete(callbackKey));
    }
  }

  async rerender(documentUuid = "") {
    return this.rerenderHandler?.(String(documentUuid || ""));
  }

  begin(rootElement, signature) {
    const previousController = this.controllers.get(rootElement);
    const duplicate = this.signatures.get(rootElement) === signature
      && previousController
      && !previousController.signal.aborted;
    if (duplicate) {
      return { controller: previousController, signal: previousController.signal, duplicate: true };
    }
    previousController?.abort();
    const controller = new AbortController();
    this.controllers.set(rootElement, controller);
    this.signatures.set(rootElement, signature);
    return { controller, signal: controller.signal, duplicate: false };
  }

  cancel(rootElement) {
    if (!rootElement) return;
    this.controllers.get(rootElement)?.abort();
    this.controllers.delete(rootElement);
    this.signatures.delete(rootElement);
  }

  cancelTree(rootElement) {
    if (!rootElement) return;
    this.cancel(rootElement);
    for (const element of rootElement.querySelectorAll?.(".idoc-live-document, .idoc-live-document-root, [data-viewer-pages]") || []) {
      this.cancel(element);
    }
  }

  async prepareViewerContext(baseContext) {
    let context = {
      ...baseContext,
      contentBlocks: (baseContext.contentBlocks || []).map(safeBlock),
      extensionData: cloneSerializable(baseContext.extensionData || {})
    };
    for (const extension of this.registry.ordered()) {
      const response = await this.executor.invoke(extension, "prepareViewerContext", extension.callbacks.prepareViewerContext, {
        ...context,
        extensionId: extension.id,
        extensionData: cloneSerializable(context.extensionData?.[extension.id] || {})
      });
      if (response && typeof response === "object") {
        context = {
          ...context,
          ...response,
          contentBlocks: Array.isArray(response.contentBlocks)
            ? response.contentBlocks.map((block) => {
              const previous = context.contentBlocks.find((candidate) => candidate.id === String(block?.id || "")) || {};
              return safeBlock({ ...previous, ...block });
            })
            : context.contentBlocks
        };
      }
    }
    return context;
  }

  async transform({ rootElement, ...baseContext }) {
    const prepared = await this.prepareViewerContext(baseContext);
    const stage = createBlockStage(prepared.contentBlocks);
    rootElement.append(stage);
    const context = {
      ...prepared,
      rootElement,
      blockRootElement: stage,
      contentBlocks: prepared.contentBlocks,
      abortSignal: baseContext.abortSignal
    };
    hookCallAll(EXTENSION_HOOKS.BEFORE_TRANSFORM, Object.freeze({
      documentUuid: String(context.documentUuid || ""),
      renderMode: String(context.renderMode || "viewer"),
      extensionIds: this.registry.ordered().map((extension) => extension.id)
    }));

    for (const extension of this.registry.ordered()) {
      if (context.abortSignal?.aborted) break;
      await this.executor.invoke(extension, "transformRenderedDocument", extension.callbacks.transformRenderedDocument, {
        ...context,
        extensionId: extension.id,
        extensionData: cloneSerializable(context.extensionData?.[extension.id] || {})
      });
    }

    const contentBlocks = collectBlocks(stage, prepared.contentBlocks);
    hookCallAll(EXTENSION_HOOKS.AFTER_TRANSFORM, Object.freeze({
      documentUuid: String(context.documentUuid || ""),
      renderMode: String(context.renderMode || "viewer"),
      transformedBlockIds: contentBlocks.map((block) => block.id)
    }));
    return { ...prepared, contentBlocks, blockRootElement: stage };
  }
}
