import {
	Control,
	FieldValues,
	FieldPathByValue,
	useController,
	RegisterOptions,
} from "react-hook-form";
import { Field, FieldContent } from "./field";
import { FieldError } from "./field";
import {
	TauriDropzone,
	DropzoneChildrenProps,
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
import { DirEntry, readDir, stat } from "@tauri-apps/plugin-fs";
import { ImageSet, ImageSetPreview } from "./image-set-preview";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";

export type ImageSetIssue = {
	title: string;
	summary: string;
	program: string;
	statusCode: number | null;
	stderr: string;
};

type FileMatrixFieldName<T extends FieldValues> = FieldPathByValue<
	T,
	ImageSet[] | undefined
>;
type FileMatrixInputProps<
	T extends FieldValues,
	TName extends FileMatrixFieldName<T>,
> = {
	control: Control<T>;
	name: TName;
	className?: string;
	issuesByIndex?: Partial<Record<number, ImageSetIssue>>;
	rules?: Omit<RegisterOptions<T, TName>, "validate"> & {
		validate?: RegisterOptions<T, TName>["validate"];
	};
};

const imageFilters: DialogFilter[] = [
	{ name: "Images", extensions: imageFileExtensions },
];

type FullDirEntry = DirEntry & {
	path: string;
};

export function ImageMatrixInput<
	T extends FieldValues,
	TName extends FileMatrixFieldName<T>,
>({
	control,
	name,
	className,
	issuesByIndex,
	rules,
}: FileMatrixInputProps<T, TName>) {
	// todo: properly handle field states
	const { field, fieldState } = useController<T, TName>({
		control,
		name,
		rules,
	});
	const value = field.value as ImageSet[] | undefined;

	const filterForAcceptance = useCallback(
		(entries: FullDirEntry[]): FullDirEntry[] =>
			entries.filter((e) => {
				const ext = path.extname(e.name).slice(1).toLowerCase();
				const accepted = e.isFile && imageFileExtensions.includes(ext);
				if (!accepted)
					toast.error(`'${e.name}' is not an acceptable image file`);

				return accepted;
			}),
		[],
	);

	const onDrop = useCallback(
		async (files: string[]) => {
			if (!files.length) return;

			// group by top-level directory name (first segment of path)
			const groups = new Map<string, ImageSet>();
			for (const rawPath of files.toSorted((a, b) => a.localeCompare(b))) {
				console.log("rawPath", rawPath);
				const fileStats = await stat(rawPath);
				const { isFile } = fileStats;
				const fileDir = isFile ? path.dirname(rawPath) : rawPath;
				const groupingDir = path.basename(fileDir);

				const arr = groups.get(groupingDir) ?? {
					name: groupingDir,
					files: [],
				};
				let pendingEntries: FullDirEntry[] = [];
				if (isFile) {
					pendingEntries = [
						{ ...fileStats, name: path.basename(rawPath), path: rawPath },
					];
				} else {
					pendingEntries = (await readDir(rawPath)).map((e) => ({
						...e,
						path: path.join(rawPath, e.name),
					}));
				}
				arr.files.push(
					...filterForAcceptance(pendingEntries).map((e) => e.path),
				);
				groups.set(groupingDir, arr);
			}

			const newRows = Array.from(groups.values());
			field.onChange([...(value ?? []), ...newRows]);
		},
		[field, value],
	);

	const selectFiles = useCallback(async () => {
		const selectedFiles = await open({
			multiple: true,
			directory: false,
			filters: imageFilters,
		});
		if (selectedFiles) onDrop(selectedFiles);
	}, [field, value]);

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
		<Field className={className} data-invalid={fieldState.invalid}>
			<FieldContent className="flex flex-col gap-0 divide-y overflow-y-auto">
				{value?.map((row: ImageSet, index: number) => {
					const issue = issuesByIndex?.[index];

					return (
						<div
							key={index}
							className={cn(
								"flex min-h-56 flex-col bg-accent",
								issue && "border border-destructive/50 bg-destructive/5",
							)}
						>
							<ImageSetPreview
								name={row.name}
								files={row.files.toSorted((a, b) => a.localeCompare(b))}
								onRemove={() => {
									field.onChange(value?.filter((_, i) => i !== index) ?? []);
								}}
							/>
							{issue && (
								<div className="border-t border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
									<p className="font-medium text-destructive">{issue.title}</p>
									<p className="mt-1 text-foreground/90">{issue.summary}</p>
									<HoverCard openDelay={150} closeDelay={100}>
										<HoverCardTrigger asChild>
											<button
												type="button"
												className="mt-3 text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
											>
												Technical details
											</button>
										</HoverCardTrigger>
										<HoverCardContent
											align="start"
											side="bottom"
											className="w-lg max-w-[calc(100vw-3rem)] space-y-2 p-3 text-xs"
										>
											<p>
												<span className="font-medium">Program:</span>{" "}
												<span className="font-mono break-all">
													{issue.program}
												</span>
											</p>
											<p>
												<span className="font-medium">Exit code:</span>{" "}
												<span className="font-mono">
													{issue.statusCode ?? "unknown"}
												</span>
											</p>
											<div>
												<p className="font-medium">stderr</p>
												<pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background p-2 font-mono">
													{issue.stderr || "No stderr output captured."}
												</pre>
											</div>
										</HoverCardContent>
									</HoverCard>
								</div>
							)}
						</div>
					);
				})}
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<TauriDropzone
							id="image-matrix-input"
							onDrop={onDrop}
							onClick={selectFiles}
						>
							{useCallback(
								({ isDragActive }: DropzoneChildrenProps) => (
									<div
										className={cn(
											"transition-colors border-8 border-dashed text-border h-56 grid place-items-center p-4 cursor-pointer focus:outline-hidden",
											"hover:text-foreground hover:border-foreground",
											// show invalid via group parent from Field as red
											"group-data-[invalid=true]/field:text-destructive",
											{ "text-foreground border-foreground": isDragActive },
										)}
									>
										<div className="grid place-items-center gap-2">
											<ArrowDownOnSquareStackIcon className="size-16" />
											<p>Drag and drop images here</p>
										</div>
									</div>
								),
								[],
							)}
						</TauriDropzone>
					</ContextMenuTrigger>
					<ContextMenuContent className="w-52">
						<ContextMenuItem onClick={selectMultipleDirectories}>
							Create from directories...
							{/* <ContextMenuShortcut>⌘]</ContextMenuShortcut> */}
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			</FieldContent>
			{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
		</Field>
	);
}
