// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

const { parseMarkdown, markdownToPlainText } = await import("../scripts/markdown.js");

const parsed = parseMarkdown("# Title\n\nA **bold** and *italic* line.\n\n- First\n> Quote\n---");
assert.equal(parsed[0].kind, "heading");
assert.equal(parsed[0].level, 1);
assert.equal(parsed[1].tokens.some((token) => token.bold && token.text.includes("bold")), true);
assert.equal(parsed[1].tokens.some((token) => token.italic && token.text.includes("italic")), true);
assert.equal(parsed[2].kind, "list");
assert.equal(parsed[3].kind, "quote");
assert.equal(parsed[4].kind, "rule");
assert.match(markdownToPlainText("## Heading\n\n1. Item"), /Heading[\s\S]*1\. Item/);

console.log("markdown tests passed");
