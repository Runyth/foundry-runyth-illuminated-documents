// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { cloneSerializable } from "./utils.js";

const ERROR_THROTTLE_MS = 10_000;

export class ExtensionSafeExecutor {
  constructor() {
    this.errors = new Map();
    this.logged = new Map();
  }

  async invoke(extension, callbackName, callback, context, { fallback = undefined } = {}) {
    if (typeof callback !== "function") return fallback;
    try {
      return await callback(context);
    } catch (error) {
      this.record(extension?.id || "unknown", callbackName, error, context?.documentUuid);
      return fallback;
    }
  }

  record(extensionId, callbackName, error, documentUuid = "") {
    const id = String(extensionId || "unknown");
    const message = String(error?.message || error || "Unknown extension error");
    const timestamp = Date.now();
    const record = {
      extensionId: id,
      callback: String(callbackName || "unknown"),
      message,
      documentUuid: String(documentUuid || ""),
      timestamp
    };
    this.errors.set(id, record);

    const fingerprint = `${id}:${record.callback}:${message}:${record.documentUuid}`;
    const lastLogged = Number(this.logged.get(fingerprint) || 0);
    if (timestamp - lastLogged >= ERROR_THROTTLE_MS) {
      this.logged.set(fingerprint, timestamp);
      console.error(
        `runyth-illuminated-documents | Extension "${id}" failed in ${record.callback}${record.documentUuid ? ` for ${record.documentUuid}` : ""}`,
        error
      );
    }
  }

  getLastError(extensionId) {
    const record = this.errors.get(String(extensionId || ""));
    return record ? cloneSerializable(record) : null;
  }

  getErrors() {
    return Array.from(this.errors.values()).map(cloneSerializable);
  }

  clear() {
    this.errors.clear();
    this.logged.clear();
  }
}
