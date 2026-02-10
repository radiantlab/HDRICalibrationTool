"use client";

import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTiffPath } from "./useTiffPath";
import { readFile } from "@tauri-apps/plugin-fs";
import { Spinner } from "@/components/ui/spinner";
import { lazy } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { decodeTiff } from "@/lib/tiff-worker-client";
import { TiffDecodeResponse } from "@/lib/tiff-worker.types";

// this is a huge import (from tiff.js), so lets lazy load it
const TiffImageInner = lazy(() => import("./tiff-image-inner"));

export const TiffImage = memo(function TiffImage({ src }: { src: string }) {
	const tiffPath = useTiffPath(src);
	const containerRef = useRef<HTMLDivElement>(null);

	const [tiffPromise, setTiffPromise] = useState<Promise<TiffDecodeResponse>>();
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const controller = new AbortController();

		const dpr = Math.max(1, window.devicePixelRatio || 1);
		const maxWidth =
			Math.floor((container.clientWidth || 0) * dpr) || undefined;
		const maxHeight =
			Math.floor((container.clientHeight || 0) * dpr) || undefined;
		console.log("maxWidth", maxWidth, "maxHeight", maxHeight, container);

		const newPromise = tiffPath.then(readFile).then((f) =>
			decodeTiff(f.buffer, {
				memoryBytes: f.buffer.byteLength * 2,
				maxWidth,
				maxHeight,
				signal: controller.signal,
			})
		);
		setTiffPromise(newPromise);
		return () => {
			controller.abort();
		};
	}, [tiffPath, containerRef.current]);

	return (
		<div ref={containerRef} className="size-full">
			<ErrorBoundary errorPrefixMessage="Error loading TIFF image">
				<Suspense fallback={<Spinner />}>
					{tiffPromise && <TiffImageInner tiffPromise={tiffPromise} />}
				</Suspense>
			</ErrorBoundary>
		</div>
	);
});
