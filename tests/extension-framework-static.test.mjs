// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function filesRecursive(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesRecursive(full));
    else result.push(full);
  }
  return result;
}
const scripts = (await filesRecursive(path.join(root, "scripts"))).filter((file) => file.endsWith(".js"));
const combined = (await Promise.all(scripts.map((file) => readFile(file, "utf8")))).join("\n");
const api = await readFile(path.join(root, "scripts/extensions/api.js"), "utf8");
const constants = await readFile(path.join(root, "scripts/extensions/constants.js"), "utf8");
const main = await readFile(path.join(root, "scripts/main.js"), "utf8");
const metadata = await readFile(path.join(root, "scripts/extensions/metadata.js"), "utf8");
const rendering = await readFile(path.join(root, "scripts/extensions/rendering.js"), "utf8");
const management = await readFile(path.join(root, "templates/document-management.hbs"), "utf8");
const docs = await readFile(path.join(root, "docs/EXTENSION_API.md"), "utf8");
const manifest = JSON.parse(await readFile(path.join(root, "module.json"), "utf8"));

assert.equal(manifest.version, "1.12.5");
assert.match(main, /game\.illuminatedDocuments\s*=\s*publicNamespace/);
assert.match(constants, /EXTENSION_API_VERSION\s*=\s*"1\.0\.0"/);
for (const hook of [
  "illuminatedDocumentsApiInit",
  "illuminatedDocumentsApiReady",
  "illuminatedDocumentsExtensionRegistered",
  "illuminatedDocumentsExtensionUnregistered",
  "illuminatedDocumentsBeforeExtensionTransform",
  "illuminatedDocumentsAfterExtensionTransform",
  "illuminatedDocumentsExtensionValidation",
  "illuminatedDocumentsExtensionDataChanged"
]) assert.match(constants, new RegExp(hook));

for (const method of [
  "registerExtension", "unregisterExtension", "getExtension", "getExtensions", "hasExtension",
  "getDocumentExtensionData", "setDocumentExtensionData", "getBlockExtensionData", "setBlockExtensionData",
  "validateExtensionData", "migrateExtensionData", "invalidateDocumentRender", "rerenderOpenDocumentViews",
  "exportDocument", "importDocument", "duplicateDocument", "exportPreset", "importPreset",
  "isApiVersionSupported", "assertApiVersion", "getExtensionDiagnostics"
]) assert.match(api, new RegExp(`\\b${method}\\b`), `Missing public API method ${method}`);

assert.match(metadata, /orphanedBlocks/);
assert.match(metadata, /repairBlockIdentities/);
assert.match(rendering, /data-illuminated-block-id/);
assert.match(rendering, /AbortController/);
assert.match(rendering, /activeInvalidationCallbacks/);
assert.match(api, /notifyExtensions:\s*false/);
assert.match(management, /copy-extension-diagnostics/);
assert.match(management, /validate-extensions/);
assert.match(management, /clear-extension-caches/);

for (const forbidden of [
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /document\.createElement\s*\(\s*["']script["']/,
  /extends\s+FormApplication\b/,
  /extends\s+Application\b/,
  /\bJournalTextPageSheet\b/,
  /globalThis\.FilePicker/,
  /globalThis\.FormDataExtended/,
  /foundry\.appv1/
]) assert.doesNotMatch(combined, forbidden, `Forbidden implementation remained: ${forbidden}`);

for (const heading of [
  "Stable entry point", "Lifecycle", "Registration", "Metadata storage", "Stable content-block identities",
  "Document fields", "Per-block fields", "Rendering transformation pipeline", "Validation", "Migrations",
  "Import, export, and duplication", "Permissions and sockets", "Diagnostics", "Minimal companion example"
]) assert.match(docs, new RegExp(`## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

for (const language of ["en", "de"]) {
  const values = JSON.parse(await readFile(path.join(root, `lang/${language}.json`), "utf8"));
  for (const key of [
    "ILLUMINATED.Extensions.DiagnosticsTitle",
    "ILLUMINATED.Extensions.UnsupportedApi",
    "ILLUMINATED.Extensions.PreservedUnknown",
    "ILLUMINATED.Extensions.MigrationError"
  ]) assert.ok(values[key], `${language} is missing ${key}`);
}

console.log("extension framework static tests passed");
