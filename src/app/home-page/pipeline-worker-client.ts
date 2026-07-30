/**
 * Drives the pipeline worker from the page.
 *
 * The page's job is the two things the worker deliberately cannot do: reach
 * files, and touch the DOM. It stages the bytes, forwards status events, and
 * receives the finished pictures.
 */

import { tauriRawIo } from "@/lib/host/raw-io";
import { isRawImage } from "@/lib/pipeline/orchestrator";
import type {
  PipelineOutputFile,
  PipelineRunRequest,
  PipelineWorkerMessage,
} from "@/lib/pipeline/pipeline.worker.types";
import { workPath } from "@/lib/pipeline/stages";
import {
  PipelineError,
  type PipelineParams,
  type PipelineStatusPayload,
} from "@/lib/pipeline/types";
import { peekRawTiff } from "@/lib/raw-preview";

export interface PipelineRunResult {
  computedVerticalIlluminance: string | null;
  outputs: PipelineOutputFile[];
}

export interface ExecuteOptions {
  onStatus: (payload: PipelineStatusPayload) => void;
  params: PipelineParams;
  /** Reads a source file, virtual or real. */
  read: (path: string) => Promise<Uint8Array>;
  /** Returning true terminates the worker before the next stage starts. */
  shouldStop?: () => boolean;
  wasmBaseUrl: string;
}

/** Files the pipeline reads by path and so must be staged before it starts. */
function referencedFiles(params: PipelineParams): string[] {
  return [
    ...params.inputImages,
    params.responseFunction,
    params.fisheyeCorrectionCal,
    params.vignettingCorrectionCal,
    params.neutralDensityCal,
    params.photometricAdjustmentCal,
  ].filter((path) => path !== "");
}

export async function executeInWorker(
  options: ExecuteOptions
): Promise<PipelineRunResult> {
  const files: Record<string, Uint8Array> = {};

  // Staged up front rather than lazily: a missing input should fail before any
  // wasm module is instantiated, not eight stages in.
  for (const path of referencedFiles(options.params)) {
    // biome-ignore lint/performance/noAwaitInLoops: reads are sequential so a missing file fails on its own path rather than inside an aggregate rejection
    files[path] = await options.read(path);
  }

  // Hand over RAW conversions already in hand from drawing the thumbnails.
  // Peeked, never converted: converting here would put ~2 s a frame back on
  // the main thread, which is what moving the pipeline off it was for. The
  // worker converts whatever is missing.
  let index = 0;
  for (const image of options.params.inputImages) {
    index += 1;
    if (!isRawImage(image)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: a cache lookup per frame, and ordering keeps the index aligned with the orchestrator's naming
    const tiff = await peekRawTiff(image, tauriRawIo);
    if (tiff) {
      files[workPath(`input${index}.tiff`)] = tiff;
    }
  }

  const worker = new Worker(
    new URL("../../lib/pipeline/pipeline.worker.ts", import.meta.url),
    { type: "module" }
  );

  try {
    return await new Promise<PipelineRunResult>((resolve, reject) => {
      // The worker cannot be interrupted mid-stage -- callMain is synchronous
      // there too -- so stopping means terminating it between status events,
      // which is as granular as the previous behaviour was.
      const stopCheck = setInterval(() => {
        if (options.shouldStop?.()) {
          clearInterval(stopCheck);
          worker.terminate();
          reject(
            new PipelineError({
              kind: "processing",
              message: "pipeline: stopped before the next stage",
            })
          );
        }
      }, 250);

      worker.addEventListener(
        "message",
        (event: MessageEvent<PipelineWorkerMessage>) => {
          const message = event.data;
          if (message.kind === "status") {
            options.onStatus(message.payload);
            return;
          }
          clearInterval(stopCheck);
          if (message.kind === "done") {
            resolve({
              computedVerticalIlluminance: message.computedVerticalIlluminance,
              outputs: message.outputs,
            });
            return;
          }
          reject(
            message.detail
              ? new PipelineError(
                  message.detail as ConstructorParameters<
                    typeof PipelineError
                  >[0]
                )
              : new Error(message.message)
          );
        }
      );

      worker.addEventListener("error", (event) => {
        clearInterval(stopCheck);
        reject(event.error ?? new Error(event.message));
      });

      const request: PipelineRunRequest = {
        files,
        params: options.params,
        wasmBaseUrl: options.wasmBaseUrl,
      };
      // Transferred, not copied: an 18-frame bracket is hundreds of megabytes.
      worker.postMessage(
        request,
        Object.values(files).map((bytes) => bytes.buffer as ArrayBuffer)
      );
    });
  } finally {
    worker.terminate();
  }
}
