"use client";

import {
	createContext,
	useCallback,
	useContext,
	useRef,
	useState,
	type ReactNode,
	type RefObject,
} from "react";

// ── Types ──────────────────────────────────────────────────────────
interface ViewerState {
	imagePath: string | null;
	zoom: number;
	panX: number;
	panY: number;
}

interface ViewerActions {
	setImagePath: (path: string | null) => void;
	zoomIn: () => void;
	zoomOut: () => void;
	resetView: () => void;
	pan: (dx: number, dy: number) => void;
	setPan: (x: number, y: number) => void;
	setZoom: (z: number) => void;
	containerRef: RefObject<HTMLDivElement | null>;
}

type ImageViewerContextValue = ViewerState & ViewerActions;

// ── Constants ──────────────────────────────────────────────────────
const ZOOM_STEP = 10;
const ZOOM_MIN = 10;
const ZOOM_MAX = 500;
const PAN_STEP = 50;

// ── Context ────────────────────────────────────────────────────────
const ImageViewerContext = createContext<ImageViewerContextValue | null>(null);

export function useImageViewer() {
	const ctx = useContext(ImageViewerContext);
	if (!ctx) {
		throw new Error("useImageViewer must be used within <ImageViewerProvider>");
	}
	return ctx;
}

// ── Provider ───────────────────────────────────────────────────────
export function ImageViewerProvider({ children }: { children: ReactNode }) {
	const [imagePath, setImagePath] = useState<string | null>(null);
	const [zoom, setZoomRaw] = useState(100);
	const [panX, setPanX] = useState(0);
	const [panY, setPanY] = useState(0);
	const containerRef = useRef<HTMLDivElement | null>(null);

	const setZoom = useCallback(
		(z: number) => setZoomRaw(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))),
		[]
	);
	const zoomIn = useCallback(
		() => setZoomRaw((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP)),
		[]
	);
	const zoomOut = useCallback(
		() => setZoomRaw((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP)),
		[]
	);
	const pan = useCallback((dx: number, dy: number) => {
		setPanX((x) => x + dx);
		setPanY((y) => y + dy);
	}, []);
	const setPan = useCallback((x: number, y: number) => {
		setPanX(x);
		setPanY(y);
	}, []);
	const resetView = useCallback(() => {
		setZoomRaw(100);
		setPanX(0);
		setPanY(0);
	}, []);

	return (
		<ImageViewerContext.Provider
			value={{
				imagePath,
				zoom,
				panX,
				panY,
				setImagePath,
				zoomIn,
				zoomOut,
				resetView,
				pan,
				setPan,
				setZoom,
				containerRef,
			}}
		>
			{children}
		</ImageViewerContext.Provider>
	);
}

export { ZOOM_STEP, ZOOM_MIN, ZOOM_MAX, PAN_STEP };