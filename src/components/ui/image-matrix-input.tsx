import {
	Control,
	FieldValues,
	FieldPathByValue,
	useController,
} from "react-hook-form";
import { Field, FieldContent } from "./field";
import {
	TauriDropzone,
	DropzoneChildrenProps,
	FileRejection,
} from "@/components/ui/tauri-dropzone";
import { cn } from "@/lib/utils";
import { ArrowDownOnSquareStackIcon } from "@heroicons/react/24/solid";
import { imageFileExtensions } from "@/lib/image-file-extensions";
import { toast } from "sonner";
import path from "path";
import { useCallback } from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DialogFilter, open } from "@tauri-apps/plugin-dialog";
import { readDir, stat } from "@tauri-apps/plugin-fs";
import { ImageSet, ImageSetPreview } from "./image-set-preview";

type FileMatrixFieldName<T extends FieldValues> = FieldPathByValue<
	T,
	ImageSet[] | undefined
>;
type FileMatrixInputProps<
	T extends FieldValues,
	TName extends FileMatrixFieldName<T>
> = {
	control: Control<T>;
	name: TName;
	className?: string;
};

const imageFilters: DialogFilter[] = [
	{ name: "Images", extensions: imageFileExtensions },
];

export function ImageMatrixInput<
	T extends FieldValues,
	TName extends FileMatrixFieldName<T>
>({ control, name, className }: FileMatrixInputProps<T, TName>) {
	// todo: properly handle field states
	const { field } = useController<T, TName>({ control, name });
	const value = field.value as ImageSet[] | undefined;

	const onDrop = useCallback(
		async (acceptedFiles: string[]) => {
			if (!acceptedFiles.length) return;

			// group by top-level directory name (first segment of path)
			const groups = new Map<string, ImageSet>();
			for (const rawPath of acceptedFiles) {
				const { isFile } = await stat(rawPath);
				const fileDir = isFile ? path.dirname(rawPath) : rawPath;
				const groupingDir = path.basename(fileDir);

				const arr = groups.get(groupingDir) ?? {
					name: groupingDir,
					files: [],
				};
				if (isFile) {
					arr.files.push(rawPath);
				} else {
					const files = await readDir(rawPath);
					const acceptedPaths = files
						.filter((f) => {
							if (!f.isFile) return false;
							const ext = path.extname(f.name).slice(1).toLowerCase();
							return imageFileExtensions.includes(ext);
						})
						.map((f) => path.join(rawPath, f.name));
					arr.files.push(...acceptedPaths);
				}
				groups.set(groupingDir, arr);
			}

			const newRows = Array.from(groups.values());
			// todo: sort these by total alpha value, so we can see the images sorted from most exposed to least exposed
			field.onChange([...(value ?? []), ...newRows]);
		},
		[field, value]
	);

	const selectOneDirectory = useCallback(async () => {
		const selectedDirectory = await open({
			multiple: false,
			directory: true,
			filters: imageFilters,
		});
		if (selectedDirectory) onDrop([selectedDirectory]);
	}, [onDrop]);

	const selectMultipleDirectories = useCallback(async () => {
		const selectedDirectories = await open({
			multiple: true,
			directory: true,
			filters: imageFilters,
		});
		if (selectedDirectories) onDrop(selectedDirectories);
	}, [onDrop]);
	return (
		<Field className={className}>
			<FieldContent className="flex flex-col gap-0 divide-y overflow-y-auto">
				{value?.map((row: ImageSet, index: number) => (
					<ImageSetPreview key={index} {...row} />
				))}
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<TauriDropzone
							accept={useCallback((p: string) => {
								const ext = path.extname(p).slice(1).toLowerCase();
								return imageFileExtensions.includes(ext);
							}, [])}
							multiple
							onDrop={onDrop}
							onError={useCallback(
								(err: Error) =>
									toast.error(`Error accepting files: ${err.message}`),
								[]
							)}
							onDropRejected={useCallback(
								(fileRejections: FileRejection[]) =>
									fileRejections.forEach((fr) =>
										toast.error(
											<>
												File rejected:{" "}
												{"path" in fr.file ? fr.file.path : "unknown"}
												<br />
												<br />
												{fr.errors.map((e) => e.message).join(", ")}
											</>
										)
									),
								[]
							)}
							onClick={selectOneDirectory}
						>
							{useCallback(
								({ isDragActive }: DropzoneChildrenProps) => (
									<div
										className={cn(
											"transition-colors border-8 border-dashed text-border h-56 grid place-items-center p-4 cursor-pointer focus:outline-hidden",
											"hover:text-foreground hover:border-foreground",
											{ "text-foreground border-foreground": isDragActive }
										)}
									>
										<div className="grid place-items-center gap-2">
											<ArrowDownOnSquareStackIcon className="size-16" />
											<p>Drag and drop images here</p>
										</div>
									</div>
								),
								[]
							)}
						</TauriDropzone>
					</ContextMenuTrigger>
					<ContextMenuContent className="w-52">
						<ContextMenuItem onClick={selectOneDirectory}>
							Create one...
							{/* <ContextMenuShortcut>⌘[</ContextMenuShortcut> */}
						</ContextMenuItem>
						<ContextMenuItem onClick={selectMultipleDirectories}>
							Create multiple...
							{/* <ContextMenuShortcut>⌘]</ContextMenuShortcut> */}
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			</FieldContent>
		</Field>
	);
}
