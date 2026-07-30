import type { LogEntry } from "@/app/pipeline-status-context";
import { readJson, writeJson } from "./app-storage";

export type RunOutcome = "ok" | "warning" | "error" | "rejected";

export interface RunRecord {
  finishedAt: string | null;
  id: string;
  /** The buildPipelineParams payload, verbatim, so reuse is a straight copy. */
  inputs: Record<string, unknown>;
  log: LogEntry[];
  outcome: RunOutcome;
  outputs: string[];
  presetName: string | null;
  /** Why a run failed or was rejected. Null when it succeeded. */
  reason: string | null;
  startedAt: string;
  /**
   * Where the pipeline's binaries lived, on runs old enough to have had any.
   *
   * Optional because nothing records it any more: the pipeline is WebAssembly
   * shipped with the app, so there is no path to capture and nothing a
   * different machine would need in order to reproduce a run. Kept on the type
   * so history written before the cutover still parses.
   */
  toolPaths?: {
    dcrawEmu: string;
    hdrgen: string;
    radiance: string;
  };
}

const HISTORY_FILE = "history/runs.json";

/**
 * A run that never reached the backend is "rejected" rather than "error": it is
 * a misconfiguration, not a processing failure, and the Runs page filters the
 * two apart. An empty log is what distinguishes them, since the backend emits
 * at least one step as soon as it starts.
 */
export function classifyOutcome(
  log: LogEntry[],
  failure: string | null
): RunOutcome {
  if (failure) {
    return log.length === 0 ? "rejected" : "error";
  }
  return log.some((entry) => entry.kind === "warning" || entry.kind === "error")
    ? "warning"
    : "ok";
}

export async function readRuns(): Promise<RunRecord[]> {
  const stored = await readJson<{ runs: RunRecord[] }>(HISTORY_FILE, {
    runs: [],
  });
  return stored.runs ?? [];
}

export async function appendRun(record: RunRecord): Promise<void> {
  const runs = await readRuns();
  await writeJson(HISTORY_FILE, { runs: [...runs, record] });
}

export async function clearRuns(): Promise<void> {
  await writeJson(HISTORY_FILE, { runs: [] });
}

/**
 * Feeds the size indicator that unbounded retention requires.
 *
 * Measured by re-serialising rather than by stat-ing a file, because there is
 * no file any more. The number is what the records cost, which is what the
 * indicator is for; it is not the storage engine's on-disk footprint, and it
 * never was exactly that either.
 */
export async function historyStats(): Promise<{
  bytes: number;
  count: number;
}> {
  const runs = await readRuns();
  let bytes = 0;
  try {
    bytes = new TextEncoder().encode(JSON.stringify({ runs })).length;
  } catch {
    // A record holding something non-serialisable should not break the page
    // that displays the count.
  }
  return { bytes, count: runs.length };
}
