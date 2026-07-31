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
 * Storage is injected. OPFS is the intended backing (`raw-cache-opfs.ts`), but
 * this module never names it: the eviction and index logic is the part worth
 * testing, and `navigator.storage` does not exist under Jest.
 *
 * The index is a single document rather than a row per entry. At a 2 GB budget
 * and ~67 MB per converted frame that is about thirty entries, so one document
 * is small, updates atomically, and can be read straight from the page for the
 * settings read-out without involving the worker.
 */

import type { BlobStore, CacheIndex } from "./raw-cache.types";
import { getDocument, updateDocument } from "./storage/kv";

const INDEX_KEY = "raw-cache-index";

/** See the design doc. Fixed rather than a share of the origin quota. */
export const BUDGET_BYTES = 2 * 1024 * 1024 * 1024;

export interface RawCacheOptions {
  budgetBytes?: number;
  /** Injected so eviction order is decided in tests rather than raced. */
  now?: () => number;
  store: BlobStore;
}

export interface RawCache {
  clear: () => Promise<void>;
  get: (key: string) => Promise<Uint8Array | undefined>;
  put: (key: string, bytes: Uint8Array) => Promise<void>;
  /** Deletes blobs the index does not know about. Runs once per instance. */
  sweep: () => Promise<void>;
  usage: () => Promise<number>;
}

export function createRawCache(options: RawCacheOptions): RawCache {
  const { store } = options;
  const budget = options.budgetBytes ?? BUDGET_BYTES;
  const now = options.now ?? (() => Date.now());

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

  async function put(key: string, bytes: Uint8Array): Promise<void> {
    await sweepOnce();

    // A blob bigger than the whole budget would evict everything and then
    // itself, so it is never stored at all.
    if (bytes.byteLength > budget) {
      return;
    }

    // Blob first, index second. An interrupted write then leaves an orphan,
    // which `sweep` reclaims, rather than a phantom the next reader must
    // discover.
    await store.write(key, bytes);

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
        if (total <= budget) {
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
    await Promise.all(
      present.map((key) => store.remove(key).catch(() => undefined))
    );
    await updateIndex(() => ({}));
  }

  return { clear, get, put, sweep, usage };
}

function updateIndex(
  change: (current: CacheIndex) => CacheIndex
): Promise<CacheIndex> {
  return updateDocument<CacheIndex>(INDEX_KEY, (current) =>
    change(current ?? {})
  );
}

export type { BlobStore, CacheEntry, CacheIndex } from "./raw-cache.types";
