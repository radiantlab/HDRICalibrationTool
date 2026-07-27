"use client";

import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clearRuns,
  historyStats,
  type RunOutcome,
  type RunRecord,
  readRuns,
} from "@/lib/run-history";
import type { buildPipelineParams } from "../home-page/build-pipeline-params";
import { useGlobalPipelineConfig } from "../home-page/pipeline-config-store";
import { serializeViewerUrl } from "../image-viewer/viewer-url";
import { groupRunsByDay } from "./group-runs";

type OutcomeFilter = "all" | RunOutcome;

const OUTCOME_LABEL: Record<RunOutcome, string> = {
  error: "Failed",
  ok: "Succeeded",
  rejected: "Not started",
  warning: "Warnings",
};

const OUTCOME_CLASS: Record<RunOutcome, string> = {
  error: "text-destructive",
  ok: "text-muted-foreground",
  rejected: "text-muted-foreground italic",
  warning: "text-amber-600",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour12: false });
}

export default function RunsPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [stats, setStats] = useState({ bytes: 0, count: 0 });
  // Rejected attempts are recorded but hidden by default: they are the noisiest
  // entries and retention is unbounded.
  const [filter, setFilter] = useState<OutcomeFilter>("all");
  const [logRecord, setLogRecord] = useState<RunRecord | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const router = useRouter();
  const setGlobalConfig = useGlobalPipelineConfig((state) => state.set);

  const load = useCallback(async () => {
    setRuns(await readRuns());
    setStats(await historyStats());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible =
    filter === "all"
      ? runs.filter((record) => record.outcome !== "rejected")
      : runs.filter((record) => record.outcome === filter);

  const reuse = (record: RunRecord) => {
    const inputs = record.inputs as unknown as ReturnType<
      typeof buildPipelineParams
    >;
    setGlobalConfig({
      cameraResponseLocation: inputs.responseFunction || null,
      correctionFiles: {
        calibrationFactor: inputs.photometricAdjustmentCal || null,
        fisheye: inputs.fisheyeCorrectionCal || null,
        neutralDensity: inputs.neutralDensityCal || null,
        vignetting: inputs.vignettingCorrectionCal || null,
      },
      fisheyeView: {
        horizontalViewDegrees: inputs.horizontalAngle,
        projection: inputs.projection,
        verticalViewDegrees: inputs.verticalAngle,
      },
      // The image set belongs to that capture and is deliberately not restored.
      inputSets: [],
      lensMask: {
        radius: inputs.diameter / 2,
        x: inputs.xleft + inputs.diameter / 2,
        y: inputs.ytop + inputs.diameter / 2,
      },
      outputSettings: {
        filterIrrelevantSrcImages: inputs.filterImages,
        targetRes: inputs.xdim,
      },
      validityCheck: {
        measuredVerticalIlluminanceLux: inputs.measuredVerticalIlluminance,
      },
    });
    toast.success("Inputs restored. Select an image set to run them.");
    router.push("/home-page");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-4">
        <h1 className="font-bold text-xl">Runs</h1>
        <Select
          onValueChange={(value) => setFilter(value as OutcomeFilter)}
          value={filter}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All runs</SelectItem>
            <SelectItem value="ok">Succeeded</SelectItem>
            <SelectItem value="warning">With warnings</SelectItem>
            <SelectItem value="error">Failed</SelectItem>
            <SelectItem value="rejected">Not started</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {visible.length === 0 ? (
          <p className="text-muted-foreground text-sm">No runs to show.</p>
        ) : null}
        {groupRunsByDay(visible, new Date()).map((group) => (
          <section className="mb-6" key={group.label}>
            <h2 className="mb-2 font-semibold text-muted-foreground text-sm">
              {group.label}
            </h2>
            <ul className="divide-y rounded-md border">
              {group.runs.map((record) => (
                <li
                  className="flex items-center justify-between gap-4 p-3"
                  key={record.id}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono">
                        {formatTime(record.startedAt)}
                      </span>
                      <span className={OUTCOME_CLASS[record.outcome]}>
                        {OUTCOME_LABEL[record.outcome]}
                      </span>
                    </div>
                    {record.reason ? (
                      <p className="truncate text-muted-foreground text-xs">
                        {record.reason}
                      </p>
                    ) : null}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" type="button" variant="outline">
                        Actions
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        disabled={record.outputs.length === 0}
                        onClick={() => {
                          const [first] = record.outputs;
                          if (first) {
                            revealItemInDir(first);
                          }
                        }}
                      >
                        Open folder
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={record.outputs.length === 0}
                        onClick={() =>
                          router.push(
                            serializeViewerUrl("/image-viewer/view", {
                              filePath: record.outputs[0],
                            })
                          )
                        }
                      >
                        Open image
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLogRecord(record)}>
                        View log
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => reuse(record)}>
                        Reuse inputs
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="flex items-center justify-between border-t p-4 text-muted-foreground text-sm">
        <span>
          {stats.count} runs, {Math.round(stats.bytes / 1024)} KB
        </span>
        <Button
          onClick={() => setConfirmClear(true)}
          type="button"
          variant="outline"
        >
          Clear history
        </Button>
      </div>

      <Dialog onOpenChange={() => setLogRecord(null)} open={logRecord !== null}>
        <DialogContent className="flex max-h-[80vh] w-[42rem] max-w-none flex-col">
          <DialogHeader>
            <DialogTitle>Run log</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
            {logRecord?.log.map((entry) => (
              <div key={`${entry.at}-${entry.message}`}>
                <span className="text-muted-foreground">
                  {formatTime(entry.at)}
                </span>{" "}
                {entry.message}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setConfirmClear} open={confirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear run history?</DialogTitle>
            <DialogDescription>
              This deletes the record of every run, including the inputs that
              produced them. The HDR images themselves are not touched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmClear(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await clearRuns();
                setConfirmClear(false);
                await load();
              }}
              type="button"
            >
              Clear history
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
