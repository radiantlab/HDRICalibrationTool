"use client";

import { use, useEffect, useRef } from "react";
import Tiff from "tiff.js";

export default function TiffImageInner({
	tiffBufferPromise,
}: {
	tiffBufferPromise: Promise<Uint8Array<ArrayBuffer>>;
}) {
	const tiffBuffer = use(tiffBufferPromise);
	const containerRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		Tiff.initialize({ TOTAL_MEMORY: 256 * 1024 * 1024 /* 256 MB */ });
		const tiff = new Tiff({
			buffer: tiffBuffer.buffer,
		});

		const thisCanvas = tiff.toCanvas();
		const container = containerRef.current;
		if (!container) return;

		container.appendChild(thisCanvas);

		const imageWidth = thisCanvas.width;
		const imageHeight = thisCanvas.height;

		// scale the canvas to fit the container size, maintaining aspect ratio
		const fit = () => {
			const containerWidth = container.clientWidth || 0;
			const containerHeight = container.clientHeight || 0;
			if (containerWidth === 0 || containerHeight === 0) return;
			const scale = Math.min(
				containerWidth / imageWidth,
				containerHeight / imageHeight,
				1
			);
			thisCanvas.style.width = `${imageWidth * scale}px`;
			thisCanvas.style.height = `${imageHeight * scale}px`;
		};

		const resizeObserver = new ResizeObserver(() => fit());
		resizeObserver.observe(container);
		fit();

		return () => {
			resizeObserver.disconnect();
			container.removeChild(thisCanvas);
		};
	}, [tiffBuffer.buffer]);
	return <div ref={containerRef} className="grid place-items-center" />;
}
