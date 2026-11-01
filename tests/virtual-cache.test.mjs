// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";

const { RasterPageCache } = await import("../scripts/virtual-book.js");

const cache = new RasterPageCache({ byteBudget: 16 * 1024 * 1024, minimumPages: 2 });
const mib = 1024 * 1024;
const evicted = [];

cache.set(0, { id: 0 }, 8 * mib);
cache.set(1, { id: 1 }, 8 * mib);
cache.set(2, { id: 2 }, 8 * mib);
cache.get(1); // Page 1 becomes more recent than page 0.
cache.evict({
  protectedIndexes: new Set([2]),
  onEvict: (index) => evicted.push(index)
});

assert.deepEqual(evicted, [0], "the oldest non-protected raster page should be evicted first");
assert.equal(cache.items.size, 2);
assert.equal(cache.totalBytes, 16 * mib);
assert.ok(cache.has(1));
assert.ok(cache.has(2));

cache.clear();
assert.equal(cache.items.size, 0);
assert.equal(cache.totalBytes, 0);

console.log("virtual raster cache tests passed");

const pageBounded = new RasterPageCache({ byteBudget: 128 * mib, maximumPages: 3, minimumPages: 1 });
for (let index = 0; index < 4; index += 1) pageBounded.set(index, { id: index }, 1 * mib);
pageBounded.evict();
assert.equal(pageBounded.items.size, 3, "the raster cache must also cap resident canvas count for small page templates");
assert.equal(pageBounded.has(0), false, "page-count eviction should still use LRU order");
