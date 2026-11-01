// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
const EXTENSION_ID = "example-companion";

Hooks.once("init", () => {
  const api = game.illuminatedDocuments?.api;
  if (api) register(api);
  else Hooks.once("illuminatedDocumentsApiInit", register);
});

function register(api) {
  api.assertApiVersion("^1.0.0");
  api.registerExtension({
    id: EXTENSION_ID,
    title: "Example Companion",
    version: "1.0.0",
    requiredApiVersion: "^1.0.0",
    schemaVersion: 1,
    priority: 100,
    capabilities: ["document-fields", "block-fields", "render-transform"],
    documentFields: [{
      key: "label",
      type: "text",
      label: "Example label",
      hint: "Stored once for the complete document.",
      default: "Archive copy",
      order: 10
    }],
    blockFields: [{
      key: "emphasize",
      type: "checkbox",
      label: "Emphasize block",
      hint: "Decorate this copied block during viewing.",
      default: false,
      order: 10
    }],
    hooks: {
      transformRenderedDocument({blockRootElement, extensionData, abortSignal}) {
        if (abortSignal.aborted) return;
        for (const section of blockRootElement.querySelectorAll("[data-illuminated-block-id]")) {
          const blockId = section.dataset.illuminatedBlockId;
          if (!extensionData.blocks?.[blockId]?.emphasize) continue;
          const text = section.querySelector("[data-idoc-block-text]");
          text.textContent = `◆ ${text.textContent}`;
        }
      },
      validateDocument({extensionData}) {
        if (extensionData.document?.label) return [];
        return [{
          severity: "info",
          blocking: false,
          fieldPath: `extensions.${EXTENSION_ID}.document.label`,
          message: "The example label is empty."
        }];
      }
    }
  });
}
