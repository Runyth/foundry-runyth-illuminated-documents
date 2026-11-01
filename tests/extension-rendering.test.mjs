// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { ExtensionRegistry } from "../scripts/extensions/registry.js";
import { ExtensionSafeExecutor } from "../scripts/extensions/safe-executor.js";
import { ExtensionRenderService } from "../scripts/extensions/rendering.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.className = "";
    this.attributes = new Map();
    this._text = "";
  }
  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === "string") {
        const text = new FakeElement("#text");
        text.textContent = node;
        node = text;
      }
      node.parentNode = this;
      this.children.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  get textContent() {
    if (this.children.length) return this.children.map((child) => child.textContent).join("");
    return this._text;
  }
  set textContent(value) { this.children = []; this._text = String(value ?? ""); }
  matches(selector) {
    if (selector === "[data-illuminated-block-id]") return Boolean(this.dataset.illuminatedBlockId);
    if (selector === "[data-idoc-block-label]") return this.dataset.idocBlockLabel !== undefined;
    if (selector === "[data-idoc-block-text]") return this.dataset.idocBlockText !== undefined;
    if (selector.startsWith(".")) return this.className.split(/\s+/).includes(selector.slice(1));
    return false;
  }
  querySelectorAll(selector) {
    const result = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

const originalConsoleError = console.error;
console.error = () => {};

globalThis.document = { createElement: (tag) => new FakeElement(tag) };
globalThis.Hooks = { callAll: () => {} };
globalThis.game = { release: { isDevelopment: false } };
globalThis.CONFIG = {};

const executor = new ExtensionSafeExecutor();
const registry = new ExtensionRegistry({ executor });
registry.setPhase("ready");
const calls = [];
registry.register({
  id: "second",
  priority: 20,
  hooks: {
    transformRenderedDocument: async ({ blockRootElement, viewer }) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      calls.push(`second:${viewer.id}`);
      blockRootElement.querySelector("[data-idoc-block-text]").textContent += "-second";
    }
  }
});
registry.register({
  id: "first",
  priority: 10,
  hooks: {
    prepareViewerContext: ({ contentBlocks }) => ({ contentBlocks: contentBlocks.map((block) => ({ ...block, text: `${block.text}-prepared` })) }),
    transformRenderedDocument: ({ blockRootElement, viewer }) => {
      calls.push(`first:${viewer.id}`);
      blockRootElement.querySelector("[data-idoc-block-text]").textContent += "-first";
    }
  }
});
registry.register({
  id: "broken",
  priority: 15,
  hooks: { transformRenderedDocument: () => { throw new Error("expected failure"); } }
});

const rendering = new ExtensionRenderService({ registry, executor });
const original = [{ id: "block-a", label: "A", kind: "initial", text: "source", startOnNewPage: true }];
const root = new FakeElement();
const transformed = await rendering.transform({
  rootElement: root,
  documentUuid: "JournalEntry.test",
  viewer: { id: "viewer-1" },
  renderMode: "viewer",
  contentBlocks: original,
  extensionData: {},
  abortSignal: new AbortController().signal
});
assert.deepEqual(calls, ["first:viewer-1", "second:viewer-1"]);
assert.equal(transformed.contentBlocks[0].text, "source-prepared-first-second");
assert.equal(transformed.contentBlocks[0].startOnNewPage, true, "viewer context transforms must preserve page-flow metadata");
assert.equal(original[0].text, "source", "Transformers must not mutate authoritative source blocks");
assert.equal(root.querySelectorAll("[data-illuminated-block-id]")[0].dataset.illuminatedBlockId, "block-a");
assert.equal(executor.getLastError("broken").callback, "transformRenderedDocument");

const signatureRoot = new FakeElement();
const firstRender = rendering.begin(signatureRoot, "one");
assert.equal(firstRender.duplicate, false);
const duplicateRender = rendering.begin(signatureRoot, "one");
assert.equal(duplicateRender.duplicate, true);
assert.equal(duplicateRender.signal, firstRender.signal, "duplicate renders must not abort a live virtualized renderer");
assert.equal(firstRender.signal.aborted, false);
const replacementRender = rendering.begin(signatureRoot, "two");
assert.equal(replacementRender.duplicate, false);
assert.equal(firstRender.signal.aborted, true, "a changed render signature must cancel stale page work");
rendering.cancel(signatureRoot);

let rerendered = "";
rendering.setRerenderHandler((uuid) => { rerendered = uuid; return 4; });
assert.equal(await rendering.rerender("JournalEntry.test"), 4);
assert.equal(rerendered, "JournalEntry.test");
const before = rendering.cacheSignature("JournalEntry.test");
rendering.invalidate("JournalEntry.test", "first");
assert.notEqual(rendering.cacheSignature("JournalEntry.test"), before);

const invalidationExecutor = new ExtensionSafeExecutor();
const invalidationRegistry = new ExtensionRegistry({ executor: invalidationExecutor });
let invalidationRendering;
let invalidationCallbackCalls = 0;
invalidationRegistry.register({
  id: "recursive-invalidator",
  hooks: {
    invalidateCache: ({ documentUuid }) => {
      invalidationCallbackCalls += 1;
      // Simulate a companion extension that asks the host to invalidate again
      // from inside its own cache callback. The host must not call it recursively.
      invalidationRendering.invalidate(documentUuid, "recursive-invalidator");
    }
  }
});
invalidationRendering = new ExtensionRenderService({ registry: invalidationRegistry, executor: invalidationExecutor });
const recursiveBefore = invalidationRendering.cacheSignature("JournalEntry.recursive");
invalidationRendering.invalidate("JournalEntry.recursive", "", { notifyExtensions: true, reason: "document-update" });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(invalidationCallbackCalls, 1, "Re-entrant extension cache callbacks must be suppressed");
assert.notEqual(invalidationRendering.cacheSignature("JournalEntry.recursive"), recursiveBefore);

const publicBefore = invalidationRendering.cacheSignature("JournalEntry.public");
invalidationRendering.invalidate("JournalEntry.public", "recursive-invalidator", {
  notifyExtensions: false,
  reason: "extension-api"
});
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(invalidationCallbackCalls, 1, "Public extension-to-host invalidation must not call the extension back");
assert.notEqual(invalidationRendering.cacheSignature("JournalEntry.public"), publicBefore);

const abortExecutor = new ExtensionSafeExecutor();
const abortRegistry = new ExtensionRegistry({ executor: abortExecutor });
const abortCalls = [];
abortRegistry.register({ id: "slow", priority: 1, hooks: { transformRenderedDocument: async () => {
  abortCalls.push("slow");
  await new Promise((resolve) => setTimeout(resolve, 8));
} } });
abortRegistry.register({ id: "after", priority: 2, hooks: { transformRenderedDocument: () => abortCalls.push("after") } });
const abortRendering = new ExtensionRenderService({ registry: abortRegistry, executor: abortExecutor });
const controller = new AbortController();
setTimeout(() => controller.abort(), 1);
await abortRendering.transform({
  rootElement: new FakeElement(),
  documentUuid: "JournalEntry.abort",
  viewer: { id: "viewer-2" },
  contentBlocks: original,
  extensionData: {},
  abortSignal: controller.signal
});
assert.deepEqual(abortCalls, ["slow"]);

console.error = originalConsoleError;
console.log("extension rendering tests passed");
