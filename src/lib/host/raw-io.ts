/**
 * How the RAW converter reaches a file, in whichever host is running.
 *
 * Separate from `raw-preview.ts` so that module imports no `@tauri-apps/*` and
 * can be given a browser file source unchanged. Shared by all three consumers
 * -- thumbnails, image metadata and the pipeline -- so they hit the same cache
 * entry rather than each converting the same frame.
 */

import { readAnyFile } from "../host-fs-tauri";
import type { RawSourceIo } from "../raw-preview";
import { fileInfo } from "./file-info";

export const tauriRawIo: RawSourceIo = {
  // Size and mtime rather than a content hash: it catches the case that
  // matters (a file replaced on disk mid-session) without reading 23 MB just
  // to decide whether a cached conversion is still valid. A virtual file has
  // no mtime, which is correct -- its bytes cannot change under us.
  fingerprint: async (path) => {
    const info = await fileInfo(path);
    return `${info.size}:${info.mtime?.getTime() ?? 0}`;
  },
  readFile: (path) => readAnyFile(path),
};
