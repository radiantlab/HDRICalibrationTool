"use client";

import {
  EllipsisVerticalIcon,
  FolderOpenIcon,
  PhotoIcon,
} from "@heroicons/react/24/solid";
import { revealFile } from "@/lib/host/reveal";
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
  onShowConsole,
  onStop,
  running,
  stopRequested,
}: {
  onFinishAcknowledgment: () => void;
  onShowConsole: () => void;
  /**
   * Null when there is no later set to stop before, which is every run of a
   * single image set.
   */
  onStop: (() => void) | null;
  /**
   * Whether the run is still going. Not derived from progress: the backend
   * reports a run finishing at the end of every set, so the bar reads 100
   * between sets while the batch continues.
   */
  running: boolean;
  stopRequested: boolean;
}) {
  const { progress, statusText, lastEmittedOutput } = usePipelineStatus();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2">
      {statusText ? (
        <div className="justify-left flex items-center gap-2 text-muted-foreground text-sm">
          {running ? <Spinner className="size-4" /> : null}
          {statusText}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <div className="text-muted-foreground text-xs">{progress}%</div>
        <Progress value={progress} />
        <Button onClick={onShowConsole} type="button" variant="outline">
          Show log
        </Button>
        {onStop && running ? (
          <Button
            disabled={stopRequested}
            onClick={onStop}
            type="button"
            variant="outline"
          >
            {stopRequested ? "Stopping after this set" : "Stop"}
          </Button>
        ) : null}
        <Button disabled={running} onClick={onFinishAcknowledgment}>
          Dismiss
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={running} size="icon" variant="outline">
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              disabled={!lastEmittedOutput}
              onClick={() => {
                if (lastEmittedOutput) {
                  revealFile(lastEmittedOutput.path);
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
