"use client";

import { useSettingsStore } from "@/app/stores/settings-store";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo } from "react";
import { z } from "zod";

export function useTiffPath(path: string) {
	const { settings } = useSettingsStore();
	const convertRawImg = useCallback(
		async (path: string) => {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			console.log("invoking convert_raw_img", path);
			const paths = await invoke("convert_raw_img", {
				dcraw: settings.dcrawEmuPath,
				paths: [path],
			});
			const p = z.string().array().parse(paths)[0];
			console.log("tiff path", p);
			return p;
		},
		[settings.dcrawEmuPath]
	);

	return useMemo(() => convertRawImg(path), [path]);
}
