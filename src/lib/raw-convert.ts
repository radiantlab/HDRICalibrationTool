/**
 * Converting one RAW frame to TIFF.
 *
 * Split out of `raw-preview.ts` so the conversion can run where the cache
 * cannot follow. The cache is shared state and belongs to the page; the
 * conversion is a synchronous `callMain` that must not run there at all.
 *
 * Deliberately owns neither a runner nor a worker. It is handed a `ToolRunner`
 * and returns bytes, which is what lets the argv and the exit-code handling be
 * tested in-process while the thing that actually runs them sits in a worker.
 *
 * `dcrawArgs` is imported rather than restated. If the two flag sets ever
 * diverge, the preview silently stops showing what the pipeline measures.
 */

import { dcrawArgs, workPath } from "./pipeline/stages";
import type { ToolRunner } from "./pipeline/types";

/** Either separator, so a Windows path keeps working unchanged. */
const PATH_SEPARATOR = /[\\/]/;

export function baseName(path: string): string {
  const parts = path.split(PATH_SEPARATOR);
  return parts.at(-1) || "input.raw";
}

/**
 * Runs `dcraw_emu` over one frame and returns the TIFF.
 *
 * The returned array is the runner's own. Callers that clear or reuse the
 * runner afterwards own it from that point and may transfer it; callers that
 * do not must treat it as borrowed.
 */
export async function convertRaw(
  runner: ToolRunner,
  path: string,
  bytes: Uint8Array
): Promise<Uint8Array> {
  // The name is kept because a path outside /work would need its parent
  // directories created, and dcraw_emu reports errors against it.
  const input = workPath(baseName(path));
  const output = workPath("preview.tiff");

  await runner.writeFile(input, bytes);
  const result = await runner.run("dcraw_emu", dcrawArgs(input, output));
  if (result.code !== 0) {
    throw new Error(
      `dcraw_emu could not convert ${path} (exit ${result.code})` +
        (result.stderr ? `: ${result.stderr.trim()}` : "")
    );
  }
  return await runner.readFile(output);
}
