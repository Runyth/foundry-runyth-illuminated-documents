// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { savedWindowOptions, saveWindowGeometry } from "./window-geometry.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const FilePickerNamespace = foundry.applications.apps.FilePicker;
const FilePicker = FilePickerNamespace?.implementation || FilePickerNamespace;
const { FormDataExtended } = foundry.applications.ux;
const ACTIVE_APPLICATIONS = new Set();

/**
 * Shared Foundry V13 ApplicationV2 base for every Illuminated Documents window.
 * It provides Handlebars rendering, supported V2 form capture, and persisted
 * window geometry without relying on any ApplicationV1 compatibility aliases.
 */
export class IlluminatedApplicationV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static GEOMETRY_KEY = "";

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["illuminated-documents-window"],
    window: {
      resizable: true
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: false,
      handler: IlluminatedApplicationV2._onSubmit
    }
  };

  static async _onSubmit(event) {
    // All module actions are explicit data-action buttons. Prevent an Enter key
    // press from triggering an unintended duplicate create/save operation.
    event?.preventDefault?.();
  }

  constructor(options = {}) {
    const constructor = new.target;
    const defaults = constructor.DEFAULT_OPTIONS.position || {};
    const saved = constructor.GEOMETRY_KEY
      ? savedWindowOptions(constructor.GEOMETRY_KEY, defaults)
      : defaults;
    super({
      ...options,
      position: {
        ...saved,
        ...(options.position || {})
      }
    });
    this._renderAbortController = null;
    ACTIVE_APPLICATIONS.add(this);
  }

  /** Return the supported V13 FormDataExtended object for this top-level form. */
  _formDataObject(form = this.form) {
    return form ? new FormDataExtended(form).object : {};
  }

  /** Return the native ApplicationV2 root element. */
  _html() {
    return this.element || null;
  }

  /** Attach a listener that is automatically removed before the next render. */
  _listen(target, type, listener, options = {}) {
    if (!target?.addEventListener || !this._renderAbortController) return;
    target.addEventListener(type, listener, {
      ...options,
      signal: this._renderAbortController.signal
    });
  }

  async _onRender(context, options) {
    this._renderAbortController?.abort();
    this._renderAbortController = new AbortController();
    return super._onRender(context, options);
  }

  async _preClose(options) {
    this._renderAbortController?.abort();
    this._renderAbortController = null;
    ACTIVE_APPLICATIONS.delete(this);
    if (this.constructor.GEOMETRY_KEY) {
      try {
        await saveWindowGeometry(this.constructor.GEOMETRY_KEY, this.position);
      } catch (error) {
        // A client-setting failure must never trap a user inside a window.
        console.warn("runyth-illuminated-documents | Unable to save window geometry", error);
      }
    }
    return super._preClose(options);
  }
}

export { DialogV2, FilePicker, FormDataExtended };

export function renderV2(application, options = {}) {
  return application.render({ force: true, ...options });
}

/** Render a V2 application without leaking an unhandled rejection from DOM callbacks. */
export async function safeRenderV2(application, options = {}) {
  try {
    return await application.render(options);
  } catch (error) {
    console.error("runyth-illuminated-documents | Application render failed", error);
    ui.notifications?.error?.("Illuminated Documents could not refresh this window. See the browser console.");
    return null;
  }
}

/**
 * Apply a complete busy state to a module-owned window while an async action is
 * running. Previously disabled controls retain their original state.
 */
export function setApplicationBusy(application, busy) {
  const root = application?.element;
  if (!root) return;
  root.setAttribute("aria-busy", busy ? "true" : "false");
  for (const control of root.querySelectorAll("button[data-action], input[type='submit']")) {
    if (busy) {
      if (!control.hasAttribute("data-idoc-busy-disabled")) {
        control.dataset.idocBusyDisabled = control.disabled ? "true" : "false";
      }
      control.disabled = true;
    } else if (control.hasAttribute("data-idoc-busy-disabled")) {
      control.disabled = control.dataset.idocBusyDisabled === "true";
      delete control.dataset.idocBusyDisabled;
    }
  }
}

export async function confirmV2({ title, content, yesLabel = "Confirm", noLabel = "Cancel" }) {
  return DialogV2.confirm({
    window: { title },
    content,
    modal: true,
    rejectClose: false,
    yes: { label: yesLabel },
    no: { label: noLabel }
  });
}

export async function promptV2({ title, content, okLabel = "OK", callback }) {
  return DialogV2.prompt({
    window: { title },
    content,
    modal: true,
    rejectClose: false,
    ok: {
      label: okLabel,
      callback
    }
  });
}

/** Rerender open module-owned V2 applications after extension registry changes. */
export async function rerenderOpenIlluminatedApplications() {
  const tasks = [];
  for (const application of ACTIVE_APPLICATIONS) {
    if (!application?.rendered) continue;
    tasks.push(Promise.resolve(application.render({ force: true })).catch((error) => {
      console.error("runyth-illuminated-documents | Failed to refresh an open application", error);
    }));
  }
  await Promise.all(tasks);
}
