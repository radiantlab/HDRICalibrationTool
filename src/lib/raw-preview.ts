/**
 * Converts a RAW file to TIFF for display, using the WebAssembly `dcraw_emu`.
 *
 * This replaces the `convert_raw_img` Tauri command. The conversion is byte
 * for byte what the pipeline does -- same tool, same `dcrawArgs` -- which is
 * deliberate and is the premise of
 * [#242](https://github.com/radiantlab/HDRICalibrationTool/issues/242): if the
 * two ever stop matching, the artifact stops being shareable between the
 * preview and the run, and both call sites still look correct.
 *
 * A 5796x3870 CR2 takes about 1.9 s and peaks around 266 MiB of wasm heap,
 * measured in Chromium. That is per instance and reclaimed when the instance
 * is dropped.
 */

import { dcrawArgs, workPath } from "./pipeline/stages";
import { urlModuleLoader, WasmToolRunner } from "./pipeline/wasm-runner";

/** Where the browser builds are served from. See `public/wasm/README.md`. */
const WASM_BASE_URL = "/wasm";

/** Either separator, so a Windows path keeps working unchanged. */
const PATH_SEPARATOR = /[\\/]/;

/**
 * Converted TIFFs, keyed by source path.
 *
 * In memory and therefore per session, which is a step down from the Rust
 * implementation's on-disk cache: that survived a restart and this does not.
 * Accepted rather than reimplemented, because a cache written through Tauri's
 * filesystem is exactly the thing the browser build cannot use, and #242 has
 * to choose a persistent backend anyway (OPFS, given these run to 67 MB each).
 * Repeating a conversion costs ~2 s; carrying a throwaway implementation costs
 * more.
 *
 * Entries are held weakly by nothing at all, so a session that previews many
 * brackets accumulates. `clearRawPreviewCache` exists for that.
 */
const cache = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

/**
 * Returns the TIFF bytes for a RAW file, converting on first request.
 *
 * The promise rather than its result is cached, so two components asking for
 * the same preview at once share one conversion instead of racing into two
 * instances of a tool that peaks at 266 MiB.
 */
export function rawToTiff(
  path: string,
  readFile: (path: string) => Promise<Uint8Array>
): Promise<Uint8Array<ArrayBuffer>> {
  const hit = cache.get(path);
  if (hit) {
    return hit;
  }
  const conversion = convert(path, readFile).catch((error: unknown) => {
    // A failed conversion must not be remembered as a result, or the file can
    // never be retried without a reload.
    cache.delete(path);
    throw error;
  });
  cache.set(path, conversion);
  return conversion;
}

async function convert(
  path: string,
  readFile: (path: string) => Promise<Uint8Array>
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await readFile(path);
  const runner = new WasmToolRunner({ load: urlModuleLoader(WASM_BASE_URL) });

  // The name is kept because dcraw_emu dispatches on more than content, and a
  // path outside /work would need its parent directories created.
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

  const tiff = await runner.readFile(output);
  // Frees the source and the output copy the runner is still holding; the
  // returned array is the caller's.
  runner.clear();
  // MEMFS hands back a plain ArrayBuffer-backed view, never a SharedArrayBuffer
  // -- these builds are single-threaded, which is what keeps them hostable
  // without COOP/COEP headers. Narrowed here so callers can pass `.buffer`
  // straight to the tiff worker instead of copying it to satisfy the type.
  return tiff as Uint8Array<ArrayBuffer>;
}

export function clearRawPreviewCache(): void {
  cache.clear();
}

function baseName(path: string): string {
  const parts = path.split(PATH_SEPARATOR);
  return parts.at(-1) || "input.raw";
}
