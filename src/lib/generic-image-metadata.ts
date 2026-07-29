import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import path from "path";
import { useMemo } from "react";
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
    const kind: string = path.extname(fsPath).toLowerCase();
    switch (kind) {
      case ".jpg":
      case ".jpeg":
        return getJpegImageMetadata(fsPath);
      default:
        return getTiffImageMetadata(fsPath);
    }
  }, [fsPath]);
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
    img.src = convertFileSrc(fsPath);
  });
}

function getTiffImageMetadata(
  fsPath: string
): Promise<GenericImageMetadata> {
  // Shares `raw-preview`'s cache with the on-screen preview, so opening an
  // image does not convert it twice -- once for its dimensions and once to
  // draw it.
  return rawToTiff(fsPath, (source) => readFile(source)).then(async (u8) => {
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
