// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { moduleId, repositoryRoot, runtimeEntries } from "./repository.mjs";

const buildRoot = path.join(repositoryRoot, "build");
const moduleRoot = path.join(buildRoot, moduleId);
await rm(buildRoot, { recursive: true, force: true });
await mkdir(moduleRoot, { recursive: true });
for (const entry of runtimeEntries) {
  await cp(path.join(repositoryRoot, entry), path.join(moduleRoot, entry), { recursive: true });
}
console.log(`Built runtime tree at ${path.relative(repositoryRoot, moduleRoot)}.`);
