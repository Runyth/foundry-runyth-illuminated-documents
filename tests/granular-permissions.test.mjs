// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

let randomCounter = 0;
Object.defineProperty(globalThis, "crypto", { value: { randomUUID: () => `uuid-${++randomCounter}` }, configurable: true });
globalThis.foundry = {
  utils: {
    randomID: () => `random-${++randomCounter}`,
    deepClone: (value) => structuredClone(value)
  }
};

const gm = { id: "gm", name: "GM", isGM: true, isActiveGM: true };
const player = { id: "player-1", name: "Player 1", isGM: false };
const other = { id: "player-2", name: "Player 2", isGM: false };

const values = new Map([
  ["templates", {
    parchment: {
      id: "parchment",
      name: "Parchment",
      background: "parchment.webp",
      width: 1200,
      height: 1600,
      regions: [{ id: "main", label: "Main" }]
    }
  }],
  ["presets", {
    chronicle: {
      id: "chronicle",
      name: "Chronicle",
      leftTemplateId: "parchment",
      rightTemplateId: "parchment"
    }
  }],
  ["allowedUsers", [player.id]],
  ["userPermissions", {}],
  ["permissionModelVersion", 0],
  ["presetRevision", 0],
  ["templateRevision", 0]
]);

globalThis.game = {
  user: gm,
  users: new Map([[gm.id, gm], [player.id, player], [other.id, other]]),
  i18n: { localize: (key) => key },
  settings: {
    get: (_moduleId, key) => values.get(key),
    set: async (_moduleId, key, value) => {
      values.set(key, structuredClone(value));
      return value;
    }
  }
};

const permissions = await import("../scripts/permissions.js");
const presets = await import("../scripts/presets.js");
const templates = await import("../scripts/template-library.js");

assert.equal(await permissions.migrateGranularPermissions(), true);
assert.equal(permissions.canCreateDocuments(player), true);
assert.equal(permissions.canManagePresets(player), false);
assert.equal(permissions.canManageTemplates(player), false);
assert.deepEqual(values.get("presets").chronicle.allowedUserIds, [player.id]);
assert.equal(values.get("presets").chronicle.accessMode, "selected-users");
assert.equal(values.get("templates").parchment.accessMode, "gm-only");

await permissions.savePermissionMap({
  [player.id]: { createDocuments: true, managePresets: true, manageTemplates: true },
  [other.id]: { createDocuments: false, managePresets: false, manageTemplates: false }
});

values.set("templates", {
  ...values.get("templates"),
  parchment: {
    ...values.get("templates").parchment,
    accessMode: "selected-users",
    allowedUserIds: [player.id]
  }
});

const sharedPreset = presets.getPresets().chronicle;
assert.equal(permissions.canUsePreset(sharedPreset, player), true);
assert.equal(permissions.canManagePresetResource(sharedPreset, player), true);
assert.equal(permissions.canUsePreset(sharedPreset, other), false);

// Add an inaccessible GM-only preset and verify a player save cannot alter it.
values.set("presets", {
  ...values.get("presets"),
  secret: {
    id: "secret",
    name: "Secret",
    leftTemplateId: "parchment",
    rightTemplateId: "parchment",
    accessMode: "gm-only",
    allowedUserIds: []
  }
});

const presetResult = await presets.applyPresetChangesForUser({
  expectedRevision: 0,
  originalIds: ["chronicle"],
  presets: {
    chronicle: {
      ...presets.getPresets().chronicle,
      name: "Player Chronicle",
      accessMode: "selected-users",
      allowedUserIds: [other.id]
    },
    "player-created": {
      id: "player-created",
      name: "Player Created",
      leftTemplateId: "parchment",
      rightTemplateId: "parchment",
      accessMode: "gm-only",
      allowedUserIds: []
    }
  }
}, player);

assert.equal(values.get("presets").secret.name, "Secret");
assert.equal(values.get("presets").chronicle.name, "Player Chronicle");
assert.deepEqual(values.get("presets").chronicle.allowedUserIds, [player.id]);
assert.equal(values.get("presets")["player-created"].accessMode, "selected-users");
assert.deepEqual(values.get("presets")["player-created"].allowedUserIds, [player.id]);
assert.equal(presetResult.revision, 1);
assert.equal(Object.hasOwn(presetResult.presets, "secret"), false);

// Share one template with the player, keep another GM-only, then verify merge safety.
values.set("templates", {
  ...values.get("templates"),
  parchment: {
    ...values.get("templates").parchment,
    accessMode: "selected-users",
    allowedUserIds: [player.id]
  },
  "secret-template": {
    id: "secret-template",
    name: "Secret Template",
    background: "secret.webp",
    width: 1200,
    height: 1600,
    regions: [{ id: "main", label: "Main" }],
    accessMode: "gm-only",
    allowedUserIds: []
  }
});

const templateResult = await templates.applyTemplateChangesForUser({
  expectedRevision: 0,
  originalIds: ["parchment"],
  templates: {
    parchment: {
      ...values.get("templates").parchment,
      name: "Player Parchment",
      accessMode: "selected-users",
      allowedUserIds: [other.id]
    },
    "player-template": {
      id: "player-template",
      name: "Player Template",
      background: "player.webp",
      width: 1000,
      height: 1400,
      regions: [{ id: "main", label: "Main" }],
      accessMode: "gm-only",
      allowedUserIds: []
    }
  }
}, player);

assert.equal(values.get("templates")["secret-template"].name, "Secret Template");
assert.equal(values.get("templates").parchment.name, "Player Parchment");
assert.deepEqual(values.get("templates").parchment.allowedUserIds, [player.id]);
assert.equal(values.get("templates")["player-template"].accessMode, "selected-users");
assert.deepEqual(values.get("templates")["player-template"].allowedUserIds, [player.id]);
assert.equal(templateResult.revision, 1);
assert.equal(Object.hasOwn(templateResult.templates, "secret-template"), false);

await assert.rejects(
  () => presets.applyPresetChangesForUser({
    expectedRevision: 1,
    originalIds: ["player-created"],
    presets: {
      "player-created": {
        ...values.get("presets")["player-created"],
        leftTemplateId: "secret-template"
      }
    }
  }, player),
  /not shared with this player/
);

await assert.rejects(
  () => templates.applyTemplateChangesForUser({
    expectedRevision: 1,
    originalIds: ["parchment"],
    templates: {}
  }, player),
  /still used by/
);

await assert.rejects(
  () => presets.applyPresetChangesForUser({ presets: {}, originalIds: [], expectedRevision: 1 }, other),
  /may not manage book presets/
);
await assert.rejects(
  () => templates.applyTemplateChangesForUser({ templates: {}, originalIds: [], expectedRevision: 1 }, other),
  /may not manage visual templates/
);

console.log("granular permission tests passed");
