"use client";

import { readFile } from "@tauri-apps/plugin-fs";
import { useMemo } from "react";
import { rawToTiff } from "@/lib/raw-preview";

/**
 * TIFF bytes for a previewable image, converting RAW on the way.
 *
 * This used to be `useTiffPath` and returned a path, because `convert_raw_img`
 * wrote the converted TIFF into a cache directory and handed back its
 * location. The conversion now runs as WebAssembly in the page and never
 * touches the filesystem, so there is no path to hand back -- and the caller
 * only ever wanted the bytes, which it then read from that path itself.
 *
 * `readFile` is injected rather than imported by `raw-preview.ts` so the
 * conversion stays free of `@tauri-apps/*` and can be given a browser file
 * source unchanged.
 */
export function useTiffBytes(path: string): Promise<Uint8Array<ArrayBuffer>> {
  return useMemo(() => rawToTiff(path, (source) => readFile(source)), [path]);
}
