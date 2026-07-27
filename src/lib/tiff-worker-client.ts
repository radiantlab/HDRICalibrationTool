import { Sema } from "async-sema";
import type {
  TiffDecodeRequest,
  TiffDecodeResponse,
  TiffMetadataRequest,
  TiffMetadataResponse,
  TiffWorkerErrorResponse,
} from "./tiff-worker.types";

function createWorker(): Worker {
  return new Worker(new URL("./tiff-worker.ts", import.meta.url), {
    type: "module",
  });
}

function onceMessage<T = unknown>(
  worker: Worker,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      cleanup();
      resolve(e.data as T);
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      reject(e.error ?? new Error(e.message));
    };
    const onAbort = () => {
      cleanup();
      try {
        worker.terminate();
      } catch {
        // ignore: worker may already be terminated
      }
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      worker.removeEventListener("message", onMessage as EventListener);
      worker.removeEventListener("error", onError as EventListener);
      if (signal) {
        signal.removeEventListener("abort", onAbort as EventListener);
      }
    };
    worker.addEventListener("message", onMessage as EventListener);
    worker.addEventListener("error", onError as EventListener);
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort as EventListener);
    }
  });
}

/**
 * Caps how many tiff workers exist at once, so memory usage does not spike.
 *
 * Each worker loads the tiff.js emscripten bundle and asks for a heap twice
 * the size of the file, which for a 67 MB RAW-derived TIFF is over 130 MB. A
 * dozen of them at once starves the ones already running, and a worker that
 * never answers leaves whoever is awaiting it suspended forever.
 *
 * Both operations share the count, and the worker is created only once a
 * permit is held: creating it first, as this used to, meant the cap limited
 * how many workers *ran* but not how many *existed*.
 */
const tiffSem = new Sema(4);

export async function getTiffMetadata(
  buffer: ArrayBuffer,
  options?: { memoryBytes?: number; signal?: AbortSignal }
): Promise<{ width: number; height: number }> {
  // Outside the try: releasing a permit that was never acquired would raise
  // the cap every time an acquisition failed.
  await tiffSem.acquire();
  let worker: Worker | undefined;
  try {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    worker = createWorker();
    const req: TiffMetadataRequest = {
      buffer: buffer.slice(0),
      memoryBytes: options?.memoryBytes,
      op: "metadata",
    };
    const resultPromise = onceMessage<
      TiffMetadataResponse | TiffWorkerErrorResponse
    >(worker, options?.signal);
    worker.postMessage(req, [req.buffer]);
    const res = await resultPromise;
    if ((res as TiffWorkerErrorResponse).error) {
      throw new Error((res as TiffWorkerErrorResponse).error);
    }
    const { width, height } = res as TiffMetadataResponse;
    return { height, width };
  } finally {
    worker?.terminate();
    tiffSem.release();
  }
}

export async function decodeTiff(
  buffer: ArrayBuffer,
  options: {
    memoryBytes?: number;
    maxWidth?: number;
    maxHeight?: number;
    signal?: AbortSignal;
  }
): Promise<TiffDecodeResponse> {
  // Decoding is the heavier of the two operations and was not counted at all,
  // so a component remounting in a loop could spawn workers without limit
  // while metadata callers waited behind a cap that no longer meant anything.
  await tiffSem.acquire();
  let worker: Worker | undefined;
  try {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    worker = createWorker();
    const req: TiffDecodeRequest = {
      buffer: buffer.slice(0),
      maxHeight: options.maxHeight,
      maxWidth: options.maxWidth,
      memoryBytes: options.memoryBytes,
      op: "decode",
    };
    const resultPromise = onceMessage<
      TiffDecodeResponse | TiffWorkerErrorResponse
    >(worker, options.signal);
    worker.postMessage(req, [req.buffer]);
    const res = await resultPromise;
    if ((res as TiffWorkerErrorResponse).error) {
      throw new Error((res as TiffWorkerErrorResponse).error);
    }
    return res as TiffDecodeResponse;
  } finally {
    worker?.terminate();
    tiffSem.release();
  }
}
