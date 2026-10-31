// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
/** Normalize checkbox-like form values from native FormData and FormDataExtended. */
export function booleanFormValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["1", "true", "on", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

/** Normalize numeric form values while preserving an explicit fallback. */
export function numberFormValue(value, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}
