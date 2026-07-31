/**
 * The persistent RAW cache's storage seam.
 *
 * In its own module so `raw-worker.ts` and the settings page can name these
 * types without importing an implementation -- and so the OPFS implementation
 * is never pulled into a Jest run, where `navigator.storage` does not exist.
 */

/** Somewhere large binary blobs live, addressed by key. */
export interface BlobStore {
  /** Every key present. Reconciliation only; not a hot path. */
  keys: () => Promise<string[]>;
  read: (key: string) => Promise<Uint8Array | undefined>;
  remove: (key: string) => Promise<void>;
  write: (key: string, bytes: Uint8Array) => Promise<void>;
}

export interface CacheEntry {
  /** Epoch milliseconds. Eviction is least-recently-*used*, not oldest. */
  lastUsed: number;
  size: number;
}

/** key -> entry. About 30 entries at a 2 GB budget, so one document holds it. */
export type CacheIndex = Record<string, CacheEntry>;
