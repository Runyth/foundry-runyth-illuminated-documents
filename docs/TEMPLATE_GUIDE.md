# Visual Template Authoring Guide

## Region strategy

Use the fewest regions that accurately describe the page.

| Background | Recommended regions |
|---|---:|
| Letter or decree | 1 |
| Scroll with header emblem | 1 main region below the emblem |
| Open two-page book | 2, left then right |
| Form with fixed sections | One region per section |
| Torn fragment | 1 irregular-looking but rectangular safe area |

Regions are rectangular by design. This keeps wrapping deterministic and makes overflow behaviour understandable. For irregular art, define the largest safe rectangle inside the writable surface instead of touching decorative edges.

## Margins

Start with 8–14% outer margins. Use region padding for additional internal breathing room. Avoid positioning text closer than 3% to tears, curls, binding, seals, or dark stains.

## Typography

- Body text: 26–42 px at 1200×1600 output.
- Minimum font size: generally 60–70% of the preferred size.
- Line height: 1.25–1.5.
- Dark brown is generally more natural than pure black on parchment.
- Use justified text only for broad regions. Narrow regions produce distracting gaps.
- Use separate templates when a title needs materially different typography; a future version may support named content fields.

## Two-page book templates

Place the left-page region first and the right-page region second. Text flows left to right, then continues onto a new spread. Keep 6–10% clear around the centre binding.

## File placement

Suggested layout:

```text
Data/
  runyth-illuminated-documents/
    backgrounds/
      books/
      scrolls/
      letters/
    fonts/
    generated/
```

The paths are Foundry Data paths, not operating-system absolute paths.

## Exact source-image dimensions

The ideal source image is always **exactly the same pixel dimensions as the template output canvas**.

| Template output | Perfect source image |
|---:|---:|
| 1200 × 1600 | 1200 × 1600 px |
| 1600 × 1200 | 1600 × 1200 px |
| 2048 × 1536 | 2048 × 1536 px |
| 2400 × 1600 | 2400 × 1600 px |

The module intentionally does not crop or letterbox the source automatically, because either behaviour could hide decorative content or produce unexplained margins. It fills the complete output canvas. A mismatched aspect ratio is therefore stretched. A mismatched resolution with the same ratio is scaled.

Recommended procedure:

1. Decide the final output width and height in the Template Manager.
2. Create, resize, or crop the background externally to those exact dimensions.
3. Upload the finished image.
4. Configure text regions only after the final dimensions are fixed.
5. Avoid changing output dimensions afterward unless the background is replaced with a matching image.

The built-in template uses **1200 × 1600 px**.

## Markdown authoring

Document Studio accepts plain text and common Markdown formatting. Supported constructs are headings, bold, italic, unordered and ordered list items, block quotes, horizontal rules, inline code, and strikethrough. Keep Markdown uncomplicated: nested structures, tables, embedded images, and HTML are intentionally not interpreted by the canvas renderer.

## Player availability and management

Every visual template is either **GM only** or shared with selected players.

Sharing a template does not automatically grant editing rights. A player must also receive the global **Manage templates** capability in the module's Player Permissions window. Conversely, granting **Manage templates** does not expose every template; the player sees and edits only templates explicitly shared with that account.

Player-created templates are initially shared only with their creator. Only a Game Master can change the sharing list. Foundry's own file-browser and upload permissions still control whether that player can browse or upload background and font files.

A visual template cannot be deleted while a book preset still references it. Change or remove those preset references first.
