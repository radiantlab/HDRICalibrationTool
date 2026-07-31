import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { BUDGET_BYTES, createRawCache } from "./raw-cache";
import type { BlobStore } from "./raw-cache.types";
import { deleteDocument } from "./storage/kv";

// One document holds the whole index, and fake-indexeddb outlives an `it`
// block, so without this each test inherits the previous test's entries --
// against a fresh store that has none of their blobs.
beforeEach(async () => {
  await deleteDocument("raw-cache-index");
});

function fakeStore(): BlobStore & { blobs: Map<string, Uint8Array> } {
  const blobs = new Map<string, Uint8Array>();
  return {
    blobs,
    keys: () => Promise.resolve(Array.from(blobs.keys())),
    read: (key) => Promise.resolve(blobs.get(key)),
    remove: (key) => {
      blobs.delete(key);
      return Promise.resolve();
    },
    write: (key, bytes) => {
      blobs.set(key, bytes);
      return Promise.resolve();
    },
  };
}

/** A distinct clock, so "least recently used" is decided rather than raced. */
function clock() {
  let time = 1000;
  return () => {
    time += 1000;
    return time;
  };
}

describe("the persistent RAW cache", () => {
  it("returns undefined for a key it has never seen", async () => {
    const cache = createRawCache({ now: clock(), store: fakeStore() });
    expect(await cache.get("absent")).toBeUndefined();
  });

  it("returns what was put", async () => {
    const cache = createRawCache({ now: clock(), store: fakeStore() });
    await cache.put("a", new Uint8Array([1, 2, 3]));
    expect(Array.from((await cache.get("a")) ?? [])).toEqual([1, 2, 3]);
  });

  it("reports usage as the sum of stored sizes", async () => {
    const cache = createRawCache({ now: clock(), store: fakeStore() });
    await cache.put("a", new Uint8Array(10));
    await cache.put("b", new Uint8Array(15));
    expect(await cache.usage()).toBe(25);
  });

  it("evicts least recently used first when over budget", async () => {
    const store = fakeStore();
    const cache = createRawCache({ budgetBytes: 30, now: clock(), store });

    await cache.put("old", new Uint8Array(10));
    await cache.put("mid", new Uint8Array(10));
    await cache.get("old"); // touches "old", making "mid" the oldest use
    await cache.put("new", new Uint8Array(15));

    expect(store.blobs.has("mid")).toBe(false);
    expect(store.blobs.has("old")).toBe(true);
    expect(store.blobs.has("new")).toBe(true);
  });

  it("never evicts the entry just added", async () => {
    const store = fakeStore();
    const cache = createRawCache({ budgetBytes: 20, now: clock(), store });
    await cache.put("a", new Uint8Array(20));
    await cache.put("b", new Uint8Array(20));
    expect(store.blobs.has("b")).toBe(true);
  });

  it("refuses a blob larger than the whole budget", async () => {
    const store = fakeStore();
    const cache = createRawCache({ budgetBytes: 10, now: clock(), store });
    await cache.put("huge", new Uint8Array(11));
    expect(store.blobs.has("huge")).toBe(false);
    expect(await cache.usage()).toBe(0);
  });

  it("clears every blob and resets usage", async () => {
    const store = fakeStore();
    const cache = createRawCache({ now: clock(), store });
    await cache.put("a", new Uint8Array(10));
    await cache.clear();
    expect(store.blobs.size).toBe(0);
    expect(await cache.usage()).toBe(0);
  });

  it("defaults to a 2 GB budget", () => {
    expect(BUDGET_BYTES).toBe(2 * 1024 * 1024 * 1024);
  });
});
