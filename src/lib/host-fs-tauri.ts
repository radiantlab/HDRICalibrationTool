/**
 * Reading and writing paths on the desktop, virtual or real.
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

import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { isVirtualPath, readVirtual, virtualExists } from "./vfs";

export function readAnyFile(path: string): Promise<Uint8Array> {
  return isVirtualPath(path) ? readVirtual(path) : readFile(path);
}

export function anyFileExists(path: string): Promise<boolean> {
  return isVirtualPath(path) ? virtualExists(path) : exists(path);
}

/** Outputs always go to a real directory the user chose. */
export function writeRealFile(path: string, data: Uint8Array): Promise<void> {
  return writeFile(path, data);
}
