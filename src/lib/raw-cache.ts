/**
 * The persistent tier of the RAW-to-TIFF cache.
 *
 * Sits behind the session tier in `raw-preview.ts` and in front of conversion.
 * Content-addressed, so a file that moved is still a hit and a file that
 * changed is not -- which is a correctness requirement rather than a nicety in
 * the browser, where `registerSessionFile` mints `/session/<n>/<name>` from a
 * counter that restarts each session and therefore names different bytes with
 * the same string across visits.
 *
 * Storage is injected. IndexedDB is the actual backing (`raw-cache-idb.ts`),
 * and `navigator.storage` -- used to clamp the budget and to ask for
 * persistence -- is injected the same way, in `raw-cache-quota.ts`: this
 * module never names either, so the eviction and index logic is the part
 * worth testing, and stays testable under Jest, where neither exists.
 *
 * The index is a single document rather than a row per entry. At a 2 GB budget
 * and ~67 MB per converted frame that is about thirty entries, so one document
 * is small, updates atomically, and can be read straight from the page for the
 * settings read-out without involving the worker.
 */

import type { BlobStore, CacheIndex } from "./raw-cache.types";
import { getDocument, updateDocument } from "./storage/kv";

const INDEX_KEY = "raw-cache-index";

/**
 * The nominal ceiling. Not the effective one any more: `budget()` below
 * clamps this against the origin's real quota where that's known, because a
 * fixed 2 GiB figure on a host whose actual quota is smaller means the
 * eviction loop in `put()` never runs -- the index never looks full even
 * though the disk already is.
 */
export const BUDGET_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * How much of the origin's reported quota this cache may claim. Well under 1:
 * the same origin also holds presets, settings and run history (small, but
 * not optional), and a cache that budgeted the *whole* quota would start
 * evicting only once nothing was left for anything else sharing it.
 */
export const QUOTA_SHARE = 0.5;

export interface RawCacheOptions {
  budgetBytes?: number;
  /**
   * Reports the origin's storage quota in bytes, or `undefined` where it
   * isn't known. Omit to skip clamping entirely and use `BUDGET_BYTES`
   * outright -- what every existing caller of this module did before F2, and
   * still what a host with no quota API gets. `estimateQuotaBytes` in
   * `raw-cache-quota.ts` is the production implementation.
   */
  estimateQuota?: () => Promise<number | undefined>;
  /** Injected so eviction order is decided in tests rather than raced. */
  now?: () => number;
  store: BlobStore;
}

export interface RawCache {
  /** The effective ceiling this instance will evict down to. See `budget()`. */
  budget: () => Promise<number>;
  clear: () => Promise<void>;
  get: (key: string) => Promise<Uint8Array | undefined>;
  put: (key: string, bytes: Uint8Array) => Promise<void>;
  /** Deletes blobs the index does not know about. Runs once per instance. */
  sweep: () => Promise<void>;
  usage: () => Promise<number>;
}

export function createRawCache(options: RawCacheOptions): RawCache {
  const { store } = options;
  const now = options.now ?? (() => Date.now());

  // Resolved once per instance and memoised: the quota is not expected to
  // change mid-session, and an explicit `budgetBytes` override -- what every
  // test in this file passes -- must win outright rather than being clamped
  // further, so it never calls `estimateQuota` at all.
  let budgetOnce: Promise<number> | undefined;
  function budget(): Promise<number> {
    if (options.budgetBytes !== undefined) {
      return Promise.resolve(options.budgetBytes);
    }
    budgetOnce ??= Promise.resolve(options.estimateQuota?.())
      .catch(() => undefined)
      .then((quota) =>
        quota && quota > 0
          ? Math.min(BUDGET_BYTES, Math.floor(quota * QUOTA_SHARE))
          : BUDGET_BYTES
      );
    return budgetOnce;
  }

  async function readIndex(): Promise<CacheIndex> {
    return (await getDocument<CacheIndex>(INDEX_KEY)) ?? {};
  }

  /**
   * Blobs with no index entry, deleted.
   *
   * A write that landed but whose index update did not is invisible to
   * eviction, so it would consume disk for the life of the origin. About
   * thirty keys at this budget, so listing them is cheap.
   */
  async function sweep(): Promise<void> {
    const index = await readIndex();
    const present = await store.keys().catch(() => [] as string[]);
    await Promise.all(
      present
        .filter((key) => !index[key])
        .map((key) => store.remove(key).catch(() => undefined))
    );
  }

  /** Once per instance: a sweep on every lookup would list the store per frame. */
  let swept: Promise<void> | undefined;
  function sweepOnce(): Promise<void> {
    swept ??= sweep().catch(() => undefined);
    return swept;
  }

  async function get(key: string): Promise<Uint8Array | undefined> {
    await sweepOnce();
    const index = await readIndex();
    if (!index[key]) {
      return;
    }

    const bytes = await store.read(key).catch(() => undefined);
    if (!bytes) {
      // Phantom: the index remembers a blob the store no longer has, which is
      // what a browser reclaiming storage under quota pressure leaves behind.
      // Dropping the entry turns it into an ordinary miss.
      await updateIndex((current) => {
        delete current[key];
        return current;
      });
      return;
    }

    await updateIndex((current) => {
      const entry = current[key];
      if (entry) {
        entry.lastUsed = now();
      }
      return current;
    });
    return bytes;
  }

  /**
   * Frees the LRU entries needed to make room for `neededBytes` more, judged
   * against what is actually indexed rather than against any budget.
   *
   * Deliberately unconditional on `budget`: this exists for the moment a
   * write already failed, which means the budget model was wrong for this
   * host (an index well under a quota-clamped ceiling, on a store that is
   * still full -- exactly what a fixed 2 GB figure produces on a smaller real
   * quota). Gating this eviction on the same budget that just failed to
   * predict the failure would evict nothing whenever the index looks
   * comfortably under it, and the retry below would repeat the identical
   * failure. Freeing roughly what is about to be written, independent of
   * budget, is what turns that into "slower" instead of "wedged forever."
   */
  async function evictToMakeRoom(neededBytes: number): Promise<void> {
    const evicted: string[] = [];
    await updateIndex((current) => {
      let freed = 0;
      const order = Object.entries(current).sort(
        ([, a], [, b]) => a.lastUsed - b.lastUsed
      );
      for (const [candidate, entry] of order) {
        if (freed >= neededBytes) {
          break;
        }
        delete current[candidate];
        freed += entry.size;
        evicted.push(candidate);
      }
      return current;
    });
    await Promise.all(
      evicted.map((candidate) => store.remove(candidate).catch(() => undefined))
    );
  }

  async function put(key: string, bytes: Uint8Array): Promise<void> {
    await sweepOnce();
    const effectiveBudget = await budget();

    // A blob bigger than the whole budget would evict everything and then
    // itself, so it is never stored at all.
    if (bytes.byteLength > effectiveBudget) {
      return;
    }

    // Blob first, index second. An interrupted write then leaves an orphan,
    // which `sweep` reclaims, rather than a phantom the next reader must
    // discover.
    try {
      await store.write(key, bytes);
    } catch {
      // F2: a write failure used to be swallowed here by the caller
      // (`convertWithCache` in raw-worker.ts) with no attempt to make room
      // first -- correct when the budget model was trustworthy, wrong once a
      // fixed 2 GB ceiling could sit above the host's real quota. One retry,
      // after freeing space the index actually thinks it can spare: if the
      // store is still full after that, something other than "the cache
      // needs to evict" is wrong, and this is left to propagate to that same
      // swallow rather than retried again.
      await evictToMakeRoom(bytes.byteLength);
      await store.write(key, bytes);
    }

    const evicted: string[] = [];
    await updateIndex((current) => {
      current[key] = { lastUsed: now(), size: bytes.byteLength };
      let total = Object.values(current).reduce(
        (sum, entry) => sum + entry.size,
        0
      );
      const order = Object.entries(current)
        .filter(([candidate]) => candidate !== key)
        .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
      for (const [candidate, entry] of order) {
        if (total <= effectiveBudget) {
          break;
        }
        delete current[candidate];
        total -= entry.size;
        evicted.push(candidate);
      }
      return current;
    });

    // Outside the index update: a failed removal must not roll back an index
    // that is already correct. What it leaves is an orphan, which sweeps.
    await Promise.all(
      evicted.map((candidate) => store.remove(candidate).catch(() => undefined))
    );
  }

  async function usage(): Promise<number> {
    const index = await readIndex();
    return Object.values(index).reduce((sum, entry) => sum + entry.size, 0);
  }

  async function clear(): Promise<void> {
    const present = await store.keys().catch(() => [] as string[]);
    const results = await Promise.allSettled(
      present.map((key) => store.remove(key))
    );
    const failed = present.filter((_, i) => results[i]?.status === "rejected");

    // Keep exactly the entries whose blobs survived removal. Emptying the
    // index unconditionally is how a partial failure used to turn into a
    // false "cleared": usage() would read 0 while the un-removed blobs sat
    // on disk, and the settings page would report success over both.
    const failedKeys = new Set(failed);
    await updateIndex((current) => {
      const next: CacheIndex = {};
      for (const key of Object.keys(current)) {
        const entry = current[key];
        if (entry && failedKeys.has(key)) {
          next[key] = entry;
        }
      }
      return next;
    });

    if (failed.length > 0) {
      const noun = failed.length === 1 ? "entry" : "entries";
      throw new Error(`Could not clear ${failed.length} cache ${noun}`);
    }
  }

  return { budget, clear, get, put, sweep, usage };
}

function updateIndex(
  change: (current: CacheIndex) => CacheIndex
): Promise<CacheIndex> {
  return updateDocument<CacheIndex>(INDEX_KEY, (current) =>
    change(current ?? {})
  );
}

export type { BlobStore, CacheEntry, CacheIndex } from "./raw-cache.types";
