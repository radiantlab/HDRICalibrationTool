/**
 * Versioned JSON documents, stored in IndexedDB.
 *
 * This used to write files under Tauri's app config directory. It does not any
 * more, and the reason is not only the browser build: preset calibration files
 * lived on disk while the record describing them lived in JSON, and the two
 * could disagree. They did -- files kept on a cloud drive copied as zero bytes
 * while the preset still recorded the hash of what the source should have
 * contained, so runs varied with nothing in the UI to explain it. Content and
 * record now live in one store.
 *
 * Nothing here imports `@tauri-apps/*`. Migration from the old files is
 * separate, in `storage/migrate-tauri-files.ts`, and runs on desktop only.
 */

import { DatabaseVersionError, getDocument, putDocument } from "./storage/kv";

/** Bumped only when a stored shape changes incompatibly. */
export const STORAGE_VERSION = 1;

/**
 * Reads a versioned document, falling back rather than throwing.
 *
 * History and presets are records, not state the app depends on, so a corrupt
 * or future-versioned document must never stop the app from starting.
 *
 * One exception: `DatabaseVersionError` is not "corrupt or unreadable", it is
 * "the data is intact and this build is the one that's behind." Falling back
 * to empty for that case is how a rolled-back deploy or a stale HTTP-cached
 * bundle would render as "you have no presets, no settings, no run history"
 * with nothing telling the user their data is still there. Rethrowing instead
 * gives a caller the chance to say so -- see `app/init.tsx`'s startup probe,
 * which is what actually shows it.
 */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const stored = await getDocument<{ version?: number }>(key);
    if (!stored || stored.version !== STORAGE_VERSION) {
      return fallback;
    }
    return stored as T;
  } catch (error) {
    if (error instanceof DatabaseVersionError) {
      throw error;
    }
    return fallback;
  }
}

export async function writeJson(key: string, value: object): Promise<void> {
  await putDocument(key, { ...value, version: STORAGE_VERSION });
}
