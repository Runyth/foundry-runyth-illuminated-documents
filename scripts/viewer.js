// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, SETTINGS } from "./settings.js";
import {
  canEditJournal,
  canExtendJournal,
  getJournalLiveMetadata,
  getLiveMetadata,
  getSectionChapterBlockId
} from "./documents.js";
import { renderIlluminatedDocumentInto } from "./live-render.js";
import { IlluminatedApplicationV2, renderV2, safeRenderV2 } from "./application-v2.js";
import { renderJournalEntryPageV2, renderJournalEntryV2 } from "./journal-integration.js";

export const JOURNAL_VIEW_MODES = Object.freeze({
  JOURNAL: "journal",
  PAGE: "page",
  VIEWER: "viewer"
});

const ACTIVE_VIEWERS = new Set();

/** Open a Journal using only supported Foundry V13 ApplicationV2 sheet classes. */
export function renderSupportedJournalSheet(journal, options = {}) {
  return renderJournalEntryV2(journal, options);
}

/** Open a Journal page using only its supported V13 ApplicationV2 sheet. */
export function renderSupportedJournalPageSheet(page, options = {}) {
  return renderJournalEntryPageV2(page, options);
}

export function getPreferredJournalView() {
  const configured = game.settings.get(MODULE_ID, SETTINGS.defaultJournalView);
  return Object.values(JOURNAL_VIEW_MODES).includes(configured) ? configured : JOURNAL_VIEW_MODES.JOURNAL;
}

export function findIlluminatedPage(journal) {
  return Array.from(journal?.pages || []).find((page) => getLiveMetadata(page))
    || Array.from(journal?.pages || []).find((page) => getSectionChapterBlockId(page))
    || Array.from(journal?.pages || []).find((page) => page.type === "text")
    || null;
}

export async function showJournalToPlayers(journal, { force = false } = {}) {
  if (!game.user.isGM) throw new Error("Only a Game Master can show a Journal to players.");
  if (!journal || !getJournalLiveMetadata(journal)) throw new Error("This is not an Illuminated Document.");

  const mode = getPreferredJournalView();
  if (force || mode === JOURNAL_VIEW_MODES.JOURNAL) {
    await journal.show(Boolean(force));
    ui.notifications.info(force
      ? `Showed ${journal.name} to all connected players.`
      : `Showed ${journal.name} to players who can observe it.`);
    return;
  }

  const observerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  const recipientIds = Array.from(game.users || [])
    .filter((user) => user.active && !user.isGM && journal.testUserPermission?.(user, observerLevel))
    .map((user) => user.id);

  if (!recipientIds.length) {
    ui.notifications.warn(`No connected players can observe ${journal.name}.`);
    return;
  }

  game.socket.emit(`module.${MODULE_ID}`, {
    action: "showIlluminatedJournal",
    sourceGmId: game.user.id,
    journalId: journal.id,
    recipientIds,
    mode
  });
  ui.notifications.info(`Showed ${journal.name} to ${recipientIds.length} connected player${recipientIds.length === 1 ? "" : "s"}.`);
}

export class IlluminatedDocumentViewer extends IlluminatedApplicationV2 {
  static GEOMETRY_KEY = "viewer";

  static DEFAULT_OPTIONS = {
    id: "illuminated-document-viewer",
    classes: ["illuminated-documents-window"],
    window: {
      title: "Illuminated Document",
      resizable: true
    },
    position: {
      width: 980,
      height: 820
    },
    actions: {
      extend: this._onExtend,
      edit: this._onEdit,
      "show-players": this._onShowPlayers,
      "open-foundry": this._onOpenFoundry
    }
  };

  static PARTS = {
    main: {
      template: "modules/runyth-illuminated-documents/templates/viewer.hbs"
    }
  };

  constructor(journalId, options = {}) {
    const journal = game.journal.get(journalId);
    super({
      ...options,
      window: {
        ...(options.window || {}),
        title: journal?.name || "Illuminated Document"
      }
    });
    this.journalId = journalId;
    ACTIVE_VIEWERS.add(this);
  }

  get journal() {
    return game.journal.get(this.journalId);
  }

  static _onExtend() {
    game.modules.get(MODULE_ID)?.api?.openForJournal(this.journalId);
  }

  static _onEdit() {
    game.modules.get(MODULE_ID)?.api?.editJournal(this.journalId);
  }

  static _onShowPlayers(event) {
    showJournalToPlayers(this.journal, { force: event.shiftKey })
      .catch((error) => ui.notifications.error(error.message));
  }

  static _onOpenFoundry() {
    if (!this.journal) return;
    renderSupportedJournalSheet(this.journal)
      .catch((error) => ui.notifications.error(error.message));
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const journal = this.journal;
    const metadata = getJournalLiveMetadata(journal);
    return foundry.utils.mergeObject(context, {
      journalName: journal?.name || "Missing Journal",
      canExtend: Boolean(journal && canExtendJournal(journal)),
      canEdit: Boolean(journal && canEditJournal(journal)),
      canShowPlayers: Boolean(game.user.isGM),
      revision: Number(metadata?.revision || 0),
      sourceLength: String(metadata?.sourceText || "").length.toLocaleString()
    }, { inplace: false });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    await this._renderPages();
  }

  async _preClose(options) {
    ACTIVE_VIEWERS.delete(this);
    return super._preClose(options);
  }

  async _renderPages() {
    const target = this.element.querySelector("[data-viewer-pages]");
    const journal = this.journal;
    const metadata = getJournalLiveMetadata(journal);
    if (!target) return;
    if (!journal || !metadata) {
      target.innerHTML = '<div class="idoc-live-render-error"><strong>Unable to open this illuminated document.</strong></div>';
      return;
    }

    try {
      await renderIlluminatedDocumentInto(target, {
        journal,
        metadata,
        application: this,
        renderMode: "viewer",
        editable: canEditJournal(journal)
      });
    } catch (error) {
      console.error(`${MODULE_ID} | Dedicated viewer render failed`, error);
      target.innerHTML = `<div class="idoc-live-render-error"><strong>Unable to render this illuminated document.</strong><br>${foundry.utils.escapeHTML(error.message)}</div>`;
    }
  }
}

export function openIlluminatedJournal(journal, { mode = getPreferredJournalView() } = {}) {
  if (!journal) throw new Error("The illuminated Journal no longer exists.");

  if (mode === JOURNAL_VIEW_MODES.VIEWER) {
    return renderV2(new IlluminatedDocumentViewer(journal.id));
  }

  if (mode === JOURNAL_VIEW_MODES.PAGE) {
    const page = findIlluminatedPage(journal);
    if (page) return renderSupportedJournalPageSheet(page, { mode: "view" });
  }

  return renderSupportedJournalSheet(journal);
}

/** Re-render any open dedicated reader for the updated Journal. */
export function rerenderIlluminatedViewers(journalId) {
  for (const viewer of ACTIVE_VIEWERS) {
    if (viewer.journalId === journalId && viewer.rendered) void safeRenderV2(viewer, { force: true });
  }
}
