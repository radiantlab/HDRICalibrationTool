"use client";

import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
	TooltipProvider,
} from "@/components/ui/tooltip";
import {
	ZoomIn,
	ZoomOut,
	RotateCcw,
	FolderOpen,
} from "lucide-react";
import { useImageViewer } from "./image-viewer-context";

const SUPPORTED_EXTENSIONS = [
	"jpg",
	"jpeg",
	"tif",
	"tiff",
	"cr2",
	"nef",
	"arw",
	"dng",
	"hdr",
];

export function ViewerToolbar() {
	const { imagePath, zoom, zoomIn, zoomOut, resetView, setImagePath } =
		useImageViewer();

	const browseAndOpen = useCallback(async () => {
		const selected = await open({
			multiple: false,
			filters: [
				{
					name: "Images",
					extensions: SUPPORTED_EXTENSIONS,
				},
			],
		});
		if (selected) {
			setImagePath(selected);
		}
	}, [setImagePath]);

	const filename = imagePath?.split(/[\\/]/).pop() ?? null;

	return (
		<TooltipProvider delayDuration={200}>
			<div className="flex items-center justify-between px-4 py-2 border-b bg-background/80 backdrop-blur-sm">
				{/* left: browse + file name */}
				<div className="flex items-center gap-2 min-w-0">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								onClick={browseAndOpen}
							>
								<FolderOpen className="h-4 w-4 mr-2" />
								Browse
							</Button>
						</TooltipTrigger>
						<TooltipContent>Open an image file</TooltipContent>
					</Tooltip>

					{filename && (
						<span className="text-xs text-muted-foreground truncate max-w-[260px]">
							{filename}
						</span>
					)}
				</div>

				{/* right: zoom controls */}
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon" onClick={zoomOut}>
								<ZoomOut className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Zoom out</TooltipContent>
					</Tooltip>

					<span className="text-xs tabular-nums w-12 text-center select-none">
						{zoom}%
					</span>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon" onClick={zoomIn}>
								<ZoomIn className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Zoom in</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon" onClick={resetView}>
								<RotateCcw className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Reset view</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</TooltipProvider>
	);
}