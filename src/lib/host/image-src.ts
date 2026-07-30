/**
 * A URL a browser `<img>` can load, for a path the app holds.
 *
 * Tauri needs `convertFileSrc`, which maps a real path onto its asset
 * protocol; a plain `file://` URL is blocked by the webview. Virtual paths
 * have no URL at all, so they become object URLs over the bytes.
 */

import { isVirtualPath, readVirtual } from "../vfs";
import { isTauri } from "./env";

const objectUrls = new Map<string, string>();

export async function imageSrc(path: string): Promise<string> {
  if (!isVirtualPath(path)) {
    if (isTauri()) {
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      return convertFileSrc(path);
    }
    // A real path in a browser is nothing it can fetch. Reaching here means a
    // path came from somewhere that has not been migrated.
    throw new Error(`${path} cannot be displayed: no file is available for it`);
  }

  // Cached per path, because an object URL leaks until revoked and a thumbnail
  // strip re-renders freely. Revoked wholesale by `releaseImageSrcs`.
  const cached = objectUrls.get(path);
  if (cached) {
    return cached;
  }
  const bytes = await readVirtual(path);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  objectUrls.set(path, url);
  return url;
}

/** Frees every object URL handed out. Call when a set is cleared. */
export function releaseImageSrcs(): void {
  for (const url of Array.from(objectUrls.values())) {
    URL.revokeObjectURL(url);
  }
  objectUrls.clear();
}
