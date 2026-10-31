# Scalable Virtualized Rendering — v1.11.0

## Problem

Earlier releases used an eager renderer: pagination and rasterization happened together, and every logical page became a full-size canvas before the viewer or preview was shown. A 50-page guard prevented runaway allocation, but it also became a practical document-size limit.

At the default 1200×1600 template size, one RGBA canvas represents roughly 7.3 MiB of raw pixel backing memory before browser/GPU overhead. Raising the eager cap to 1,000 would therefore be unsafe.

## Architecture

Version 1.11.0 separates the pipeline into two stages.

### 1. Logical pagination

`planAlternatingPages()` and `planBookPageEntries()`:

- load only fonts required for text measurement;
- use one reusable 1×1 measurement canvas;
- calculate text wrapping, region occupancy, section page breaks, alternating left/right templates, and cover positions;
- return lightweight page plans containing layout instructions rather than raster canvases;
- cooperatively yield every 100 pages so very large books do not monopolize the UI thread;
- accept an AbortSignal so closing or rerendering an application cancels pagination;
- enforce a 10,000-body-page pathological-input guard independently of normal viewport rendering.

### 2. Virtual rasterization

`VirtualBookView` owns the runtime viewport:

- every logical page receives a stable aspect-ratio placeholder;
- `IntersectionObserver` watches the actual scroll container with overscan;
- only nearby pages are queued for rasterization;
- two page rasterizations may run concurrently;
- queued pages are removed if they leave the overscan range;
- in-flight work receives an abort signal if it becomes obsolete;
- canvases are retained in an LRU cache bounded by both bytes and resident page count;
- low-memory devices use a reduced automatic raster budget;
- evicted canvases are explicitly detached and resized to zero to release backing storage;
- repeated background/template failures are logged once per distinct error instead of once per page;
- closing or rerendering the owning application disconnects observers, aborts work, and releases cached canvases.

The default maximum resident raster count is 24. The default byte budget is 128 MiB, reduced to 96 MiB on devices reporting 8 GiB or less and 64 MiB on devices reporting 4 GiB or less.

## UI integration

The scalable path is used by:

- Illuminated Journal rendering;
- the dedicated Illuminated Document viewer;
- New Document preview;
- Extend existing preview;
- existing-document edit preview.

The previous eager image/blob preview path has been removed from module-owned UI. Preview rerenders no longer generate temporary object URLs for every page.

## Extension behavior

Viewer-specific extension transforms still run before pagination. Therefore different users may legitimately receive different logical page plans when a companion extension changes text length. The authoritative stored Markdown and extension metadata remain unchanged.

The extension API remains version `1.0.0`; this feature does not change its stable contract.

## Compatibility

The existing eager helpers remain available:

- `renderDocumentPages()`
- `renderAlternatingPages()`
- `renderBookPageEntries()`
- `renderBookPages()`

They preserve conservative eager-render limits for callers that explicitly request arrays of full raster canvases. Module-owned interfaces no longer use them for long-document viewing.

No stored data migration is required. Existing Journals, presets, visual templates, section IDs, page-flow flags, extension data, folders, naming settings, permissions, and viewer settings remain unchanged.

## Failure safety

- A page raster error affects that page surface instead of destroying authoritative document data.
- A pathological layout that cannot consume text still fails immediately with a clear configuration error.
- The 10,000-page logical guard remains to stop runaway pagination caused by malformed layouts or extreme input.
- Duplicate render requests with an unchanged signature reuse the existing active render controller instead of aborting a healthy virtual viewer.
