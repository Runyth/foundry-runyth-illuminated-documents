// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { booleanFormValue, numberFormValue } from "../scripts/form-values.js";

for (const value of [true, 1, "1", "true", "TRUE", "on", "yes"]) {
  assert.equal(booleanFormValue(value), true);
}
for (const value of [false, 0, "0", "false", "off", "", undefined, null]) {
  assert.equal(booleanFormValue(value), false);
}
assert.equal(numberFormValue("42.5", 0), 42.5);
assert.equal(numberFormValue(7, 0), 7);
assert.equal(numberFormValue("not-a-number", 9), 9);

console.log("form value normalization tests passed");
