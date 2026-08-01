/**
 * The one file that touches `navigator.storage` for the persistent RAW cache.
 *
 * `raw-cache.ts` stays free of it deliberately -- the same reason it never
 * names OPFS or IndexedDB directly: `navigator.storage` does not exist under
 * Jest, so anything that calls it lives here and is injected into the tier
 * as a function, the same seam `BlobStore` already establishes for the blobs
 * themselves.
 */

/**
 * The origin's reported storage quota, in bytes, or `undefined` where the
 * host does not say -- no `navigator.storage.estimate`, a rejected call, or a
 * response with no numeric `quota` (recorded as `null` from WebKit in CI).
 * Never throws: an unknown quota is what tells `raw-cache.ts` to fall back to
 * its fixed nominal ceiling rather than a value it can't clamp against.
 */
export async function estimateQuotaBytes(): Promise<number | undefined> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return typeof estimate?.quota === "number" ? estimate.quota : undefined;
  } catch {
    // Unknown, not thrown: see the doc comment above.
  }
}

/**
 * Asks the browser not to reclaim this origin's storage under pressure
 * without asking first. Best-effort and silent on failure: `persist()` is not
 * implemented everywhere `estimate()` is (it has a history of being
 * window-only on some engines), and a host that declines it, or lacks it
 * outright, must not stop the cache from working -- it only becomes a more
 * evictable one.
 *
 * Worth calling regardless: this cache can add up to a couple of gigabytes to
 * an origin that has never asked for persistence, which makes the whole
 * origin -- presets and settings included, not just these blobs -- a more
 * attractive target for the browser's storage-pressure eviction than it was
 * before this cache existed.
 */
export async function persistStorageBestEffort(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Best-effort, see above.
  }
}
