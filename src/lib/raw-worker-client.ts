/**
 * Drives the RAW worker from the page.
 *
 * One worker, one queue. Frames are converted in turn rather than in parallel:
 * `WasmToolRunner.clear()` keeps its compiled modules, so a single worker
 * doing ten frames compiles `dcraw_emu` once and peaks at one instance's
 * ~266 MiB, where a pool would compile per worker and multiply that peak by
 * its width. The complaint being fixed is responsiveness, not throughput, and
 * a queue fixes it without spending any memory.
 */

import type { RawConvertRequest, RawWorkerMessage } from "./raw-worker.types";

let worker: Worker | undefined;
/** Resolves when the frame in flight has finished, whatever its outcome. */
let queue: Promise<unknown> = Promise.resolve();
/**
 * Settles the frame currently in flight, if any -- set for the life of one
 * `send()` call and cleared the moment that call settles by any path.
 *
 * `terminate()` fires neither `message` nor `error`, so a `resetRawWorker()`
 * that only terminated would leave an in-flight frame's promise, and the
 * `queue` chained after it, with no event left that could ever settle them:
 * every later `convertRawInWorker` call would then hang forever. `onError`
 * already has its own path to `reject`, but nothing else that could call
 * `resetRawWorker` does, and the docstring below invites exactly that call.
 */
let abandon: ((reason: Error) => void) | undefined;

function ensureWorker(): Worker {
  worker ??= new Worker(new URL("./raw-worker.ts", import.meta.url), {
    type: "module",
  });
  return worker;
}

/**
 * Drops the worker so the next frame builds a fresh one, and settles whatever
 * frame that worker was holding.
 *
 * A worker that has errored may be in any state at all, and queueing later
 * frames behind it would suspend them forever. An OOM on one frame then costs
 * that frame rather than the rest of the session.
 *
 * Deliberately does not touch `queue`. Frames already queued behind the
 * dropped one are chained off *that frame's own promise*, not off this
 * module's `queue` variable, so resetting `queue` here would not reach them
 * anyway -- and if a call site changes that stops being true, resetting it
 * would let two queued frames both resolve on the same tick and both reach
 * the fresh worker's `postMessage` before either's response arrives, sharing
 * one `WasmToolRunner` and breaking the one-frame-at-a-time invariant this
 * client exists to hold. `abandon` is what settles the in-flight frame
 * instead, so `queue` never needs to be touched to keep the client usable.
 */
export function resetRawWorker(): void {
  worker?.terminate();
  worker = undefined;
  // No-op when nothing is in flight, or when `onError` already reached its
  // own `reject` and cleared this on the way to calling us.
  abandon?.(new Error("the RAW worker was dropped"));
}

export function convertRawInWorker(
  path: string,
  bytes: Uint8Array,
  wasmBaseUrl: string
): Promise<Uint8Array> {
  const conversion = queue.then(() => send(path, bytes, wasmBaseUrl));
  // Swallowed on the queue only: a failed frame must not stop the ones behind
  // it, but its own caller still sees the rejection through `conversion`.
  queue = conversion.catch(() => undefined);
  return conversion;
}

function send(
  path: string,
  bytes: Uint8Array,
  wasmBaseUrl: string
): Promise<Uint8Array> {
  const active = ensureWorker();

  return new Promise<Uint8Array>((resolve, reject) => {
    const onMessage = (event: MessageEvent<RawWorkerMessage>) => {
      cleanup();
      if (event.data.kind === "done") {
        resolve(event.data.tiff);
        return;
      }
      reject(new Error(event.data.message));
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      // The worker is gone, or in a state nobody can describe. Either way it
      // must not receive the next frame.
      resetRawWorker();
      reject(event.error ?? new Error(event.message));
    };
    const cleanup = () => {
      active.removeEventListener("message", onMessage as EventListener);
      active.removeEventListener("error", onError as EventListener);
      abandon = undefined;
    };
    abandon = (reason) => {
      cleanup();
      reject(reason);
    };

    active.addEventListener("message", onMessage as EventListener);
    active.addEventListener("error", onError as EventListener);

    const request: RawConvertRequest = {
      // Copied, not handed over. `readFile` may return the session
      // filesystem's own array, and transferring that would empty it -- the
      // defect fixed in 93ba5fc. The copy is this client's to give away.
      bytes: bytes.slice(),
      path,
      wasmBaseUrl,
    };
    active.postMessage(request, [request.bytes.buffer as ArrayBuffer]);
  });
}
