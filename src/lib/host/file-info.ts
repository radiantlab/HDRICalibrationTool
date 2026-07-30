/**
 * Size and modification time for a path, virtual or real.
 *
 * The preview strip shows these for every file in a set, on render, so this
 * runs in a browser as a matter of course and cannot be a Tauri call.
 * A virtual file has a size but no meaningful mtime: it was registered this
 * session, and the browser does not report the original's timestamp.
 */

import { isVirtualPath, readVirtual } from "../vfs";
import { isTauri } from "./env";

export interface FileInfo {
  mtime: Date | null;
  size: number;
}

export async function fileInfo(path: string): Promise<FileInfo> {
  if (!isVirtualPath(path) && isTauri()) {
    const { stat } = await import("@tauri-apps/plugin-fs");
    const info = await stat(path);
    return { mtime: info.mtime ?? null, size: info.size };
  }
  return { mtime: null, size: (await readVirtual(path)).length };
}
