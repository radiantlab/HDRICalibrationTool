import {
	Control,
	FieldValues,
	FieldPathByValue,
	useController,
} from "react-hook-form";
import { Field, FieldContent } from "./field";
import TauriDropzone, {
	DropzoneChildrenProps,
	FileRejection,
} from "@/components/ui/tauri-dropzone";
import { cn } from "@/lib/utils";
import { ArrowDownOnSquareStackIcon } from "@heroicons/react/24/solid";
import type { FileWithPath } from "react-dropzone";
import { imageFileExtensions } from "@/lib/image-file-extensions";
import { toast } from "sonner";
import path from "path";
import { useCallback } from "react";

type FileMatrixFieldName<T extends FieldValues> = FieldPathByValue<
	T,
	FileGroup[] | undefined
>;
type FileMatrixInputProps<
	T extends FieldValues,
	TName extends FileMatrixFieldName<T>
> = {
	control: Control<T>;
	name: TName;
};

type FileGroup = {
	name: string;
	files: string[];
};

export function ImageMatrixInput<
	T extends FieldValues,
	TName extends FileMatrixFieldName<T>
>({ control, name }: FileMatrixInputProps<T, TName>) {
	// todo: properly handle field states
	const { field } = useController<T, TName>({ control, name });
	const value = field.value as FileGroup[] | undefined;

	const onDrop = useCallback(
		(acceptedFiles: string[]) => {
			if (!acceptedFiles?.length) return;

			// group by top-level directory name (first segment of path)
			const groups = new Map<string, FileGroup>();
			for (const rawPath of acceptedFiles) {
				const fileDir = path.dirname(rawPath);
				const directParent = path.basename(fileDir);

				const arr = groups.get(directParent) ?? {
					name: directParent,
					files: [],
				};
				arr.files.push(rawPath);
				groups.set(directParent, arr);
			}

			const newRows = Array.from(groups.values());
			field.onChange([...(value ?? []), ...newRows]);
		},
		[field, value]
	);

	return (
		<Field>
			<FieldContent className="flex flex-col gap-0">
				{value?.map((row: FileGroup, index: number) => (
					<div key={index} className="h-56 border-b px-8">
						<div className="text-lg font-bold">{row.name}</div>
						{/* {row.files.map((file) => (
							<div key={file.name}>{file.name}</div>
						))} */}
					</div>
				))}
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
				>
					{useCallback(
						({ isDragActive }: DropzoneChildrenProps) => (
							<div
								className={cn(
									"transition-colors border-8 border-dashed text-border h-56 grid place-items-center p-4 cursor-pointer focus:outline-none",
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
			</FieldContent>
		</Field>
	);
}
