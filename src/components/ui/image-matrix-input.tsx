import { ArrowDownOnSquareStackIcon } from "@heroicons/react/24/solid";
import type { DialogFilter } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@/lib/host/env";
import { pickFiles, pickImageSets } from "@/lib/host/pick";
import type { DirEntry } from "@tauri-apps/plugin-fs";
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

export interface ImageSetIssue {
  program: string;
  statusCode: number | null;
  stderr: string;
  summary: string;
  title: string;
}

type FileMatrixFieldName<T extends FieldValues> = FieldPathByValue<
  T,
  ImageSet[] | undefined
>;
interface FileMatrixInputProps<
  T extends FieldValues,
  TName extends FileMatrixFieldName<T>,
> {
  className?: string;
  control: Control<T>;
  /**
   * Makes the whole panel read-only. A batch commits to a snapshot of the sets
   * taken when the run started, so while one is in flight the rows still have
   * to be readable but must not be allowed to shift under the run: the issue
   * banners are keyed by array index, and any edit resets them all.
   */
  disabled?: boolean;
  issuesByIndex?: Partial<Record<number, ImageSetIssue>>;
  name: TName;
  rules?: Omit<RegisterOptions<T, TName>, "validate"> & {
    validate?: RegisterOptions<T, TName>["validate"];
  };
}

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
  disabled,
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

      // Only Tauri produces real paths here: a browser drop registers its
      // files first and hands over session paths, which are already files and
      // have no directory to expand. Grouping them by "directory" would be
      // meaningless, so they become one set named for what was dropped.
      if (!isTauri()) {
        field.onChange([
          ...(value ?? []),
          {
            files: files.filter((candidate) => {
              const extension = path
                .extname(candidate)
                .slice(1)
                .toLowerCase();
              const accepted = imageFileExtensions.includes(extension);
              if (!accepted) {
                toast.error(
                  `'${path.basename(candidate)}' is not an acceptable image file`
                );
              }
              return accepted;
            }),
            name: "Images",
          },
        ]);
        return;
      }
      const { readDir, stat } = await import("@tauri-apps/plugin-fs");

      // group by top-level directory name (first segment of path)
      const groups = new Map<string, ImageSet>();
      for (const rawPath of files.toSorted((a, b) => a.localeCompare(b))) {
        console.log("rawPath", rawPath);
        // biome-ignore lint/performance/noAwaitInLoops: sequential awaits are intentional here — switching to Promise.all would change error-handling semantics (first-failure vs. all-settled) and possibly ordering-dependent grouping behavior in file-set matching.
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
    [field, value, filterForAcceptance]
  );

  // Grouping into sets happens in `pickImageSets`, because it is the part that
  // differs by host: a directory on the desktop, `webkitRelativePath` in a
  // browser. `onDrop` below still handles real dropped paths, which only Tauri
  // produces.
  const addSets = useCallback(
    (sets: { files: string[]; name: string }[]) => {
      if (sets.length === 0) {
        return;
      }
      field.onChange([...(value ?? []), ...sets]);
    },
    [field, value]
  );

  const selectFiles = useCallback(async () => {
    addSets(await pickImageSets({ directory: false, filters: imageFilters }));
  }, [addSets]);

  const selectMultipleDirectories = useCallback(async () => {
    addSets(await pickImageSets({ directory: true, filters: imageFilters }));
  }, [addSets]);

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
              key={row.name}
            >
              <ImageSetPreview
                disabled={disabled}
                files={row.files.toSorted((a, b) => a.localeCompare(b))}
                name={row.name}
                onAdd={async () => {
                  const newFiles = await pickFiles({
                    filters: imageFilters,
                    multiple: true,
                  });
                  if (newFiles.length === 0) {
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
                  field.onChange(value.filter((_, i) => i !== index));
                }}
                onRemoveIndex={(deleteIndex) => {
                  value[index] = {
                    ...row,
                    files: row.files.filter((_, i) => i !== deleteIndex),
                  };
                  field.onChange([...value]);
                }}
              />
              {issue ? (
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
              ) : null}
            </div>
          );
        })}
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <TauriDropzone
              disabled={disabled}
              id="image-matrix-input"
              onClick={selectFiles}
              onDrop={onDrop}
            >
              {useCallback(
                ({ isDragActive }: DropzoneChildrenProps) => (
                  <div
                    className={cn(
                      "grid h-56 place-items-center border-8 border-dashed p-4 text-border transition-colors focus:outline-hidden",
                      // No hover affordance while locked: nothing should invite
                      // a drop that the panel is going to ignore.
                      disabled
                        ? "opacity-50"
                        : "cursor-pointer hover:border-foreground hover:text-foreground",
                      // show invalid via group parent from Field as red
                      "group-data-[invalid=true]/field:text-destructive",
                      { "border-foreground text-foreground": isDragActive }
                    )}
                  >
                    <div className="grid place-items-center gap-2">
                      <ArrowDownOnSquareStackIcon className="size-16" />
                      <p>Drag and drop images here</p>
                      {/* Both formats are accepted and neither is rejected, so
                          the preference has to be stated where the choice is
                          actually made rather than left to the documentation. */}
                      <p className="max-w-md text-balance text-center text-xs">
                        RAW files (CR2, NEF, DNG and similar) give more accurate
                        results than JPEG, and need no camera response function.
                      </p>
                    </div>
                  </div>
                ),
                [disabled]
              )}
            </TauriDropzone>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            <ContextMenuItem
              disabled={disabled}
              onClick={selectMultipleDirectories}
            >
              Create from directories...
              {/* <ContextMenuShortcut>⌘]</ContextMenuShortcut> */}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </FieldContent>
      {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
    </Field>
  );
}
