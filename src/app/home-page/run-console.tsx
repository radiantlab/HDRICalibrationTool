"use client";

import { canRevealInFileManager } from "@/lib/host/env";
import { revealFile } from "@/lib/host/reveal";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { serializeViewerUrl } from "../image-viewer/viewer-url";
import { usePipelineStatus } from "../pipeline-status-context";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour12: false });
}

/**
 * The live view of a pipeline run.
 *
 * The messages were always being emitted; the provider used to keep only the
 * most recent one, so they were unreadable. This renders the accumulated log.
 *
 * The viewport is a plain scroll container rather than a shadcn ScrollArea: it
 * needs role="log" with a polite live region so a screen reader announces new
 * lines, and native scrolling so the auto-scroll below is a single assignment
 * rather than reaching into a custom scrollbar's inner viewport.
 */
export function RunConsole({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { lastEmittedOutput, log, progress, setIndex, setTotal, statusText } =
    usePipelineStatus();
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement>(null);

  // Follow the tail as entries arrive. The provider appends by replacing the
  // array, so its identity changes exactly when an entry is added.
  // biome-ignore lint/correctness/useExhaustiveDependencies: log is the trigger for this effect, not a value its body reads, so the rule sees it as unnecessary.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [log]);

  const copyLog = async () => {
    const text = log
      .map((entry) => `${formatTime(entry.at)}  ${entry.message}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Log copied");
    } catch {
      toast.error("Could not copy the log");
    }
  };

  const openImage = () => {
    router.push(
      serializeViewerUrl("/image-viewer/view", {
        filePath: lastEmittedOutput?.path,
      })
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[80vh] w-[42rem] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle>Generating HDR images</DialogTitle>
        </DialogHeader>

        {setIndex && setTotal ? (
          <p className="text-muted-foreground text-sm">
            Set {setIndex} of {setTotal}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <span className="w-10 text-muted-foreground text-xs">
            {progress}%
          </span>
          <Progress value={progress} />
        </div>

        {statusText ? (
          <p className="text-muted-foreground text-sm">{statusText}</p>
        ) : null}

        <div
          aria-live="polite"
          className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs"
          ref={viewportRef}
          role="log"
        >
          {log.map((entry) => (
            <div
              className={
                entry.kind === "warning" || entry.kind === "error"
                  ? "text-destructive"
                  : undefined
              }
              key={`${entry.at}-${entry.message}`}
            >
              <span className="text-muted-foreground">
                {formatTime(entry.at)}
              </span>{" "}
              {entry.message}
            </div>
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button onClick={copyLog} type="button" variant="outline">
            Copy log
          </Button>
          <div className="flex gap-2">
            {canRevealInFileManager() ? (
              <Button
                disabled={!lastEmittedOutput}
                onClick={() => {
                  if (lastEmittedOutput) {
                    revealFile(lastEmittedOutput.path);
                  }
                }}
                type="button"
                variant="outline"
              >
                Open folder
              </Button>
            ) : null}
            <Button
              disabled={!lastEmittedOutput}
              onClick={openImage}
              type="button"
            >
              Open image
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
