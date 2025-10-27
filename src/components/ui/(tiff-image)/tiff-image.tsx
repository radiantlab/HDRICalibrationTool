"use client";

import { Suspense } from "react";
import { useTiffPath } from "./useTiffPath";
import { readFile } from "@tauri-apps/plugin-fs";
import { Spinner } from "../spinner";
import { lazy } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";

// this is a huge import (from tiff.js), so lets lazy load it
const TiffImageInner = lazy(() => import("./tiff-image-inner"));

export function TiffImage({ src }: { src: string }) {
	const tiffPath = useTiffPath(src);

	return (
		<ErrorBoundary errorPrefixMessage="Error loading TIFF image">
			<Suspense fallback={<Spinner className="size-10" />}>
				<TiffImageInner tiffBufferPromise={tiffPath.then(readFile)} />
			</Suspense>
		</ErrorBoundary>
	);
}
