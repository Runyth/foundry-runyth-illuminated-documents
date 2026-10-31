// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

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
      getContext() { return context; }
    };
  }
};

const { describeBookPage, renderBookPageEntries } = await import("../scripts/renderer.js");

assert.equal(describeBookPage("front-cover"), "Front cover");
assert.equal(describeBookPage("body", 0), "Page 1 · left template");
assert.equal(describeBookPage("body", 1), "Page 2 · right template");
assert.equal(describeBookPage("back-cover"), "Back cover");

function template(id, background) {
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
      width: 100,
      height: 18,
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

const left = template("left", "left.webp");
const right = template("right", "right.webp");
const front = template("front", "front.webp");
const back = template("back", "back.webp");
const text = Array.from({ length: 80 }, (_value, index) => `word${index}`).join(" ");

const entries = await renderBookPageEntries({
  leftTemplate: left,
  rightTemplate: right,
  frontCoverTemplate: front,
  backCoverTemplate: back,
  includeFrontCover: true,
  includeBackCover: true,
  text,
  maxPages: 50
});

assert.equal(entries[0].kind, "front-cover");
assert.equal(entries.at(-1).kind, "back-cover");

const body = entries.filter((entry) => entry.kind === "body");
assert.ok(body.length > 1, "long text should render to multiple body pages");
assert.equal(body[0].template.background, "left.webp");
assert.equal(body[1].template.background, "right.webp");
assert.equal(body[2].template.background, "left.webp");
assert.equal(entries.length, body.length + 2, "covers must not replace or remove body pages");


const flowingSections = await renderBookPageEntries({
  leftTemplate: left,
  rightTemplate: right,
  text: "First section\n\nSecond section",
  contentEntries: [
    { id: "first", text: "First section", startOnNewPage: false },
    { id: "second", text: "Second section", startOnNewPage: false }
  ]
});
assert.equal(
  flowingSections.filter((entry) => entry.kind === "body").length,
  1,
  "short sections should share a page when no page break is requested"
);

const separatedSections = await renderBookPageEntries({
  leftTemplate: left,
  rightTemplate: right,
  text: "First section\n\nSecond section",
  contentEntries: [
    { id: "first", text: "First section", startOnNewPage: false },
    { id: "second", text: "Second section", startOnNewPage: true }
  ]
});
const separatedBody = separatedSections.filter((entry) => entry.kind === "body");
assert.equal(separatedBody.length, 2, "a forced section page break should create a new body page");
assert.equal(separatedBody[0].template.background, "left.webp");
assert.equal(separatedBody[1].template.background, "right.webp");

console.log("book rendering tests passed");
