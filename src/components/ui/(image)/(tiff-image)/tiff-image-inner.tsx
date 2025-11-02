"use client";

import { use, useEffect, useRef } from "react";
import { TiffDecodeResponse } from "@/lib/tiff-worker.types";

export default function TiffImageInner({
	tiffPromise,
}: {
	tiffPromise: Promise<TiffDecodeResponse>;
}) {
	const tiff = use(tiffPromise);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		// Create a canvas we control
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const controller = new AbortController();

		const { width, height, buffer } = tiff;

		canvas.width = width;
		canvas.height = height;
		const imageData = new ImageData(
			new Uint8ClampedArray(buffer),
			width,
			height
		);
		ctx.putImageData(imageData, 0, 0);
		fit(canvas, container);
		container.appendChild(canvas);

		const resizeObserver = new ResizeObserver(() => fit(canvas, container));
		resizeObserver.observe(container);

		return () => {
			controller.abort();
			resizeObserver.disconnect();
			if (container.contains(canvas)) container.removeChild(canvas);
		};
	}, [tiff.buffer]);

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
