"use client";

import { useEffect } from "react";
import { useImageViewer, PAN_STEP, ZOOM_STEP } from "./image-viewer-context";

export function ViewerKeyboardHandler() {
	const { zoomIn, zoomOut, resetView, pan } = useImageViewer();

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			switch (e.key) {
				case "ArrowUp":
					e.preventDefault();
					pan(0, PAN_STEP);
					break;
				case "ArrowDown":
					e.preventDefault();
					pan(0, -PAN_STEP);
					break;
				case "ArrowLeft":
					e.preventDefault();
					pan(PAN_STEP, 0);
					break;
				case "ArrowRight":
					e.preventDefault();
					pan(-PAN_STEP, 0);
					break;
				case "+":
				case "=":
					e.preventDefault();
					zoomIn();
					break;
				case "-":
					e.preventDefault();
					zoomOut();
					break;
				case "0":
					e.preventDefault();
					resetView();
					break;
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [zoomIn, zoomOut, resetView, pan]);

	return null;
}