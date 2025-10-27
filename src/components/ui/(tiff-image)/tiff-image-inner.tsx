"use client";

import { use, useEffect, useRef } from "react";

export default function TiffImageInner({
	tiffBufferPromise,
}: {
	tiffBufferPromise: Promise<Uint8Array<ArrayBuffer>>;
}) {
	const tiffBuffer = use(tiffBufferPromise);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;
		const container = containerRef.current;
		if (!container) return;

		// Create a canvas we control
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		container.appendChild(canvas);

		// Worker setup
		const worker = new Worker(new URL("./tiff-worker.ts", import.meta.url), {
			type: "module",
		});

		const onMessage = (e: MessageEvent) => {
			if (cancelled) return;
			const data = e.data as
				| { width: number; height: number; buffer: ArrayBuffer }
				| { error: string };
			if ("error" in data) {
				console.error("TIFF decode error", data.error);
				return;
			}
			if ("buffer" in data) {
				const { width, height, buffer } = data;
				canvas.width = width;
				canvas.height = height;
				const imageData = new ImageData(
					new Uint8ClampedArray(buffer),
					width,
					height
				);
				ctx.putImageData(imageData, 0, 0);
				fit(canvas, container);
			}
		};

		worker.addEventListener("message", onMessage);
		// copy the buffer before posting to avoid React dev-mode
		// double-invoke detaching the original ArrayBuffer
		const bufferCopy = tiffBuffer.buffer.slice(0);
		const dpr = Math.max(1, window.devicePixelRatio || 1);
		const maxWidth =
			Math.floor((container.clientWidth || 0) * dpr) || undefined;
		const maxHeight =
			Math.floor((container.clientHeight || 0) * dpr) || undefined;
		worker.postMessage(
			{
				buffer: bufferCopy,
				memoryBytes: 256 * 1024 * 1024,
				maxWidth,
				maxHeight,
			},
			[bufferCopy]
		);

		const resizeObserver = new ResizeObserver(() => fit(canvas, container));
		resizeObserver.observe(container);

		return () => {
			cancelled = true;
			resizeObserver.disconnect();
			worker.removeEventListener("message", onMessage);
			worker.terminate();
			if (container.contains(canvas)) container.removeChild(canvas);
		};
	}, [tiffBuffer.buffer]);

	return (
		<div ref={containerRef} className="size-full grid place-items-center" />
	);
}

function fit(canvas: HTMLCanvasElement, container: HTMLDivElement) {
	const imageWidth = canvas.width;
	const imageHeight = canvas.height;
	const containerWidth = container.clientWidth || 0;
	const containerHeight = container.clientHeight || 0;
	if (containerWidth === 0 || containerHeight === 0) return;
	const scale = Math.min(
		containerWidth / imageWidth,
		containerHeight / imageHeight,
		1
	);
	canvas.style.width = `${imageWidth * scale}px`;
	canvas.style.height = `${imageHeight * scale}px`;
}
