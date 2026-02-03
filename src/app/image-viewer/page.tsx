"use client";

import { ImageViewerProvider } from "./image-viewer-context";
import { ViewerToolbar } from "./viewer-toolbar";
import { ImageCanvas } from "./image-canvas";
import { ViewerKeyboardHandler } from "./viewer-keyboard-handler";
import { ImageViewerErrorBoundary } from "./image-viewer-error-boundary";

export default function ImageViewerPage() {
	return (
		<ImageViewerProvider>
			<ViewerKeyboardHandler />
			<div className="flex flex-col h-full">
				<ViewerToolbar />
				<ImageViewerErrorBoundary>
					<ImageCanvas />
				</ImageViewerErrorBoundary>
			</div>
		</ImageViewerProvider>
	);
}