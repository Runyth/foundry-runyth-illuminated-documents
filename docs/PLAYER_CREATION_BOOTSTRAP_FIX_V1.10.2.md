# Player Creation Bootstrap Fix — v1.10.2

## Reported failure

A permitted non-GM player could open Document Studio and reach the extension-enabled creation workflow, but the browser failed independent ESM requests for:

- `modules/runyth-illuminated-documents/scripts/extensions/registry.js`
- `modules/runyth-illuminated-documents/scripts/extensions/fields.js`

The authoritative v1.10.1 installable archive contains both files, so the release ZIP was not deterministically omitting them. Nevertheless, the production extension bootstrap depended on both files as separate browser requests, meaning a deployed, cached, or partially synchronized player client could lose the complete creation subsystem when either request failed.

## Correction

The creation-critical registry and field-service implementations now live in `scripts/extensions/runtime.js`, which was already a required production dependency. `runtime.js` no longer imports `registry.js` or `fields.js`.

The two historical files remain present as compatibility re-exports for source consumers and tests. They are no longer part of the browser module graph rooted at `scripts/main.js` and therefore are not required to initialize extension-aware document creation.

No public extension API method or extension API version changed.

## Release guards

The release pipeline now verifies the actual installable ZIP's recursive ESM graph starting at every manifest `esmodules` entry. It fails if:

- a referenced runtime module is missing from the archive;
- a relative import escapes the module root;
- player startup again gains a direct dependency on `extensions/registry.js` or `extensions/fields.js`.

A dedicated non-GM bootstrap test also verifies registration, dynamic extension choices, document/block field preparation, form capture, and extension validation with a player user context.

The existing socket regression suite continues to verify the player-to-active-GM creation request and targeted response path.

## Data compatibility

No flags, settings, Journals, presets, templates, block identities, extension metadata, permissions, or socket payload schemas changed. No world migration is required.
