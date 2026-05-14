import { stat } from "@tauri-apps/plugin-fs";
import path from "path";
import { useMemo } from "react";
import { SkeletonSuspended } from "./skeleton-suspended";
import prettyBytes from "pretty-bytes";
import { GenericImage } from "./(image)/generic-image";
import { Trash2 } from "lucide-react";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { PlusIcon } from "@heroicons/react/24/solid";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "./context-menu";

export type ImageSet = {
	name: string;
	files: string[];
};

export function ImageSetPreview({
	name,
	files,
	onRemove,
	onAdd,
	onRemoveIndex,
	onClick,
}: ImageSet & {
	onRemove: () => void;
	onAdd: () => void;
	onRemoveIndex: (index: number) => void;
	onClick: (image: string) => void;
}) {
	const fileStats = useMemo(
		() => Promise.all(files.map((f) => stat(f))),
		[files],
	);

	const fileTypes = useMemo(
		() => Array.from(new Set(files.map((f) => path.extname(f).slice(1)))),
		[files],
	);

	return (
		<div
			className="flex min-h-56 flex-col bg-accent"
			data-testid="image-set-preview"
		>
			<div className="flex w-full">
				<div className="flex-1 grid grid-flow-col divide-x border-b pl-2">
					<div className="font-bold text-2xl flex items-center">{name}</div>
					{useMemo(
						() =>
							Object.entries({
								Files: files.length,
								[fileTypes.length > 1 ? "File Types" : "File Type"]:
									fileTypes.join(", "),
								"Average File Size": fileStats.then((stats) =>
									prettyBytes(
										stats.reduce((acc, stat) => acc + stat.size, 0) /
											stats.length,
									),
								),
							} satisfies Record<
								string,
								string | number | Promise<string | number>
							>).map(([key, value]) => (
								<div
									key={key}
									className="flex gap-1 items-center text-sm text-muted-foreground px-2"
								>
									{key}:
									<SkeletonSuspended sizePlaceholder={"placeholder"}>
										{value}
									</SkeletonSuspended>
								</div>
							)),
						[fileStats, fileTypes, files.length],
					)}
				</div>
				<Button
					variant="outline"
					className="w-16 h-full border-b border-l border-t-0 border-r-0 rounded-none grid place-items-center text-destructive hover:text-foreground hover:cursor-pointer transition-colors"
					onClick={onRemove}
				>
					<Trash2 />
				</Button>
				<Button
					variant="ghost"
					className="w-16 h-full border-b border-l border-t-0 border-r-0 rounded-none grid place-items-center text-muted-foreground hover:text-foreground hover:cursor-pointer transition-colors"
					onClick={onAdd}
				>
					<PlusIcon />
				</Button>
			</div>
			<div
				className="flex overflow-x-auto gap-4 grow overflow-y-hidden"
				style={{ scrollbarWidth: "none" }}
			>
				{files.map((file, index) => (
					<Tooltip key={file}>
						<TooltipTrigger>
							<ContextMenu>
								<ContextMenuTrigger asChild>
									<div
										className="size-48 shrink-0 bg-accent generic-image-container"
										onClick={() => onClick(file)}
									>
										<GenericImage fsSrc={file} />
									</div>
								</ContextMenuTrigger>
								<ContextMenuContent>
									<ContextMenuItem onClick={() => onRemoveIndex(index)}>
										Remove image
									</ContextMenuItem>
								</ContextMenuContent>
							</ContextMenu>
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
