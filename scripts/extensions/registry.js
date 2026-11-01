// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
/**
 * Compatibility re-export for source consumers and tests.
 *
 * The production runtime keeps its registry implementation in runtime.js so a
 * non-GM client does not depend on a separate browser request for registry.js
 * while bootstrapping the extension-enabled creation workflow.
 */
export { ExtensionRegistry } from "./runtime.js";
