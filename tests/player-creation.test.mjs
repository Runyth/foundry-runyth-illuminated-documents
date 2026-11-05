// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleManifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
assert.equal(moduleManifest.version, "1.12.5");
assert.equal(moduleManifest.socket, true, "The module socket namespace must be enabled for player-to-GM requests.");

const mainSource = await readFile(new URL("../scripts/main.js", import.meta.url), "utf8");
assert.match(mainSource, /isRequestForThisActiveGm/);
assert.match(mainSource, /ownerId:\s*requester\.id/);

const emitted = [];
globalThis.game = {
  user: { id: "player-1", isActiveGM: false },
  users: {
    activeGM: { id: "gm-1" }
  },
  socket: {
    emit(channel, message) {
      emitted.push({ channel, message });
    }
  }
};

const socketModule = await import(`../scripts/socket.js?test=${Date.now()}`);
const request = socketModule.requestFromActiveGm("createLiveJournal", { text: "Session log" });
assert.equal(emitted.length, 1);
assert.equal(emitted[0].channel, "module.runyth-illuminated-documents");
assert.equal(emitted[0].message.requesterId, "player-1");
assert.equal(emitted[0].message.targetGmId, "gm-1");

const accepted = socketModule.acceptGmResponse({
  action: "requestResult",
  requestId: emitted[0].message.requestId,
  targetUserId: "player-1",
  sourceGmId: "gm-1",
  ok: true,
  result: { journalId: "journal-1" }
});
assert.equal(accepted, true);
assert.deepEqual(await request, { journalId: "journal-1" });

const secondRequest = socketModule.requestFromActiveGm("createLiveJournal", { text: "Second log" });
const secondMessage = emitted.at(-1).message;
assert.equal(socketModule.acceptGmResponse({
  action: "requestResult",
  requestId: secondMessage.requestId,
  targetUserId: "player-1",
  sourceGmId: "not-the-target-gm",
  ok: true,
  result: { journalId: "forged" }
}), false, "responses from a different client must be rejected");
assert.equal(socketModule.acceptGmResponse({
  action: "requestResult",
  requestId: secondMessage.requestId,
  targetUserId: "player-1",
  sourceGmId: "gm-1",
  ok: true,
  result: { journalId: "journal-2" }
}), true);
assert.deepEqual(await secondRequest, { journalId: "journal-2" });

game.user = { id: "gm-1", isActiveGM: true };
assert.equal(socketModule.isRequestForThisActiveGm({ targetGmId: "gm-1" }), true);
assert.equal(socketModule.isRequestForThisActiveGm({ targetGmId: "gm-2" }), false);

game.user = { id: "assistant-1", isActiveGM: false };
assert.equal(socketModule.isRequestForThisActiveGm({ targetGmId: "assistant-1" }), false);

const allowedActions = ["createLiveJournal"];
const validEnvelope = {
  action: "createLiveJournal",
  requestId: "request-1",
  requesterId: "player-1",
  targetGmId: "gm-1",
  payload: { text: "Session log" }
};
assert.equal(socketModule.validateGmRequestEnvelope(validEnvelope, allowedActions), true);
assert.equal(socketModule.validateGmRequestEnvelope({ ...validEnvelope, action: "unknown" }, allowedActions), false);
assert.equal(socketModule.validateGmRequestEnvelope({ ...validEnvelope, requestId: "" }, allowedActions), false);
assert.equal(socketModule.validateGmRequestEnvelope({ ...validEnvelope, payload: [] }, allowedActions), false);

socketModule.clearProcessedGmRequests();
let executions = 0;
const firstResult = await socketModule.processGmRequestOnce(validEnvelope, async () => {
  executions += 1;
  return { journalId: "journal-once" };
});
const replayResult = await socketModule.processGmRequestOnce(validEnvelope, async () => {
  executions += 1;
  return { journalId: "journal-duplicate" };
});
assert.equal(executions, 1, "a replayed request must not repeat the privileged write");
assert.deepEqual(firstResult, { ok: true, result: { journalId: "journal-once" }, replayed: false });
assert.deepEqual(replayResult, { ok: true, result: { journalId: "journal-once" }, replayed: true });

console.log("Player creation socket tests passed");
