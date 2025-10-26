import { stat } from "@tauri-apps/plugin-fs";
import path from "path";
import { useMemo } from "react";
import { SkeletonSuspended } from "./skeleton-suspended";
import prettyBytes from "pretty-bytes";

export type FileGroup = {
	name: string;
	files: string[];
};

export function ImageSetPreview({ name, files }: FileGroup) {
	const fileStats = useMemo(
		() => Promise.all(files.map((f) => stat(f))),
		[files]
	);

	const fileTypes = useMemo(
		() => Array.from(new Set(files.map((f) => path.extname(f).slice(1)))),
		[files]
	);

	return (
		<div className="h-56 border-b px-4">
			<div className="grid grid-flow-col">
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
							className="flex gap-1 items-center text-sm text-muted-foreground"
						>
							{key}:
							<SkeletonSuspended sizePlaceholder={"placeholder"}>
								{value}
							</SkeletonSuspended>
						</div>
					)
				)}
			</div>
		</div>
	);
}
