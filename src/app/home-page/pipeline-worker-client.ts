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

/**
 * Copies bytes the client is free to give away.
 *
 * The staged buffers are transferred to the worker, and a transfer *moves*
 * them: the page's view is left detached and zero-length. What `read` returns
 * is not the client's to move. The session filesystem hands back the array it
 * holds in its map, and the RAW preview cache hands back its own buffer by
 * design, so transferring either emptied a store that the rest of the session
 * still depends on -- the next run could not start, and a preset comparing its
 * calibration against a now-empty source reported it as changed on disk.
 *
 * `slice` on the view rather than on `buffer` also keeps the copy to exactly
 * the bytes in question, where a view onto part of a larger buffer would
 * otherwise have handed the whole thing over, and gives every entry a distinct
 * buffer so two paths resolving to the same bytes cannot transfer it twice.
 *
 * The copies cost peak memory, and every one is made before the single send
 * that frees them, so originals and copies coexist. A JPEG bracket is a few
 * megabytes a frame and does not notice. A RAW one does: an 18-frame CR2
 * bracket holds its sources and its converted TIFFs and now briefly holds a
 * second set of both. That is the price of the stores surviving the run, and
 * it belongs with whatever moves the RAW conversion off the main thread, since
 * that is the change that decides whether the peeked TIFF should be handed
 * over at all.
 */
function owned(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
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
    files[path] = owned(await options.read(path));
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
      // Copied like the rest: the cache holds this buffer for the thumbnails
      // and for the next run, and handing it over would leave both with an
      // entry that reads as zero bytes.
      files[workPath(`input${index}.tiff`)] = owned(tiff);
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
      try {
        // Transferred, not copied: an 18-frame bracket is hundreds of
        // megabytes. Safe because `owned` staged copies the client may give
        // away; transferring what `read` returned is what detached the
        // session filesystem's own arrays.
        worker.postMessage(
          request,
          Object.values(files).map((bytes) => bytes.buffer as ArrayBuffer)
        );
      } catch (error) {
        // Caught rather than left to reject the promise on its own, which a
        // synchronous throw in an executor does: that path would leave the
        // interval running, and one nobody clears keeps calling `shouldStop`
        // for the life of the page.
        clearInterval(stopCheck);
        reject(error);
      }
    });
  } finally {
    worker.terminate();
  }
}
