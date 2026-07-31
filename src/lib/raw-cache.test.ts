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
    // A key that is already present keeps its original position in the
    // index, so growing it back up to the others' size and giving it a
    // `lastUsed` tied with theirs is enough to make it the *first* candidate
    // in eviction order -- unless the "never the just-added key" filter
    // excludes it. Two same-sized entries can't discriminate this: a
    // brand-new key is always appended last and so is always safe on its
    // own, regardless of that filter. Only re-growing a key that was
    // already there exercises the guard.
    const store = fakeStore();
    const times = [1000, 2000, 2000, 2000]; // a, b, c, then a again -- tied with b and c
    const cache = createRawCache({
      budgetBytes: 25,
      now: () => times.shift() ?? 0,
      store,
    });

    await cache.put("a", new Uint8Array(5));
    await cache.put("b", new Uint8Array(10));
    await cache.put("c", new Uint8Array(10));
    await cache.put("a", new Uint8Array(10)); // total now 30 > 25: eviction runs

    expect(store.blobs.has("a")).toBe(true);
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

describe("reconciliation", () => {
  it("reports a miss and forgets the entry when the blob has vanished", async () => {
    const store = fakeStore();
    const cache = createRawCache({ now: clock(), store });
    await cache.put("a", new Uint8Array(10));

    store.blobs.delete("a"); // as a browser reclaiming storage would

    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.usage()).toBe(0);
  });

  it("deletes blobs the index does not know about", async () => {
    const store = fakeStore();
    store.blobs.set("orphan", new Uint8Array(10)); // a crashed write

    const cache = createRawCache({ now: clock(), store });
    await cache.sweep();

    expect(store.blobs.has("orphan")).toBe(false);
  });

  it("sweeps once, not on every call", async () => {
    const store = fakeStore();
    let listed = 0;
    const counting = {
      ...store,
      keys: () => {
        listed += 1;
        return store.keys();
      },
    };
    const cache = createRawCache({ now: clock(), store: counting });

    await cache.get("a");
    await cache.get("b");
    await cache.put("c", new Uint8Array(1));

    expect(listed).toBe(1);
  });

  it("keeps blobs the index does know about", async () => {
    const store = fakeStore();
    const cache = createRawCache({ now: clock(), store });
    await cache.put("kept", new Uint8Array(10));

    await cache.sweep();

    expect(store.blobs.has("kept")).toBe(true);
  });
});
