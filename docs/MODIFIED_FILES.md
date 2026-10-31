# Files Modified for 1.12.0

## Runtime

- `module.json` — feature-release version.
- `scripts/documents.js` — chapter-mode metadata, section labels, deterministic chapter-page sources, stable section/page synchronization, create/edit/extend/import/duplicate integration.
- `scripts/studio.js` — new-document chapter option, initial section name, appended section name, and persistence through create/extend payloads and previews.
- `scripts/document-editor.js` — editable chapter-mode state, preview preservation, and save payload support.
- `scripts/live-render.js` — chapter-scoped block rendering, Journal-page render context, and first/last cover overrides without altering authoritative metadata.
- `scripts/main.js` — chapter-aware Journal/ApplicationV2 rendering, stable chapter-page resolution, update rerendering, and module version.
- `templates/studio.hbs` — creation chapter option and section-name fields.
- `templates/document-editor.hbs` — Journal chapter structure control.
- `styles/runyth-illuminated-documents.css` — scoped responsive chapter controls.
- `lang/en.json`, `lang/de.json` — exact-parity chapter UI localization.

## Tests

- `tests/journal-chapters.test.mjs` — creation sources, stable page identity, rename/reorder/delete synchronization, conversion in both directions, unrelated-page preservation, duplication, UI controls, and render isolation.
- Version fixtures updated to `1.12.0`.

## Repository and documentation

- `package.json`, `package-lock.json` — repository version.
- `README.md`, `CHANGELOG.md` — feature documentation.
- `docs/JOURNAL_SECTION_CHAPTERS_V1.12.0.md` — design, persistence, rendering, and compatibility contract.
- `docs/TEST_RESULTS.md` — validation coverage.
- `docs/MODIFIED_FILES.md` — this file.
- `docs/RELEASE_PROVENANCE.md` — authoritative baseline.
- `docs/MANUAL_COMPATIBILITY_CHECKLIST.md` — live chapter acceptance checks.
