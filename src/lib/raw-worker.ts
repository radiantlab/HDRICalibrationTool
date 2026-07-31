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
import { createRawCache, type RawCache } from "./raw-cache";
import { blobStoreAvailable, idbBlobStore } from "./raw-cache-idb";
import { rawCacheKey, toolTag } from "./raw-cache-key";
import { convertRaw } from "./raw-convert";
import type { RawConvertRequest, RawWorkerMessage } from "./raw-worker.types";

declare const self: DedicatedWorkerGlobalScope;

let runner: WasmToolRunner | undefined;

function runnerFor(wasmBaseUrl: string): WasmToolRunner {
  // `??=` means every request after the first keeps the original runner and
  // silently ignores whatever `wasmBaseUrl` it arrived with. That is safe
  // only because the URL is fixed for the life of the worker: `raw-preview.ts`
  // resolves it once, against the document, and every `convertRawInWorker`
  // call this session makes passes that same value. If a second, different
  // base URL ever became a real request, it would need to be a key here
  // rather than a discard.
  runner ??= new WasmToolRunner({
    compile: urlModuleCompiler(wasmBaseUrl),
    load: urlModuleLoader(wasmBaseUrl),
  });
  return runner;
}

let cache: RawCache | undefined;

/**
 * The persistent tier, or nothing on a host without IndexedDB.
 *
 * Absence is not an error: the conversion path is unchanged and only slower,
 * which is exactly what every host did before this existed.
 */
function cacheFor(): RawCache | undefined {
  if (!blobStoreAvailable()) {
    return;
  }
  cache ??= createRawCache({ store: idbBlobStore() });
  return cache;
}

export interface CachedConversion {
  cache: RawCache | undefined;
  convert: () => Promise<Uint8Array>;
  key: () => Promise<string>;
}

/**
 * A conversion, answered from the cache where possible.
 *
 * Exported for tests: the worker's own message plumbing needs a real `Worker`,
 * whereas this is the part with the decisions in it.
 *
 * Every cache failure falls through to conversion. The cache may never be the
 * reason a frame fails to convert -- a read error is a miss, and a write error
 * is a slower next session rather than a lost image.
 */
export async function convertWithCache({
  cache: tier,
  convert: performConvert,
  key,
}: CachedConversion): Promise<Uint8Array> {
  let resolved: string | undefined;
  if (tier) {
    try {
      resolved = await key();
      const hit = await tier.get(resolved);
      if (hit) {
        return hit;
      }
    } catch {
      // Unusable cache: convert, exactly as a host without one does.
      resolved = undefined;
    }
  }

  const tiff = await performConvert();

  if (tier && resolved) {
    // Before the caller transfers it. `postMessage` with a transfer detaches
    // the buffer, and writing afterwards would persist a zero-byte file that
    // later reads as a corrupt hit -- the failure fixed in 93ba5fc.
    await tier.put(resolved, tiff).catch(() => undefined);
  }

  return tiff;
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
    return await convertWithCache({
      cache: cacheFor(),
      convert: () => convertRaw(active, request.path, request.bytes),
      key: async () =>
        rawCacheKey(request.bytes, await toolTag(request.wasmBaseUrl)),
    });
  } finally {
    // Between frames rather than at the end: the runner survives to keep its
    // compiled modules, so its staged bytes must not survive with it.
    active.clear();
  }
}
