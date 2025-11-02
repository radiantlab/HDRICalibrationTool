import type {
	TiffMetadataRequest,
	TiffMetadataResponse,
	TiffDecodeRequest,
	TiffDecodeResponse,
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
			} catch {}
			reject(new DOMException("Aborted", "AbortError"));
		};
		const cleanup = () => {
			worker.removeEventListener("message", onMessage as EventListener);
			worker.removeEventListener("error", onError as EventListener);
			if (signal) signal.removeEventListener("abort", onAbort as EventListener);
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

export async function getTiffMetadata(
	buffer: ArrayBuffer,
	options?: { memoryBytes?: number; signal?: AbortSignal }
): Promise<{ width: number; height: number }> {
	const worker = createWorker();
	try {
		if (options?.signal?.aborted) {
			worker.terminate();
			throw new DOMException("Aborted", "AbortError");
		}
		const req: TiffMetadataRequest = {
			op: "metadata",
			buffer: buffer.slice(0),
			memoryBytes: options?.memoryBytes,
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
		return { width, height };
	} finally {
		worker.terminate();
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
	const worker = createWorker();
	try {
		if (options.signal?.aborted) {
			worker.terminate();
			throw new DOMException("Aborted", "AbortError");
		}
		const req: TiffDecodeRequest = {
			op: "decode",
			buffer: buffer.slice(0),
			memoryBytes: options.memoryBytes,
			maxWidth: options.maxWidth,
			maxHeight: options.maxHeight,
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
		worker.terminate();
	}
}
