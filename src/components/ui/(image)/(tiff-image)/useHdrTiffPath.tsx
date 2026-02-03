"use client";

import { useSettingsStore } from "@/app/stores/settings-store";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo } from "react";
import { z } from "zod";

export function useHdrTiffPath(path: string) {
	const { settings } = useSettingsStore();
	const convertHdrImg = useCallback(
		async (path: string) => {
			return getHdrTiffPath(path, settings.radiancePath);
		},
		[settings.radiancePath]
	);

	return useMemo(() => convertHdrImg(path), [path]);
}

export async function getHdrTiffPath(path: string, radiancePath: string) {
	const tiffPath = await invoke("convert_hdr_img", {
		radiancePath: radiancePath,
		filePath: path,
	});
	const p = z.string().parse(tiffPath);
	if (!p)
		throw new Error(
			`Failed to convert HDR image to TIFF, got output: ${tiffPath}`
		);

	return p;
}