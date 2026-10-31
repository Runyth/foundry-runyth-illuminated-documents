// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const applicationBase = await read("scripts/application-v2.js");
const studio = await read("scripts/studio.js");
const documentOperations = await read("scripts/document-operations.js");
const templateManager = await read("scripts/template-manager.js");
const presetManager = await read("scripts/preset-manager.js");
const permissionManager = await read("scripts/permission-manager.js");
const documentManagement = await read("scripts/document-management.js");
const documentEditor = await read("scripts/document-editor.js");
const main = await read("scripts/main.js");
const viewer = await read("scripts/viewer.js");
const css = await read("styles/runyth-illuminated-documents.css");

// Use Foundry's concrete V13 file-picker implementation where the namespace
// exposes one, while retaining compatibility with runtimes that export the
// class directly.
assert.match(applicationBase, /FilePickerNamespace\?\.implementation \|\| FilePickerNamespace/);
assert.match(templateManager, /typeof FilePicker !== "function"/);
assert.match(templateManager, /typeof path !== "string" \|\| !path\.trim\(\)/);

// A failed client-setting write cannot trap an ApplicationV2 window open.
assert.match(applicationBase, /try \{[\s\S]*?saveWindowGeometry[\s\S]*?catch \(error\)[\s\S]*?Unable to save window geometry/);

// Long-running writes disable the complete module-owned action surface and
// restore pre-existing disabled states afterwards.
assert.match(applicationBase, /export function setApplicationBusy/);
for (const [name, source] of Object.entries({
  templateManager,
  presetManager,
  permissionManager,
  documentManagement,
  documentEditor,
  studio
})) {
  assert.match(source, /setApplicationBusy\(this, true\)/, `${name} must enter a complete busy state`);
  assert.match(source, /setApplicationBusy\(this, false\)/, `${name} must leave the busy state`);
}

// Successful create and extend operations close Document Studio only after the
// authoritative operation and preferred viewer attempt complete. Failures are
// still handled by the surrounding submit catch and leave the form open.
assert.match(documentOperations, /export async function waitForJournal/);
assert.equal((studio.match(/await this\.close\(\);/g) || []).length, 2);
assert.match(studio, /has not synchronized to this client yet/);
assert.match(studio, /could not be opened automatically/);

// DOM callbacks and background rerenders use rejection-safe rendering.
assert.match(main, /safeRenderV2\(new DocumentStudio\(\), \{ force: true \}\)/);
assert.match(main, /safeRenderV2\(application, \{ force: true \}\)/);
assert.match(viewer, /safeRenderV2\(viewer, \{ force: true \}\)/);
assert.match(documentEditor, /safeRenderV2\(this, \{ force: true \}\)/);

// Shared UI hardening remains scoped beneath module-owned roots.
assert.match(css, /\.illuminated-documents-window \.window-content\s*\{[\s\S]*?padding:\s*0;[\s\S]*?overflow:\s*hidden;/);
assert.match(css, /\.idoc-shell input:not\(\[type="checkbox"\]\)[\s\S]*?padding:\s*0\.45rem 0\.55rem;/);
assert.match(css, /\.idoc-shell button\s*\{[\s\S]*?word-break:\s*break-word;[\s\S]*?white-space:\s*normal;/);
assert.match(css, /\.idoc-shell\[aria-busy="true"\]/);
assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.idoc-template-manager/);

// Every icon-only template button has an accessible name.
const templates = await readdir(new URL("../templates/", import.meta.url));
for (const filename of templates.filter((name) => name.endsWith(".hbs"))) {
  const source = await read(`templates/${filename}`);
  for (const match of source.matchAll(/<button\b([^>]*)>\s*<i\b[^>]*><\/i>\s*<\/button>/gis)) {
    assert.match(match[1], /\baria-label=/i, `${filename} contains an unnamed icon-only button`);
  }
}

console.log("Quality and UI resilience tests passed");
