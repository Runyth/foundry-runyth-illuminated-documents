# Compatibility and Interference Audit — v1.9.2

Audit date: 2026-07-29
Authoritative baseline: accepted v1.9.1 reproducible source repository
Target: Foundry VTT v13

## Scope

The complete production source tree was reviewed for hook ownership, ApplicationV2 lifecycle behavior, DOM assumptions, event listener lifetime, CSS scope, Journal integration, Scene Controls, sockets, permissions, initialization, public API stability, stored data, and optional-integration failure isolation.

Illuminated Documents does not implement Actor-sheet controls, Item-sheet controls, Token HUD controls, Chat render hooks/cards, PIXI/canvas overlays, raw keyboard shortcuts, Tidy 5e sheet injection, or D&D 5e-specific sheet augmentation. Those areas were still searched and are covered by static absence tests because the correct isolation behavior is to inject nothing into them.

## Issues found and corrected

| Issue | Affected files | Root cause | Correction |
|---|---|---|---|
| ApplicationV2 code still depended on a jQuery facade | `application-v2.js`, all editable application classes | `_html()` wrapped the native V2 root in `$()`, and application code used jQuery event/query APIs | Added native DOM helpers; `_html()` now returns the native application root; all queries, value reads, class updates, and listeners use native DOM APIs |
| Listeners could be rebound after every full or partial render | `application-v2.js`, application classes | V2 rerenders recreated DOM while listeners had no common lifecycle cleanup | Added a render-scoped `AbortController` and `_listen()` helper; previous-render listeners are aborted before rerender and on close |
| Visual-template drag listeners could outlive the window | `template-manager.js` | Temporary `window` mouse listeners were not tied to a close-safe lifecycle | Added a dedicated abortable pointer session, replacement on each drag, and close cleanup |
| Journal V2 integration used a generic hook without a sufficiently explicit primary-sheet gate | `main.js` | The hook correctly used module flags but could still inspect application objects more broadly than necessary | Added a positive primary Journal sheet predicate requiring the backing document, ApplicationV2/DocumentSheetV2 support, Journal document type, and Illuminated Documents flags |
| Generic close handling touched every V2 application | `main.js` | `closeApplicationV2` cancelled render state for all applications | Restricted cleanup to Illuminated Documents applications and eligible primary illuminated Journal sheets |
| Scene Control tool registration did not fully describe a V13 record-based tool | `main.js` | The tool entry lacked explicit order/visibility and needed a stable keyed replacement strategy | Registers one `notes.tools.illuminatedDocuments` record with stable name, order, visibility, button semantics, and callback; no array `push` assumption |
| Journal directory listeners and controls required stronger idempotence guarantees | `main.js` | Repeated directory renders are normal in Foundry | Native controls are inserted only when absent; the delegated double-click handler has a dataset guard |
| Player-to-GM operations could be replayed | `socket.js`, `main.js` | A duplicated socket packet could repeat an authoritative create/edit/save operation | Added validated request envelopes and a bounded TTL replay cache keyed by requester/request ID; replayed packets receive the cached result without repeating writes |
| GM responses were not tied to the originally selected GM | `socket.js` | The pending request tracked only the request ID | Pending requests now retain the target GM ID and reject responses from another client |
| Custom Show Players socket messages did not identify the GM sender | `viewer.js`, `main.js` | Recipient clients trusted the module channel action alone | Messages now include `sourceGmId`; recipients accept only an active GM sender and still require normal Journal visibility |
| Direct public mutation helpers did not mirror UI capability boundaries | `main.js` | UI and socket paths validated permissions, while direct helpers were less explicit | Template/preset saves require their granular management capability; direct Journal create/edit/extend remains GM-authoritative without changing method signatures |
| Optional initialization failures could obscure unrelated startup work | `main.js` | Settings, partial loading, API setup, migrations, and socket setup were not all isolated equally | Added subsystem-specific error boundaries and one-time socket registration while preserving visible diagnostics |

## Hook ownership

Registered production hooks after the patch:

- `init` and `ready` — one-time module lifecycle registration;
- `renderJournalDirectory` — module-owned Journal sidebar launchers and preferred-view handling;
- `getSceneControlButtons` — one module-owned tool in the Notes control group;
- `renderApplicationV2` — narrowly gated illuminated Journal rendering;
- `closeApplicationV2` — narrowly gated render cancellation;
- `getHeaderControlsApplicationV2` — narrowly gated Edit Book and Show Players controls;
- `updateJournalEntry`, `updateJournalEntryPage`, and `deleteJournalEntry` — only module-flagged live-document lifecycle work.

There are no broad V1 application hooks, Actor/Item sheet hooks, Token HUD hooks, Chat render hooks, or canvas lifecycle hooks.

## CSS isolation

Every production selector is rooted in one of:

- a module-owned `#illuminated-*` application ID;
- a module-owned `.idoc-*` class;
- a module-owned `.illuminated-*` integration class.

No global rule begins with `.window-header`, `.window-content`, `.application`, `.form-group`, `.tabs`, `.tab`, `.sr-only`, `button`, `input`, `select`, `label`, `body`, `html`, or `*`.

Header actions are prepended to Foundry's control list and deduplicated, leaving native controls, including the ellipsis and close controls, farthest right.

## Actor, Item, Tidy, Token HUD, Chat, and canvas result

No module-owned integration exists in these areas. Consequently:

- advancement, level-up, rest, roll, activity, effect, importer, and migration windows cannot receive Illuminated Documents Actor/Item controls;
- core D&D 5e, Tidy Modern, Tidy Classic, synthetic Actors, and unsupported sheets are not modified;
- Token HUD rerenders cannot duplicate module controls or listeners;
- the module creates no Chat cards and registers no Chat render hook;
- the module creates no PIXI display objects and modifies no Token nameplate;
- no keybinding is registered or intercepted.

No unrelated integration was added merely to satisfy the audit checklist.

## Public API and data compatibility

- Existing public method names and signatures are unchanged.
- Extension API version remains `1.0.0`; no public extension contract changed.
- `game.illuminatedDocuments.api` and `game.modules.get("runyth-illuminated-documents").api` remain exposed during `init` and announced at deterministic lifecycle points.
- Existing Journals, flags, content-block IDs, extension metadata, presets, templates, settings, permissions, folders, naming formats, and window geometry require no migration.
- Disabling the module leaves stored Foundry Documents and flags intact.

## Intentionally unchanged behavior

- The generic `renderApplicationV2` and header-control hooks remain because Foundry exposes multiple supported Journal V2 sheet implementations. They are now guarded by positive sheet, document, and module-flag checks.
- The Notes Scene Control continues to open ID Studio for permitted users.
- Show Players continues to render per recipient client and respects the configured viewing mode.
- No behavior from other packages is monkey-patched or suppressed.

## External errors

No browser log from another package accompanied this audit request, so no specific external runtime error could be attributed. The source audit found no reason to add workarounds for other modules. Errors originating from other module paths remain the responsibility of those packages.

## Remaining limitation

A live Foundry VTT v13 world with connected GM/player browsers and the requested representative module set was not available in the build environment. Automated, static, extracted-archive, and mocked ApplicationV2 validation passed. The repository includes a complete live acceptance checklist for a cloned world.
