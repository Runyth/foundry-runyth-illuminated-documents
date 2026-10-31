// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

let canvasCreates = 0;

globalThis.foundry = undefined;
globalThis.crypto ??= { randomUUID: () => "test-uuid" };

globalThis.Image = class MockImage {
  set src(value) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
};

globalThis.document = {
  fonts: { add() {} },
  createElement(type) {
    assert.equal(type, "canvas");
    canvasCreates += 1;
    const context = {
      beginPath() {},
      clip() {},
      drawImage() {},
      fillText() {},
      measureText(text) { return { width: String(text).length * 9 }; },
      moveTo() {},
      lineTo() {},
      rect() {},
      restore() {},
      save() {},
      stroke() {},
      set fillStyle(_value) {},
      set font(_value) {},
      set lineWidth(_value) {},
      set strokeStyle(_value) {},
      set textBaseline(_value) {}
    };
    return {
      width: 0,
      height: 0,
      className: "",
      dataset: {},
      getContext() { return context; },
      remove() {}
    };
  }
};

const {
  DEFAULT_LOGICAL_MAX_PAGES,
  planBookPageEntries,
  renderPlannedPage
} = await import("../scripts/renderer.js");

function narrowTemplate(id, background) {
  return {
    id,
    name: id,
    background,
    width: 320,
    height: 320,
    imageFormat: "png",
    regions: [{
      id: "main",
      x: 0,
      y: 0,
      width: 2,
      height: 5,
      padding: 0,
      fontFamily: "serif",
      fontFile: "",
      fontSize: 18,
      minFontSize: 18,
      lineHeight: 1,
      color: "#000000",
      align: "left",
      verticalAlign: "top",
      fontWeight: "400",
      fontStyle: "normal"
    }]
  };
}

const left = narrowTemplate("left", "left.webp");
const right = narrowTemplate("right", "right.webp");
const text = Array.from({ length: 1205 }, (_value, index) => `longword${index}`).join(" ");

const plans = await planBookPageEntries({
  leftTemplate: left,
  rightTemplate: right,
  text
});

assert.ok(plans.length > 1000, "logical pagination must support books exceeding 1000 pages");
assert.ok(plans.length < DEFAULT_LOGICAL_MAX_PAGES, "ordinary long books must remain below the pathological guard");
assert.equal(canvasCreates, 1, "planning a thousand-page book must allocate only the reusable measurement canvas");
assert.equal(plans[0].template.background, "left.webp");
assert.equal(plans[1].template.background, "right.webp");
assert.equal(plans[2].template.background, "left.webp");

const rendered = await renderPlannedPage(plans[1000]);
assert.equal(rendered.canvas.width, 320);
assert.equal(rendered.canvas.height, 320);
assert.equal(canvasCreates, 2, "rasterizing one logical page must allocate exactly one additional page-sized canvas");


const cancelled = new AbortController();
cancelled.abort();
await assert.rejects(
  () => planBookPageEntries({ leftTemplate: left, rightTemplate: right, text, signal: cancelled.signal }),
  (error) => error?.name === "AbortError",
  "logical pagination must stop promptly when its owning view closes or rerenders"
);

await assert.rejects(
  () => planBookPageEntries({ leftTemplate: left, rightTemplate: right, text, maxPages: 1000 }),
  /logical safety limit of 1000 pages/,
  "the independent pathological guard must remain enforceable without being a normal viewer limit"
);

console.log("virtual rendering tests passed");
