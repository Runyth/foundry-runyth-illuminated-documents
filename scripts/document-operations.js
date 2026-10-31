// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { canCreateDocuments } from "./permissions.js";
import {
  canEditJournal,
  canExtendJournal,
  createLiveJournal,
  editLiveJournal,
  extendLiveJournal,
  getJournalLiveMetadata
} from "./documents.js";
import { requestFromActiveGm } from "./socket.js";

function journalEntryClass() {
  return globalThis.CONFIG?.JournalEntry?.documentClass
    || globalThis.foundry?.documents?.JournalEntry
    || globalThis.JournalEntry
    || null;
}

export function canCreateJournalDirectly(user = globalThis.game?.user) {
  if (!user) return false;
  if (user.isGM) return true;
  const JournalClass = journalEntryClass();
  return Boolean(JournalClass?.canUserCreate?.(user));
}

export function canUpdateJournalDirectly(journal, user = globalThis.game?.user) {
  if (!journal || !user) return false;
  if (user.isGM) return true;
  if (typeof journal.canUserModify === "function") return Boolean(journal.canUserModify(user, "update"));
  const owner = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  return Boolean(journal.testUserPermission?.(user, owner));
}

export async function waitForJournal(journalId, { timeout = 2500, interval = 50, revision = null } = {}) {
  const started = Date.now();
  let journal = globalThis.game?.journal?.get?.(journalId) || null;
  while (Date.now() - started < timeout) {
    if (journal) {
      if (revision === null || revision === undefined) return journal;
      const metadata = getJournalLiveMetadata(journal);
      if (Number(metadata?.revision ?? -1) >= Number(revision)) return journal;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
    journal = globalThis.game?.journal?.get?.(journalId) || null;
  }
  return journal || null;
}

function activeGmAvailable() {
  return Boolean(globalThis.game?.users?.activeGM);
}

function noCreatePathError() {
  return new Error(
    "Your Foundry role cannot create Journal Entries directly and no active Game Master is connected to delegate this operation. "
    + "Ask a Game Master to grant your role permission to create Journal Entries or connect a Game Master."
  );
}

function noUpdatePathError() {
  return new Error(
    "Foundry does not allow this client to update the selected Journal directly and no active Game Master is connected to delegate this operation."
  );
}

export async function createDocumentForCurrentUser(payload) {
  const user = globalThis.game?.user;
  if (!user || !canCreateDocuments(user)) throw new Error("You do not have permission to create illuminated documents.");
  const normalized = { ...payload, ownerId: user.id };

  if (canCreateJournalDirectly(user)) {
    const journal = await createLiveJournal(normalized);
    return { journal, metadata: getJournalLiveMetadata(journal), delegated: false };
  }

  if (!activeGmAvailable()) throw noCreatePathError();
  const result = await requestFromActiveGm("createLiveJournal", normalized);
  const journal = await waitForJournal(result.journalId);
  return { journal, metadata: getJournalLiveMetadata(journal), delegated: true, result };
}

export async function extendDocumentForCurrentUser(payload) {
  const user = globalThis.game?.user;
  const journal = globalThis.game?.journal?.get?.(payload?.journalId);
  if (!user || !journal || !canExtendJournal(journal, user)) {
    throw new Error("You do not have permission to extend this illuminated document.");
  }
  const normalized = { ...payload, requesterId: user.id };

  if (canUpdateJournalDirectly(journal, user)) {
    const result = await extendLiveJournal(normalized);
    return { ...result, delegated: false };
  }

  if (!activeGmAvailable()) throw noUpdatePathError();
  const result = await requestFromActiveGm("extendLiveJournal", normalized);
  const synchronized = await waitForJournal(result.journalId, { revision: result.revision });
  return {
    journal: synchronized || journal,
    metadata: getJournalLiveMetadata(synchronized || journal),
    delegated: true,
    result
  };
}

export async function editDocumentForCurrentUser(payload) {
  const user = globalThis.game?.user;
  const journal = globalThis.game?.journal?.get?.(payload?.journalId);
  if (!user || !journal || !canEditJournal(journal, user)) {
    throw new Error("You do not have permission to edit this illuminated document.");
  }
  const normalized = { ...payload, requesterId: user.id };

  if (canUpdateJournalDirectly(journal, user)) {
    const result = await editLiveJournal(normalized);
    return { ...result, delegated: false };
  }

  if (!activeGmAvailable()) throw noUpdatePathError();
  const result = await requestFromActiveGm("editLiveJournal", normalized);
  const synchronized = await waitForJournal(result.journalId, { revision: result.revision });
  return {
    journal: synchronized || journal,
    metadata: getJournalLiveMetadata(synchronized || journal),
    delegated: true,
    result
  };
}
