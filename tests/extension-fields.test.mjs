// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { ExtensionRegistry } from "../scripts/extensions/registry.js";
import { ExtensionSafeExecutor } from "../scripts/extensions/safe-executor.js";
import { ExtensionFieldService } from "../scripts/extensions/fields.js";

globalThis.Hooks = { callAll: () => {} };
globalThis.game = { release: { isDevelopment: false } };
globalThis.CONFIG = {};
globalThis.CSS = { escape: (value) => value };

const executor = new ExtensionSafeExecutor();
const registry = new ExtensionRegistry({ executor });
registry.register({
  id: "field-extension",
  schemaVersion: 3,
  documentFields: [
    { key: "language", type: "select", default: ({ preset }) => preset.defaultLanguage || "common", choices: async () => ({ common: "Common", elvish: "Elvish" }) },
    { key: "enabled", type: "checkbox", default: true },
    { key: "level", type: "number", default: 1, normalize: (value) => Math.max(0, value) }
  ],
  blockFields: [
    { key: "language", type: "select", choices: ["common", "elvish"] },
    { key: "secret", type: "text", visible: ({ block }) => block.kind !== "cover" }
  ]
});
const fields = new ExtensionFieldService({ registry, executor });
const metadata = {
  extensions: {
    "field-extension": {
      schemaVersion: 3,
      document: { language: "elvish" },
      blocks: { b1: { secret: "stored" } },
      orphanedBlocks: {}
    }
  }
};
const preset = {
  defaultLanguage: "common",
  extensions: {
    "field-extension": {
      document: { language: "common" },
      blockDefaults: { language: "common" }
    }
  }
};
const documentGroups = await fields.prepareGroups({ scope: "document", metadata, preset, lifecycleContext: { preset } });
assert.equal(documentGroups[0].fields.find((field) => field.key === "language").value, "elvish", "Document value overrides preset default");
assert.equal(documentGroups[0].fields.find((field) => field.key === "enabled").checked, true);
assert.equal(documentGroups[0].fields.find((field) => field.key === "language").choices.length, 2);

const block = { id: "b1", kind: "initial", label: "Block" };
const blockGroups = await fields.prepareGroups({ scope: "block", metadata, preset, block, lifecycleContext: { preset } });
assert.equal(blockGroups[0].fields.find((field) => field.key === "language").value, "elvish", "Document value overrides preset block default when block has no explicit value");
assert.equal(blockGroups[0].fields.find((field) => field.key === "secret").value, "stored");

const elements = new Map();
for (const field of documentGroups[0].fields) {
  elements.set(field.fieldName, {
    value: field.key === "level" ? "-2" : field.key === "language" ? "common" : "",
    checked: field.key === "enabled"
  });
}
const root = {
  querySelector(selector) {
    const match = selector.match(/\[name="([^"]+)"\]/) || selector.match(/\[data-extension-field-name="([^"]+)"\]/);
    return match ? elements.get(match[1]) || null : null;
  }
};
const captured = fields.capture(root, documentGroups, { metadata });
assert.equal(captured.extensions["field-extension"].document.language, "common");
assert.equal(captured.extensions["field-extension"].document.enabled, true);
assert.equal(captured.extensions["field-extension"].document.level, 0);

console.log("extension field tests passed");
