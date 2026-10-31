# Extension Architecture

The framework is divided into cohesive services:

| Component | Responsibility |
|---|---|
| `extensions/runtime.js` | Atomic production bootstrap, registration validation, extension-field preparation/capture, service composition, lifecycle phase and diagnostics. |
| `extensions/safe-executor.js` | Callback isolation, throttled logging and last-error state. |
| `extensions/metadata.js` | Namespaced serializable storage, stable IDs, orphaning and remapping. |
| `extensions/registry.js`, `extensions/fields.js` | Compatibility re-exports for source consumers; not part of the production browser graph. |
| `extensions/validation.js` | Structured field and document validation. |
| `extensions/migrations.js` | Independent extension schema migration. |
| `extensions/rendering.js` | Client-local context preparation, block DOM stage, transformation order, cancellation and cache versions. |
| `extensions/transfer.js` | Safe import/export and duplication remapping. |
| `extensions/api.js` | Frozen supported public facade. |
| `live-render.js` | Integration with the existing canvas page renderer without persisting transformed text. |

The public facade is intentionally narrower than internal services. Companion modules must not import internal files.

## Data flow

```text
stored Journal flags
  → core normalization and stable-ID repair
  → extension migration
  → viewer context preparation
  → scoped copied block DOM
  → deterministic extension transforms
  → copied transformed text
  → existing Markdown/canvas renderer
  → current client view
```

The authoritative stored source never passes back from the transformation stage.

## Security boundaries

- Serialized data is plain JSON-compatible data.
- Extension IDs and field keys are validated.
- Document creation and updates use Foundry capability and ownership checks first; the active-GM request path is retained only as an elevation fallback when the current player cannot perform the Journal write directly.
- Imports do not instantiate callbacks.
- Only installed modules can register executable functions.
- Field values are rendered through escaped Handlebars controls or extension-owned safe DOM code.

## Compatibility limitations

- Canvas-rendered text does not expose visual line-level DOM nodes. The stable hidden block stage is the supported targeting surface before canvas composition.
- Custom field components are trusted installed-module code and are responsible for semantic markup and accessibility beyond the provided mount and state methods.
- Live Foundry V13 browser interaction must still be verified in a real world because automated tests use targeted runtime mocks for Foundry-owned classes.
