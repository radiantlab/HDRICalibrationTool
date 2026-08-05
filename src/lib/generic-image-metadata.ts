import path from "path";
import { useMemo } from "react";
import { imageSrc } from "./host/image-src";
import { tauriRawIo } from "./host/raw-io";
import { rawToTiff } from "./raw-preview";
import { getTiffMetadata } from "./tiff-worker-client";

export interface GenericImageMetadata {
  size: [width: number, height: number];
}

// Overloaded so callers with a definite `string` path keep a definite
// `Promise` return type, while callers that may not have a path yet (e.g.
// no image selected) can pass `string | undefined` and call the hook
// unconditionally instead of skipping it based on a condition, which would
// violate the rules of hooks.
export function useGenericImageMetadata(
  fsPath: string
): Promise<GenericImageMetadata>;
export function useGenericImageMetadata(
  fsPath: string | undefined
): Promise<GenericImageMetadata> | undefined;
export function useGenericImageMetadata(
  fsPath: string | undefined
): Promise<GenericImageMetadata> | undefined {
  return useMemo(() => {
    if (!fsPath) {
      return;
    }
    const metadata = metadataFor(fsPath);
    // Removing a file drops its queued RAW conversion, and the rejection that
    // causes arrives only once the queue reaches that frame -- by which time
    // the selection has moved on and every consumer of this promise has
    // unmounted, leaving nobody attached to it. Same reason as
    // `tiff-image.tsx`'s handler on its derived decode promise. The original
    // promise is returned, not the handled one: turning the rejection into a
    // resolved `undefined` would make a genuine conversion failure look like
    // an image with no dimensions.
    metadata.catch(() => undefined);
    return metadata;
  }, [fsPath]);
}

function metadataFor(fsPath: string): Promise<GenericImageMetadata> {
  const kind: string = path.extname(fsPath).toLowerCase();
  switch (kind) {
    case ".jpg":
    case ".jpeg":
      return getJpegImageMetadata(fsPath);
    default:
      return getTiffImageMetadata(fsPath);
  }
}

function getJpegImageMetadata(fsPath: string): Promise<GenericImageMetadata> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ size: [img.width, img.height] });
    };
    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };
    imageSrc(fsPath).then((src) => {
      img.src = src;
    }, reject);
  });
}

function getTiffImageMetadata(fsPath: string): Promise<GenericImageMetadata> {
  // Shares `raw-preview`'s cache with the on-screen preview, so opening an
  // image does not convert it twice -- once for its dimensions and once to
  // draw it.
  return rawToTiff(fsPath, tauriRawIo).then(async (u8) => {
    const { buffer } = u8;
    const { width, height } = await getTiffMetadata(buffer, {
      memoryBytes: Math.max(
        4 << 20,
        Math.min(256 << 20, buffer.byteLength * 2)
      ),
    });
    return { size: [width, height] };
  });
}
