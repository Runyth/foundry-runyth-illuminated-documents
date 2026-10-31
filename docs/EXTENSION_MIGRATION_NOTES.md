# Extension Framework Migration Notes

## Core upgrade

Illuminated Documents 1.9.0 raises the live-document core schema marker to 6. Existing flags are accepted unchanged and normalized lazily.

No manual migration is required.

## Existing content blocks

- Existing structured blocks keep valid IDs.
- Missing IDs receive deterministic document-scoped IDs.
- Duplicate IDs are repaired without changing visible text.
- Reordering and preset changes do not regenerate IDs.
- Lazy ID repair is persisted only when the current user may update the Journal.

## Existing extension-free documents

Documents without an `extensions` object behave exactly as before. An empty object is added only when metadata is next normalized or saved.

## Unknown extension data

Unknown, disabled, or uninstalled extension namespaces are preserved. Their callbacks are never executed while unregistered. Reinstalling the companion module restores access to the existing data.

## Extension schema migrations

Extension schema versions are independent from the Illuminated Documents core schema. A migration callback must return migrated data before its schema version advances. Failures retain the original record and remain visible in diagnostics.

## Presets

Old presets remain valid. Extension defaults are optional. Active extension preset metadata is migrated when the preset manager opens and is persisted with the next normal preset save.

## Export format

The extension-capable document export format is `runyth-illuminated-documents-export` version 1. It includes stable blocks and extension records. Imports without the owning extension installed are supported.

## Rollback consideration

Older Illuminated Documents releases ignore unknown `extensions` data but may not preserve it when rewriting a document. Back up the world before downgrading from 1.9.0 to a pre-extension release.
