import type { RunRecord } from "@/lib/run-history";

const HDR_FILE = /\.hdr$/i;

/**
 * Records written before the output paths were captured from the
 * pipeline-output events hold the run's output *directory*, which the viewer
 * cannot open. Only offer paths that are actually image files.
 */
export function openableOutputs(record: RunRecord): string[] {
  return record.outputs.filter((path) => HDR_FILE.test(path));
}
