// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const moduleId = "runyth-illuminated-documents";

export const runtimeEntries = Object.freeze([
  "module.json",
  "LICENSE",
  "scripts",
  "styles",
  "templates",
  "lang",
  "assets"
]);

export const sourceExclusions = Object.freeze(new Set([
  ".git",
  "node_modules",
  "build",
  "dist"
]));

export async function readManifest() {
  return JSON.parse(await readFile(path.join(repositoryRoot, "module.json"), "utf8"));
}

export async function walkFiles(root, { exclude = new Set() } = {}) {
  const result = [];

  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (exclude.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) result.push(absolute);
    }
  }

  if ((await stat(root)).isDirectory()) await visit(root);
  else result.push(root);
  return result;
}

export function relativePosix(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join("/");
}
