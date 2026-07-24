"use client";

import { ArrowDownOnSquareStackIcon } from "@heroicons/react/24/solid";
import { open } from "@tauri-apps/plugin-dialog";
import { useRouter } from "next/navigation";
import path from "path";
import { useCallback } from "react";
import { toast } from "sonner";
import {
  type DropzoneChildrenProps,
  TauriDropzone,
} from "@/components/ui/tauri-dropzone";
import { cn } from "@/lib/utils";
import { serializeViewerUrl } from "./viewer-url";

export default function ImageViewer() {
  const router = useRouter();
  const attemptView = (filePath: string) => {
    if (path.extname(filePath).toLowerCase() !== ".hdr") {
      toast.error("The selected file is not an HDR image");
      return;
    }
    router.push(serializeViewerUrl("/image-viewer/view", { filePath }));
  };

  return (
    <TauriDropzone
      className="size-full p-16"
      id="image-viewer-input"
      onClick={async () => {
        const selectedFile = await open({
          directory: false,
          filters: [{ extensions: ["hdr"], name: "HDR Image" }],
          multiple: false,
        });
        if (selectedFile) {
          attemptView(selectedFile);
        }
      }}
      onDrop={(paths) => {
        if (paths.length !== 1) {
          toast.error("Only one image can be viewed at a time");
          return;
        }
        attemptView(paths[0]!);
      }}
    >
      {useCallback(
        ({ isDragActive }: DropzoneChildrenProps) => (
          <div
            className={cn(
              "grid size-full cursor-pointer place-items-center border-8 border-dashed p-4 text-border transition-colors focus:outline-hidden",
              "hover:border-foreground hover:text-foreground",
              // show invalid via group parent from Field as red
              "group-data-[invalid=true]/field:text-destructive",
              { "border-foreground text-foreground": isDragActive }
            )}
          >
            <div className="grid place-items-center gap-2">
              <ArrowDownOnSquareStackIcon className="size-16" />
              <p>Drop or select an .hdr image here</p>
            </div>
          </div>
        ),
        []
      )}
    </TauriDropzone>
  );
}
