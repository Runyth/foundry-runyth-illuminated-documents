# Quality and Resilience Audit — v1.10.1

## Scope

Version 1.10.1 was audited from the complete accepted v1.10.0 source repository. The audit covered all ApplicationV2 windows, form actions, file selection, render callbacks, window persistence, responsive layout, accessibility, extension integration, sockets, document creation and extension, and deterministic packaging.

## Corrections

### Application lifecycle

- Window geometry is still stored on close, but a failed client-setting write is logged and no longer prevents the ApplicationV2 window from closing.
- Module-triggered rerenders from DOM callbacks, Journal updates, dedicated viewers, Scene Controls, and sidebar launchers now contain rejected promises rather than producing unhandled browser errors.
- Existing render-scoped `AbortController` cleanup remains unchanged.

### Authoritative operations

- Creation, extension, editing, permission saves, preset saves, visual-template saves, and storage-setting saves now apply a complete window busy state.
- All module action buttons are disabled during the operation. Controls that were already disabled remain disabled after the operation.
- Duplicate-operation locks remain in place.
- Document Studio closes only after successful creation or extension. Any error before authoritative completion leaves the window open and preserves the current draft.
- Player requests wait briefly for the authoritative GM-created Journal to synchronize locally before attempting to open it. A successful operation is never repeated merely because the local collection was delayed.

### File selection

- The visual-template manager resolves `foundry.applications.apps.FilePicker.implementation` when supplied by Foundry V13 and falls back to the directly exported class where appropriate.
- Empty or cancelled selections are ignored.
- A file callback cannot write into a text region that was removed while the picker was open.
- Existing file browsing, upload support, spaces and special characters in paths, and Foundry permission failures remain handled by the supported picker.

### UI and accessibility

- Every module window now receives the same scoped content-padding and overflow baseline.
- Text inputs, selects, and textareas have consistent internal padding and minimum control height.
- Buttons wrap long labels safely instead of overflowing their border.
- Legacy fixed minimum widths are overridden by responsive module-owned layouts.
- Preset, permission, editor, viewer, storage, and visual-template windows retain their normal desktop layouts and gain safer narrow-window fallbacks.
- Every icon-only Handlebars button now has an accessible name in addition to its tooltip where applicable.

## Intentionally unchanged

- No data migration was added.
- No stored Journal, page, preset, template, permission, setting, folder, naming, extension, or page-flow schema changed.
- Extension API version remains `1.0.0`.
- Manager windows continue to stay open after an ordinary save so users can keep configuring resources. Only the completed New/Extend Document workflow closes automatically.
- No third-party module behavior is patched or suppressed.

## Live acceptance

A live Foundry VTT V13 multi-client world was unavailable in the build environment. The included manual checklist should be used to verify create/extend auto-close, failed-operation retention, FilePicker browsing/upload, narrow layouts, and light/dark-theme readability in-world.
