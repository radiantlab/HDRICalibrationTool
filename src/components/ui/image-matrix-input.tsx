import { ArrowDownOnSquareStackIcon } from "@heroicons/react/24/solid";
import { type DialogFilter, open } from "@tauri-apps/plugin-dialog";
import { type DirEntry, readDir, stat } from "@tauri-apps/plugin-fs";
import path from "path";
import { useCallback } from "react";
import {
  type Control,
  type FieldPathByValue,
  type FieldValues,
  type RegisterOptions,
  useController,
} from "react-hook-form";
import { toast } from "sonner";
import { useSelectedImage } from "@/app/home-page/selected-image-context";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  type DropzoneChildrenProps,
  TauriDropzone,
} from "@/components/ui/tauri-dropzone";
import { imageFileExtensions } from "@/lib/image-file-extensions";
import { cn } from "@/lib/utils";
import { Field, FieldContent, FieldError } from "./field";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";
import { type ImageSet, ImageSetPreview } from "./image-set-preview";

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
  { extensions: imageFileExtensions, name: "Images" },
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
        if (!accepted) {
          toast.error(`'${e.name}' is not an acceptable image file`);
        }

        return accepted;
      }),
    []
  );

  const onDrop = useCallback(
    async (files: string[]) => {
      if (!files.length) {
        return;
      }

      // group by top-level directory name (first segment of path)
      const groups = new Map<string, ImageSet>();
      for (const rawPath of files.toSorted((a, b) => a.localeCompare(b))) {
        console.log("rawPath", rawPath);
        const fileStats = await stat(rawPath);
        const { isFile } = fileStats;
        const fileDir = isFile ? path.dirname(rawPath) : rawPath;
        const groupingDir = path.basename(fileDir);

        const arr = groups.get(groupingDir) ?? {
          files: [],
          name: groupingDir,
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
          ...filterForAcceptance(pendingEntries).map((e) => e.path)
        );
        groups.set(groupingDir, arr);
      }

      const newRows = Array.from(groups.values());
      field.onChange([...(value ?? []), ...newRows]);
    },
    [field, value]
  );

  const selectFiles = useCallback(async () => {
    const selectedFiles = await open({
      directory: false,
      filters: imageFilters,
      multiple: true,
    });
    if (selectedFiles) {
      onDrop(selectedFiles);
    }
  }, [field, value]);

  const selectMultipleDirectories = useCallback(async () => {
    const selectedDirectories = await open({
      directory: true,
      filters: imageFilters,
      multiple: true,
    });
    if (selectedDirectories) {
      onDrop(selectedDirectories);
    }
  }, [onDrop]);

  const { setSelectedImage } = useSelectedImage();

  return (
    <Field className={className} data-invalid={fieldState.invalid}>
      <FieldContent className="flex flex-col gap-0 divide-y overflow-y-auto">
        {value?.map((row: ImageSet, index: number) => {
          const issue = issuesByIndex?.[index];

          return (
            <div
              className={cn(
                "flex min-h-56 flex-col bg-accent",
                issue && "border border-destructive/50 bg-destructive/5"
              )}
              key={index}
            >
              <ImageSetPreview
                files={row.files.toSorted((a, b) => a.localeCompare(b))}
                name={row.name}
                onAdd={async () => {
                  const newFiles = await open({
                    directory: false,
                    filters: imageFilters,
                    multiple: true,
                  });
                  if (!newFiles) {
                    return;
                  }

                  value[index] = {
                    ...row,
                    files: [...row.files, ...newFiles],
                  };
                  field.onChange([...value]);
                }}
                onClick={setSelectedImage}
                onRemove={() => {
                  field.onChange(value?.filter((_, i) => i !== index) ?? []);
                }}
                onRemoveIndex={(deleteIndex) => {
                  value[index] = {
                    ...row,
                    files: row.files.filter((_, i) => i !== deleteIndex),
                  };
                  field.onChange([...value]);
                }}
              />
              {issue && (
                <div className="border-destructive/40 border-t bg-destructive/10 px-4 py-3 text-sm">
                  <p className="font-medium text-destructive">{issue.title}</p>
                  <p className="mt-1 text-foreground/90">{issue.summary}</p>
                  <HoverCard closeDelay={100} openDelay={150}>
                    <HoverCardTrigger asChild>
                      <button
                        className="mt-3 font-medium text-muted-foreground text-xs underline underline-offset-4 transition-colors hover:text-foreground"
                        type="button"
                      >
                        Technical details
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent
                      align="start"
                      className="w-lg max-w-[calc(100vw-3rem)] space-y-2 p-3 text-xs"
                      side="bottom"
                    >
                      <p>
                        <span className="font-medium">Program:</span>{" "}
                        <span className="break-all font-mono">
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
              onClick={selectFiles}
              onDrop={onDrop}
            >
              {useCallback(
                ({ isDragActive }: DropzoneChildrenProps) => (
                  <div
                    className={cn(
                      "grid h-56 cursor-pointer place-items-center border-8 border-dashed p-4 text-border transition-colors focus:outline-hidden",
                      "hover:border-foreground hover:text-foreground",
                      // show invalid via group parent from Field as red
                      "group-data-[invalid=true]/field:text-destructive",
                      { "border-foreground text-foreground": isDragActive }
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
