import { describe, expect, it } from "@jest/globals";
import type { RawCache } from "./raw-cache";
import { convertWithCache } from "./raw-worker";

function fakeCache(seed: Record<string, Uint8Array> = {}) {
  const blobs = new Map(Object.entries(seed));
  const cache: RawCache & { blobs: Map<string, Uint8Array> } = {
    blobs,
    clear: () => Promise.resolve(),
    get: (key) => Promise.resolve(blobs.get(key)),
    put: (key, bytes) => {
      blobs.set(key, bytes);
      return Promise.resolve();
    },
    sweep: () => Promise.resolve(),
    usage: () => Promise.resolve(0),
  };
  return cache;
}

describe("converting with the persistent cache", () => {
  it("returns the cached TIFF without converting", async () => {
    const cache = fakeCache({ "key-1": new Uint8Array([9, 9]) });
    let converted = 0;

    const tiff = await convertWithCache({
      cache,
      convert: () => {
        converted += 1;
        return Promise.resolve(new Uint8Array([1]));
      },
      key: () => Promise.resolve("key-1"),
    });

    expect(Array.from(tiff)).toEqual([9, 9]);
    expect(converted).toBe(0);
  });

  it("converts and stores on a miss", async () => {
    const cache = fakeCache();
    const tiff = await convertWithCache({
      cache,
      convert: () => Promise.resolve(new Uint8Array([4, 5])),
      key: () => Promise.resolve("key-2"),
    });

    expect(Array.from(tiff)).toEqual([4, 5]);
    expect(Array.from(cache.blobs.get("key-2") ?? [])).toEqual([4, 5]);
  });

  it("still converts when the key cannot be derived", async () => {
    const cache = fakeCache();
    const tiff = await convertWithCache({
      cache,
      convert: () => Promise.resolve(new Uint8Array([7])),
      key: () => Promise.reject(new Error("versions.json unreachable")),
    });
    expect(Array.from(tiff)).toEqual([7]);
  });

  it("still returns the TIFF when the cache write fails", async () => {
    const cache = fakeCache();
    cache.put = () => Promise.reject(new Error("quota exceeded"));

    const tiff = await convertWithCache({
      cache,
      convert: () => Promise.resolve(new Uint8Array([8])),
      key: () => Promise.resolve("key-3"),
    });
    expect(Array.from(tiff)).toEqual([8]);
  });

  it("still returns the TIFF when the cache read fails", async () => {
    const cache = fakeCache();
    cache.get = () => Promise.reject(new Error("storage unavailable"));

    const tiff = await convertWithCache({
      cache,
      convert: () => Promise.resolve(new Uint8Array([6])),
      key: () => Promise.resolve("key-4"),
    });
    expect(Array.from(tiff)).toEqual([6]);
  });
});
