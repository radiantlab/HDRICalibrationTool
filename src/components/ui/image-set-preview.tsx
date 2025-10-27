import { stat } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import path from "path";
import { useMemo } from "react";
import { SkeletonSuspended } from "./skeleton-suspended";
import prettyBytes from "pretty-bytes";
import { TiffImage } from "./(tiff-image)/tiff-image";

export type ImageSet = {
	name: string;
	files: string[];
};

export function ImageSetPreview({ name, files }: ImageSet) {
	const fileStats = useMemo(
		() => Promise.all(files.map((f) => stat(f))),
		[files]
	);

	const fileTypes = useMemo(
		() => Array.from(new Set(files.map((f) => path.extname(f).slice(1)))),
		[files]
	);

	return (
		<div className="h-56">
			<div className="grid grid-flow-col bg-accent divide-x border-b px-2">
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
			<div
				className="flex overflow-x-auto gap-4"
				style={{ scrollbarWidth: "none" }}
			>
				{files.map((file) => {
					let imageElem: React.ReactNode;
					switch (path.extname(file).toLowerCase()) {
						case ".jpg":
						case ".jpeg":
							imageElem = (
								<img
									src={convertFileSrc(file)}
									className="size-full object-contain"
								/>
							);
							break;
						default:
							imageElem = <TiffImage key={file} src={file} />;
							break;
					}
					return (
						<div key={file} className="size-48 bg-accent">
							{imageElem}
						</div>
					);
				})}
			</div>
		</div>
	);
}
