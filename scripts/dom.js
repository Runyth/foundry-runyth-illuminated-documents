// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
/** Return the first native HTMLElement-like root supplied by a Foundry hook or application. */
export function asElement(value) {
  if (!value) return null;
  if (value.nodeType === 1) return value;
  if (value.element?.nodeType === 1) return value.element;
  if (value[0]?.nodeType === 1) return value[0];
  return null;
}

export function query(root, selector) {
  return asElement(root)?.querySelector(selector) || null;
}

export function queryAll(root, selector) {
  return Array.from(asElement(root)?.querySelectorAll(selector) || []);
}

export function setText(root, selector, value) {
  const element = query(root, selector);
  if (element) element.textContent = String(value ?? "");
  return element;
}

export function toggleClass(root, selector, className, force) {
  const element = query(root, selector);
  element?.classList.toggle(className, Boolean(force));
  return element;
}

export function setDisabled(root, selector, disabled) {
  const element = query(root, selector);
  if (element) element.disabled = Boolean(disabled);
  return element;
}

export function checkedValue(root, name, fallback = "") {
  return String(query(root, `input[name="${name}"]:checked`)?.value ?? fallback);
}

export function checkedValues(root, name) {
  return queryAll(root, `input[name="${name}"]:checked`).map((element) => String(element.value));
}

export function escapeSelectorValue(value) {
  const text = String(value ?? "");
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(text);
  return text.replace(/["\\]/g, "\\$&");
}

export function createButton({ className = "", icon = "", label = "", title = "" } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  if (className) button.className = className;
  if (title) button.title = title;
  if (label || title) button.setAttribute("aria-label", label || title);
  if (icon) {
    const iconElement = document.createElement("i");
    iconElement.className = icon;
    iconElement.setAttribute("aria-hidden", "true");
    button.append(iconElement, document.createTextNode(` ${label}`));
  } else button.textContent = label;
  return button;
}
