// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { repositoryRoot, walkFiles } from "./repository.mjs";

const files = (await walkFiles(repositoryRoot, { exclude: new Set([".git", "node_modules", "build", "dist"]) }))
  .filter((file) => file.endsWith(".js") || file.endsWith(".mjs"));

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: repositoryRoot, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}
console.log(`Syntax-checked ${files.length} JavaScript files.`);
