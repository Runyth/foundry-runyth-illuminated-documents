// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import {
  DEFAULT_DOCUMENT_FOLDER_NAME,
  DOCUMENT_FOLDER_MODES,
  MODULE_ID,
  SETTINGS
} from "./settings.js";

function allJournalFolders() {
  return Array.from(game.folders || []).filter((folder) => folder.type === "JournalEntry");
}

export function journalFolderById(folderId) {
  const id = String(folderId || "");
  if (!id) return null;
  const folder = game.folders?.get?.(id)
    || allJournalFolders().find((candidate) => candidate.id === id);
  return folder?.type === "JournalEntry" ? folder : null;
}

function isTopLevel(folder) {
  return !folder?.folder;
}

function isManagedDefaultFolder(folder) {
  return Boolean(folder?.flags?.[MODULE_ID]?.defaultDocumentFolder);
}

export function findDefaultDocumentFolder() {
  const folders = allJournalFolders();
  return folders.find(isManagedDefaultFolder)
    || folders.find((folder) => isTopLevel(folder) && folder.name === DEFAULT_DOCUMENT_FOLDER_NAME)
    || null;
}

export async function ensureDefaultDocumentFolder() {
  const existing = findDefaultDocumentFolder();
  if (existing) return existing;
  if (!game.user?.isGM) return null;

  return Folder.create({
    name: DEFAULT_DOCUMENT_FOLDER_NAME,
    type: "JournalEntry",
    folder: null,
    flags: {
      [MODULE_ID]: {
        defaultDocumentFolder: true
      }
    }
  });
}

export function getDocumentFolderConfiguration() {
  const configuredFolderId = String(game.settings.get(MODULE_ID, SETTINGS.documentFolderId) || "");
  const configuredFolder = journalFolderById(configuredFolderId);
  const storedMode = String(game.settings.get(MODULE_ID, SETTINGS.documentFolderMode) || "");
  const knownModes = Object.values(DOCUMENT_FOLDER_MODES);

  // v1.5-v1.6 stored only a folder ID. Preserve that configuration as a
  // custom destination when upgrading; otherwise use the safer module folder.
  const mode = knownModes.includes(storedMode)
    ? storedMode
    : configuredFolder
      ? DOCUMENT_FOLDER_MODES.CUSTOM
      : DOCUMENT_FOLDER_MODES.DEFAULT;

  return {
    mode,
    folderId: configuredFolderId,
    folder: configuredFolder
  };
}

export async function resolveDocumentFolderDestination() {
  const configuration = getDocumentFolderConfiguration();

  if (configuration.mode === DOCUMENT_FOLDER_MODES.ROOT) {
    return {
      folderId: null,
      mode: DOCUMENT_FOLDER_MODES.ROOT,
      fallbackUsed: false,
      folder: null
    };
  }

  if (configuration.mode === DOCUMENT_FOLDER_MODES.CUSTOM && configuration.folder) {
    return {
      folderId: configuration.folder.id,
      mode: DOCUMENT_FOLDER_MODES.CUSTOM,
      fallbackUsed: false,
      folder: configuration.folder
    };
  }

  const defaultFolder = await ensureDefaultDocumentFolder();
  return {
    folderId: defaultFolder?.id || null,
    mode: DOCUMENT_FOLDER_MODES.DEFAULT,
    fallbackUsed: configuration.mode === DOCUMENT_FOLDER_MODES.CUSTOM,
    folder: defaultFolder
  };
}

export function describeDocumentFolderDestination({ mode, folderId } = {}) {
  const selectedMode = mode || getDocumentFolderConfiguration().mode;
  const selectedFolderId = folderId ?? getDocumentFolderConfiguration().folderId;

  if (selectedMode === DOCUMENT_FOLDER_MODES.ROOT) {
    return "Journal root";
  }

  if (selectedMode === DOCUMENT_FOLDER_MODES.CUSTOM) {
    const folder = journalFolderById(selectedFolderId);
    if (folder) return folder.name;
    return `${DEFAULT_DOCUMENT_FOLDER_NAME} (fallback because the custom folder is unavailable)`;
  }

  const folder = findDefaultDocumentFolder();
  return folder?.name || `${DEFAULT_DOCUMENT_FOLDER_NAME} (created automatically)`;
}
