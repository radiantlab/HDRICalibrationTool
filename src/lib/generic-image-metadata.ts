import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import { getTiffMetadata } from "./tiff-worker-client";
import path from "path";
import { useMemo } from "react";
import { useSettingsStore } from "@/app/stores/settings-store";
import { getTiffPath } from "@/components/ui/(image)/(tiff-image)/useTiffPath";

export type GenericImageMetadata = {
	size: [width: number, height: number];
};

export function useGenericImageMetadata(
	fsPath: string
): Promise<GenericImageMetadata> {
	const { settings } = useSettingsStore();
	return useMemo(() => {
		const kind = path.extname(fsPath).toLowerCase();
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
	return tiffPath.then(async (path) => {
		const u8 = await readFile(path);
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
