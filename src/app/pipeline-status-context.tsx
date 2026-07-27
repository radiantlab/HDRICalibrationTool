"use client";

import { listen } from "@tauri-apps/api/event";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import z from "zod";

const pipelineStatusSchema = z.object({
  kind: z.enum(["step", "progress", "warning", "error", "done"]),
  message: z.string().optional().nullable(),
  progress: z.number().optional().nullable(),
  set_index: z.number().optional().nullable(),
  set_total: z.number().optional().nullable(),
  step: z.string().optional().nullable(),
});

type PipelineStatusPayload = z.infer<typeof pipelineStatusSchema>;

const pipelineOutputSchema = z.object({
  path: z.string(),
});

export type PipelineOutputPayload = z.infer<typeof pipelineOutputSchema>;

/**
 * One line of a run's transcript.
 *
 * Shaped to be the record run history will persist, so that feature stores
 * these entries directly rather than reshaping them.
 */
export interface LogEntry {
  at: string;
  kind: "step" | "progress" | "warning" | "error" | "done";
  message: string;
  step: string | null;
}

const UNDERSCORE = /_/g;

function humanise(step: string) {
  return step.replace(UNDERSCORE, " ");
}

function statusTextFor(payload: PipelineStatusPayload): string | null {
  return payload.message ?? (payload.step ? humanise(payload.step) : null);
}

function warningTextFor(payload: PipelineStatusPayload): string {
  return (
    payload.message ??
    (payload.step
      ? `Pipeline warning: ${humanise(payload.step)}`
      : "Pipeline warning")
  );
}

/**
 * Progress-only events carry no text and would flood the log with percentages,
 * so only messages and named steps become entries.
 */
function toLogEntry(payload: PipelineStatusPayload): LogEntry | null {
  if (payload.kind === "progress") {
    return null;
  }
  const message = statusTextFor(payload);
  if (!message) {
    return null;
  }
  return {
    at: new Date().toISOString(),
    kind: payload.kind,
    message,
    step: payload.step ?? null,
  };
}

interface PipelineStatusContextValue {
  clearLog: () => void;
  lastEmittedOutput: PipelineOutputPayload | null;
  log: LogEntry[];
  payload: PipelineStatusPayload | null;
  progress: number;
  setIndex: number | null;
  setTotal: number | null;
  statusText: string;
}

const PipelineStatusContext = createContext<
  PipelineStatusContextValue | undefined
>(undefined);

export function PipelineStatusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>("");
  const [payload, setPayload] = useState<PipelineStatusPayload | null>(null);
  const [lastEmittedOutput, setLastEmittedOutput] =
    useState<PipelineOutputPayload | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [setIndex, setSetIndex] = useState<number | null>(null);
  const [setTotal, setSetTotal] = useState<number | null>(null);

  useEffect(() => {
    const unlistenProgressPromise = listen(
      "pipeline-progress",
      (event: { payload: unknown }) => {
        setProgress(z.number().parse(event.payload));
      }
    );
    const unlistenStatusPromise = listen(
      "pipeline-status",
      (event: { payload: unknown }) => {
        const nextPayload = pipelineStatusSchema.parse(event.payload);
        setPayload(nextPayload);

        const text = statusTextFor(nextPayload);
        const entry = toLogEntry(nextPayload);

        if (typeof nextPayload.progress === "number") {
          setProgress(nextPayload.progress);
        }
        if (text) {
          setStatusText(text);
        }
        if (typeof nextPayload.set_index === "number") {
          setSetIndex(nextPayload.set_index);
        }
        if (typeof nextPayload.set_total === "number") {
          setSetTotal(nextPayload.set_total);
        }
        if (entry) {
          setLog((entries) => [...entries, entry]);
        }
        if (nextPayload.kind === "warning") {
          toast.warning(warningTextFor(nextPayload));
        }
      }
    );
    const unlistenOutputPromise = listen(
      "pipeline-output",
      (event: { payload: unknown }) => {
        setLastEmittedOutput(pipelineOutputSchema.parse(event.payload));
      }
    );

    return () => {
      unlistenProgressPromise.then((unlisten) => unlisten());
      unlistenStatusPromise.then((unlisten) => unlisten());
      unlistenOutputPromise.then((unlisten) => unlisten());
    };
  }, []);

  const clearLog = useCallback(() => {
    setLog([]);
    setSetIndex(null);
    setSetTotal(null);
  }, []);

  const value = useMemo(
    () => ({
      clearLog,
      lastEmittedOutput,
      log,
      payload,
      progress,
      setIndex,
      setTotal,
      statusText,
    }),
    [
      clearLog,
      lastEmittedOutput,
      log,
      payload,
      progress,
      setIndex,
      setTotal,
      statusText,
    ]
  );

  return (
    <PipelineStatusContext.Provider value={value}>
      {children}
    </PipelineStatusContext.Provider>
  );
}

export function usePipelineStatus() {
  const context = useContext(PipelineStatusContext);
  if (!context) {
    throw new Error(
      "usePipelineStatus must be used within PipelineStatusProvider"
    );
  }
  return context;
}
