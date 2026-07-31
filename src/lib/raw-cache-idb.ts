/**
 * IndexedDB backing for the persistent RAW cache.
 *
 * IndexedDB rather than OPFS, and that was measured rather than assumed.
 * #243 specified OPFS for its `createSyncAccessHandle` fast path; the probe in
 * `e2e-web/tests/storage-probe.spec.ts` found `navigator.storage.getDirectory`
 * **absent** in WebKit and in WebKitGTK 605.1.15, the webview Tauri uses on
 * Linux -- not slow, not quota-limited, simply not implemented. An OPFS cache
 * would have silently never worked for Safari users or Linux desktop users.
 * IndexedDB round-tripped a 67 MB blob on every engine tested.
 *
 * The cost is a structured clone on each read and write, against roughly 2 s
 * of demosaic per frame that it avoids. `perf.bench.ts` measures the result
 * rather than assuming it.
 *
 * A second consequence worth knowing: blobs and index now live in the same
 * database, so the reconciliation in `raw-cache.ts` guards a narrower window
 * than it was designed for. It is kept because the two are still written in
 * separate transactions, so a crash between them remains possible.
 */

import type { BlobStore } from "./raw-cache.types";
import { blobKeys, deleteBlob, getBlob, putBlob } from "./storage/kv";

/**
 * Whether this host can back the cache at all.
 *
 * Always true where the app runs -- IndexedDB is what presets, settings and
 * run history already depend on -- but the caller reads better for asking,
 * and a host without it degrades to converting every time rather than
 * throwing.
 */
export function blobStoreAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export function idbBlobStore(): BlobStore {
  return {
    keys: () => blobKeys(),
    read: (key) => getBlob(key),
    remove: async (key) => {
      await deleteBlob(key);
    },
    write: async (key, bytes) => {
      await putBlob(key, bytes);
    },
  };
}
