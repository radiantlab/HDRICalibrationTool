/**
 * Reading paths, virtual or real, in whichever host is running.
 *
 * A path reaching the pipeline is now one of two things. Input images and
 * files the user picked are real, and go to Tauri's filesystem. A preset's
 * calibration files are virtual (`/presets/<id>/<slot>.cal`): they have no
 * disk entry at all, because a preset stores its contents rather than a copy
 * beside a record pointing at one.
 *
 * Every consumer that resolves a path has to go through here, or applying a
 * preset fails with ENOENT on a file that is present and correct.
 */

import { isTauri } from "./host/env";
import { isVirtualPath, readVirtual, virtualExists } from "./vfs";

export async function readAnyFile(path: string): Promise<Uint8Array> {
  if (isVirtualPath(path) || !isTauri()) {
    return await readVirtual(path);
  }
  const { readFile } = await import("@tauri-apps/plugin-fs");
  return await readFile(path);
}

export async function anyFileExists(path: string): Promise<boolean> {
  if (isVirtualPath(path)) {
    return await virtualExists(path);
  }
  if (!isTauri()) {
    // A browser only ever holds virtual paths. Anything else came from a
    // record written on the desktop, and it is genuinely not here.
    return false;
  }
  const { exists } = await import("@tauri-apps/plugin-fs");
  return await exists(path);
}
