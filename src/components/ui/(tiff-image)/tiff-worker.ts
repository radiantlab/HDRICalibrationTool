/// <reference lib="webworker" />

import Tiff from "tiff.js";

type DecodeRequest = {
	buffer: ArrayBuffer;
	memoryBytes: number;
	maxWidth?: number;
	maxHeight?: number;
};

type DecodeBufferResponse = {
	width: number;
	height: number;
	buffer: ArrayBuffer;
};

type DecodeError = {
	error: string;
};

self.onmessage = (event: MessageEvent<DecodeRequest>) => {
	const { buffer, memoryBytes, maxWidth, maxHeight } = event.data;
	try {
		Tiff.initialize({ TOTAL_MEMORY: memoryBytes });
		const tiff = new Tiff({ buffer });
		const width = tiff.width();
		const height = tiff.height();
		const rgbaBuffer = tiff.readRGBAImage();
		tiff.close();

		// Make a copy so it is independent of the wasm heap
		const copy = new Uint8ClampedArray(new Uint8Array(rgbaBuffer));

		// Determine target dimensions within constraints
		let targetWidth = width;
		let targetHeight = height;
		if ((maxWidth && maxWidth > 0) || (maxHeight && maxHeight > 0)) {
			const wLimit = maxWidth ?? Number.POSITIVE_INFINITY;
			const hLimit = maxHeight ?? Number.POSITIVE_INFINITY;
			const scale = Math.min(wLimit / width, hLimit / height);
			if (isFinite(scale) && scale > 0 && scale < 1) {
				targetWidth = Math.max(1, Math.floor(width * scale));
				targetHeight = Math.max(1, Math.floor(height * scale));
			}
		}

		if (targetWidth !== width || targetHeight !== height) {
			const downscaled = downscale(
				copy,
				width,
				height,
				targetWidth,
				targetHeight
			);
			self.postMessage(
				{
					width: targetWidth,
					height: targetHeight,
					buffer: downscaled.buffer as ArrayBuffer,
				} satisfies DecodeBufferResponse,
				[downscaled.buffer as ArrayBuffer]
			);
			return;
		}

		// Send raw RGBA buffer to the main thread (transferable, fast and compatible)
		self.postMessage(
			{ width, height, buffer: copy.buffer } satisfies DecodeBufferResponse,
			[copy.buffer]
		);
	} catch (e: unknown) {
		const message = (e as { message?: string })?.message ?? String(e);
		self.postMessage({ error: message } satisfies DecodeError);
	}
};

function downscale(
	src: Uint8ClampedArray,
	srcW: number,
	srcH: number,
	dstW: number,
	dstH: number
): Uint8ClampedArray {
	// prefer OffscreenCanvas if available for high-quality native downscaling
	const OffscreenCanvasCtor = (
		globalThis as unknown as { OffscreenCanvas?: typeof OffscreenCanvas }
	).OffscreenCanvas;
	if (typeof OffscreenCanvasCtor !== "undefined") {
		const srcCanvas = new OffscreenCanvasCtor(srcW, srcH);
		const sctx = srcCanvas.getContext("2d");
		if (sctx) {
			// ensure ImageData gets a clamped array backed by ArrayBuffer
			const ab = new ArrayBuffer(src.byteLength);
			const u8 = new Uint8ClampedArray(ab);
			u8.set(src);
			sctx.putImageData(new ImageData(u8, srcW, srcH), 0, 0);
			const dstCanvas = new OffscreenCanvasCtor(dstW, dstH);
			const dctx = dstCanvas.getContext("2d");
			if (dctx) {
				dctx.imageSmoothingEnabled = true;
				dctx.imageSmoothingQuality = "medium";
				dctx.drawImage(
					srcCanvas as unknown as CanvasImageSource,
					0,
					0,
					srcW,
					srcH,
					0,
					0,
					dstW,
					dstH
				);
				const out = dctx.getImageData(0, 0, dstW, dstH).data;
				return new Uint8ClampedArray(out.buffer.slice(0));
			}
		}
	}

	// fallback to simple nearest-neighbor downscale
	const dst = new Uint8ClampedArray(dstW * dstH * 4);
	for (let y = 0; y < dstH; y++) {
		const sy = Math.floor((y * srcH) / dstH);
		for (let x = 0; x < dstW; x++) {
			const sx = Math.floor((x * srcW) / dstW);
			const sIdx = (sy * srcW + sx) * 4;
			const dIdx = (y * dstW + x) * 4;
			dst[dIdx] = src[sIdx];
			dst[dIdx + 1] = src[sIdx + 1];
			dst[dIdx + 2] = src[sIdx + 2];
			dst[dIdx + 3] = src[sIdx + 3];
		}
	}
	return dst;
}
