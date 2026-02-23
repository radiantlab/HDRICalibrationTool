/**
 * Image Viewer Component for the HDRI Calibration Tool.
 *
 * This component allows users to browse and view HDR images from the file system.
 * It displays a grid of available HDR images in the output directory and offers
 * functionality to select and view these images using external viewers.
 *
 * Note: The HDR viewing functionality is currently not supported on Windows platforms.
 */
"use client";

import React, { useCallback } from "react";
import { useSettingsStore } from "../stores/settings-store";
import {
	DropzoneChildrenProps,
	TauriDropzone,
} from "@/components/ui/tauri-dropzone";
import { ArrowDownOnSquareStackIcon } from "@heroicons/react/24/solid";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import path from "path";
import { open } from "@tauri-apps/plugin-dialog";
import { createSerializer, parseAsString } from "nuqs";

const serializeViewerUrl = createSerializer({
	filePath: parseAsString,
});

/**
 * Main Image Viewer component
 *
 * @returns React component with image viewer interface
 */
export default function ImageViewer() {
	// Access global settings to get output path and platform information
	const { settings } = useSettingsStore();
	const outputPath = settings.outputPath;

	const router = useRouter();
	const attemptView = (filePath: string) => {
		if (path.extname(filePath).toLowerCase() !== ".hdr") {
			toast.error("The selected file is not an HDR image");
			return;
		}
		router.push(serializeViewerUrl("/image-viewer/view", { filePath }));
	};

	return (
		<TauriDropzone
			onDrop={(paths) => {
				if (paths.length !== 1) {
					toast.error("Only one image can be viewed at a time");
					return;
				}
				attemptView(paths[0]!);
			}}
			onClick={async () => {
				const selectedFile = await open({
					multiple: false,
					directory: false,
					filters: [{ name: "HDR Image", extensions: ["hdr"] }],
				});
				if (selectedFile) attemptView(selectedFile);
			}}
			className="size-full p-16"
		>
			{useCallback(
				({ isDragActive }: DropzoneChildrenProps) => (
					<div
						className={cn(
							"transition-colors border-8 border-dashed text-border size-full grid place-items-center p-4 cursor-pointer focus:outline-hidden",
							"hover:text-foreground hover:border-foreground",
							// show invalid via group parent from Field as red
							"group-data-[invalid=true]/field:text-destructive",
							{ "text-foreground border-foreground": isDragActive }
						)}
					>
						<div className="grid place-items-center gap-2">
							<ArrowDownOnSquareStackIcon className="size-16" />
							<p>Drop a .hdr image here</p>
						</div>
					</div>
				),
				[]
			)}
		</TauriDropzone>
	);
}
