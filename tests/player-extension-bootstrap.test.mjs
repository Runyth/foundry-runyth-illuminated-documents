// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptsRoot = path.join(root, "scripts");

function importsFrom(source) {
  const results = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^"'()]*?\s+from\s*)?["'](\.\.?\/[^"']+)["']/g,
    /import\s*\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) results.add(match[1]);
  }
  return [...results];
}

async function productionGraph(entry) {
  const visited = new Set();
  const pending = [entry];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = await readFile(file, "utf8");
    for (const specifier of importsFrom(source)) {
      const target = path.resolve(path.dirname(file), specifier.split(/[?#]/, 1)[0]);
      await access(target);
      if (target.endsWith(".js")) pending.push(target);
    }
  }
  return visited;
}

const graph = await productionGraph(path.join(scriptsRoot, "main.js"));
const relativeGraph = new Set([...graph].map((file) => path.relative(root, file).replaceAll(path.sep, "/")));
assert.ok(relativeGraph.has("scripts/extensions/runtime.js"), "The extension runtime must remain part of the production graph.");
assert.ok(!relativeGraph.has("scripts/extensions/registry.js"), "Player startup must not require a separate registry.js browser request.");
assert.ok(!relativeGraph.has("scripts/extensions/fields.js"), "Player startup must not require a separate fields.js browser request.");

const runtimeSource = await readFile(path.join(scriptsRoot, "extensions/runtime.js"), "utf8");
assert.doesNotMatch(runtimeSource, /from\s+["']\.\/registry\.js["']/);
assert.doesNotMatch(runtimeSource, /from\s+["']\.\/fields\.js["']/);
assert.match(runtimeSource, /export class ExtensionRegistry/);
assert.match(runtimeSource, /export class ExtensionFieldService/);

const extensionTemplate = await readFile(path.join(root, "templates/extension-fields.hbs"), "utf8");
for (const fieldType of ["isSelect", "isCheckbox", "isText", "isNumber", "isHidden", "isCustom"]) {
  assert.match(extensionTemplate, new RegExp(fieldType), `Extension field template must render ${fieldType}.`);
}

globalThis.game = {
  user: { id: "player-1", name: "Player 1", isGM: false },
  release: { isDevelopment: false },
  i18n: {
    has: () => false,
    localize: (key) => key
  }
};
globalThis.Hooks = { callAll() {} };

const { extensionRuntime } = await import(`../scripts/extensions/runtime.js?player-bootstrap=${Date.now()}`);
extensionRuntime.setPhase("init");
extensionRuntime.registry.register({
  id: "player-bootstrap-test",
  version: "1.0.0",
  documentFields: [{
    key: "documentMode",
    type: "select",
    label: "Document mode",
    choices: () => [
      { value: "plain", label: "Plain" },
      { value: "annotated", label: "Annotated" }
    ],
    default: "plain"
  }],
  blockFields: [{
    key: "marked",
    type: "checkbox",
    label: "Marked",
    default: true
  }]
});

const metadata = { extensions: {} };
const documentGroups = await extensionRuntime.fields.prepareGroups({
  scope: "document",
  metadata,
  preset: {},
  lifecycleContext: { currentUser: game.user, isGM: false, mode: "create" }
});
assert.equal(documentGroups.length, 1);
assert.equal(documentGroups[0].fields[0].fieldName, "idocExt__player-bootstrap-test__document__document__documentMode");
assert.equal(documentGroups[0].fields[0].value, "plain");
assert.equal(documentGroups[0].fields[0].choices.length, 2);

const blockGroups = await extensionRuntime.fields.prepareGroups({
  scope: "block",
  metadata,
  preset: {},
  block: { id: "block-player-1", label: "Initial content", kind: "initial", text: "Hello" },
  lifecycleContext: { currentUser: game.user, isGM: false, mode: "create" }
});
assert.equal(blockGroups.length, 1);
assert.equal(blockGroups[0].fields[0].checked, true);
assert.match(blockGroups[0].fields[0].fieldName, /block-player-1/);

const input = { value: "annotated", checked: false };
const rootElement = {
  querySelector(selector) {
    return selector.includes("documentMode") ? input : null;
  }
};
const captured = extensionRuntime.fields.capture(rootElement, documentGroups, { metadata });
assert.equal(captured.extensions["player-bootstrap-test"].document.documentMode, "annotated");

const validation = await extensionRuntime.validation.validate({
  currentUser: game.user,
  isGM: false,
  metadata: captured,
  contentBlocks: [{ id: "block-player-1", text: "Hello" }],
  extensionData: captured.extensions
});
assert.deepEqual(validation.filter((entry) => entry.blocking), []);

console.log("Player extension bootstrap and production module-graph tests passed");
