# Player Writes Without an Active GM — v1.10.3

## Problem

Previous releases treated all non-GM document creation, extension, and editing as privileged operations and always called `requestFromActiveGm()`. A player could therefore have both Illuminated Documents permission and sufficient Foundry Journal permissions yet still be unable to save when no GM was connected.

## Corrected routing

Document writes now use Foundry's own V13 capability model first:

- creation checks `JournalEntry.canUserCreate(game.user)`;
- extension and editing check `journal.canUserModify(game.user, "update")`;
- module-specific Create Documents and Journal ownership checks remain in force;
- caller-controlled `ownerId` and `requesterId` values are replaced by the current player identity;
- GM delegation is used only when the Foundry capability check says the client cannot perform the write directly.

The existing active-GM socket path remains available for those elevated cases and retains its target-GM validation, malformed-payload rejection, and replay protection.

## Offline behavior

When no GM is connected:

- a player whose Foundry role can create Journal Entries can create an Illuminated Document directly;
- an Owner can extend and edit that Illuminated Document directly;
- extension document fields and block fields persist through the same metadata model;
- the newly created document remains owned by its creator;
- the resulting document can be reopened from the normal Journal collection;
- if the configured managed default folder does not already exist, the existing non-GM folder resolver falls back to the Journal root rather than failing the document creation;
- a player who lacks the required Foundry capability receives an actionable permission error without emitting an impossible GM request.

Preset and visual-template collection saves still require a GM because they modify restricted world settings.

## Compatibility

No stored flags, presets, templates, content blocks, page-flow metadata, extension payloads, socket message formats, or extension API methods changed. Extension API version remains `1.0.0`. No migration is required.
