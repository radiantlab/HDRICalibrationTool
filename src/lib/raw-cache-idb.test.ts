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
    // asked for. Two things must both hold for a correct write, and a naive
    // "forgot to slice" bug (`store.put(bytes, key)`, storing the Uint8Array
    // itself) breaks neither on its own:
    //
    //  - The read-back *value* is `[3, 4, 5]` either way. Structured clone
    //    reconstructs a view with the same offset and length it was given,
    //    so `read()`'s `new Uint8Array(stored)` looks identical from a
    //    stored slice or a stored view -- `.byteLength` on a view reflects
    //    the view's length, not its retained backing buffer.
    //  - `stored?.byteLength` alone is not enough either: a stored *view*
    //    that happens to be exactly 3 bytes would also pass a bare
    //    `byteLength === 3` check while still being the wrong kind of
    //    record and still retaining the 8-byte buffer behind it.
    //
    // What actually distinguishes a correct write is that the record is a
    // **plain `ArrayBuffer`** of length 3, not a view over something larger.
    // Read the raw record directly, bypassing `read()`'s conversion, to
    // check both.
    const backing = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await idbBlobStore().write("view", backing.subarray(2, 5));

    const stored = await rawBlobRecord("view");
    // `instanceof ArrayBuffer` is not reliable here: fake-indexeddb's clone
    // reconstructs the value in a different realm, so a genuinely correct
    // ArrayBuffer record fails `instanceof` against this file's global
    // `ArrayBuffer` too. `Object.prototype.toString` and `ArrayBuffer.isView`
    // read an object's internal slot rather than walking its prototype
    // chain, so both stay accurate across realms -- verified by hand: a
    // stored `ArrayBuffer` reports `"[object ArrayBuffer]"` and
    // `isView() === false`, a stored `Uint8Array` reports
    // `"[object Uint8Array]"` and `isView() === true`, regardless of realm.
    expect(Object.prototype.toString.call(stored)).toBe("[object ArrayBuffer]");
    expect(ArrayBuffer.isView(stored)).toBe(false);
    expect((stored as ArrayBuffer).byteLength).toBe(3);
  });
});

/**
 * Reads a blob record straight off the store, without `read()`'s
 * `new Uint8Array(stored)` conversion, so a test can inspect what was
 * actually persisted -- including its *type*, not just a value shaped like
 * the one `read()` would have produced from either a correct or a defective
 * write.
 */
function rawBlobRecord(key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Same database and store `kv.ts` opens; hardcoded because this reaches
    // underneath that module's API on purpose, to see what it actually wrote.
    const request = indexedDB.open("hdri-calibration", 2);
    request.onsuccess = () => {
      const database = request.result;
      const read = database
        .transaction("blobs", "readonly")
        .objectStore("blobs")
        .get(key);
      read.onsuccess = () => {
        database.close();
        resolve(read.result);
      };
      read.onerror = () => {
        database.close();
        reject(read.error);
      };
    };
    request.onerror = () => reject(request.error);
  });
}
