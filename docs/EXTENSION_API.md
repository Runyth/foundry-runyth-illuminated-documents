# Illuminated Documents Extension API

API version: **1.0.0**
Foundry target: **V13**

The extension API allows installed companion modules to add serializable metadata, fields, validation, migrations, and viewer-specific presentation without patching Illuminated Documents classes or modifying authoritative Markdown.

## Stable entry point

```javascript
const api = game.illuminatedDocuments.api;
api.assertApiVersion("^1.0.0");
```

`game.illuminatedDocuments.api.version` is the extension API version. It is intentionally independent from the Illuminated Documents module version, available as `game.illuminatedDocuments.api.moduleVersion`.

Everything explicitly documented in this guide is supported. Files under `scripts/extensions/`, service instances, application properties, CSS implementation details, and methods beginning with `_` are internal.

## Lifecycle

Illuminated Documents exposes the API during its `init` hook and fires:

```text
illuminatedDocumentsApiInit
illuminatedDocumentsApiReady
```

A companion module can support either load order:

```javascript
Hooks.once("init", () => {
  const api = game.illuminatedDocuments?.api;
  if (api) register(api);
  else Hooks.once("illuminatedDocumentsApiInit", register);
});

function register(api) {
  api.assertApiVersion("^1.0.0");
  api.registerExtension({ id: "example-notes", version: "1.0.0" });
}
```

Registration is allowed during `init` and after `ready`. Late registration is marked in diagnostics and refreshes open Illuminated Documents interfaces and viewers.

## Registration

```javascript
const handle = api.registerExtension({
  id: "example-notes",
  title: "Example Notes",
  version: "1.0.0",
  requiredApiVersion: "^1.0.0",
  schemaVersion: 1,
  priority: 100,
  capabilities: ["metadata", "render-transform"],
  documentFields: [],
  blockFields: [],
  hooks: {}
});
```

### Registration properties

| Property | Type | Meaning |
|---|---:|---|
| `id` | string | Required stable lowercase ID. Allowed: letters, numbers, `.`, `_`, `-`; maximum 64 characters. |
| `title` | string | Human-readable extension name. |
| `version` | semver | Companion version; defaults to `0.0.0`. |
| `requiredApiVersion` | range | Optional API range, such as `^1.0.0`. Incompatible registrations remain diagnostic-only and do not execute callbacks. |
| `schemaVersion` | number | Current schema version of this extension’s stored metadata. |
| `priority` | number | Ascending callback order; equal priorities are ordered by extension ID. |
| `capabilities` | string[] | Diagnostic capability declarations. |
| `documentFields` | field[] | Document-level field definitions. |
| `blockFields` | field[] | Per-content-block field definitions. |
| `hooks` / `callbacks` | object | Supported extension callbacks. |

Malformed IDs, duplicate IDs, invalid fields, unsupported callbacks, and non-function callbacks are rejected. Development-only replacement is available as `{replace: true}` only in a Foundry development environment or when the dedicated debug flag is enabled.

The returned immutable handle contains:

```text
handle.extension   immutable public descriptor
handle.unregister  unregister this extension
```

Unregistering never deletes stored extension data.

## Registered-extension inspection

```javascript
api.hasExtension("example-notes");
api.getExtension("example-notes");
api.getExtensions();
api.unregisterExtension("example-notes");
```

Descriptors are immutable snapshots. Mutable registry collections are not exposed.

## API-version compatibility

```javascript
api.isApiVersionSupported("^1.0.0"); // boolean
api.assertApiVersion("^1.0.0");      // true or throws
```

Supported range forms are exact versions, `*`, `latest`, `1.x`, `1.0.x`, `^`, `~`, `>=`, `>`, `<=`, and `<` followed by a complete semantic version.

## Metadata storage

Extension data is stored inside the existing Illuminated Documents live-document flag:

```json
{
  "flags": {
    "runyth-illuminated-documents": {
      "liveDocument": {
        "schemaVersion": 6,
        "extensions": {
          "example-notes": {
            "schemaVersion": 1,
            "document": {},
            "blocks": {
              "idoc-block-...": {}
            },
            "orphanedBlocks": {}
          }
        }
      }
    }
  }
}
```

Rules:

- Data is namespaced by extension ID.
- Core metadata cannot be overwritten through extension setters.
- Document and block data are separate.
- Unknown extension records and unknown serializable properties are preserved.
- Disabling or uninstalling a companion module does not delete its data.
- Runtime objects, DOM nodes, functions, symbols, big integers, circular structures, and non-finite numbers are rejected.
- Serialized data never contains executable callbacks.

## Public metadata methods

### `getDocumentExtensionData(documentOrUuid, extensionId)`

Returns a deep-cloned document-level object. `documentOrUuid` may be a Journal Entry, Journal Entry Page, world Journal ID, or resolvable UUID. Throws when the target is not an Illuminated Document or the extension ID is malformed.

### `setDocumentExtensionData(documentOrUuid, extensionId, data)`

Validates and persists document-level data. Requires a registered active extension and GM status or Owner permission for the Journal. Returns the extension record after save. Validation errors reject the update.

### `getBlockExtensionData(documentOrUuid, blockId, extensionId)`

Returns a deep-cloned object for one stable block ID. Throws when the block ID is empty.

### `setBlockExtensionData(documentOrUuid, blockId, extensionId, data)`

Validates and persists one block payload. Requires GM status or Owner permission. Restores matching orphaned metadata when applicable.

### `validateExtensionData(documentOrUuid)`

Runs every active field validator and `validateDocument` callback. Returns structured validation results without mutating data.

### `migrateExtensionData(documentOrUuid, {dryRun = false})`

Runs independent extension migrations. A non-dry run requires GM status or Owner permission. Schema versions advance only after successful callbacks. A dry run returns authoritative metadata unchanged plus a migrated preview.

## Stable content-block identities

Each initial input, appended input, and manually added editor section has a serializable stable ID.

IDs:

- remain stable across text edits, reorder operations, preset changes, close/reopen, export, and import;
- are not array positions;
- are lazily added to old documents without changing visible text;
- are repaired when missing or duplicated;
- are regenerated for document duplication;
- are accompanied by an old-to-new mapping during duplication.

When a block is removed, its extension metadata moves to `orphanedBlocks` instead of being silently destroyed. A duplicate document receives independent block IDs, with every active and unknown extension block record remapped.

## Document fields

```javascript
api.registerExtension({
  id: "example-notes",
  version: "1.0.0",
  documentFields: [{
    key: "category",
    type: "select",
    label: "EXAMPLE.Category",
    hint: "EXAMPLE.CategoryHint",
    default: ({preset}) => preset?.extensions?.["example-notes"]?.document?.category ?? "general",
    required: true,
    choices: async ({currentUser}) => getChoicesFor(currentUser),
    visible: ({isGM}) => isGM,
    disabled: ({editable}) => !editable,
    validate: ({value}) => value ? null : {severity: "error", message: "Choose a category."},
    normalize: (value) => String(value).trim().toLowerCase(),
    order: 20,
    group: "classification"
  }]
});
```

Supported field types:

```text
select, checkbox, text, number, hidden, custom
```

Common properties:

```text
key, type, label, hint, default, required, choices, visible, disabled,
validate, normalize, serialize, order, group, placement, placeholder,
min, max, step, blocking
```

`choices`, predicates, defaults, and validators may be synchronous or asynchronous where documented by their calling lifecycle. Dynamic choices are resolved each time context is prepared.

Document defaults resolve in this order:

```text
explicit document value
preset document default
field default
```

## Per-block fields

```javascript
api.registerExtension({
  id: "example-notes",
  version: "1.0.0",
  blockFields: [{
    key: "emphasis",
    type: "checkbox",
    label: "EXAMPLE.Emphasis",
    hint: "Highlight this content section for this viewer.",
    default: false,
    order: 10
  }]
});
```

Block fields appear in an expandable, extension-labelled metadata section on each content card. They remain associated with the stable block ID after reorder operations.

Block defaults resolve in this order:

```text
explicit block value
explicit document value
preset block default
preset document default
field default
```

### Custom fields

A custom field requires `render(context)`. The context includes:

```text
mount, field, value, setValue(value), getValue(), blockId, extensionId
```

Use safe DOM methods and semantic controls. Call `setValue` to participate in the existing save and dirty-state workflow. Returning an `HTMLElement` replaces the mount’s children. Do not inject serialized field values as unsanitized HTML.

## Creation integration

`prepareCreationContext(context)` runs before fields are prepared. Its context includes the application, mode, selected preset, current user, content block, and current extension data.

It may return defaults without mutating private application state:

```javascript
prepareCreationContext: ({preset}) => ({
  documentDefaults: {category: preset?.name ?? "general"},
  blockDefaults: {emphasis: false}
})
```

Defaults fill only missing values and therefore do not overwrite unsaved user input during rerenders.

Creation validation runs before a Journal is created. A validation result with `severity: "error"` and `blocking !== false` prevents creation. Other extension failures are isolated and logged.

## Existing-document editor integration

`prepareEditorContext(context)` runs before editor fields are prepared. The documented context includes:

```text
application, document, documentUuid, currentUser, isGM, editable,
preset, contentBlocks, extensionData
```

Registered document and block fields are displayed using the module’s normal visual language. Changes are persisted through the existing save operation, revision conflict protection, Foundry document permission checks, and capability-aware direct-or-GM-delegated transport.

Preset changes preserve block IDs, order, document metadata, block metadata, and orphaned metadata.

## Preset integration

Active extensions contribute document and block-default fields to the preset manager. No empty extension section is shown when nothing is registered.

Preset precedence is:

```text
field default < preset document default < document value < block value
```

`preparePresetContext(context)` runs before preset fields are prepared.

Preset export/import uses:

```javascript
const payload = await api.exportPreset(presetId);
await api.importPreset(payload, {replace: false});
```

Unknown extension defaults round-trip unchanged. Active `exportMetadata`, `importMetadata`, and `migrateMetadata` callbacks receive `kind: "preset"` where applicable. Existing preset metadata is migrated lazily when opened in the manager and persisted on save.

## Viewer context

`prepareViewerContext(context)` runs for each client before transformations. The context includes:

```text
document, documentUuid, journal, journalPage, contentBlocks,
currentUser, viewer, isGM, application, renderMode, editable,
extensionData, metadata, abortSignal
```

A callback may return a partial context or replacement `contentBlocks`. Each core block contains `id`, `label`, `kind`, `text`, `startOnNewPage`, `createdAt`, and `updatedAt`. Returned block data is copied and is never written to authoritative metadata. When a replacement block retains its stable `id` but omits a core property such as `startOnNewPage`, Illuminated Documents preserves that property from the prepared block.

## Rendering transformation pipeline

```javascript
transformRenderedDocument: async ({
  blockRootElement,
  viewer,
  abortSignal
}) => {
  if (abortSignal.aborted) return;
  for (const section of blockRootElement.querySelectorAll("[data-illuminated-block-id]")) {
    const text = section.querySelector("[data-idoc-block-text]");
    text.textContent = decorateForViewer(text.textContent, viewer);
  }
}
```

The scoped block stage contains:

```html
<section data-illuminated-block-id="idoc-block-..." data-illuminated-block-kind="append">
  <span data-idoc-block-label>...</span>
  <span data-idoc-block-text>...</span>
</section>
```

Guarantees:

- transformations run locally on every viewer client;
- source Markdown and editor text are never replaced;
- synchronous and asynchronous callbacks are supported;
- order is ascending `priority`, then extension ID;
- failures are isolated;
- repeated render signatures are deduplicated;
- prior work is aborted during rerender and window close;
- previews use the same copied block pipeline;
- transforms receive a scoped root, not the global browser document;
- **Show Players** sends a document reference and each receiving client transforms its own view;
- transformed HTML is never persisted as authoritative content.

Transform callbacks may change the copied block text, label, or order. Viewer-context callbacks may also return a viewer-specific `startOnNewPage` value, but omitting it preserves the document's stored page flow. They should check `abortSignal` before and after expensive asynchronous work.

## Cache invalidation and rerendering

```javascript
api.invalidateDocumentRender(documentUuid);
api.invalidateDocumentRender(documentUuid, "example-notes");
await api.rerenderOpenDocumentViews(documentUuid);
await api.rerenderOpenDocumentViews(); // all open illuminated views
```

Public invalidation is client-local and extension-aware. It invalidates Illuminated Documents' host-owned render signature only; it deliberately does **not** invoke the calling extension's `invalidateCache` callback. This directionality prevents extension-to-host invalidation from immediately calling the same extension back.

Illuminated Documents invokes registered `invalidateCache` callbacks only for host-originated events such as authoritative document updates. An `invalidateCache` callback must clear only extension-owned transient state and must not be required to call `invalidateDocumentRender` in response. A defensive re-entrancy guard isolates accidental callback cycles.

## Validation

```javascript
validateDocument: ({extensionData, contentBlocks}) => [{
  severity: "warning",
  fieldPath: "extensions.example-notes.document.category",
  blockId: contentBlocks[0]?.id ?? "",
  message: "This document uses the default category.",
  localizationKey: "EXAMPLE.DefaultCategory",
  repairAction: {id: "choose-category"},
  blocking: false
}]
```

Severity is `error`, `warning`, or `info`. Results can be document-level or block-level. A broken validator does not stop other validators. Validation emits `illuminatedDocumentsExtensionValidation`.

Repair actions are descriptive serialized data; Illuminated Documents does not execute code from stored validation results.

## Migrations

```javascript
migrateMetadata: ({
  storedSchemaVersion,
  targetSchemaVersion,
  documentData,
  blockData,
  orphanedBlockData,
  document,
  documentUuid,
  dryRun
}) => ({
  documentData: migrateDocument(documentData),
  blockData: migrateBlocks(blockData),
  orphanedBlockData
})
```

Migrations:

- run only for installed, compatible extensions;
- preserve a cloned backup;
- advance the extension schema version only on success;
- are idempotent after advancement;
- can run lazily when a document opens;
- can run programmatically or as a dry run;
- do not migrate unknown extension data;
- do not block a document from opening when they fail.

## Import, export, and duplication

```javascript
const exportPayload = await api.exportDocument(journalOrUuid);
const importedJournal = await api.importDocument(exportPayload, options); // GM only
const {journal: copy, blockIdMap} = await api.duplicateDocument(journalOrUuid, options); // GM only
```

Export payloads include core metadata, content blocks and IDs, extension IDs, extension schema versions, unknown extension records, and ownership.

`exportMetadata(context)` may replace its extension record in the export copy. `importMetadata(context)` may normalize its extension record after structural validation. Missing extensions are allowed and remain preserved.

Duplication creates a new Journal identity and new content-block IDs. Extension block metadata is remapped. `onDocumentCreated` receives `duplicatedFrom` and `blockIdMap` so active extensions can update external references if needed.

## Document lifecycle callbacks

Supported callbacks:

```text
prepareCreationContext
prepareEditorContext
preparePresetContext
prepareViewerContext
transformRenderedDocument
validateDocument
onDocumentCreated
onDocumentUpdated
onDocumentDeleted
exportMetadata
importMetadata
migrateMetadata
invalidateCache
```

Every callback receives `extensionId` and only that extension’s cloned `extensionData` where applicable. Lifecycle callbacks cannot access mutable registry internals.

## Hooks and payloads

Stable hooks:

| Hook | Payload |
|---|---|
| `illuminatedDocumentsApiInit` | Immutable public API object. |
| `illuminatedDocumentsApiReady` | Immutable public API object. |
| `illuminatedDocumentsExtensionRegistered` | Immutable extension descriptor. |
| `illuminatedDocumentsExtensionUnregistered` | Immutable extension descriptor. |
| `illuminatedDocumentsBeforeExtensionTransform` | Immutable summary: document UUID, render mode, ordered extension IDs. |
| `illuminatedDocumentsAfterExtensionTransform` | Immutable summary: document UUID, render mode, transformed block IDs. |
| `illuminatedDocumentsExtensionValidation` | Immutable document UUID and validation results. |
| `illuminatedDocumentsExtensionDataChanged` | Immutable document UUID, update reason, extension IDs. |

Hook payloads are informational unless explicitly stated. Mutating them is unsupported.

## Permissions and sockets

- Reads require normal Foundry access to the Journal.
- Metadata writes require GM status or Journal Owner permission.
- Creation and editing continue to use the module’s granular player permission model.
- Creation, extension, and full editor saves by players use direct Foundry Journal writes when `JournalEntry.canUserCreate(user)` or `journal.canUserModify(user, "update")` permits them. The active-GM socket is only an elevation fallback when those Foundry capabilities are unavailable. Direct metadata setter calls continue to require normal Journal Owner permission.
- GM-only import, duplication, folder, preset-sharing, and template-sharing boundaries remain unchanged.
- Extension callbacks execute only from installed JavaScript registrations, never from serialized flags or imports.

## Error handling

All callbacks pass through a shared safe executor. Failures record:

```text
extension ID, callback name, message, document UUID when available, timestamp
```

Repeated identical errors are throttled in the console. One broken extension does not stop unrelated extensions. The GM can review and copy a sanitized report from **Configure Settings → Illuminated Documents → Storage & Naming → Extension diagnostics**.

## Diagnostics

The diagnostics section shows API version, lifecycle, registered ID/version, status, capabilities, field count, callback count, compatibility warning, late-registration state, and last error.

Actions:

```text
Copy diagnostic report
Validate extension data
Rerender open documents
Clear transient caches
```

The report excludes raw registry objects and document contents.

## Minimal companion example

A complete minimal source tree is included under:

```text
docs/examples/minimal-companion/
```

It attaches a document label and block emphasis flag, then decorates copied rendered blocks for the current viewer. It deliberately contains no Polyglot integration, language rules, or system-specific logic.
