// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeDeterministicZip } from "./archive.mjs";
import { moduleId, readManifest, relativePosix, repositoryRoot, sourceExclusions, walkFiles } from "./repository.mjs";

const manifest = await readManifest();
const dist = path.join(repositoryRoot, "dist");
const buildModule = path.join(repositoryRoot, "build", moduleId);
await access(path.join(buildModule, "module.json"));
await mkdir(dist, { recursive: true });

const runtimeFiles = await walkFiles(buildModule);
const installablePath = path.join(dist, `${moduleId}-v${manifest.version}-mod.zip`);
const sourceRoot = `${moduleId}-v${manifest.version}-src`;
const docRoot = `${moduleId}-v${manifest.version}-doc`;
await writeDeterministicZip(installablePath, runtimeFiles.map((file) => ({
  name: `${moduleId}/${relativePosix(buildModule, file)}`,
  path: file
})));

const sourceFiles = (await walkFiles(repositoryRoot, { exclude: sourceExclusions }))
  .filter((file) => path.basename(file) !== ".gitkeep");
const sourcePath = path.join(dist, `${sourceRoot}.zip`);
await writeDeterministicZip(sourcePath, sourceFiles.map((file) => ({
  name: `${sourceRoot}/${relativePosix(repositoryRoot, file)}`,
  path: file
})));

const docFiles = sourceFiles.filter((file) => {
  const relative = relativePosix(repositoryRoot, file);
  return ["README.md", "CHANGELOG.md", "LICENSE", "SECURITY.md", "CONTRIBUTING.md"].includes(relative)
    || relative.startsWith("docs/");
});
const docPath = path.join(dist, `${docRoot}.zip`);
await writeDeterministicZip(docPath, docFiles.map((file) => ({
  name: `${docRoot}/${relativePosix(repositoryRoot, file)}`,
  path: file
})));

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}
const checksums = [
  `${await sha256(installablePath)}  ${path.basename(installablePath)}`,
  `${await sha256(sourcePath)}  ${path.basename(sourcePath)}`,
  `${await sha256(docPath)}  ${path.basename(docPath)}`
];
await writeFile(path.join(dist, `${moduleId}-v${manifest.version}-SHA256SUMS.txt`), `${checksums.join("\n")}\n`);
console.log(`Created ${path.relative(repositoryRoot, installablePath)}`);
console.log(`Created ${path.relative(repositoryRoot, sourcePath)}`);
console.log(`Created ${path.relative(repositoryRoot, docPath)}`);
