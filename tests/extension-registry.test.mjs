// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { ExtensionRegistry } from "../scripts/extensions/registry.js";
import { ExtensionSafeExecutor } from "../scripts/extensions/safe-executor.js";

const events = [];
globalThis.Hooks = { callAll: (name, payload) => events.push({ name, payload }) };
globalThis.game = { release: { isDevelopment: false } };
globalThis.CONFIG = {};

const executor = new ExtensionSafeExecutor();
let changes = 0;
const registry = new ExtensionRegistry({ executor, onChanged: () => { changes += 1; } });
registry.setPhase("init");

const handle = registry.register({
  id: "example-extension",
  version: "1.2.3",
  schemaVersion: 2,
  priority: 20,
  capabilities: ["render", "metadata", "render"],
  documentFields: [{ key: "mode", type: "select", choices: { common: "Common" } }],
  blockFields: [{ key: "enabled", type: "checkbox" }],
  hooks: { validateDocument: () => [] }
});
assert.equal(handle.extension.id, "example-extension");
assert.equal(registry.has("example-extension"), true);
assert.equal(registry.get("example-extension").documentFieldCount, 1);
assert.equal(registry.getExtensions, undefined, "Registry internals do not expose mutable collections");
assert.throws(() => { handle.extension.capabilities.push("mutate"); }, TypeError);
assert.throws(() => registry.register({ id: "example-extension" }), /already registered/);
assert.throws(() => registry.register({}), /Extension IDs/);
assert.throws(() => registry.register({ id: "Bad ID" }), /Extension IDs/);
assert.throws(() => registry.register({ id: "bad-callback", hooks: { unknown: () => {} } }), /unsupported callback/);
assert.throws(() => registry.register({ id: "bad-field", documentFields: [{ key: "value", type: "unsupported" }] }), /unsupported field type/);
assert.throws(() => registry.register({ id: "bad-custom", blockFields: [{ key: "component", type: "custom" }] }), /render function/);

registry.register({ id: "first-priority", priority: -5 });
const incompatible = registry.register({ id: "future-extension", requiredApiVersion: ">=2.0.0" });
assert.equal(incompatible.extension.status, "incompatible");
assert.match(incompatible.extension.compatibilityWarning, /current API is 1.0.0/);
assert.deepEqual(registry.ordered().map((entry) => entry.id), ["first-priority", "example-extension"]);
assert.ok(registry.list().some((entry) => entry.id === "future-extension"));
registry.setPhase("ready");
const late = registry.register({ id: "late-extension" });
assert.equal(late.extension.lateRegistration, true);
assert.equal(changes, 4);
assert.equal(handle.unregister(), true);
assert.equal(registry.has("example-extension"), false);
assert.equal(handle.unregister(), false);
assert.ok(events.some((event) => event.name === "illuminatedDocumentsExtensionRegistered"));
assert.ok(events.some((event) => event.name === "illuminatedDocumentsExtensionUnregistered"));

console.log("extension registry tests passed");
