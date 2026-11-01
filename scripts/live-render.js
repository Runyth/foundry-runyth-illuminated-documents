// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { resolveBookDefinition } from "./book-definition.js";
import { combineContentEntries, getContentEntries } from "./content-entries.js";
import { saveLiveMetadataToJournal } from "./documents.js";
import { planBookPageEntries } from "./renderer.js";
import { VirtualBookView } from "./virtual-book.js";
import { extensionRuntime } from "./extensions/runtime.js";
import { ensureDocumentExtensionEnvelope } from "./extensions/metadata.js";

const PENDING_MIGRATION_WRITES = new Set();
const ACTIVE_VIRTUAL_BOOKS = new WeakMap();

function mayUpdate(journal) {
  if (!journal) return false;
  if (game.user?.isGM) return true;
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  return Boolean(journal.testUserPermission?.(game.user, owner));
}

async function prepareMetadata(journal, metadata) {
  const uuid = journal?.uuid || "";
  const envelope = ensureDocumentExtensionEnvelope(metadata);
  const content = getContentEntries(envelope, { documentUuid: uuid });
  let prepared = { ...envelope, contentEntries: content.entries, sourceText: combineContentEntries(content.entries) };
  const migration = await extensionRuntime.migrations.migrateMetadata(prepared, {
    document: journal,
    documentUuid: uuid,
    dryRun: false
  });
  prepared = migration.metadata;
  const changed = JSON.stringify(prepared) !== JSON.stringify(metadata);
  if (changed && mayUpdate(journal) && !PENDING_MIGRATION_WRITES.has(uuid)) {
    PENDING_MIGRATION_WRITES.add(uuid);
    queueMicrotask(async () => {
      try {
        await saveLiveMetadataToJournal(journal, prepared, { reason: "lazy-extension-migration", previousMetadata: metadata });
      } catch (error) {
        console.error(`runyth-illuminated-documents | Lazy metadata migration failed for ${uuid}`, error);
      } finally {
        PENDING_MIGRATION_WRITES.delete(uuid);
      }
    });
  }
  return prepared;
}


/**
 * Run the viewer transformation pipeline against a detached, scoped root.
 * This is used by previews so extensions see the same per-client block model
 * without mutating editor source or persisting transformed text.
 */
export async function transformIlluminatedContentBlocks({
  journal = null,
  metadata,
  contentBlocks = [],
  application = null,
  renderMode = "preview",
  editable = false
} = {}) {
  const preparedMetadata = await prepareMetadata(journal, metadata || {});
  const rootElement = document.createElement("div");
  const controller = new AbortController();
  const transformed = await extensionRuntime.rendering.transform({
    rootElement,
    document: journal,
    journal,
    journalPage: null,
    documentUuid: journal?.uuid || "",
    viewer: game.user,
    currentUser: game.user,
    isGM: Boolean(game.user?.isGM),
    application,
    renderMode,
    editable,
    contentBlocks,
    extensionData: preparedMetadata.extensions || {},
    metadata: preparedMetadata,
    abortSignal: controller.signal
  });
  controller.abort();
  return transformed.contentBlocks;
}

export async function renderIlluminatedDocumentInto(rootElement, {
  journal,
  metadata,
  application = null,
  renderMode = "viewer",
  editable = false,
  beforeTransform = null,
  journalPage = null,
  contentBlockIds = null,
  includeFrontCoverOverride = null,
  includeBackCoverOverride = null
} = {}) {
  if (!rootElement || !metadata) return;
  const preparedMetadata = await prepareMetadata(journal, metadata);
  const documentUuid = journal?.uuid || "";
  const signature = [
    documentUuid,
    preparedMetadata.revision || 0,
    extensionRuntime.registry.revision,
    extensionRuntime.rendering.cacheSignature(documentUuid),
    game.user?.id || "",
    renderMode,
    journalPage?.id || "",
    Array.isArray(contentBlockIds) ? contentBlockIds.join(",") : "all"
  ].join(":");
  const { signal, duplicate } = extensionRuntime.rendering.begin(rootElement, signature);
  if (duplicate && rootElement.querySelector("[data-idoc-virtual-book]")) return;
  ACTIVE_VIRTUAL_BOOKS.get(rootElement)?.destroy();
  ACTIVE_VIRTUAL_BOOKS.delete(rootElement);

  rootElement.classList.remove("idoc-live-render-error");
  rootElement.classList.add("idoc-live-document");
  rootElement.replaceChildren();
  if (typeof beforeTransform === "function") await beforeTransform(rootElement, preparedMetadata);

  const loading = document.createElement("div");
  loading.className = "idoc-live-loading";
  const spinner = document.createElement("i");
  spinner.className = "fa-solid fa-spinner fa-spin";
  spinner.setAttribute("aria-hidden", "true");
  loading.append(spinner, document.createTextNode(` ${game.i18n.localize("ILLUMINATED.Virtual.Paginating")}`));
  rootElement.append(loading);

  try {
    const allContentBlocks = getContentEntries(preparedMetadata, { documentUuid }).entries;
    const selectedBlockIds = Array.isArray(contentBlockIds) ? new Set(contentBlockIds.map(String)) : null;
    const contentBlocks = selectedBlockIds
      ? allContentBlocks.filter((block) => selectedBlockIds.has(String(block.id)))
      : allContentBlocks;
    const transformed = await extensionRuntime.rendering.transform({
      rootElement,
      document: journal,
      journal,
      journalPage,
      documentUuid,
      viewer: game.user,
      currentUser: game.user,
      isGM: Boolean(game.user?.isGM),
      application,
      renderMode,
      editable,
      contentBlocks,
      extensionData: preparedMetadata.extensions || {},
      metadata: preparedMetadata,
      abortSignal: signal
    });
    if (signal.aborted) return;

    const definition = resolveBookDefinition(preparedMetadata);
    if (includeFrontCoverOverride !== null) definition.includeFrontCover = Boolean(includeFrontCoverOverride);
    if (includeBackCoverOverride !== null) definition.includeBackCover = Boolean(includeBackCoverOverride);
    const text = combineContentEntries(transformed.contentBlocks);
    const pagePlans = await planBookPageEntries({
      ...definition,
      text,
      contentEntries: transformed.contentBlocks,
      signal
    });
    if (signal.aborted) return;

    loading.remove();
    const pages = document.createElement("div");
    pages.className = "idoc-live-page-list";
    pages.dataset.idocPageList = "true";
    rootElement.append(pages);
    ACTIVE_VIRTUAL_BOOKS.get(rootElement)?.destroy();
    const virtualBook = new VirtualBookView({
      rootElement: pages,
      pagePlans,
      signal,
      canvasClass: "idoc-live-page",
      showStatus: true
    });
    ACTIVE_VIRTUAL_BOOKS.set(rootElement, virtualBook);
    virtualBook.mount();
  } catch (error) {
    if (signal.aborted) return;
    console.error(`runyth-illuminated-documents | Live document render failed for ${documentUuid || "unknown document"}`, error);
    rootElement.classList.add("idoc-live-render-error");
    rootElement.replaceChildren();
    const message = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = "Unable to render this illuminated document.";
    message.append(strong, document.createElement("br"), document.createTextNode(String(error.message || error)));
    rootElement.append(message);
  }
}
