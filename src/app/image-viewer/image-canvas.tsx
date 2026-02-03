"use client";

import { useCallback, useRef, useState, type WheelEvent } from "react";
import { useImageViewer, ZOOM_STEP, ZOOM_MIN, ZOOM_MAX } from "./image-viewer-context";
import { GenericImage } from "@/components/ui/(image)/generic-image";

export function ImageCanvas() {
	const { imagePath, zoom, panX, panY, setZoom, setPan, containerRef } =
		useImageViewer();

	const isDragging = useRef(false);
	const dragStart = useRef({ x: 0, y: 0 });
	const panStart = useRef({ x: 0, y: 0 });

	// scroll → zoom
	const handleWheel = useCallback(
		(e: WheelEvent) => {
			e.preventDefault();
			const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
			setZoom(zoom + delta);
		},
		[zoom, setZoom]
	);

	// drag → pan
	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			isDragging.current = true;
			dragStart.current = { x: e.clientX, y: e.clientY };
			panStart.current = { x: panX, y: panY };
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
		},
		[panX, panY]
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!isDragging.current) return;
			const dx = e.clientX - dragStart.current.x;
			const dy = e.clientY - dragStart.current.y;
			setPan(panStart.current.x + dx, panStart.current.y + dy);
		},
		[setPan]
	);

	const handlePointerUp = useCallback(() => {
		isDragging.current = false;
	}, []);

	if (!imagePath) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground select-none">
				<p>No image loaded — use the browse button to open a file.</p>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing bg-neutral-950"
			onWheel={handleWheel}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
		>
			<div
				className="absolute inset-0 flex items-center justify-center will-change-transform"
				style={{
					transform: `translate(${panX}px, ${panY}px) scale(${zoom / 100})`,
					transformOrigin: "center center",
				}}
			>
				<GenericImage fsSrc={imagePath} />
			</div>
		</div>
	);
}