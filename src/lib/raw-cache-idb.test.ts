import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { idbBlobStore } from "./raw-cache-idb";

describe("the IndexedDB blob store", () => {
  beforeEach(async () => {
    const store = idbBlobStore();
    for (const key of await store.keys()) {
      // biome-ignore lint/performance/noAwaitInLoops: clearing fake-indexeddb between tests; order doesn't matter but a shared store does
      await store.remove(key);
    }
  });

  it("round-trips bytes through write and read", async () => {
    const store = idbBlobStore();
    await store.write("a", new Uint8Array([1, 2, 3]));
    expect(Array.from((await store.read("a")) ?? [])).toEqual([1, 2, 3]);
  });

  it("returns undefined for a key that was never written", async () => {
    expect(await idbBlobStore().read("absent")).toBeUndefined();
  });

  it("overwrites an existing key rather than appending", async () => {
    const store = idbBlobStore();
    await store.write("a", new Uint8Array([1, 2, 3]));
    await store.write("a", new Uint8Array([9]));
    expect(Array.from((await store.read("a")) ?? [])).toEqual([9]);
  });

  it("lists and removes keys", async () => {
    const store = idbBlobStore();
    await store.write("a", new Uint8Array([1]));
    await store.write("b", new Uint8Array([2]));
    expect((await store.keys()).toSorted((a, b) => a.localeCompare(b))).toEqual(
      ["a", "b"]
    );

    await store.remove("a");
    expect(await store.keys()).toEqual(["b"]);
  });

  it("swallows a removal of something absent", async () => {
    await expect(idbBlobStore().remove("absent")).resolves.toBeUndefined();
  });

  it("stores a view of a larger buffer without dragging the whole buffer in", async () => {
    // The defect `putFile` documents: a subarray carries its parent's buffer,
    // so storing the view rather than a slice would persist far more than was
    // asked for -- and read back the wrong bytes.
    const backing = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await idbBlobStore().write("view", backing.subarray(2, 5));
    expect(Array.from((await idbBlobStore().read("view")) ?? [])).toEqual([
      3, 4, 5,
    ]);
  });
});
