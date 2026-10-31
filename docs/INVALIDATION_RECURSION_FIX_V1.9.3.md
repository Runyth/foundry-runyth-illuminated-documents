# Cache Invalidation Recursion Fix — v1.9.3

## Live finding

A Foundry VTT V13 browser log showed `RangeError: Maximum call stack size exceeded` alternating between Illuminated Documents `ExtensionRenderService.invalidate` and Illuminated Languages `invalidateCache`. The host notified the extension to clear its cache; the extension called the public host invalidation API; the host then notified the same extension again.

## Correction

- Public `game.illuminatedDocuments.api.invalidateDocumentRender(...)` now invalidates host render state without invoking extension callbacks.
- Internal host-originated invalidations still notify relevant extensions.
- `ExtensionRenderService` tracks active callback pairs by document UUID and extension ID and suppresses re-entry.
- The extension API version remains `1.0.0`; method names, arguments, and return behavior remain compatible.

## Data compatibility

No flags, metadata, block IDs, settings, presets, templates, permissions, or Journal data change. No migration is required.

## Unrelated log findings

The same world log attributes additional warnings and errors to other packages, including deprecated globals, duplicate custom-element registration, jQuery assumptions in `playlist_import`, record/array misuse in `objects-interactions-fx`, deprecated Chat hooks, and other package-specific failures. Illuminated Documents does not patch or suppress those external errors.
