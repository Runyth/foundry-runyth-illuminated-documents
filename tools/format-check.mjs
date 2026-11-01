// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { repositoryRoot, relativePosix, walkFiles } from "./repository.mjs";

const checkedExtensions = new Set([".js", ".mjs", ".json", ".hbs", ".css", ".md", ".svg", ".gitignore", ".editorconfig"]);
const files = (await walkFiles(repositoryRoot, { exclude: new Set([".git", "node_modules", "build", "dist"]) }))
  .filter((file) => checkedExtensions.has(path.extname(file)) || [".gitignore", ".editorconfig"].includes(path.basename(file)));
const problems = [];
for (const file of files) {
  const bytes = await readFile(file);
  const name = relativePosix(repositoryRoot, file);
  if (bytes.includes(Buffer.from("\r\n"))) problems.push(`${name}: CRLF line endings`);
  if (bytes.length && bytes.at(-1) !== 0x0a) problems.push(`${name}: missing final newline`);
  const lines = bytes.toString("utf8").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (/[\t ]+$/.test(lines[index])) problems.push(`${name}:${index + 1}: trailing whitespace`);
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Formatting checks passed for ${files.length} text files.`);
