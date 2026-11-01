// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
/**
 * Compatibility re-export for source consumers and tests.
 *
 * The production runtime keeps its field-service implementation in runtime.js
 * so player-side document creation cannot fail solely because fields.js was
 * unavailable as an independent browser module request.
 */
export { ExtensionFieldService } from "./runtime.js";
