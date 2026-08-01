import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { BUDGET_BYTES, createRawCache, QUOTA_SHARE } from "./raw-cache";
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

/**
 * A store whose `write` fails the first `failures` times it's called for a
 * given key, then succeeds. Models the F2 wedge: a real quota smaller than
 * the nominal 2 GB ceiling, where `store.write` is what actually fails, not
 * the index accounting.
 */
function flakyStore(
  failures: Record<string, number> = {}
): BlobStore & { blobs: Map<string, Uint8Array> } {
  const blobs = new Map<string, Uint8Array>();
  const remaining = { ...failures };
  return {
    blobs,
    keys: () => Promise.resolve(Array.from(blobs.keys())),
    read: (key) => Promise.resolve(blobs.get(key)),
    remove: (key) => {
      blobs.delete(key);
      return Promise.resolve();
    },
    write: (key, bytes) => {
      const left = remaining[key] ?? 0;
      if (left > 0) {
        remaining[key] = left - 1;
        return Promise.reject(new Error("quota exceeded"));
      }
      blobs.set(key, bytes);
      return Promise.resolve();
    },
  };
}

const ONE_FAILED_ENTRY = /1/;

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

  it("keeps an entry in the index when its blob cannot be removed, and rejects", async () => {
    const store = fakeStore();
    const cache = createRawCache({ now: clock(), store });
    await cache.put("keeps", new Uint8Array(10));
    await cache.put("goes", new Uint8Array(15));

    // Only "keeps" fails to remove, so a naive implementation that keeps
    // everything (rather than exactly the failed entry) would still pass a
    // test that merely checks usage() is nonzero.
    const flaky: BlobStore = {
      ...store,
      remove: (key) =>
        key === "keeps"
          ? Promise.reject(new Error("locked"))
          : store.remove(key),
    };
    const flakyCache = createRawCache({ now: clock(), store: flaky });

    await expect(flakyCache.clear()).rejects.toThrow();
    expect(store.blobs.has("keeps")).toBe(true);
    expect(store.blobs.has("goes")).toBe(false);
    expect(await flakyCache.usage()).toBe(10);
  });

  it("names how many entries could not be removed", async () => {
    const store = fakeStore();
    const cache = createRawCache({ now: clock(), store });
    await cache.put("keeps", new Uint8Array(10));
    await cache.put("goes", new Uint8Array(15));

    const flaky: BlobStore = {
      ...store,
      remove: (key) =>
        key === "keeps"
          ? Promise.reject(new Error("locked"))
          : store.remove(key),
    };
    const flakyCache = createRawCache({ now: clock(), store: flaky });

    await expect(flakyCache.clear()).rejects.toThrow(ONE_FAILED_ENTRY);
  });

  it("defaults to a 2 GB budget", () => {
    expect(BUDGET_BYTES).toBe(2 * 1024 * 1024 * 1024);
  });
});

describe("the effective budget", () => {
  it("uses the nominal ceiling when no quota is reported", async () => {
    const cache = createRawCache({
      estimateQuota: () => Promise.resolve(undefined),
      now: clock(),
      store: fakeStore(),
    });
    expect(await cache.budget()).toBe(BUDGET_BYTES);
  });

  it("clamps to a share of a smaller reported quota", async () => {
    const quota = 1000;
    const cache = createRawCache({
      estimateQuota: () => Promise.resolve(quota),
      now: clock(),
      store: fakeStore(),
    });
    expect(await cache.budget()).toBe(Math.floor(quota * QUOTA_SHARE));
  });

  it("never clamps above the nominal ceiling on a huge quota", async () => {
    const cache = createRawCache({
      estimateQuota: () => Promise.resolve(BUDGET_BYTES * 10),
      now: clock(),
      store: fakeStore(),
    });
    expect(await cache.budget()).toBe(BUDGET_BYTES);
  });

  it("ignores a reported quota when budgetBytes is set explicitly", async () => {
    // The override every other test in this file relies on: it must win
    // outright, not be clamped a second time against a quota a test never
    // intends to model.
    const cache = createRawCache({
      budgetBytes: 30,
      estimateQuota: () => Promise.resolve(5),
      now: clock(),
      store: fakeStore(),
    });
    expect(await cache.budget()).toBe(30);
  });

  it("shrinks eviction to match a quota-clamped budget", async () => {
    // The actual bug F2 fixes: a fixed nominal budget lets an over-quota
    // index look comfortably under budget and never evict. Small quota (100)
    // clamps the effective budget to 50; two 30-byte entries (60 total)
    // exceed that, so the older one must go, even though 60 is nowhere near
    // the nominal BUDGET_BYTES.
    const store = fakeStore();
    const cache = createRawCache({
      estimateQuota: () => Promise.resolve(100),
      now: clock(),
      store,
    });
    await cache.put("old", new Uint8Array(30));
    await cache.put("new", new Uint8Array(30));

    expect(store.blobs.has("old")).toBe(false);
    expect(store.blobs.has("new")).toBe(true);
  });
});

describe("recovering from a write failure", () => {
  it("evicts and retries once, rather than losing the conversion", async () => {
    const store = flakyStore({ new: 1 });
    const cache = createRawCache({ budgetBytes: 20, now: clock(), store });

    await cache.put("old", new Uint8Array(15));
    await cache.put("new", new Uint8Array(15)); // first write() rejects

    expect(Array.from((await cache.get("new")) ?? [])).toEqual(
      Array.from(new Uint8Array(15))
    );
  });

  it("frees room even when the index looks comfortably under budget", async () => {
    // Discriminates the failure-path eviction from the normal budget-gated
    // one: with budgetBytes generous (1000), "old" (15) + "new" (15) never
    // approaches budget, so an implementation that only evicts when *over
    // budget* would free nothing here and the retry would hit the identical
    // failure. Freeing space unconditionally on a write failure -- what F2
    // requires -- evicts "old" anyway, because the failure itself is the
    // evidence the budget figure doesn't match what the store can hold.
    const store = flakyStore({ new: 1 });
    const cache = createRawCache({ budgetBytes: 1000, now: clock(), store });

    await cache.put("old", new Uint8Array(15));
    await cache.put("new", new Uint8Array(15));

    expect(store.blobs.has("old")).toBe(false);
    expect(Array.from((await cache.get("new")) ?? [])).toEqual(
      Array.from(new Uint8Array(15))
    );
  });

  it("propagates a write failure that eviction and one retry could not fix", async () => {
    const store = flakyStore({ stuck: Number.POSITIVE_INFINITY });
    const cache = createRawCache({ budgetBytes: 1000, now: clock(), store });

    await expect(cache.put("stuck", new Uint8Array(10))).rejects.toThrow();
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
