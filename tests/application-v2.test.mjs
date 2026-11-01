// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptDir = path.join(root, "scripts");
const templateDir = path.join(root, "templates");
const scriptNames = (await readdir(scriptDir)).filter((name) => name.endsWith(".js"));
const sources = Object.fromEntries(await Promise.all(scriptNames.map(async (name) => [
  name,
  await readFile(path.join(scriptDir, name), "utf8")
])));
const combined = Object.values(sources).join("\n");

for (const forbidden of [
  /extends\s+FormApplication\b/,
  /extends\s+Application\b/,
  /static\s+get\s+defaultOptions\s*\(/,
  /\bactivateListeners\s*\(/,
  /\b_updateObject\s*\(/,
  /^\s*(?:async\s+)?getData\s*\(/m,
  /\bJournalTextPageSheet\b/,
  /\brenderTemplate\b/,
  /(?<![\w.])loadTemplates\s*\(/,
  /globalThis\.Dialog/,
  /\bDialog\.confirm\b/,
  /\bDialog\.prompt\b/,
  /foundry\.appv1/,
  /renderApplicationV1/,
  /getApplicationV1HeaderButtons/
]) {
  assert.doesNotMatch(combined, forbidden, `Deprecated pattern remained: ${forbidden}`);
}

for (const file of [
  "studio.js",
  "document-management.js",
  "permission-manager.js",
  "preset-manager.js",
  "template-manager.js",
  "document-editor.js",
  "viewer.js"
]) {
  assert.match(sources[file], /extends\s+IlluminatedApplicationV2\b/, `${file} must use the shared V2 base`);
  assert.match(sources[file], /static\s+DEFAULT_OPTIONS\s*=\s*\{/);
  assert.match(sources[file], /static\s+PARTS\s*=\s*\{/);
}

assert.match(sources["application-v2.js"], /foundry\.applications\.api/);
assert.match(sources["application-v2.js"], /foundry\.applications\.apps/);
assert.match(sources["application-v2.js"], /foundry\.applications\.ux/);
assert.match(sources["application-v2.js"], /HandlebarsApplicationMixin\(ApplicationV2\)/);
assert.match(sources["application-v2.js"], /tag:\s*"form"/);
assert.match(sources["template-manager.js"], /new\s+FilePicker\s*\(/);
assert.match(sources["main.js"], /Hooks\.on\("renderApplicationV2"/);
assert.doesNotMatch(sources["main.js"], /getApplicationV1HeaderButtons/);
assert.doesNotMatch(sources["main.js"], /renderJournalTextPageSheet/);
assert.doesNotMatch(sources["main.js"], /journal\.sheet|page\.sheet/);
assert.doesNotMatch(sources["viewer.js"], /journal\.sheet|page\.sheet/);
assert.match(sources["viewer.js"], /journal-integration\.js/);
assert.match(sources["journal-integration.js"], /foundry\.applications\?\.sheets\?\.journal/);
assert.match(sources["journal-integration.js"], /JournalEntrySheet/);
assert.match(sources["journal-integration.js"], /JournalEntryPageProseMirrorSheet/);
assert.match(sources["journal-integration.js"], /JournalEntryPageMarkdownSheet/);
assert.match(sources["journal-integration.js"], /SheetClass\.isV2 !== true/);
assert.match(sources["main.js"], /getJournalLiveMetadata/);
assert.match(sources["main.js"], /getLiveMetadata/);

for (const templateName of (await readdir(templateDir)).filter((name) => name.endsWith(".hbs"))) {
  const template = await readFile(path.join(templateDir, templateName), "utf8");
  assert.doesNotMatch(template, /<form\b/i, `${templateName} must rely on the ApplicationV2 top-level form`);
  for (const button of template.matchAll(/<button\b([^>]*)>/gi)) {
    assert.match(button[1], /\btype\s*=\s*["']button["']/i, `${templateName} has an implicit submit button`);
  }
}

assert.match(sources["studio.js"], /_operationPending/);
assert.match(sources["document-editor.js"], /_savePending/);
assert.match(sources["template-manager.js"], /_savePending/);
assert.match(sources["preset-manager.js"], /_savePending/);

console.log("ApplicationV2 migration tests passed");
