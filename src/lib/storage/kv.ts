/**
 * A small key-value store on IndexedDB.
 *
 * This is the persistence seam for everything the app keeps between runs:
 * settings, presets and run history. It replaces reading and writing JSON
 * files under Tauri's app config directory.
 *
 * IndexedDB rather than localStorage, for reasons that are about the data
 * rather than taste. Calibration files are stored here as bytes; localStorage
 * holds strings only, so they would need base64 and grow by a third, its 5 MB
 * quota is shared with everything else on the origin, and its API is
 * synchronous, so every write would block the main thread.
 *
 * Nothing here imports `@tauri-apps/*`. IndexedDB is available in the Tauri
 * webview and in every target browser, so one implementation serves both.
 */

/**
 * Deliberately still the old name, and it must stay that way.
 *
 * The app was renamed from HDRI Calibration Tool to LumiLab; this was not,
 * because an IndexedDB database is addressed by name. Renaming it does not
 * migrate anything -- it opens a *different*, empty database, and every
 * existing user silently loses their presets, run history and settings while
 * the app looks like it has simply forgotten them.
 *
 * The same reasoning applies to `hdr-settings` in `stores/settings-store.ts`
 * and to `identifier` in `tauri.conf.json`, which is what the desktop app data
 * directory (and therefore this database's file on disk) is derived from.
 * Cosmetic renames are free; addresses are not.
 */
const DATABASE = "hdri-calibration";
const DATABASE_VERSION = 2;

/** JSON documents: settings, the preset index, run history. */
const DOCUMENTS = "documents";
/** Binary blobs: calibration files and response functions, by virtual path. */
const FILES = "files";
/** Converted RAW frames, by content-addressed key. See `raw-cache.ts`. */
const BLOBS = "blobs";

/**
 * A stored database newer than this build knows how to open.
 *
 * IndexedDB does not negotiate a downgrade: opening at a version below what
 * is already on disk fails the request with a `VersionError`, every time,
 * for as long as the on-disk version stays ahead of `DATABASE_VERSION`. That
 * is not a hypothetical -- a rolled-back web deploy, a browser still serving
 * an old bundle from its HTTP cache, or a Tauri user reinstalling an older
 * release all produce it for real, against data that is fully intact on
 * disk. Left as a generic rejection, it looks identical to any other open
 * failure: `app-storage.ts`'s `readJson` would swallow it and hand back the
 * empty-state fallback, so the app would render as if the user had never
 * used it, with no error anywhere to explain why. Giving it a name is what
 * lets a caller refuse to paper over this one class of failure the way it is
 * free to paper over the others.
 */
export class DatabaseVersionError extends Error {
  constructor() {
    super(
      "This browser holds app data written by a newer version of LumiLab " +
        "than this build can open. Reload the page, or update the app, to " +
        "read it."
    );
    this.name = "DatabaseVersionError";
  }
}

let connection: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DOCUMENTS)) {
        database.createObjectStore(DOCUMENTS);
      }
      if (!database.objectStoreNames.contains(FILES)) {
        database.createObjectStore(FILES);
      }
      if (!database.objectStoreNames.contains(BLOBS)) {
        database.createObjectStore(BLOBS);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      // Fires in an older tab when a newer tab's open() needs to upgrade.
      // Closing here lets that upgrade proceed instead of leaving the newer
      // tab's request permanently blocked -- DATABASE_VERSION could not
      // change before this database had a second version to move between,
      // so this branch was unreachable until the blob store was added.
      //
      // `connection` is cleared *before* `close()`, not after: this tab's
      // cached promise still resolves to `database`, and once it is closed
      // every later `getDocument`/`putDocument` against it fails with
      // `InvalidStateError` -- permanently, since nothing else would ever
      // clear the cache. `app-storage.ts`'s `readJson` swallows read errors
      // and returns the fallback, so that failure would not surface as an
      // error; it would render as an empty app -- no presets, no settings,
      // no run history -- until the tab is reloaded. Clearing first means
      // the next call to `open()` reopens instead of reusing the dying
      // handle.
      database.onversionchange = () => {
        connection = undefined;
        database.close();
      };
      resolve(database);
    };
    request.onerror = () => {
      // A downgrade attempt surfaces here, not in onupgradeneeded: IndexedDB
      // refuses it outright rather than running an upgrade transaction.
      // Recognised by name rather than assumed from context, because this
      // handler also catches every other open failure (onblocked losing a
      // race is not modeled as an error here, but a future browser quirk
      // could route through onerror too) and only this one is permanent for
      // the life of the build.
      reject(
        request.error?.name === "VersionError"
          ? new DatabaseVersionError()
          : (request.error ?? new Error("could not open IndexedDB"))
      );
    };
    // Fires when another tab holds an older version open. Rejecting is better
    // than hanging: the caller reports it rather than the app appearing frozen.
    request.onblocked = () =>
      reject(
        new Error(
          "another tab is holding an older version of the database open"
        )
      );
  }).catch((error: unknown) => {
    // Not remembered: `??=` above means the first call to open() after a
    // failure decides the value for every caller until the process reloads.
    // A cached rejection would leave storage broken -- presets and settings,
    // not just this cache -- until then, for a failure that may have been
    // transient (an onblocked race resolved by the other tab closing, for
    // one). `raw-cache-key.ts`'s `toolTag` and `wasm-runner.ts`'s compiled
    // module cache clear their memo entries on failure for the same reason.
    //
    // `DatabaseVersionError` is the one exception to "transient": the
    // on-disk version really is ahead of `DATABASE_VERSION`, so retrying
    // `open()` again fails identically until the running build changes.
    // Clearing the cache here anyway is still correct -- it means a caller
    // gets the same distinguishable error type on every retry rather than a
    // stale cached rejection of a different shape -- and it costs nothing,
    // since the retry that follows fails the same way either.
    connection = undefined;
    throw error;
  });
  return connection;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return open().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(store, mode);
        const request = action(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        // Both are needed: a request can fail on its own, and a transaction
        // can abort underneath a request that already succeeded (quota, for
        // one), which would otherwise resolve a write that never landed.
        request.onerror = () =>
          reject(request.error ?? new Error(`${store}: request failed`));
        transaction.onabort = () =>
          reject(
            transaction.error ?? new Error(`${store}: transaction aborted`)
          );
      })
  );
}

export function getDocument<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>(DOCUMENTS, "readonly", (store) => store.get(key));
}

export function putDocument(key: string, value: unknown): Promise<unknown> {
  return run(DOCUMENTS, "readwrite", (store) => store.put(value, key));
}

export function deleteDocument(key: string): Promise<unknown> {
  return run(DOCUMENTS, "readwrite", (store) => store.delete(key));
}

/**
 * Reads, changes and writes a document inside one transaction.
 *
 * `run()` issues a single request per transaction, so `getDocument` followed
 * by `putDocument` is two transactions with a window between them. The RAW
 * cache index is written by the worker on every conversion and cleared from
 * the settings page, and a lost update there means a leaked blob nothing will
 * ever evict.
 */
export function updateDocument<T>(
  key: string,
  change: (current: T | undefined) => T
): Promise<T> {
  return open().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(DOCUMENTS, "readwrite");
        const store = transaction.objectStore(DOCUMENTS);
        const read = store.get(key);
        let written: T;
        read.onsuccess = () => {
          written = change(read.result as T | undefined);
          store.put(written, key);
        };
        read.onerror = () =>
          reject(read.error ?? new Error(`${DOCUMENTS}: read failed`));
        // Resolved on the transaction, not the put: the write is only durable
        // once the transaction commits, and a quota abort can follow a
        // successful request.
        transaction.oncomplete = () => resolve(written);
        transaction.onabort = () =>
          reject(transaction.error ?? new Error(`${DOCUMENTS}: aborted`));
      })
  );
}

/**
 * Reads a stored file.
 *
 * Returns a fresh view each time. IndexedDB structured-clones on the way out,
 * so a caller cannot mutate what the next caller reads.
 */
export async function getFile(key: string): Promise<Uint8Array | undefined> {
  const stored = await run<ArrayBuffer | undefined>(
    FILES,
    "readonly",
    (store) => store.get(key)
  );
  return stored ? new Uint8Array(stored) : undefined;
}

export function putFile(key: string, bytes: Uint8Array): Promise<unknown> {
  // Stored as ArrayBuffer rather than Uint8Array: a view carries its offset
  // and length, and a subarray of a larger buffer would otherwise be cloned
  // whole. `slice` also detaches it from whatever the caller does next.
  return run(FILES, "readwrite", (store) =>
    store.put(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer,
      key
    )
  );
}

export function deleteFile(key: string): Promise<unknown> {
  return run(FILES, "readwrite", (store) => store.delete(key));
}

/** Every stored file key beginning with `prefix`, for deleting a preset. */
export async function fileKeys(prefix: string): Promise<string[]> {
  const keys = await run<IDBValidKey[]>(FILES, "readonly", (store) =>
    store.getAllKeys()
  );
  return keys
    .filter((key): key is string => typeof key === "string")
    .filter((key) => key.startsWith(prefix));
}

/**
 * Reads a cached blob.
 *
 * Separate from `getFile` despite the identical shape, because these live in
 * their own store: the RAW cache evicts on a budget and is cleared wholesale
 * from the settings page, and neither may touch a preset's calibration files.
 */
export async function getBlob(key: string): Promise<Uint8Array | undefined> {
  const stored = await run<ArrayBuffer | undefined>(
    BLOBS,
    "readonly",
    (store) => store.get(key)
  );
  return stored ? new Uint8Array(stored) : undefined;
}

export function putBlob(key: string, bytes: Uint8Array): Promise<unknown> {
  // Stored as ArrayBuffer for the reason `putFile` gives: a view carries its
  // offset and length, so a subarray of a larger buffer would be cloned whole.
  return run(BLOBS, "readwrite", (store) =>
    store.put(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer,
      key
    )
  );
}

export function deleteBlob(key: string): Promise<unknown> {
  return run(BLOBS, "readwrite", (store) => store.delete(key));
}

export async function blobKeys(): Promise<string[]> {
  const keys = await run<IDBValidKey[]>(BLOBS, "readonly", (store) =>
    store.getAllKeys()
  );
  return keys.filter((key): key is string => typeof key === "string");
}

/** Drops the cached connection. Tests only; the app opens once per session. */
export function resetConnectionForTests(): void {
  connection = undefined;
}
