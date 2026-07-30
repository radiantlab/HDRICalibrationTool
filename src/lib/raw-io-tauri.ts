/**
 * The Tauri implementation of `RawSourceIo`.
 *
 * Separate from `raw-preview.ts` so that module imports no `@tauri-apps/*` and
 * can be handed a browser file source unchanged. Shared by all three consumers
 * -- thumbnails, image metadata and the pipeline -- so they hit the same cache
 * entry rather than each converting the same frame.
 */

import { readFile, stat } from "@tauri-apps/plugin-fs";
import type { RawSourceIo } from "./raw-preview";

export const tauriRawIo: RawSourceIo = {
  // Size and mtime rather than a content hash: it catches the case that
  // matters (a file replaced on disk mid-session) without reading 23 MB just
  // to decide whether a cached conversion is still valid.
  fingerprint: async (path) => {
    const info = await stat(path);
    return `${info.size}:${info.mtime?.getTime() ?? 0}`;
  },
  readFile: (path) => readFile(path),
};
