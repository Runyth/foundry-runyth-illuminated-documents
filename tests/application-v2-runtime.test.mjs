// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

function mergeObject(original = {}, other = {}, { inplace = true } = {}) {
  const target = inplace ? original : structuredClone(original);
  for (const [key, value] of Object.entries(other || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = mergeObject(target[key] || {}, value, { inplace: true });
    } else target[key] = value;
  }
  return target;
}

class MockApplicationV2 {
  static isV2 = true;
  static DEFAULT_OPTIONS = {};

  constructor(options = {}) {
    this.options = options;
    this.position = options.position || {};
    this.rendered = false;
    this.element = globalThis.document.createElement("form");
  }

  async render() {
    this.rendered = true;
    return this;
  }

  async _prepareContext() {
    return {};
  }

  async _onRender() {}
  async _preClose() {}
}

class MockDialogV2 {
  static async confirm() { return true; }
  static async prompt() { return null; }
}

class MockFilePicker extends MockApplicationV2 {
  static last = null;

  constructor(options = {}) {
    super(options);
    this.callback = options.callback;
    this.type = options.type;
    this.current = options.current;
    MockFilePicker.last = this;
  }

  async browse(target = "") {
    this.browseTarget = target;
    return this;
  }
}
class MockFormDataExtended {
  constructor() { this.object = {}; }
}

class MockElement extends EventTarget {
  constructor() {
    super();
    this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }

  append() {}
  appendChild() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute() {}
  remove() {}
  replaceChildren() {}
}

const element = () => new MockElement();

globalThis.document = {
  documentElement: { clientWidth: 1920, clientHeight: 1080 },
  createElement: element
};
globalThis.window = { innerWidth: 1920, innerHeight: 1080 };
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: MockApplicationV2,
      DialogV2: MockDialogV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    },
    apps: { FilePicker: MockFilePicker },
    ux: { FormDataExtended: MockFormDataExtended },
    sheets: {
      journal: {
        JournalEntrySheet: class extends MockApplicationV2 {},
        JournalEntryPageSheet: class extends MockApplicationV2 {},
        JournalEntryPageTextSheet: class extends MockApplicationV2 {},
        JournalEntryPageProseMirrorSheet: class extends MockApplicationV2 {},
        JournalEntryPageMarkdownSheet: class extends MockApplicationV2 {}
      }
    }
  },
  utils: {
    deepClone: structuredClone,
    escapeHTML: (value) => String(value),
    getProperty: () => undefined,
    hasProperty: () => false,
    mergeObject,
    randomID: () => "mock-id"
  }
};

globalThis.game = {
  user: { id: "gm", name: "GM", isGM: true, isActiveGM: true },
  users: new Map(),
  journal: new Map(),
  folders: [],
  settings: {
    get: (_module, key) => key === "windowGeometry" ? {} : key === "templates" ? {} : key === "presets" ? {} : "",
    set: async () => undefined
  },
  i18n: { localize: (key) => key },
  modules: new Map()
};
globalThis.ui = { notifications: { error() {}, info() {}, warn() {} } };
globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 },
  JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1, MARKDOWN: 2 }
};

const { IlluminatedApplicationV2 } = await import("../scripts/application-v2.js");
const modules = [
  ["../scripts/studio.js", "DocumentStudio"],
  ["../scripts/document-management.js", "DocumentManagement"],
  ["../scripts/permission-manager.js", "PermissionManager"],
  ["../scripts/preset-manager.js", "PresetManager"],
  ["../scripts/template-manager.js", "TemplateManager"],
  ["../scripts/document-editor.js", "DocumentEditor"],
  ["../scripts/viewer.js", "IlluminatedDocumentViewer"]
];

const importedApplications = new Map();
for (const [modulePath, exportName] of modules) {
  const imported = await import(modulePath);
  importedApplications.set(exportName, imported);
  const ApplicationClass = imported[exportName];
  assert.equal(typeof ApplicationClass, "function", `${exportName} must be exported`);
  assert.ok(ApplicationClass.prototype instanceof IlluminatedApplicationV2, `${exportName} must inherit the shared V2 base`);
  assert.ok(ApplicationClass.DEFAULT_OPTIONS, `${exportName} must define V2 options`);
  assert.ok(ApplicationClass.PARTS, `${exportName} must define Handlebars parts`);
}

class GeometrySmokeApplication extends IlluminatedApplicationV2 {
  static GEOMETRY_KEY = "smoke";
  static DEFAULT_OPTIONS = { position: { width: 640, height: 480 } };
}
const smoke = new GeometrySmokeApplication();
assert.equal(smoke.position.width, 640);
assert.equal(smoke.position.height, 480);
await smoke.render({ force: true });
assert.equal(smoke.rendered, true);

await smoke._onRender({}, {});
const listenerTarget = new EventTarget();
let listenerCalls = 0;
smoke._listen(listenerTarget, "idoc-test", () => { listenerCalls += 1; });
listenerTarget.dispatchEvent(new Event("idoc-test"));
assert.equal(listenerCalls, 1);
await smoke._onRender({}, {});
listenerTarget.dispatchEvent(new Event("idoc-test"));
assert.equal(listenerCalls, 1, "rerender must abort listeners from the previous render");
smoke._listen(listenerTarget, "idoc-test", () => { listenerCalls += 1; });
listenerTarget.dispatchEvent(new Event("idoc-test"));
assert.equal(listenerCalls, 2);
await smoke._preClose({});
listenerTarget.dispatchEvent(new Event("idoc-test"));
assert.equal(listenerCalls, 2, "closing must remove render-bound listeners");

const { TemplateManager } = importedApplications.get("TemplateManager");
const templateManager = new TemplateManager();
templateManager.form = null;
const originalBackground = templateManager._active().background;
await templateManager._pickFile("background");
assert.equal(MockFilePicker.last.type, "image");
assert.equal(MockFilePicker.last.current, originalBackground);
assert.equal(MockFilePicker.last.browseTarget, originalBackground);
MockFilePicker.last.callback("illuminated documents/My Background #1.webp");
assert.equal(templateManager._active().background, "illuminated documents/My Background #1.webp");
MockFilePicker.last.callback("");
assert.equal(templateManager._active().background, "illuminated documents/My Background #1.webp");

const viewerModule = importedApplications.get("IlluminatedDocumentViewer");
const journal = { id: "journal-1", documentName: "JournalEntry" };
const page = {
  id: "page-1",
  documentName: "JournalEntryPage",
  type: "text",
  text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML }
};
const journalSheet = await viewerModule.renderSupportedJournalSheet(journal);
const pageSheet = await viewerModule.renderSupportedJournalPageSheet(page, { mode: "view" });
assert.equal(journalSheet.options.document, journal);
assert.equal(pageSheet.options.document, page);
assert.equal(journalSheet.constructor.isV2, true);
assert.equal(pageSheet.constructor.isV2, true);

console.log("ApplicationV2 runtime smoke tests passed");
