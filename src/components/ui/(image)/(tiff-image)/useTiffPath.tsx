"use client";

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo } from "react";
import { z } from "zod";
import { useSettingsStore } from "@/app/stores/settings-store";

export function useTiffPath(path: string) {
  const { settings } = useSettingsStore();
  const convertRawImg = useCallback(
    async (rawPath: string) => getTiffPath(rawPath, settings.dcrawEmuPath),
    [settings.dcrawEmuPath]
  );

  return useMemo(() => convertRawImg(path), [path, convertRawImg]);
}

export async function getTiffPath(path: string, dcrawEmuPath: string) {
  const paths = await invoke("convert_raw_img", {
    dcraw: dcrawEmuPath,
    paths: [path],
  });
  const [p] = z.string().array().parse(paths);
  if (!p) {
    throw new Error(
      `Failed to convert raw image to TIFF, got output: ${paths}`
    );
  }

  return p;
}
