/// <reference lib="webworker" />

/**
 * Converts RAW frames off the main thread.
 *
 * `callMain` is synchronous: it blocks its thread for the whole tool, and a
 * 5796x3870 CR2 takes about 1.9 s. Thumbnails convert every frame in a set, so
 * on the main thread a 10-frame bracket froze the tab for about 20 s -- no
 * repaints, no clicks, and eventually the browser's "page is not responding"
 * prompt. The pipeline already moved into a worker for exactly this reason;
 * the preview path is the half that was left behind.
 *
 * One runner for the life of the worker. `clear()` drops the staged bytes but
 * keeps the compiled modules, so ten frames cost one compile of `dcraw_emu`
 * rather than ten.
 */

import {
  urlModuleCompiler,
  urlModuleLoader,
  WasmToolRunner,
} from "./pipeline/wasm-runner";
import { convertRaw } from "./raw-convert";
import type { RawConvertRequest, RawWorkerMessage } from "./raw-worker.types";

declare const self: DedicatedWorkerGlobalScope;

let runner: WasmToolRunner | undefined;

function runnerFor(wasmBaseUrl: string): WasmToolRunner {
  runner ??= new WasmToolRunner({
    compile: urlModuleCompiler(wasmBaseUrl),
    load: urlModuleLoader(wasmBaseUrl),
  });
  return runner;
}

function post(message: RawWorkerMessage, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

self.addEventListener("message", (event: MessageEvent<RawConvertRequest>) => {
  convert(event.data)
    .then((tiff) => {
      // Transferred, not copied: a converted CR2 is about 67 MB. Safe because
      // the runner was cleared first, so this array is no longer held here.
      post({ kind: "done", tiff }, [tiff.buffer as ArrayBuffer]);
    })
    .catch((error: unknown) => {
      post({
        kind: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    });
});

async function convert(request: RawConvertRequest): Promise<Uint8Array> {
  const active = runnerFor(request.wasmBaseUrl);
  try {
    return await convertRaw(active, request.path, request.bytes);
  } finally {
    // Between frames rather than at the end: the runner survives to keep its
    // compiled modules, so its staged bytes must not survive with it.
    active.clear();
  }
}
