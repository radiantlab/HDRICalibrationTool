import { appConfigDir, join } from "@tauri-apps/api/path";
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

/** Bumped only when a stored shape changes incompatibly. */
export const STORAGE_VERSION = 1;

export async function storagePath(...segments: string[]): Promise<string> {
  return await join(await appConfigDir(), ...segments);
}

/**
 * Reads a versioned JSON file, falling back rather than throwing.
 *
 * History and presets are records, not state the app depends on, so a corrupt
 * or future-versioned file must never stop the app from starting.
 */
export async function readJson<T>(
  relativePath: string,
  fallback: T
): Promise<T> {
  const path = await storagePath(...relativePath.split("/"));
  try {
    if (!(await exists(path))) {
      return fallback;
    }
    const parsed = JSON.parse(await readTextFile(path));
    if (parsed?.version !== STORAGE_VERSION) {
      return fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(
  relativePath: string,
  value: object
): Promise<void> {
  const segments = relativePath.split("/");
  const path = await storagePath(...segments);
  if (segments.length > 1) {
    await mkdir(await storagePath(...segments.slice(0, -1)), {
      recursive: true,
    });
  }
  await writeTextFile(
    path,
    JSON.stringify({ ...value, version: STORAGE_VERSION }, null, 2)
  );
}
