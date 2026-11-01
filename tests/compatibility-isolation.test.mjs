// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkFiles } from "../tools/repository.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptRoot = path.join(root, "scripts");
const templateRoot = path.join(root, "templates");
const styleRoot = path.join(root, "styles");

async function combinedFiles(directory, extension) {
  const files = (await walkFiles(directory)).filter((file) => file.endsWith(extension));
  const entries = await Promise.all(files.map(async (file) => [
    path.relative(root, file).split(path.sep).join("/"),
    await readFile(file, "utf8")
  ]));
  return Object.fromEntries(entries);
}

const scripts = await combinedFiles(scriptRoot, ".js");
const templates = await combinedFiles(templateRoot, ".hbs");
const styles = await combinedFiles(styleRoot, ".css");
const allScripts = Object.values(scripts).join("\n");
const main = scripts["scripts/main.js"];
const applicationBase = scripts["scripts/application-v2.js"];
const templateManager = scripts["scripts/template-manager.js"];
const documentEditor = scripts["scripts/document-editor.js"];
const journalIntegration = scripts["scripts/journal-integration.js"];

// ApplicationV2 and supported V13 hooks pass native HTMLElements. The module
// must not retain jQuery facades or deprecated jQuery-oriented render hooks.
for (const forbidden of [
  /(?:^|[^\w$])\$\s*\(/m,
  /\bjQuery\s*\(/,
  /\.jquery\b/,
  /\bhtml\.(?:find|on|closest|data|attr)\s*\(/,
  /\.originalEvent\b/,
  /Hooks\.(?:on|once)\(["']renderChatMessage["']/,
  /Hooks\.(?:on|once)\(["']renderApplication["']/,
  /Hooks\.(?:on|once)\(["']renderDocumentSheet["']/,
  /\bFormApplication\b/,
  /\bJournalTextPageSheet\b/,
  /foundry\.appv1/,
  /globalThis\.(?:Dialog|FilePicker|FormDataExtended)/
]) {
  assert.doesNotMatch(allScripts, forbidden, `Forbidden compatibility pattern remained: ${forbidden}`);
}

// No Actor, Item, Token HUD, Chat, canvas-display, or keyboard integration is
// owned by this document module. Therefore it cannot inject controls into
// advancement/level-up/rest/roll child applications or duplicate HUD objects.
for (const forbidden of [
  /Hooks\.(?:on|once)\(["'][^"']*ActorSheet/i,
  /Hooks\.(?:on|once)\(["'][^"']*ItemSheet/i,
  /Hooks\.(?:on|once)\(["']renderTokenHUD["']/,
  /Hooks\.(?:on|once)\(["']renderChatMessageHTML["']/,
  /\bChatMessage\.create\s*\(/,
  /\bPIXI\./,
  /Hooks\.(?:on|once)\(["']canvas(?:Ready|Init|TearDown)["']/,
  /game\.keybindings\.register\s*\(/,
  /window\.addEventListener\(["'](?:keydown|keyup)["']/
]) {
  assert.doesNotMatch(allScripts, forbidden, `Unexpected unrelated integration remained: ${forbidden}`);
}

// The generic V2 render/header hooks are retained only for positively identified
// primary Journal sheets carrying Illuminated Documents metadata.
assert.equal((main.match(/Hooks\.on\("renderApplicationV2"/g) || []).length, 1);
assert.equal((main.match(/Hooks\.on\("getHeaderControlsApplicationV2"/g) || []).length, 1);
assert.equal((main.match(/Hooks\.on\("closeApplicationV2"/g) || []).length, 1);
assert.match(main, /function isPrimaryJournalSheetApplication/);
assert.match(main, /isPrimaryJournalV2Application/);
assert.match(journalIntegration, /app\.document !== document/);
assert.match(journalIntegration, /DocumentSheetV2/);
assert.match(journalIntegration, /foundry\.applications\?\.sheets\?\.journal/);
assert.match(main, /illuminatedJournalFromDocument/);
assert.match(main, /app instanceof IlluminatedApplicationV2/);

// Header controls are prepended and deduplicated, preserving Foundry's native
// ellipsis/close cluster as the farthest-right controls.
assert.match(main, /controls\.some\(\(control\) => control\.action === "idocEditBook"\)/);
assert.match(main, /controls\.some\(\(control\) => control\.action === "idocShowPlayers"\)/);
assert.equal((main.match(/controls\.unshift\s*\(/g) || []).length, 2);

// Foundry V13 Scene Controls use a record of tools. Do not push into an assumed
// array, and use one stable key so rerenders replace rather than duplicate it.
assert.match(main, /const notes = controls\?\.notes/);
assert.match(main, /notes\.tools\.illuminatedDocuments\s*=\s*\{/);
assert.match(main, /order:\s*existing\?\.order/);
assert.doesNotMatch(main, /controls\.push\s*\(/);
assert.doesNotMatch(main, /notes\.tools\.push\s*\(/);

// Render-bound listeners are replaced with AbortController cleanup. Template
// drag listeners have their own close-safe pointer session.
assert.match(applicationBase, /new AbortController\(\)/);
assert.match(applicationBase, /signal:\s*this\._renderAbortController\.signal/);
assert.match(applicationBase, /this\._renderAbortController\?\.abort\(\)/);
assert.match(templateManager, /_pointerAbortController/);
assert.match(templateManager, /window\.addEventListener\("mousemove"[\s\S]*signal:\s*controller\.signal/);
assert.match(templateManager, /async _preClose\(options\)[\s\S]*_pointerAbortController\?\.abort\(\)/);
assert.match(documentEditor, /this\._listen\(handle, "dragstart"/);

// Directory launchers and preferred-view listeners are idempotent.
assert.match(main, /!query\(root, "\.illuminated-open-studio"\)/);
assert.match(main, /!query\(root, "\.illuminated-document-settings"\)/);
assert.match(main, /element\.dataset\.idocPreferredViewHandler === "true"/);
assert.match(scripts["scripts/viewer.js"], /sourceGmId:\s*game\.user\.id/);
assert.match(main, /sourceGm\?\.isGM/);
assert.match(main, /sourceGm\.active/);

// Every explicit application action must be non-submitting and module-specific.
for (const [name, template] of Object.entries(templates)) {
  assert.doesNotMatch(template, /data-action=["']tab["']/, `${name} uses Foundry's reserved generic tab action`);
  for (const button of template.matchAll(/<button\b([^>]*)>/gi)) {
    assert.match(button[1], /\btype\s*=\s*["']button["']/i, `${name} contains an implicit submit button`);
  }
}

// CSS must be rooted in a module-owned application ID or idoc/illuminated class.
const forbiddenGlobalRoots = /^(?:\.window-header\b|\.window-content\b|\.header-control\b|\.window-title\b|\.application\b|\.form-group\b|\.tabs\b|\.tab\b|\.sr-only\b|button\b|input\b|select\b|textarea\b|label\b|body\b|html\b|\*)/;
for (const [name, rawCss] of Object.entries(styles)) {
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const header = match[1].trim();
    if (!header || header.startsWith("@")) continue;
    for (const selector of header.split(",").map((value) => value.trim())) {
      assert.doesNotMatch(selector, forbiddenGlobalRoots, `${name} contains a global selector: ${selector}`);
      assert.match(
        selector,
        /^(?:#runyth-illuminated-[\w-]+|#illuminated-[\w-]+|\.idoc-[\w-]+|\.illuminated-[\w-]+)/,
        `${name} selector is not rooted in module ownership: ${selector}`
      );
    }
  }
}

console.log("Compatibility and interference isolation tests passed");
