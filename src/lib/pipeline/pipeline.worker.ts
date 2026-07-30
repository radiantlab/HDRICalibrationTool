/// <reference lib="webworker" />

/**
 * Runs the whole pipeline off the main thread.
 *
 * `callMain` is synchronous: it blocks its thread for the entire duration of a
 * tool, and hdrgen merging an 18-frame bracket is tens of seconds of solid
 * work. On the main thread that means the page stops responding -- no
 * repaints, no clicks, no progress bar moving, and eventually the browser's
 * "page is not responding" prompt. Everything the pipeline needs works in a
 * worker, so there is no reason for it to be anywhere else.
 *
 * The worker reads no files. The page stages the bytes and transfers them in,
 * because only the page knows how to reach a file -- Tauri's filesystem on the
 * desktop, the virtual filesystem in a browser -- and keeping that out of here
 * is what lets one worker serve both.
 */

import type { DecodedImage } from "./filter-images";
import { runPipeline } from "./orchestrator";
import type {
  PipelineOutputFile,
  PipelineRunRequest,
  PipelineWorkerMessage,
} from "./pipeline.worker.types";
import { PipelineError } from "./types";
import {
  urlModuleCompiler,
  urlModuleLoader,
  WasmToolRunner,
} from "./wasm-runner";

declare const self: DedicatedWorkerGlobalScope;

function post(message: PipelineWorkerMessage, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

self.addEventListener("message", (event: MessageEvent<PipelineRunRequest>) => {
  run(event.data).catch((error: unknown) => {
    post({
      detail: error instanceof PipelineError ? error.detail : null,
      kind: "failed",
      message: error instanceof Error ? error.message : String(error),
    });
  });
});

async function run(request: PipelineRunRequest): Promise<void> {
  const runner = new WasmToolRunner({
    compile: urlModuleCompiler(request.wasmBaseUrl),
    load: urlModuleLoader(request.wasmBaseUrl),
  });

  for (const [path, bytes] of Object.entries(request.files)) {
    // biome-ignore lint/performance/noAwaitInLoops: writes are trivial and sequential staging keeps a failure attributable to its path
    await runner.writeFile(path, bytes);
  }

  const result = await runPipeline({
    // Bound to this run's runner. The orchestrator hands `decodeImage` only a
    // path, and the bytes live in the runner, so it needs the way back.
    decodeImage: (path) => decodeImage(runner, path),
    emit: (payload) => post({ kind: "status", payload }),
    params: request.params,
    runner,
  });

  const outputs: PipelineOutputFile[] = [
    { bytes: await runner.readFile(result.outputPath), kind: "main" },
  ];
  if (result.falsecolorPath) {
    outputs.push({
      bytes: await runner.readFile(result.falsecolorPath),
      kind: "falsecolor",
    });
  }

  runner.clear();

  // Transferred rather than copied: a finished picture runs to tens of
  // megabytes, and structured-cloning it would double that for no reason.
  post(
    {
      computedVerticalIlluminance: result.computedVerticalIlluminance ?? null,
      kind: "done",
      outputs,
    },
    outputs.map((output) => output.bytes.buffer as ArrayBuffer)
  );
}

/**
 * Decodes a JPEG to RGBA for the image filter.
 *
 * `createImageBitmap` and `OffscreenCanvas` both exist in a worker, which is
 * what lets the filter stage come along with everything else rather than
 * having to stay behind on the main thread. The bitmap is closed explicitly:
 * a 21-megapixel frame is ~84 MB of RGBA.
 */
async function decodeImage(
  runner: WasmToolRunner,
  path: string
): Promise<DecodedImage> {
  const bytes = await runner.readFile(path);
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(`could not get a 2d context to decode ${path}`);
    }
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { height: bitmap.height, rgba: data, width: bitmap.width };
  } finally {
    bitmap.close();
  }
}
