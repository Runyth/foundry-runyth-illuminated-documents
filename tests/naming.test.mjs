// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

const {
  DEFAULT_NAME_FORMAT,
  buildDocumentName,
  renderNameFormat
} = await import("../scripts/naming.js");

const now = new Date(2026, 6, 24, 19, 5);
const preset = {
  name: "Open Chronicle",
  namePrefix: "Book — ",
  nameSuffix: " — Vol. I",
  nameFormat: ""
};

assert.equal(
  buildDocumentName({
    title: "The Road North",
    preset,
    globalPrefix: "Archive / ",
    globalSuffix: " [GM]",
    globalFormat: DEFAULT_NAME_FORMAT,
    userName: "Akito",
    now
  }),
  "Archive / Book — The Road North — Vol. I [GM]"
);

assert.equal(
  buildDocumentName({
    title: "Session 12",
    preset: { ...preset, nameFormat: "{date} · {preset} · {title} · {user}" },
    globalPrefix: "Ignored",
    globalSuffix: "Ignored",
    userName: "Akito",
    now
  }),
  "2026-07-24 · Open Chronicle · Session 12 · Akito"
);

assert.equal(renderNameFormat("{title}   {date}", { title: "Log", date: "2026-07-24" }), "Log 2026-07-24");
assert.throws(() => renderNameFormat("{title}-{unknown}", { title: "Log" }), /Unknown document-name token/);
assert.throws(() => renderNameFormat("{globalPrefix}", { globalPrefix: "" }), /empty name/);
assert.throws(() => renderNameFormat("{title", { title: "Log" }), /invalid or incomplete token/);

console.log("document naming tests passed");
