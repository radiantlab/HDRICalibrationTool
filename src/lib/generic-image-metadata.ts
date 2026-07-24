import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import path from "path";
import { useMemo } from "react";
import { useSettingsStore } from "@/app/stores/settings-store";
import { getTiffPath } from "@/components/ui/(image)/(tiff-image)/useTiffPath";
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
  const { settings } = useSettingsStore();
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
        return getTiffImageMetadata(fsPath, settings.dcrawEmuPath);
    }
  }, [fsPath, settings.dcrawEmuPath]);
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
  fsPath: string,
  dcrawEmuPath: string
): Promise<GenericImageMetadata> {
  const tiffPath = getTiffPath(fsPath, dcrawEmuPath);
  return tiffPath.then(async (resolvedTiffPath) => {
    const u8 = await readFile(resolvedTiffPath);
    const buffer = u8.buffer.slice(0);
    const { width, height } = await getTiffMetadata(buffer, {
      memoryBytes: Math.max(
        4 << 20,
        Math.min(256 << 20, buffer.byteLength * 2)
      ),
    });
    return { size: [width, height] };
  });
}
