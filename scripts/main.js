// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { registerSettings, getTemplates, saveTemplates, MODULE_ID } from "./settings.js";
import { DocumentManagement } from "./document-management.js";
import { TemplateManager } from "./template-manager.js";
import { PresetManager } from "./preset-manager.js";
import { PermissionManager, canUseModule } from "./permission-manager.js";
import {
  canCreateDocuments,
  canManagePresets,
  canManagePresetResource,
  canManageTemplates,
  canManageTemplateResource,
  canUsePreset,
  canUseTemplate,
  getUserPermissions,
  migrateGranularPermissions
} from "./permissions.js";
import { DocumentStudio, resolveBookDefinition } from "./studio.js";
import { DocumentEditor } from "./document-editor.js";
import {
  createDocumentForCurrentUser,
  editDocumentForCurrentUser,
  extendDocumentForCurrentUser
} from "./document-operations.js";
import {
  canEditJournal,
  canExtendJournal,
  createLiveJournal,
  editLiveJournal,
  extendLiveJournal,
  getJournalLiveMetadata,
  getLiveMetadata,
  getSectionChapterBlockId,
  listEditableJournals,
  listExtendableJournals,
  usesSectionChapters
} from "./documents.js";
import {
  acceptGmResponse,
  isRequestForThisActiveGm,
  processGmRequestOnce,
  sendGmResponse,
  validateGmRequestEnvelope
} from "./socket.js";
import { normalizeTemplate } from "./layout.js";
import { renderDocumentPages, renderBookPages, renderBookPageEntries } from "./renderer.js";
import { applyPresetChangesForUser, getPresets, savePresets } from "./presets.js";
import { applyTemplateChangesForUser } from "./template-library.js";
import {
  JOURNAL_VIEW_MODES,
  getPreferredJournalView,
  openIlluminatedJournal,
  rerenderIlluminatedViewers,
  showJournalToPlayers
} from "./viewer.js";
import {
  IlluminatedApplicationV2,
  renderV2,
  rerenderOpenIlluminatedApplications,
  safeRenderV2
} from "./application-v2.js";
import { createExtensionApi } from "./extensions/api.js";
import { announceApiInit, announceApiReady, extensionRuntime } from "./extensions/runtime.js";
import { renderIlluminatedDocumentInto } from "./live-render.js";
import { asElement, createButton, query, queryAll } from "./dom.js";
import { getContentEntries } from "./content-entries.js";
import { isPrimaryJournalV2Application } from "./journal-integration.js";

function getDocument(app) {
  return app?.document || app?.page || app?.options?.document || null;
}

function illuminatedJournalFromDocument(document) {
  if (!document) return null;
  if (document.documentName === "JournalEntry" && getJournalLiveMetadata(document)) return document;
  if (document.documentName === "JournalEntryPage") {
    const journal = document.parent;
    return (getLiveMetadata(document) || getJournalLiveMetadata(journal)) ? journal : null;
  }
  return null;
}

function isPrimaryJournalSheetApplication(app, document = getDocument(app)) {
  return isPrimaryJournalV2Application(app, document);
}

function findLiveMounts(html) {
  const root = asElement(html);
  if (!root) return [];
  const collect = (selector) => [
    ...(root.matches?.(selector) ? [root] : []),
    ...queryAll(root, selector)
  ];

  let mounts = collect(".idoc-live-document-root");
  if (mounts.length) return mounts;

  for (const legacy of collect(".idoc-live-placeholder")) {
    const mount = document.createElement("div");
    mount.className = "idoc-live-document-root";
    mount.dataset.idocLiveDocument = "true";
    legacy.replaceWith(mount);
  }
  mounts = collect(".idoc-live-document-root");
  return mounts;
}

function appendExtensionToolbar(target, journal, metadata) {
  if (!journal || !target) return;
  const toolbar = document.createElement("div");
  toolbar.className = "idoc-live-toolbar";
  const summary = document.createElement("div");
  summary.className = "idoc-live-toolbar-summary";
  const title = document.createElement("strong");
  title.textContent = journal.name;
  const details = document.createElement("small");
  details.textContent = `Revision ${Number(metadata.revision || 0)} · ${String(metadata.sourceText || "").length.toLocaleString()} characters`;
  summary.append(title, details);

  const actions = document.createElement("div");
  actions.className = "idoc-live-toolbar-actions";
  if (game.user.isGM) {
    const showButton = createButton({
      className: "idoc-show-players",
      icon: "fa-solid fa-eye",
      label: "Show Players",
      title: "Show to observing players. Hold Shift to force-show to all connected players."
    });
    showButton.addEventListener("click", (event) => {
      showJournalToPlayers(journal, { force: event.shiftKey }).catch((error) => ui.notifications.error(error.message));
    }, { once: false });
    actions.append(showButton);
  }

  if (canExtendJournal(journal)) {
    const extendButton = createButton({
      className: "idoc-extend-book",
      icon: "fa-solid fa-plus",
      label: "Extend this book"
    });
    extendButton.addEventListener("click", () => DocumentStudio.openForJournal(journal.id));
    actions.append(extendButton);
  }

  if (canEditJournal(journal)) {
    const editButton = createButton({
      className: "idoc-edit-book",
      icon: "fa-solid fa-pen-to-square",
      label: "Edit book"
    });
    editButton.addEventListener("click", () => DocumentEditor.open(journal.id));
    actions.append(editButton);
  }

  toolbar.append(summary, actions);
  target.append(toolbar);
}

function sectionChapterRenderOptions(journal, metadata, blockId, journalPage = null) {
  if (!usesSectionChapters(metadata) || !blockId) return { journalPage };
  const entries = getContentEntries(metadata, { documentUuid: journal?.uuid || "" }).entries;
  const index = entries.findIndex((entry) => String(entry.id) === String(blockId));
  if (index < 0) return { journalPage };
  return {
    journalPage,
    contentBlockIds: [String(blockId)],
    includeFrontCoverOverride: index === 0 && Boolean(metadata.includeFrontCover),
    includeBackCoverOverride: index === entries.length - 1 && Boolean(metadata.includeBackCover)
  };
}

async function renderLiveMount(mount, metadata, journal = null, application = null, { journalPage = null, showToolbar = true } = {}) {
  const element = asElement(mount);
  if (!metadata || !element) return;
  const blockId = String(element.dataset.idocChapterBlockId || getSectionChapterBlockId(journalPage) || "");
  const chapterOptions = sectionChapterRenderOptions(journal, metadata, blockId, journalPage);
  await renderIlluminatedDocumentInto(element, {
    journal,
    metadata,
    application,
    renderMode: blockId ? "journal-chapter" : "journal",
    editable: Boolean(journal && canEditJournal(journal)),
    ...chapterOptions,
    beforeTransform: showToolbar ? async (root, preparedMetadata) => {
      appendExtensionToolbar(root, journal, preparedMetadata);
    } : null
  });
}

async function renderLivePageSheet(app, html) {
  const document = getDocument(app);
  const journal = document?.documentName === "JournalEntry" ? document : document?.parent;
  const metadata = getJournalLiveMetadata(journal) || getLiveMetadata(document);
  if (!metadata) return;

  for (const mount of findLiveMounts(html)) {
    await renderLiveMount(mount, metadata, journal, app, {
      journalPage: document?.documentName === "JournalEntryPage" ? document : null,
      showToolbar: true
    });
  }
}

async function renderLiveJournalSheet(app, html) {
  const journal = getDocument(app);
  const mounts = findLiveMounts(html);
  if (!mounts.length) return;

  const journalMetadata = getJournalLiveMetadata(journal);
  if (!journalMetadata) return;
  const orderedChapterPages = Array.from(journal?.pages || [])
    .filter((page) => getSectionChapterBlockId(page))
    .sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0));
  const chapterPages = new Map(orderedChapterPages.map((page) => [getSectionChapterBlockId(page), page]));
  const chapterPagesById = new Map(orderedChapterPages.map((page) => [String(page.id), page]));

  for (const [index, mount] of mounts.entries()) {
    let blockId = String(mount.dataset.idocChapterBlockId || "");
    let journalPage = blockId ? chapterPages.get(blockId) || null : null;
    if (!journalPage) {
      const pageHost = mount.closest?.("[data-page-id], [data-entry-id]") || null;
      const pageId = String(pageHost?.dataset?.pageId || pageHost?.dataset?.entryId || "");
      journalPage = chapterPagesById.get(pageId) || null;
      blockId = getSectionChapterBlockId(journalPage);
    }
    if (!journalPage && mounts.length === orderedChapterPages.length) {
      journalPage = orderedChapterPages[index] || null;
      blockId = getSectionChapterBlockId(journalPage);
    }
    if (blockId && !mount.dataset.idocChapterBlockId) mount.dataset.idocChapterBlockId = blockId;
    await renderLiveMount(mount, journalMetadata, journal, app, {
      journalPage,
      showToolbar: mounts.length === 1 || index === 0
    });
  }
}

Hooks.once("init", () => {
  try {
    registerSettings(TemplateManager, PresetManager, PermissionManager, DocumentManagement);
  } catch (error) {
    console.error(`${MODULE_ID} | Settings registration failed`, error);
    ui.notifications?.error?.("Illuminated Documents could not register all settings. See the browser console.");
  }

  try {
    foundry.applications.handlebars.loadTemplates([
      "modules/runyth-illuminated-documents/templates/extension-fields.hbs"
    ]).catch((error) => console.error(`${MODULE_ID} | Failed to load extension field partial`, error));
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to schedule extension field template loading`, error);
  }

  try {
    const coreApi = {
      moduleVersion: "1.12.1",
      openStudio: () => canUseModule()
        ? renderV2(new DocumentStudio())
        : ui.notifications.error("You do not have permission to create illuminated documents."),
      openForJournal: (journalId) => DocumentStudio.openForJournal(journalId),
      editJournal: (journalId) => DocumentEditor.open(journalId),
      openTemplateManager: () => canManageTemplates()
        ? renderV2(new TemplateManager())
        : ui.notifications.error("You do not have permission to manage visual templates."),
      openPresetManager: () => canManagePresets()
        ? renderV2(new PresetManager())
        : ui.notifications.error("You do not have permission to manage book presets."),
      openDocumentManagement: () => game.user.isGM && renderV2(new DocumentManagement()),
      openJournal: (journalOrId, options = {}) => {
        const journal = typeof journalOrId === "string" ? game.journal.get(journalOrId) : journalOrId;
        return openIlluminatedJournal(journal, options);
      },
      showToPlayers: (journalOrId, options = {}) => {
        const journal = typeof journalOrId === "string" ? game.journal.get(journalOrId) : journalOrId;
        return showJournalToPlayers(journal, options);
      },
      getTemplates: () => foundry.utils.deepClone(getTemplates()),
      saveTemplates: async (templates) => {
        if (!canManageTemplates()) throw new Error("You do not have permission to manage visual templates.");
        return foundry.utils.deepClone(await saveTemplates(templates));
      },
      getPresets: () => foundry.utils.deepClone(getPresets()),
      savePresets: async (presets) => {
        if (!canManagePresets()) throw new Error("You do not have permission to manage book presets.");
        return foundry.utils.deepClone(await savePresets(presets));
      },
      listExtendableJournals: () => listExtendableJournals(),
      listEditableJournals: () => listEditableJournals(),
      createLiveJournal: async (payload) => (await createDocumentForCurrentUser(payload)).journal,
      editLiveJournal: async (payload) => {
        const { journal, metadata } = await editDocumentForCurrentUser(payload);
        return { journal, metadata };
      },
      extendLiveJournal: async (payload) => {
        const { journal, metadata } = await extendDocumentForCurrentUser(payload);
        return { journal, metadata };
      },
      normalizeTemplate,
      renderDocumentPages,
      renderBookPages,
      renderBookPageEntries,
      canUseModule,
      canCreateDocuments,
      canManagePresets,
      canManagePresetResource,
      canManageTemplates,
      canManageTemplateResource,
      canUsePreset,
      canUseTemplate,
      getUserPermissions,
      canEditJournal,
      canExtendJournal,
      JOURNAL_VIEW_MODES
    };
    const api = createExtensionApi(coreApi);
    const publicNamespace = Object.freeze({ api });
    game.illuminatedDocuments = publicNamespace;
    const moduleRecord = game.modules.get(MODULE_ID);
    if (moduleRecord) moduleRecord.api = api;
    announceApiInit(api);
    Hooks.callAll(`${MODULE_ID}.apiReady`, api);

    extensionRuntime.setInterfaceRefreshHandler(() => rerenderOpenIlluminatedApplications());
    extensionRuntime.rendering.setRerenderHandler((documentUuid = "") => {
      const journals = documentUuid
        ? [globalThis.fromUuidSync?.(documentUuid)].map((document) => document?.documentName === "JournalEntryPage" ? document.parent : document).filter(Boolean)
        : Array.from(game.journal || []).filter((journal) => getJournalLiveMetadata(journal));
      for (const journal of journals) {
        rerenderSupportedDocumentApplications(journal);
        for (const page of journal.pages || []) rerenderSupportedDocumentApplications(page);
        rerenderIlluminatedViewers(journal.id);
      }
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Public API initialization failed`, error);
    ui.notifications?.error?.("Illuminated Documents could not initialize its public API. See the browser console.");
  }
});

const REMOTE_ACTIONS = Object.freeze([
  "createLiveJournal",
  "extendLiveJournal",
  "editLiveJournal",
  "saveBookPresets",
  "saveVisualTemplates"
]);
let socketHandlerRegistered = false;

async function performRemoteAction(message, requester) {
  if (["createLiveJournal", "extendLiveJournal", "editLiveJournal"].includes(message.action)
    && !canCreateDocuments(requester)) {
    throw new Error("The requesting player is not allowed to create or update illuminated documents.");
  }

  if (message.action === "createLiveJournal") {
    const journal = await createLiveJournal({ ...message.payload, ownerId: requester.id });
    return {
      operation: "create",
      journalId: journal.id,
      journalName: journal.name,
      notice: `Created illuminated document for ${requester.name}: ${journal.name}`
    };
  }
  if (message.action === "extendLiveJournal") {
    const { journal, metadata } = await extendLiveJournal({ ...message.payload, requesterId: requester.id });
    return {
      operation: "extend",
      journalId: journal.id,
      journalName: journal.name,
      revision: metadata.revision,
      notice: `${requester.name} extended illuminated document: ${journal.name}`
    };
  }
  if (message.action === "editLiveJournal") {
    const { journal, metadata } = await editLiveJournal({ ...message.payload, requesterId: requester.id });
    return {
      operation: "edit",
      journalId: journal.id,
      journalName: journal.name,
      revision: metadata.revision,
      notice: `${requester.name} edited illuminated document: ${journal.name}`
    };
  }
  if (message.action === "saveBookPresets") {
    const result = await applyPresetChangesForUser(message.payload || {}, requester);
    return { ...result, notice: `${requester.name} updated shared Illuminated Documents book presets.` };
  }
  if (message.action === "saveVisualTemplates") {
    const result = await applyTemplateChangesForUser(message.payload || {}, requester);
    return { ...result, notice: `${requester.name} updated shared Illuminated Documents visual templates.` };
  }
  throw new Error("Unsupported Illuminated Documents socket action.");
}

async function handleSocketMessage(message) {
  if (message?.action === "showIlluminatedJournal") {
    const sourceGm = game.users.get(message.sourceGmId);
    if (!sourceGm?.isGM || !sourceGm.active) return;
    if (!Array.isArray(message.recipientIds) || !message.recipientIds.includes(game.user.id)) return;
    const journal = game.journal.get(String(message.journalId || ""));
    if (journal && getJournalLiveMetadata(journal)) {
      await openIlluminatedJournal(journal, { mode: message.mode });
    }
    return;
  }

  if (acceptGmResponse(message)) return;
  if (!isRequestForThisActiveGm(message) || !REMOTE_ACTIONS.includes(message?.action)) return;
  if (!validateGmRequestEnvelope(message, REMOTE_ACTIONS)) {
    if (typeof message?.requestId === "string" && typeof message?.requesterId === "string") {
      sendGmResponse(message, { ok: false, error: "The Illuminated Documents request payload is malformed." });
    }
    return;
  }

  const requester = game.users.get(message.requesterId);
  if (!requester) {
    sendGmResponse(message, { ok: false, error: "The requesting Foundry user no longer exists." });
    return;
  }

  const response = await processGmRequestOnce(message, () => performRemoteAction(message, requester));
  const { notice, ...result } = response.result || {};
  sendGmResponse(message, { ok: response.ok, result, error: response.error || "" });
  if (response.ok && !response.replayed && notice) ui.notifications.info(notice);
  if (!response.ok && !response.replayed) {
    console.error(`${MODULE_ID} | Remote request failed: ${response.error}`);
    ui.notifications.error(`Illuminated Documents request failed: ${response.error}`);
  }
}

function registerSocketHandler() {
  if (socketHandlerRegistered) return;
  try {
    game.socket.on(`module.${MODULE_ID}`, handleSocketMessage);
    socketHandlerRegistered = true;
  } catch (error) {
    console.error(`${MODULE_ID} | Socket handler registration failed`, error);
    ui.notifications?.error?.("Illuminated Documents could not initialize player-to-GM requests. See the browser console.");
  }
}

Hooks.once("ready", async () => {
  const api = game.illuminatedDocuments?.api;
  if (api) announceApiReady(api);
  else console.error(`${MODULE_ID} | Public API was unavailable at ready`);
  try {
    const migrated = await migrateGranularPermissions();
    if (migrated) ui.notifications.info("Illuminated Documents permissions were upgraded to the granular model.");
  } catch (error) {
    console.error(`${MODULE_ID} | Permission migration failed`, error);
  }

  registerSocketHandler();
});

function directoryJournalId(element) {
  const item = element?.closest?.("[data-document-id], [data-entry-id], [data-document-uuid]");
  if (!item) return "";
  const uuid = item.dataset.documentUuid || "";
  return item.dataset.documentId || item.dataset.entryId || (uuid.startsWith("JournalEntry.") ? uuid.split(".")[1] : "");
}

function installPreferredViewHandler(html) {
  const element = asElement(html);
  if (!element || element.dataset.idocPreferredViewHandler === "true") return;
  element.dataset.idocPreferredViewHandler = "true";
  element.addEventListener("dblclick", (event) => {
    const mode = getPreferredJournalView();
    if (mode === JOURNAL_VIEW_MODES.JOURNAL) return;
    const journalId = directoryJournalId(event.target);
    const journal = game.journal.get(journalId);
    if (!journal || !getJournalLiveMetadata(journal)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void Promise.resolve(openIlluminatedJournal(journal, { mode }))
      .catch((error) => ui.notifications.error(error.message));
  }, true);
}

function addJournalDirectoryButtons(html) {
  const root = asElement(html);
  const actions = query(root, ".directory-header .header-actions");
  if (!root || !actions) return;

  if (canUseModule() && !query(root, ".illuminated-open-studio")) {
    const studioButton = createButton({
      className: "illuminated-open-studio",
      icon: "fa-solid fa-feather-pointed",
      label: game.i18n.localize("ILLUMINATED.SidebarStudio")
    });
    studioButton.addEventListener("click", () => {
      void safeRenderV2(new DocumentStudio(), { force: true });
    });
    actions.append(studioButton);
  }

  if (game.user.isGM && !query(root, ".illuminated-document-settings")) {
    const settingsButton = createButton({
      className: "illuminated-document-settings",
      icon: "fa-solid fa-folder-gear",
      label: game.i18n.localize("ILLUMINATED.SidebarStore"),
      title: "Configure the Journal destination folder and generated document names."
    });
    settingsButton.addEventListener("click", () => {
      void safeRenderV2(new DocumentManagement(), { force: true });
    });
    actions.append(settingsButton);
  }
}

Hooks.on("renderJournalDirectory", (_app, html) => {
  addJournalDirectoryButtons(html);
  installPreferredViewHandler(html);
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!canUseModule()) return;
  const notes = controls?.notes;
  if (!notes || !notes.tools || Array.isArray(notes.tools)) return;
  const existing = notes.tools.illuminatedDocuments;
  notes.tools.illuminatedDocuments = {
    name: "illuminatedDocuments",
    title: game.i18n.localize("ILLUMINATED.OpenStudio"),
    icon: "fa-solid fa-feather-pointed",
    order: existing?.order ?? Object.keys(notes.tools).length,
    button: true,
    visible: true,
    onChange: () => {
      void safeRenderV2(new DocumentStudio(), { force: true });
    }
  };
});

/**
 * Render only applications whose backing document is positively identified by
 * Illuminated Documents flags. This uses the supported generic ApplicationV2
 * render hook and document metadata rather than deprecated page-sheet globals
 * or fragile constructor-name checks.
 */
Hooks.on("closeApplicationV2", (app) => {
  const document = getDocument(app);
  const isOwnedApplication = app instanceof IlluminatedApplicationV2
    || isPrimaryJournalSheetApplication(app, document);
  if (!isOwnedApplication) return;
  extensionRuntime.rendering.cancelTree(app?.element || null);
});

Hooks.on("renderApplicationV2", async (app, element) => {
  const document = getDocument(app);
  if (!isPrimaryJournalSheetApplication(app, document)) return;
  const journal = illuminatedJournalFromDocument(document);
  if (!journal) return;

  if (document.documentName === "JournalEntryPage") {
    await renderLivePageSheet(app, element);
  } else if (document.documentName === "JournalEntry") {
    await renderLiveJournalSheet(app, element);
  }
});

function illuminatedJournalForApplication(app) {
  const document = getDocument(app);
  if (!isPrimaryJournalSheetApplication(app, document)) return null;
  return illuminatedJournalFromDocument(document);
}

function addEditV2HeaderControl(app, controls) {
  if (!Array.isArray(controls)) return;
  const journal = illuminatedJournalForApplication(app);
  if (!journal || !canEditJournal(journal) || controls.some((control) => control.action === "idocEditBook")) return;
  controls.unshift({
    label: "Edit Book",
    icon: "fa-solid fa-pen-to-square",
    action: "idocEditBook",
    visible: true,
    callback: () => DocumentEditor.open(journal.id)
  });
}

function addShowPlayersV2HeaderControl(app, controls) {
  if (!game.user.isGM || !Array.isArray(controls)) return;
  const journal = illuminatedJournalForApplication(app);
  if (!journal || controls.some((control) => control.action === "idocShowPlayers")) return;
  controls.unshift({
    label: "Show Players",
    icon: "fa-solid fa-eye",
    action: "idocShowPlayers",
    visible: true,
    callback: (event) => showJournalToPlayers(journal, { force: Boolean(event?.shiftKey) })
      .catch((error) => ui.notifications.error(error.message))
  });
}

Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  addEditV2HeaderControl(app, controls);
  addShowPlayersV2HeaderControl(app, controls);
});

function documentApplications(document) {
  const applications = document?.apps;
  if (!applications) return [];
  if (applications instanceof Map) return Array.from(applications.values());
  if (Array.isArray(applications)) return applications;
  return Object.values(applications);
}

function rerenderSupportedDocumentApplications(document) {
  for (const application of documentApplications(document)) {
    if (!application?.constructor?.isV2 || !application.rendered) continue;
    void safeRenderV2(application, { force: true });
  }
}

Hooks.on("updateJournalEntry", (journal, changed) => {
  if (!foundry.utils.hasProperty(changed, `flags.${MODULE_ID}.liveDocument`)) return;
  extensionRuntime.rendering.invalidate(journal.uuid);
  rerenderSupportedDocumentApplications(journal);
  rerenderIlluminatedViewers(journal.id);
});

Hooks.on("updateJournalEntryPage", (page, changed) => {
  const parentMetadata = getJournalLiveMetadata(page.parent);
  const moduleFlagChanged = foundry.utils.hasProperty(changed, `flags.${MODULE_ID}.liveDocument`)
    || foundry.utils.hasProperty(changed, `flags.${MODULE_ID}.sectionChapter`);
  const managedChapterChanged = Boolean(parentMetadata && getSectionChapterBlockId(page))
    && ["name", "sort", "text"].some((path) => foundry.utils.hasProperty(changed, path));
  if (!moduleFlagChanged && !managedChapterChanged) return;
  extensionRuntime.rendering.invalidate(page.parent?.uuid || page.uuid);
  rerenderSupportedDocumentApplications(page);
  rerenderSupportedDocumentApplications(page.parent);
  if (page.parent?.id) rerenderIlluminatedViewers(page.parent.id);
});

Hooks.on("deleteJournalEntry", async (journal) => {
  const metadata = getJournalLiveMetadata(journal);
  if (!metadata) return;
  extensionRuntime.rendering.invalidate(journal.uuid);
  await extensionRuntime.runLifecycle("onDocumentDeleted", {
    documentUuid: journal.uuid,
    documentName: journal.name,
    metadata,
    extensionData: metadata.extensions || {}
  });
});
