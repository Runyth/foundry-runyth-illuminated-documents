// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { moduleId, readManifest, repositoryRoot } from "./repository.mjs";

const manifest = await readManifest();
const sourceRoot = `${moduleId}-v${manifest.version}-src`;
const docRoot = `${moduleId}-v${manifest.version}-doc`;
const installable = path.join(repositoryRoot, "dist", `${moduleId}-v${manifest.version}-mod.zip`);
const source = path.join(repositoryRoot, "dist", `${sourceRoot}.zip`);
const documentation = path.join(repositoryRoot, "dist", `${docRoot}.zip`);

function importsFrom(sourceText) {
  const results = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^"'()]*?\s+from\s*)?["'](\.\.?\/[^"']+)["']/g,
    /import\s*\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) results.add(match[1]);
  }
  return [...results];
}

function readArchiveText(archive, entry) {
  const result = spawnSync("unzip", ["-p", archive, entry], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || `Could not read ${entry} from ${path.basename(archive)}`);
  return result.stdout;
}

function verifyBrowserModuleGraph(archive, manifest, archiveEntries) {
  const available = new Set(archiveEntries);
  const visited = new Set();
  const pending = (manifest.esmodules || []).map((entry) => `${moduleId}/${entry}`);
  while (pending.length) {
    const entry = pending.pop();
    if (visited.has(entry)) continue;
    assert.ok(available.has(entry), `Browser module graph is missing ${entry}`);
    visited.add(entry);
    const sourceText = readArchiveText(archive, entry);
    for (const specifier of importsFrom(sourceText)) {
      const clean = specifier.split(/[?#]/, 1)[0];
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(entry), clean));
      assert.ok(target.startsWith(`${moduleId}/`), `Browser module import escapes the module root: ${specifier}`);
      assert.ok(available.has(target), `Browser module graph is missing ${target} imported by ${entry}`);
      if (target.endsWith(".js")) pending.push(target);
    }
  }
  return visited;
}

for (const [archive, expectedRoot] of [[installable, moduleId], [source, sourceRoot], [documentation, docRoot]]) {
  const result = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const entries = result.stdout.trim().split("\n").filter(Boolean);
  assert.ok(entries.length > 0, `${path.basename(archive)} is empty`);
  assert.ok(entries.every((entry) => entry.startsWith(`${expectedRoot}/`)), `${path.basename(archive)} has an invalid root`);
  if (archive === installable) assert.ok(entries.includes(`${expectedRoot}/module.json`), `${path.basename(archive)} lacks module.json`);
  assert.equal(new Set(entries.map((entry) => entry.split("/")[0])).size, 1, `${path.basename(archive)} has multiple roots`);
}

const installableEntryList = spawnSync("unzip", ["-Z1", installable], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean);
const installableEntries = installableEntryList.join("\n");
for (const forbidden of ["tests/", "tools/", "package.json", "package-lock.json", "docs/", ".gitignore", ".editorconfig"]) {
  assert.ok(!installableEntries.includes(`${moduleId}/${forbidden}`), `Development-only entry leaked: ${forbidden}`);
}

const browserGraph = verifyBrowserModuleGraph(installable, manifest, installableEntryList);
assert.ok(browserGraph.has(`${moduleId}/scripts/extensions/runtime.js`), "Extension runtime is absent from the packaged browser graph");
assert.ok(!browserGraph.has(`${moduleId}/scripts/extensions/registry.js`), "Player startup must not fetch registry.js independently");
assert.ok(!browserGraph.has(`${moduleId}/scripts/extensions/fields.js`), "Player startup must not fetch fields.js independently");

const sourceEntries = spawnSync("unzip", ["-Z1", source], { encoding: "utf8" }).stdout;
for (const required of ["package.json", "package-lock.json", "tools/package.mjs", "tests/layout.test.mjs", "docs/EXTENSION_API.md"]) {
  assert.ok(sourceEntries.includes(`${sourceRoot}/${required}`), `Source archive lacks ${required}`);
}
assert.ok(!sourceEntries.includes(`${sourceRoot}/dist/`), "Source archive must not wrap generated ZIPs");

const installableManifest = JSON.parse(spawnSync("unzip", ["-p", installable, `${moduleId}/module.json`], { encoding: "utf8" }).stdout);
const sourceManifest = JSON.parse(spawnSync("unzip", ["-p", source, `${sourceRoot}/module.json`], { encoding: "utf8" }).stdout);
assert.equal(installableManifest.version, manifest.version);
assert.equal(sourceManifest.version, manifest.version);
console.log(`Verified installable, source, and documentation archives for version ${manifest.version}.`);
