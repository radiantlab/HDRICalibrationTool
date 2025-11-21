import { stat } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import path from "path";
import { useMemo } from "react";
import { SkeletonSuspended } from "./skeleton-suspended";
import prettyBytes from "pretty-bytes";
import { GenericImage } from "./(image)/generic-image";
import { Trash2 } from "lucide-react";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export type ImageSet = {
	name: string;
	files: string[];
};

export function ImageSetPreview({
	name,
	files,
	onRemove,
}: ImageSet & { onRemove: () => void }) {
	const fileStats = useMemo(
		() => Promise.all(files.map((f) => stat(f))),
		[files]
	);

	const fileTypes = useMemo(
		() => Array.from(new Set(files.map((f) => path.extname(f).slice(1)))),
		[files]
	);

	return (
		<div className="flex flex-col h-56 bg-accent">
			<div className="flex w-full">
				<div className="flex-1 grid grid-flow-col divide-x border-b pl-2">
					<div className="font-bold text-2xl">{name}</div>
					{Object.entries({
						Files: files.length,
						[fileTypes.length > 1 ? "File Types" : "File Type"]:
							fileTypes.join(", "),
						"Average File Size": fileStats.then((stats) =>
							prettyBytes(
								stats.reduce((acc, stat) => acc + stat.size, 0) / stats.length
							)
						),
					} satisfies Record<string, string | number | Promise<string | number>>).map(
						([key, value]) => (
							<div
								key={key}
								className="flex gap-1 items-center text-sm text-muted-foreground px-2"
							>
								{key}:
								<SkeletonSuspended sizePlaceholder={"placeholder"}>
									{value}
								</SkeletonSuspended>
							</div>
						)
					)}
				</div>
				<Button
					variant="outline"
					className="w-16 border-b border-l border-t-0 border-r-0 rounded-none grid place-items-center text-destructive hover:text-foreground hover:cursor-pointer transition-colors"
					onClick={onRemove}
				>
					<Trash2 />
				</Button>
			</div>
			<div
				className="flex overflow-x-auto gap-4 grow overflow-y-hidden"
				style={{ scrollbarWidth: "none" }}
			>
				{files.map((file) => (
					<Tooltip>
						<TooltipTrigger>
							<div key={file} className="size-48 shrink-0 bg-accent">
								<GenericImage fsSrc={file} />
							</div>
						</TooltipTrigger>
						<TooltipContent>
							<p>{file}</p>
						</TooltipContent>
					</Tooltip>
				))}
			</div>
		</div>
	);
}
