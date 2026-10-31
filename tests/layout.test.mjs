// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

// Foundry is optional in the pure normalization module.
globalThis.foundry = undefined;
globalThis.crypto ??= { randomUUID: () => "test-uuid" };

const { normalizeRegion, normalizeTemplate, splitParagraphs, regionPixels } = await import("../scripts/layout.js");

const region = normalizeRegion({ x: -10, y: 120, width: 0, height: 500, color: "unsafe" });
assert.equal(region.x, 0);
assert.equal(region.y, 100);
assert.equal(region.width, 1);
assert.equal(region.height, 100);
assert.equal(region.color, "#2b1b12");

const template = normalizeTemplate({ id: "My Template", width: 100, height: 200, regions: [] });
assert.equal(template.id, "my-template");
assert.equal(template.width, 320);
assert.equal(template.height, 320);
assert.equal(template.regions.length, 1);

assert.deepEqual(splitParagraphs("One\nline\n\nTwo"), ["One line", "Two"]);
assert.deepEqual(regionPixels({ x: 10, y: 10, width: 80, height: 80, padding: 2 }, 1000, 2000), {
  x: 120,
  y: 240,
  width: 760,
  height: 1520
});

console.log("layout tests passed");
