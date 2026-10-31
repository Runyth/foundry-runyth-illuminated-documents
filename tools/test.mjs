// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { repositoryRoot } from "./repository.mjs";

const testDirectory = path.join(repositoryRoot, "tests");
const tests = (await readdir(testDirectory))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(testDirectory, test)], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Completed ${tests.length} test files.`);
