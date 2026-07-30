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
const DATABASE_VERSION = 1;

/** JSON documents: settings, the preset index, run history. */
const DOCUMENTS = "documents";
/** Binary blobs: calibration files and response functions, by virtual path. */
const FILES = "files";

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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("could not open IndexedDB"));
    // Fires when another tab holds an older version open. Rejecting is better
    // than hanging: the caller reports it rather than the app appearing frozen.
    request.onblocked = () =>
      reject(
        new Error(
          "another tab is holding an older version of the database open"
        )
      );
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

/** Drops the cached connection. Tests only; the app opens once per session. */
export function resetConnectionForTests(): void {
  connection = undefined;
}
