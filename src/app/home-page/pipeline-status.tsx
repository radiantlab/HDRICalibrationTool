"use client";

import {
  EllipsisVerticalIcon,
  FolderOpenIcon,
  PhotoIcon,
} from "@heroicons/react/24/solid";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { serializeViewerUrl } from "../image-viewer/viewer-url";
import { usePipelineStatus } from "../pipeline-status-context";

export function PipelineStatus({
  onFinishAcknowledgment,
}: {
  onFinishAcknowledgment: () => void;
}) {
  const { progress, statusText, lastEmittedOutput } = usePipelineStatus();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2">
      {statusText ? (
        <div className="justify-left flex items-center gap-2 text-muted-foreground text-sm">
          {progress !== 100 && <Spinner className="size-4" />}
          {statusText}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <div className="text-muted-foreground text-xs">{progress}%</div>
        <Progress value={progress} />
        <Button disabled={progress !== 100} onClick={onFinishAcknowledgment}>
          Dismiss
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={progress !== 100} size="icon" variant="outline">
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              disabled={!lastEmittedOutput}
              onClick={() => {
                if (lastEmittedOutput) {
                  revealItemInDir(lastEmittedOutput.path);
                }
              }}
            >
              <FolderOpenIcon />
              View file
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!lastEmittedOutput}
              onClick={() => {
                router.push(
                  serializeViewerUrl("/image-viewer/view", {
                    filePath: lastEmittedOutput?.path,
                  })
                );
              }}
            >
              <PhotoIcon />
              View image
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
