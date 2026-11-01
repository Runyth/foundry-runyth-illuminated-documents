// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { ExtensionRegistry } from "../scripts/extensions/registry.js";
import { ExtensionSafeExecutor } from "../scripts/extensions/safe-executor.js";
import { ExtensionValidationService } from "../scripts/extensions/validation.js";

const originalError = console.error;
console.error = () => {};
globalThis.Hooks = { callAll: () => {} };
globalThis.game = { release: { isDevelopment: false } };
globalThis.CONFIG = {};
const executor = new ExtensionSafeExecutor();
const registry = new ExtensionRegistry({ executor });
registry.register({
  id: "validation-extension",
  documentFields: [{ key: "required", type: "text", label: "Required value", required: true }],
  blockFields: [{ key: "level", type: "number", validate: ({ value, block }) => value > 2 ? {
    severity: "warning",
    blockId: block.id,
    message: "High level",
    repairAction: { id: "lower-level" }
  } : null }],
  hooks: { validateDocument: () => ({ severity: "info", message: "Checked" }) }
});
registry.register({
  id: "broken-validator",
  hooks: { validateDocument: () => { throw new Error("broken"); } }
});
const service = new ExtensionValidationService({ registry, executor });
const results = await service.validate({
  documentUuid: "JournalEntry.test",
  contentBlocks: [{ id: "b1", label: "One" }],
  extensionData: {
    "validation-extension": {
      document: {},
      blocks: { b1: { level: 3 } }
    }
  }
});
assert.ok(results.some((result) => result.severity === "error" && result.fieldPath.endsWith(".required")));
assert.ok(results.some((result) => result.severity === "warning" && result.blockId === "b1" && result.repairAction.id === "lower-level"));
assert.ok(results.some((result) => result.severity === "info"));
assert.equal(executor.getLastError("broken-validator").callback, "validateDocument");
assert.throws(() => service.assertNoBlockingErrors(results), /Required value/);
service.assertNoBlockingErrors([{ severity: "warning" }, { severity: "error", blocking: false }]);
console.error = originalError;
console.log("extension validation tests passed");
