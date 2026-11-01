// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { repositoryRoot, readManifest, runtimeEntries, walkFiles } from "./repository.mjs";

const manifest = await readManifest();
assert.equal(manifest.id, "runyth-illuminated-documents", "Unexpected module id");
assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "Module version must be semantic");
assert.equal(manifest.compatibility?.minimum, "13", "Foundry minimum must remain v13");
assert.equal(manifest.compatibility?.maximum, "13", "Foundry maximum must remain v13");
assert.equal(manifest.socket, true, "Player-to-GM workflows require the module socket channel");

for (const entry of runtimeEntries) await access(path.join(repositoryRoot, entry));
for (const script of manifest.esmodules || []) await access(path.join(repositoryRoot, script));
for (const style of manifest.styles || []) await access(path.join(repositoryRoot, style));
for (const language of manifest.languages || []) await access(path.join(repositoryRoot, language.path));
await access(path.join(repositoryRoot, manifest.license));

const jsonFiles = (await walkFiles(repositoryRoot, { exclude: new Set([".git", "node_modules", "build", "dist"]) }))
  .filter((file) => file.endsWith(".json"));
for (const file of jsonFiles) JSON.parse(await readFile(file, "utf8"));

const scriptFiles = (await walkFiles(path.join(repositoryRoot, "scripts"))).filter((file) => file.endsWith(".js"));
for (const file of scriptFiles) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)) {
    const target = path.resolve(path.dirname(file), match[1]);
    await access(target);
  }
  for (const match of source.matchAll(/import\s*\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g)) {
    const target = path.resolve(path.dirname(file), match[1]);
    await access(target);
  }
}

const localization = new Map();
for (const language of manifest.languages || []) {
  const data = JSON.parse(await readFile(path.join(repositoryRoot, language.path), "utf8"));
  localization.set(language.lang, new Set(Object.keys(data)));
}
const english = localization.get("en") || new Set();
for (const [language, keys] of localization) {
  assert.deepEqual([...keys].sort(), [...english].sort(), `Localization keys differ for ${language}`);
}

console.log(`Validated Illuminated Documents ${manifest.version}: manifest, runtime references, imports, JSON, and localization parity.`);
