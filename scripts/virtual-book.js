// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import {
  DEFAULT_RASTER_CACHE_BYTES,
  DEFAULT_RASTER_CACHE_PAGES,
  estimatePageRasterBytes,
  releaseCanvas,
  renderPlannedPage
} from "./renderer.js";

const DEFAULT_OVERSCAN_PX = 1400;
const DEFAULT_RENDER_CONCURRENCY = 2;
const MIN_CACHED_PAGES = 3;

export function recommendedRasterCacheBytes() {
  const deviceMemory = Number(globalThis.navigator?.deviceMemory || 0);
  if (deviceMemory > 0 && deviceMemory <= 4) return 64 * 1024 * 1024;
  if (deviceMemory > 0 && deviceMemory <= 8) return 96 * 1024 * 1024;
  return DEFAULT_RASTER_CACHE_BYTES;
}

function localized(key, fallback, data = null) {
  try {
    if (data && globalThis.game?.i18n?.format) return globalThis.game.i18n.format(key, data);
    const value = globalThis.game?.i18n?.localize?.(key);
    return value && value !== key ? value : fallback;
  } catch (_error) {
    return fallback;
  }
}

function pageNumberLabel(plan, index) {
  return String(plan?.label || localized("ILLUMINATED.Virtual.PageFallback", `Page ${index + 1}`, { page: index + 1 }));
}

function findScrollRoot(rootElement) {
  return rootElement?.closest?.(".idoc-viewer-pages, .idoc-preview-pane, .journal-entry-content, .window-content") || null;
}

export class RasterPageCache {
  constructor({
    byteBudget = DEFAULT_RASTER_CACHE_BYTES,
    maximumPages = DEFAULT_RASTER_CACHE_PAGES,
    minimumPages = MIN_CACHED_PAGES
  } = {}) {
    this.byteBudget = Math.max(16 * 1024 * 1024, Number(byteBudget) || DEFAULT_RASTER_CACHE_BYTES);
    this.maximumPages = Math.max(3, Number(maximumPages) || DEFAULT_RASTER_CACHE_PAGES);
    this.minimumPages = Math.max(1, Math.min(this.maximumPages, Number(minimumPages) || MIN_CACHED_PAGES));
    this.items = new Map();
    this.totalBytes = 0;
    this.clock = 0;
  }

  has(index) {
    return this.items.has(index);
  }

  get(index) {
    const item = this.items.get(index);
    if (!item) return null;
    item.lastUsed = ++this.clock;
    return item;
  }

  set(index, canvas, bytes) {
    this.delete(index);
    const item = {
      canvas,
      bytes: Math.max(0, Number(bytes) || 0),
      lastUsed: ++this.clock
    };
    this.items.set(index, item);
    this.totalBytes += item.bytes;
    return item;
  }

  delete(index) {
    const item = this.items.get(index);
    if (!item) return null;
    this.items.delete(index);
    this.totalBytes = Math.max(0, this.totalBytes - item.bytes);
    return item;
  }

  evict({ protectedIndexes = new Set(), onEvict = null } = {}) {
    while ((this.totalBytes > this.byteBudget || this.items.size > this.maximumPages)
      && this.items.size > this.minimumPages) {
      const candidates = Array.from(this.items.entries())
        .filter(([index]) => !protectedIndexes.has(index))
        .sort((left, right) => left[1].lastUsed - right[1].lastUsed);
      if (!candidates.length) break;
      const [index] = candidates[0];
      const item = this.delete(index);
      if (item) onEvict?.(index, item);
    }
  }

  clear(onEvict = null) {
    for (const [index, item] of this.items) onEvict?.(index, item);
    this.items.clear();
    this.totalBytes = 0;
  }
}

/**
 * Virtualized book viewport.
 *
 * Logical pagination is represented by lightweight page plans. Only pages near
 * the scroll viewport are rasterized, with raster canvases bounded by an LRU
 * memory budget. This keeps thousand-page books practical without weakening
 * the high logical safety guard used to detect pathological pagination.
 */
export class VirtualBookView {
  constructor({
    rootElement,
    pagePlans,
    signal = null,
    byteBudget = recommendedRasterCacheBytes(),
    maximumCachedPages = DEFAULT_RASTER_CACHE_PAGES,
    overscanPx = DEFAULT_OVERSCAN_PX,
    concurrency = DEFAULT_RENDER_CONCURRENCY,
    canvasClass = "idoc-live-page",
    showStatus = true,
    renderPage = renderPlannedPage
  } = {}) {
    if (!rootElement) throw new Error("VirtualBookView requires a root element.");
    this.rootElement = rootElement;
    this.pagePlans = Array.isArray(pagePlans) ? pagePlans : [];
    this.byteBudget = byteBudget;
    this.maximumCachedPages = maximumCachedPages;
    this.overscanPx = Math.max(0, Number(overscanPx) || DEFAULT_OVERSCAN_PX);
    this.concurrency = Math.max(1, Math.min(4, Number(concurrency) || DEFAULT_RENDER_CONCURRENCY));
    this.canvasClass = canvasClass;
    this.showStatus = Boolean(showStatus);
    this.renderPage = renderPage;
    this.controller = new AbortController();
    this.cache = new RasterPageCache({ byteBudget, maximumPages: maximumCachedPages });
    this.frames = [];
    this.hotIndexes = new Set();
    this.queue = new Map();
    this.rendering = new Set();
    this.taskControllers = new Map();
    this.observer = null;
    this.fallbackListenerTarget = null;
    this.fallbackRaf = 0;
    this.destroyed = false;
    this.loggedRenderErrors = new Set();
    if (signal) {
      if (signal.aborted) this.controller.abort();
      else signal.addEventListener("abort", () => this.destroy(), { once: true });
    }
  }

  mount() {
    if (this.destroyed || this.controller.signal.aborted) return this;
    const container = document.createElement("div");
    container.className = "idoc-virtual-book";
    container.dataset.idocVirtualBook = "true";

    if (this.showStatus) {
      const status = document.createElement("div");
      status.className = "idoc-virtual-book-status";
      status.textContent = localized(
        "ILLUMINATED.Virtual.PageCount",
        `${this.pagePlans.length.toLocaleString()} logical pages · nearby pages render on demand.`,
        { count: this.pagePlans.length.toLocaleString() }
      );
      container.append(status);
    }

    const list = document.createElement("div");
    list.className = "idoc-virtual-page-list";
    list.dataset.idocVirtualPageList = "true";
    container.append(list);

    this.frames = this.pagePlans.map((plan, index) => {
      const figure = document.createElement("figure");
      figure.className = "idoc-virtual-page-frame";
      figure.dataset.pageIndex = String(index);
      figure.dataset.pageKind = String(plan?.kind || "body");
      figure.style.setProperty("--idoc-page-aspect", `${plan.template.width} / ${plan.template.height}`);

      const caption = document.createElement("figcaption");
      caption.className = "idoc-live-page-label";
      caption.textContent = pageNumberLabel(plan, index);

      const surface = document.createElement("div");
      surface.className = "idoc-virtual-page-surface is-pending";
      surface.dataset.pageSurface = "true";
      surface.setAttribute("role", "img");
      surface.setAttribute("aria-label", pageNumberLabel(plan, index));

      const pending = document.createElement("span");
      pending.className = "idoc-virtual-page-placeholder";
      pending.textContent = localized(
        "ILLUMINATED.Virtual.RenderPending",
        "This page renders when it approaches the viewport."
      );
      surface.append(pending);
      figure.append(caption, surface);
      list.append(figure);
      return { figure, surface, plan, index };
    });

    this.rootElement.replaceChildren(container);
    this.container = container;
    this.list = list;
    this._startObservation();
    for (let index = 0; index < Math.min(2, this.frames.length); index += 1) this._enqueue(index, 0);
    return this;
  }

  _startObservation() {
    const scrollRoot = findScrollRoot(this.rootElement);
    if (typeof IntersectionObserver === "function") {
      this.observer = new IntersectionObserver((entries) => {
        if (this.destroyed) return;
        for (const entry of entries) {
          const index = Number(entry.target?.dataset?.pageIndex);
          if (!Number.isInteger(index)) continue;
          if (entry.isIntersecting) {
            this.hotIndexes.add(index);
            this._enqueue(index, entry.intersectionRatio > 0 ? 0 : 1);
          } else {
            this.hotIndexes.delete(index);
            this.queue.delete(index);
            this.taskControllers.get(index)?.abort();
          }
        }
        this._evictIfNeeded();
      }, {
        root: scrollRoot,
        rootMargin: `${this.overscanPx}px 0px`,
        threshold: [0, 0.01]
      });
      for (const frame of this.frames) this.observer.observe(frame.figure);
      return;
    }

    // Chromium used by Foundry V13 supports IntersectionObserver. This fallback
    // keeps the reader usable in unusual embedded environments without eagerly
    // rasterizing the whole book.
    this.fallbackListenerTarget = scrollRoot || window;
    const schedule = () => {
      if (this.fallbackRaf || this.destroyed) return;
      const scheduleFrame = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
      this.fallbackRaf = scheduleFrame(() => {
        this.fallbackRaf = 0;
        this._fallbackScan(scrollRoot);
      });
    };
    this.fallbackListenerTarget.addEventListener("scroll", schedule, {
      passive: true,
      signal: this.controller.signal
    });
    window.addEventListener("resize", schedule, { passive: true, signal: this.controller.signal });
    schedule();
  }

  _fallbackScan(scrollRoot) {
    if (this.destroyed) return;
    const rootRect = scrollRoot?.getBoundingClientRect?.() || {
      top: 0,
      bottom: globalThis.innerHeight || 1080
    };
    const top = rootRect.top - this.overscanPx;
    const bottom = rootRect.bottom + this.overscanPx;
    const previousHot = new Set(this.hotIndexes);
    this.hotIndexes.clear();
    for (const frame of this.frames) {
      const rect = frame.figure.getBoundingClientRect?.();
      if (!rect) continue;
      if (rect.bottom >= top && rect.top <= bottom) {
        this.hotIndexes.add(frame.index);
        this._enqueue(frame.index, rect.top >= rootRect.top && rect.bottom <= rootRect.bottom ? 0 : 1);
      }
    }
    for (const index of previousHot) {
      if (this.hotIndexes.has(index)) continue;
      this.queue.delete(index);
      this.taskControllers.get(index)?.abort();
    }
    this._evictIfNeeded();
  }

  _enqueue(index, priority = 1) {
    if (this.destroyed || this.cache.has(index) || this.rendering.has(index)) {
      if (this.cache.has(index)) this._attachCached(index);
      return;
    }
    const current = this.queue.get(index);
    if (current === undefined || priority < current) this.queue.set(index, priority);
    this._pump();
  }

  _pump() {
    if (this.destroyed || this.controller.signal.aborted) return;
    while (this.rendering.size < this.concurrency && this.queue.size) {
      const [index] = Array.from(this.queue.entries())
        .sort((left, right) => left[1] - right[1] || left[0] - right[0])[0];
      this.queue.delete(index);
      this.rendering.add(index);
      void this._renderIndex(index).finally(() => {
        this.rendering.delete(index);
        this._pump();
      });
    }
  }

  async _renderIndex(index) {
    const frame = this.frames[index];
    if (!frame || this.destroyed || this.controller.signal.aborted) return;
    const taskController = new AbortController();
    const abortTask = () => taskController.abort();
    this.controller.signal.addEventListener("abort", abortTask, { once: true });
    this.taskControllers.set(index, taskController);
    this._setSurfaceState(frame, "rendering");
    try {
      const entry = await this.renderPage(frame.plan, { signal: taskController.signal });
      if (this.destroyed || taskController.signal.aborted) {
        releaseCanvas(entry?.canvas);
        return;
      }
      const canvas = entry.canvas;
      canvas.className = this.canvasClass;
      canvas.dataset.pageIndex = String(index);
      this.cache.set(index, canvas, estimatePageRasterBytes(frame.plan));
      this._attachCached(index);
      this._evictIfNeeded();
    } catch (error) {
      if (error?.name === "AbortError" || taskController.signal.aborted) {
        if (!this.destroyed && !this.cache.has(index)) this._setSurfaceState(frame, "pending");
        return;
      }
      const errorMessage = String(error?.message || error);
      const errorKey = `${frame.plan?.template?.background || "unknown"}::${errorMessage}`;
      if (!this.loggedRenderErrors.has(errorKey)) {
        this.loggedRenderErrors.add(errorKey);
        console.error(`runyth-illuminated-documents | Unable to rasterize logical page ${index + 1}`, error);
      }
      this._setSurfaceState(frame, "error", errorMessage);
    } finally {
      this.controller.signal.removeEventListener("abort", abortTask);
      this.taskControllers.delete(index);
    }
  }

  _attachCached(index) {
    const frame = this.frames[index];
    const item = this.cache.get(index);
    if (!frame || !item || this.destroyed) return;
    frame.surface.replaceChildren(item.canvas);
    this._setSurfaceState(frame, "ready");
  }

  _setSurfaceState(frame, state, errorMessage = "") {
    if (!frame?.surface) return;
    frame.surface.classList.remove("is-pending", "is-rendering", "is-ready", "is-error");
    frame.surface.classList.add(`is-${state}`);
    frame.surface.dataset.renderState = state;
    if (state === "ready") return;
    const message = document.createElement("span");
    message.className = "idoc-virtual-page-placeholder";
    if (state === "rendering") {
      message.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>';
      message.append(document.createTextNode(` ${localized("ILLUMINATED.Virtual.RenderingPage", "Rendering page…")}`));
    } else if (state === "error") {
      message.textContent = `${localized("ILLUMINATED.Virtual.PageRenderError", "Unable to render this page.")} ${errorMessage}`.trim();
    } else {
      message.textContent = localized("ILLUMINATED.Virtual.RenderPending", "This page renders when it approaches the viewport.");
    }
    frame.surface.replaceChildren(message);
  }

  _evictIfNeeded() {
    const protectedIndexes = new Set([...this.hotIndexes, ...this.rendering]);
    this.cache.evict({
      protectedIndexes,
      onEvict: (index, item) => {
        releaseCanvas(item.canvas);
        const frame = this.frames[index];
        if (frame && !protectedIndexes.has(index)) this._setSurfaceState(frame, "pending");
      }
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.controller.abort();
    this.observer?.disconnect?.();
    this.observer = null;
    if (this.fallbackRaf) {
      const cancelFrame = globalThis.cancelAnimationFrame || clearTimeout;
      cancelFrame(this.fallbackRaf);
    }
    this.fallbackRaf = 0;
    this.queue.clear();
    this.hotIndexes.clear();
    for (const controller of this.taskControllers.values()) controller.abort();
    this.taskControllers.clear();
    this.loggedRenderErrors.clear();
    this.cache.clear((_index, item) => releaseCanvas(item.canvas));
    this.frames = [];
  }
}
