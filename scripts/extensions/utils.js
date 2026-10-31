// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SAFE_FIELD_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function assertExtensionId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!SAFE_IDENTIFIER.test(id)) {
    throw new Error("Extension IDs must be 1-64 lowercase letters, numbers, dots, underscores, or hyphens.");
  }
  return id;
}

export function assertFieldKey(value) {
  const key = String(value || "").trim();
  if (!SAFE_FIELD_KEY.test(key)) {
    throw new Error("Extension field keys must be 1-64 letters, numbers, dots, underscores, or hyphens.");
  }
  return key;
}

export function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertSerializable(value, path = "value", seen = new WeakSet()) {
  if (value === null || value === undefined) return;
  const type = typeof value;
  if (["string", "number", "boolean"].includes(type)) {
    if (type === "number" && !Number.isFinite(value)) throw new Error(`${path} contains a non-finite number.`);
    return;
  }
  if (["function", "symbol", "bigint"].includes(type)) throw new Error(`${path} contains a non-serializable ${type}.`);
  if (type !== "object") return;
  if (typeof Node !== "undefined" && value instanceof Node) throw new Error(`${path} contains a DOM node.`);
  if (seen.has(value)) throw new Error(`${path} contains a circular reference.`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSerializable(entry, `${path}[${index}]`, seen));
  } else {
    if (!isPlainObject(value)) throw new Error(`${path} must contain only plain objects and arrays.`);
    for (const [key, entry] of Object.entries(value)) assertSerializable(entry, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

export function cloneSerializable(value) {
  assertSerializable(value);
  if (value === undefined) return undefined;
  if (globalThis.structuredClone) return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) deepFreeze(entry);
  return value;
}

export function immutableClone(value) {
  return deepFreeze(cloneSerializable(value));
}

export function hookCallAll(name, payload) {
  try {
    globalThis.Hooks?.callAll?.(name, payload);
  } catch (error) {
    console.error(`runyth-illuminated-documents | Hook ${name} failed`, error);
  }
}

export function randomStableId(prefix = "idoc-block") {
  const suffix = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${suffix}`;
}

export function deterministicId(seed, prefix = "idoc-block") {
  let hash = 2166136261;
  for (const character of String(seed || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function parseVersion(version) {
  const match = String(version || "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function satisfiesVersion(version, range) {
  const current = parseVersion(version);
  const requested = String(range || "").trim();
  if (!current || !requested) return false;
  if (requested === "*" || requested.toLowerCase() === "latest") return true;

  const exact = parseVersion(requested);
  if (exact) return compareVersion(current, exact) === 0;

  const wildcard = requested.match(/^(\d+)(?:\.(\d+))?\.x$/i);
  if (wildcard) {
    if (current[0] !== Number(wildcard[1])) return false;
    return wildcard[2] === undefined || current[1] === Number(wildcard[2]);
  }

  const operator = requested.match(/^(\^|~|>=|>|<=|<)\s*(\d+\.\d+\.\d+)$/);
  if (!operator) return false;
  const target = parseVersion(operator[2]);
  const comparison = compareVersion(current, target);
  if (operator[1] === ">=") return comparison >= 0;
  if (operator[1] === ">") return comparison > 0;
  if (operator[1] === "<=") return comparison <= 0;
  if (operator[1] === "<") return comparison < 0;
  if (operator[1] === "^") {
    const upper = target[0] > 0 ? [target[0] + 1, 0, 0]
      : target[1] > 0 ? [0, target[1] + 1, 0]
        : [0, 0, target[2] + 1];
    return comparison >= 0 && compareVersion(current, upper) < 0;
  }
  if (operator[1] === "~") {
    const upper = [target[0], target[1] + 1, 0];
    return comparison >= 0 && compareVersion(current, upper) < 0;
  }
  return false;
}
