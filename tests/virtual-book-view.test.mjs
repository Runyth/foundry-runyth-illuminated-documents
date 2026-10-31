// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = "";
    this.classList = new FakeClassList();
    this.style = { setProperty: (key, value) => { this.style[key] = value; } };
    this.attributes = new Map();
    this.parentNode = null;
    this.width = 0;
    this.height = 0;
  }
  append(...children) {
    for (const child of children) {
      if (typeof child === "string") continue;
      child.parentNode = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...children);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener() {}
  closest() { return null; }
  getBoundingClientRect() { return { top: 0, bottom: 1000 }; }
}

const observers = [];
globalThis.IntersectionObserver = class MockIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.targets = [];
    this.disconnected = false;
    observers.push(this);
  }
  observe(target) { this.targets.push(target); }
  disconnect() { this.disconnected = true; }
};

globalThis.document = {
  createElement(tag) { return new FakeElement(tag); },
  createTextNode(text) { return { textContent: String(text), parentNode: null }; }
};
globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (_key, data) => `${data.count} logical pages`
  }
};

globalThis.navigator ??= {};

const { VirtualBookView } = await import("../scripts/virtual-book.js");

const root = new FakeElement("div");
const plans = Array.from({ length: 1000 }, (_value, index) => ({
  kind: "body",
  bodyIndex: index,
  label: `Page ${index + 1}`,
  template: { width: 1200, height: 1600, background: "page.webp", regions: [] },
  regions: []
}));

const renderedIndexes = [];
const view = new VirtualBookView({
  rootElement: root,
  pagePlans: plans,
  showStatus: false,
  renderPage: async (plan) => {
    renderedIndexes.push(plan.bodyIndex);
    const canvas = new FakeElement("canvas");
    canvas.width = 1200;
    canvas.height = 1600;
    return { canvas, template: plan.template, kind: plan.kind, bodyIndex: plan.bodyIndex, label: plan.label };
  }
});
view.mount();
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));

assert.equal(view.frames.length, 1000, "all logical pages should have lightweight addressable placeholders");
assert.deepEqual(renderedIndexes, [0, 1], "mounting must rasterize only the initial viewport prefetch, not the whole book");
assert.equal(view.cache.items.size, 2);
assert.equal(observers.length, 1);
assert.equal(observers[0].targets.length, 1000);

observers[0].callback([{ target: view.frames[500].figure, isIntersecting: true, intersectionRatio: 1 }]);
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(renderedIndexes, [0, 1, 500], "an observed distant page should rasterize independently on demand");
assert.equal(view.cache.items.size, 3);

view.destroy();
assert.equal(observers[0].disconnected, true);
assert.equal(view.cache.items.size, 0, "closing the view must release cached raster pages");

console.log("virtual book viewport tests passed");
