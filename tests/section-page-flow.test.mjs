// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

globalThis.foundry = undefined;
globalThis.crypto ??= { randomUUID: () => "page-flow-id" };

const { createContentEntry, getContentEntries, prepareEditedEntries } = await import("../scripts/content-entries.js");
const { buildEditedMetadata, createLiveMetadata } = await import("../scripts/documents.js");
const { duplicateMetadata } = await import("../scripts/extensions/transfer.js");

const entry = createContentEntry("Chapter two", { startOnNewPage: true });
assert.equal(entry.startOnNewPage, true);

const legacy = getContentEntries({ sourceText: "Legacy text" });
assert.equal(legacy.entries[0].startOnNewPage, false, "older documents must preserve continuous flow by default");

const prepared = prepareEditedEntries(
  [{ ...entry, startOnNewPage: false }],
  [entry],
  { userId: "user-1", userName: "Akito", now: 2000 }
);
assert.equal(prepared[0].startOnNewPage, false);
assert.equal(prepared[0].updatedAt, 2000, "changing page flow must count as an edit");

const live = createLiveMetadata({
  title: "Page-flow book",
  text: "First",
  presetId: "book",
  ownerId: "user-1",
  now: 1000
});
const onlyPageFlowChanged = buildEditedMetadata(live, {
  entries: [{ ...live.contentEntries[0], startOnNewPage: true }],
  presetId: live.presetId,
  includeFrontCover: false,
  includeBackCover: false
}, { userId: "user-1", userName: "Akito", now: 3000 });
assert.equal(onlyPageFlowChanged.contentEntries[0].startOnNewPage, true);
assert.equal(onlyPageFlowChanged.editHistory.at(-1).pageFlowChanged, true);

const duplicated = duplicateMetadata({
  ...onlyPageFlowChanged,
  contentEntries: [
    { ...onlyPageFlowChanged.contentEntries[0], startOnNewPage: false },
    createContentEntry("Second", { id: "second", startOnNewPage: true })
  ]
});
assert.deepEqual(duplicated.metadata.contentEntries.map((item) => item.startOnNewPage), [false, true]);

const studio = await readFile(new URL("../templates/studio.hbs", import.meta.url), "utf8");
assert.match(studio, /name="startOnNewPage"/);
assert.match(studio, /ILLUMINATED\.Studio\.StartAppendedSectionNewPage/);

const editor = await readFile(new URL("../templates/document-editor.hbs", import.meta.url), "utf8");
assert.match(editor, /data-action="start-all-new-pages"/);
assert.match(editor, /data-entry-page-break/);
assert.match(editor, /ILLUMINATED\.Editor\.StartAllSectionsNewPage/);

console.log("section page-flow tests passed");
