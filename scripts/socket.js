// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { MODULE_ID } from "./settings.js";

const pending = new Map();
const REQUEST_TIMEOUT_MS = 20000;
const PROCESSED_REQUEST_TTL_MS = 60000;
const processedGmRequests = new Map();

function newRequestId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function clearPendingRequest(requestId) {
  const request = pending.get(requestId);
  if (!request) return null;
  clearTimeout(request.timeout);
  pending.delete(requestId);
  return request;
}


function pruneProcessedRequests(now = Date.now()) {
  for (const [key, record] of processedGmRequests) {
    if (now - record.createdAt > PROCESSED_REQUEST_TTL_MS) processedGmRequests.delete(key);
  }
  while (processedGmRequests.size > 256) processedGmRequests.delete(processedGmRequests.keys().next().value);
}

export function validateGmRequestEnvelope(message, allowedActions = []) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return false;
  if (!allowedActions.includes(message.action)) return false;
  if (typeof message.requestId !== "string" || !message.requestId.trim()) return false;
  if (typeof message.requesterId !== "string" || !message.requesterId.trim()) return false;
  if (typeof message.targetGmId !== "string" || !message.targetGmId.trim()) return false;
  if (message.payload === null || typeof message.payload !== "object" || Array.isArray(message.payload)) return false;
  return true;
}

/**
 * Execute a GM-authoritative request at most once per requester/request ID.
 * Replayed socket packets receive the cached result without repeating writes.
 */
export async function processGmRequestOnce(message, operation) {
  pruneProcessedRequests();
  const key = `${message.requesterId}:${message.requestId}`;
  const cached = processedGmRequests.get(key);
  if (cached) return { ...(await cached.promise), replayed: true };

  const promise = Promise.resolve()
    .then(operation)
    .then((result) => ({ ok: true, result: result || {} }))
    .catch((error) => ({ ok: false, error: String(error?.message || error) }));
  processedGmRequests.set(key, { createdAt: Date.now(), promise });
  return { ...(await promise), replayed: false };
}

export function clearProcessedGmRequests() {
  processedGmRequests.clear();
}

/**
 * Send a privileged operation to Foundry's designated active GM.
 *
 * The module manifest must declare `"socket": true` so Foundry registers the
 * reserved `module.runyth-illuminated-documents` channel.
 */
export function requestFromActiveGm(action, payload) {
  const activeGm = game.users.activeGM;
  if (!activeGm) {
    return Promise.reject(new Error("No active Game Master is available to perform this Illuminated Documents operation."));
  }

  const requestId = newRequestId();
  const message = {
    action,
    payload,
    requestId,
    requesterId: game.user.id,
    targetGmId: activeGm.id
  };

  return new Promise((resolve, reject) => {
    // Register the pending request before emitting. This avoids losing a very
    // fast response on local or low-latency Foundry installations.
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(
        "The Game Master did not respond to the Illuminated Documents request. "
        + "Confirm that a GM is connected and that the same current Illuminated Documents version is enabled for every client."
      ));
    }, REQUEST_TIMEOUT_MS);

    pending.set(requestId, { resolve, reject, timeout, targetGmId: activeGm.id });

    try {
      game.socket.emit(`module.${MODULE_ID}`, message);
    } catch (error) {
      clearPendingRequest(requestId);
      reject(new Error(`Unable to send the Illuminated Documents request to the Game Master: ${error.message}`));
    }
  });
}

export function acceptGmResponse(message) {
  if (message?.action !== "requestResult" || message.targetUserId !== game.user.id) return false;
  const request = pending.get(message.requestId);
  if (!request) return true;
  if (message.sourceGmId !== request.targetGmId) return false;
  clearPendingRequest(message.requestId);
  if (message.ok) request.resolve(message.result || {});
  else request.reject(new Error(message.error || "The Game Master rejected the request."));
  return true;
}

export function sendGmResponse(message, { ok, result = {}, error = "" }) {
  game.socket.emit(`module.${MODULE_ID}`, {
    action: "requestResult",
    requestId: message.requestId,
    targetUserId: message.requesterId,
    sourceGmId: game.user.id,
    ok,
    result,
    error
  });
}

export function isRequestForThisActiveGm(message) {
  if (!game.user?.isActiveGM) return false;
  if (message?.targetGmId && message.targetGmId !== game.user.id) return false;
  return true;
}
