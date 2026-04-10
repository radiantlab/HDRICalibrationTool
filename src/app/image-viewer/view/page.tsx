"use client";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { parseAsString, useQueryState } from "nuqs";
import {
	Suspense,
	use,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { redirect } from "next/navigation";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import {
	DataTexture,
	FloatType,
	LinearFilter,
	LinearSRGBColorSpace,
	Mesh,
	MeshBasicMaterial,
	NoToneMapping,
	OrthographicCamera,
	PlaneGeometry,
	Scene,
	WebGLRenderer,
} from "three";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { HdrMetadataDetails } from "@/app/image-viewer/view/illuminance-details";
import {
	ImageSelectionProvider,
	useImageSelection,
} from "./image-selection-context";
import {
	HoverLuminanceDetails,
	type HoverLuminanceSample,
} from "./hover-luminance-details";
import { SelectionDetails } from "./selection-details";
import {
	computeFalsecolorLuminance,
	computeFalsecolorPixelLuminanceCpu,
	type FalsecolorLuminanceMatrix,
} from "./falsecolor-luminance-webgpu";
import { computeLuminanceSummary } from "./luminance-aggregates";
import { useImageSelectionLayer } from "./use-image-selection-layer";
import { buildHeatmapTexture, computeAutoScaleRange } from "./heatmap-texture";
import {
	EXPOSURE_DEFAULT,
	type ViewType,
	ViewControlCard,
} from "./view-control-card";

const DEFAULT_FALSECOLOR_MULTIPLIER = 179;

type LoadedHdrData = {
	texture: DataTexture;
	rgbaData: Float32Array | null;
	exposure: number;
};

type HdrMetadata = {
	FORMAT: string;
	[key: string]: string;
};

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

async function loadHdrData(filePath: string): Promise<LoadedHdrData> {
	const { readFile } = await import("@tauri-apps/plugin-fs");
	const fileData = await readFile(filePath);

	// Parse the HDR file ourselves since RGBELoader.parse() has bugs
	// with Radiance headers that contain long lines
	const { width, height, rgbeData, exposure } = parseRadianceHDR(fileData);

	// Convert RGBE bytes to float32 RGBA
	const floatData = new Float32Array(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		const r = rgbeData[i * 4] ?? 0;
		const g = rgbeData[i * 4 + 1] ?? 0;
		const b = rgbeData[i * 4 + 2] ?? 0;
		const e = rgbeData[i * 4 + 3] ?? 0;
		const scale = e !== 0 ? Math.pow(2.0, e - 128.0) / 255.0 : 0;
		floatData[i * 4] = r * scale;
		floatData[i * 4 + 1] = g * scale;
		floatData[i * 4 + 2] = b * scale;
		floatData[i * 4 + 3] = 1.0;
	}

	const texture = new DataTexture(floatData, width, height);
	texture.type = FloatType;
	texture.colorSpace = LinearSRGBColorSpace;
	texture.minFilter = LinearFilter;
	texture.magFilter = LinearFilter;
	texture.generateMipmaps = false;
	texture.flipY = true;
	texture.needsUpdate = true;

	return {
		texture,
		rgbaData: floatData,
		exposure,
	};
}

function parseRadianceHDR(data: Uint8Array) {
	// Find header end (empty line = two consecutive newlines)
	let headerEnd = -1;
	for (let i = 0; i < Math.min(data.length, 65536); i++) {
		if (data[i] === 0x0a && data[i + 1] === 0x0a) {
			headerEnd = i;
			break;
		}
	}
	if (headerEnd === -1)
		throw new Error("Invalid HDR: no header terminator found");

	// Parse header for exposure
	const headerStr = new TextDecoder().decode(data.subarray(0, headerEnd));
	const exposureMatch = headerStr.match(/EXPOSURE\s*=\s*([\d.eE+-]+)/);
	const exposure =
		exposureMatch && exposureMatch[1] ? parseFloat(exposureMatch[1]) : 1.0;

	// Parse resolution line (right after the empty line)
	const resStart = headerEnd + 2;
	let resEnd = resStart;
	while (resEnd < data.length && data[resEnd] !== 0x0a) resEnd++;
	const resLine = new TextDecoder().decode(data.subarray(resStart, resEnd));
	const resMatch = resLine.match(/([+-][XY])\s+(\d+)\s+([+-][XY])\s+(\d+)/);
	if (
		!resMatch ||
		!resMatch[1] ||
		!resMatch[2] ||
		!resMatch[3] ||
		!resMatch[4]
	) {
		throw new Error(`Invalid HDR resolution line: "${resLine}"`);
	}

	let width: number;
	let height: number;
	if (resMatch[1].charAt(1) === "Y") {
		height = parseInt(resMatch[2], 10);
		width = parseInt(resMatch[4], 10);
	} else {
		width = parseInt(resMatch[2], 10);
		height = parseInt(resMatch[4], 10);
	}

	// Decode RLE pixel data
	let pos = resEnd + 1;
	const rgbeData = new Uint8Array(width * height * 4);
	let offset = 0;

	for (let y = 0; y < height; y++) {
		if (pos + 4 > data.length) {
			throw new Error(`Ran out of data at scanline ${y}`);
		}

		// Check for new-style RLE
		if (data[pos] !== 2 || data[pos + 1] !== 2 || (data[pos + 2] ?? 0) & 0x80) {
			throw new Error("Unsupported HDR encoding (old-style RLE or flat)");
		}
		const scanlineWidth = ((data[pos + 2] ?? 0) << 8) | (data[pos + 3] ?? 0);
		if (scanlineWidth !== width) {
			throw new Error(`Scanline width mismatch: ${scanlineWidth} vs ${width}`);
		}
		pos += 4;

		// Read 4 channels separately (R, G, B, E)
		const scanline = new Uint8Array(width * 4);
		for (let ch = 0; ch < 4; ch++) {
			let x = 0;
			while (x < width) {
				if (pos >= data.length) {
					throw new Error(`Ran out of data at scanline ${y}, channel ${ch}`);
				}
				const code = data[pos] ?? 0;
				pos++;
				if (code > 128) {
					// RLE run
					const count = code - 128;
					const val = data[pos] ?? 0;
					pos++;
					for (let i = 0; i < count; i++) {
						scanline[ch * width + x] = val;
						x++;
					}
				} else {
					// Literal run
					for (let i = 0; i < code; i++) {
						scanline[ch * width + x] = data[pos] ?? 0;
						pos++;
						x++;
					}
				}
			}
		}

		// Deinterleave into RGBE pixel format
		for (let x = 0; x < width; x++) {
			rgbeData[offset] = scanline[x] ?? 0;
			offset++;
			rgbeData[offset] = scanline[width + x] ?? 0;
			offset++;
			rgbeData[offset] = scanline[width * 2 + x] ?? 0;
			offset++;
			rgbeData[offset] = scanline[width * 3 + x] ?? 0;
			offset++;
		}
	}

	return { width, height, rgbeData, exposure };
}

async function readHdrMetadata(filePath: string): Promise<HdrMetadata> {
	return invoke<HdrMetadata>("read_hdr_metadata", { path: filePath });
}

type ImageViewerData = LoadedHdrData & {
	hdrMetadata: HdrMetadata | null;
	imageWidth: number;
	imageHeight: number;
	luminanceMatrix: FalsecolorLuminanceMatrix | null;
};

async function loadImageViewerData(filePath: string): Promise<ImageViewerData> {
	const [loadedHdrData, hdrMetadata] = await Promise.all([
		loadHdrData(filePath),
		readHdrMetadata(filePath).catch(() => null),
	]);
	const imageWidth = loadedHdrData.texture.image.width;
	const imageHeight = loadedHdrData.texture.image.height;
	let luminanceMatrix: FalsecolorLuminanceMatrix | null = null;

	if (loadedHdrData.rgbaData) {
		try {
			luminanceMatrix = await computeFalsecolorLuminance({
				rgba: loadedHdrData.rgbaData,
				width: imageWidth,
				height: imageHeight,
				exposure: loadedHdrData.exposure,
			});
		} catch {
			luminanceMatrix = null;
		}
	}

	return {
		...loadedHdrData,
		hdrMetadata,
		imageWidth,
		imageHeight,
		luminanceMatrix,
	};
}

function ImageViewerLoadingState() {
	return (
		<div className="size-full grid place-items-center relative">
			<div className="absolute inset-0 grid place-items-center bg-background/60">
				<Spinner />
			</div>
		</div>
	);
}

function ImageViewerErrorState({ error }: FallbackProps) {
	return (
		<div className="size-full grid place-items-center relative">
			<Card className="absolute w-full max-w-md">
				<CardHeader>
					<CardTitle>Failed to load image</CardTitle>
					<CardDescription>{error.message}</CardDescription>
				</CardHeader>
			</Card>
		</div>
	);
}

export default function ImageViewerViewPage() {
	const [filePath] = useQueryState("filePath", parseAsString);
	if (!filePath) redirect("/image-viewer");

	return (
		<ImageSelectionProvider>
			<ImageViewerCanvas filePath={filePath} />
		</ImageSelectionProvider>
	);
}

function ImageViewerCanvas({ filePath }: { filePath: string }) {
	const viewerDataPromise = useMemo(
		() => loadImageViewerData(filePath),
		[filePath],
	);

	return (
		<ErrorBoundary
			fallbackRender={(props) => <ImageViewerErrorState {...props} />}
		>
			<Suspense fallback={<ImageViewerLoadingState />}>
				<ImageViewerCanvasContent viewerDataPromise={viewerDataPromise} />
			</Suspense>
		</ErrorBoundary>
	);
}

function ImageViewerCanvasContent({
	viewerDataPromise,
}: {
	viewerDataPromise: Promise<ImageViewerData>;
}) {
	const viewerData = use(viewerDataPromise);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [hoverLuminanceSample, setHoverLuminanceSample] =
		useState<HoverLuminanceSample | null>(null);
	const [exposureEv, setExposureEv] = useState(EXPOSURE_DEFAULT);
	const [selectedViewType, setSelectedViewType] = useState<ViewType>("natural");
	const { selection } = useImageSelection();
	const dimensions = useMemo<[number, number]>(
		() => [viewerData.imageWidth, viewerData.imageHeight],
		[viewerData.imageHeight, viewerData.imageWidth],
	);
	const {
		overlay,
		isSelectionInputEnabled,
		isSelecting,
		layerPointerHandlers,
	} = useImageSelectionLayer({
		imageDimensions: dimensions,
		surfaceRef: canvasRef,
	});
	const isHoverLuminanceVisible = !selection && !isSelecting;
	const luminanceSummary = useMemo(
		() => computeLuminanceSummary(viewerData.luminanceMatrix, selection),
		[selection, viewerData.luminanceMatrix],
	);

	const heatmapTexture = useMemo(() => {
		if (!viewerData.luminanceMatrix) return null;
		return buildHeatmapTexture(
			viewerData.luminanceMatrix,
			computeAutoScaleRange(viewerData.luminanceMatrix),
		);
	}, [viewerData.luminanceMatrix]);
	const isHeatmapAvailable = Boolean(heatmapTexture);
	const activeViewLayers = useMemo(() => {
		if (selectedViewType === "luminanceHeatmap" && heatmapTexture) {
			return {
				texture: heatmapTexture,
				exposureScale: 1,
			};
		}

		return {
			texture: viewerData.texture,
			exposureScale: Math.pow(2.0, exposureEv),
		};
	}, [exposureEv, heatmapTexture, selectedViewType, viewerData.texture]);

	const onCanvasPointerMove = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			if (!isHoverLuminanceVisible || !dimensions) return;
			const rgbaData = viewerData.rgbaData;
			if (!rgbaData) {
				setHoverLuminanceSample(null);
				return;
			}

			const [imageWidth, imageHeight] = dimensions;
			const rect = event.currentTarget.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return;

			const normalizedX = (event.clientX - rect.left) / rect.width;
			const normalizedY = (event.clientY - rect.top) / rect.height;
			if (
				normalizedX < 0 ||
				normalizedX > 1 ||
				normalizedY < 0 ||
				normalizedY > 1
			) {
				setHoverLuminanceSample(null);
				return;
			}

			const pixelX = clamp(
				Math.floor(normalizedX * imageWidth),
				0,
				imageWidth - 1,
			);
			const pixelY = clamp(
				Math.floor(normalizedY * imageHeight),
				0,
				imageHeight - 1,
			);
			const rgbaOffset = (pixelY * imageWidth + pixelX) * 4;
			const red = rgbaData[rgbaOffset] ?? 0;
			const green = rgbaData[rgbaOffset + 1] ?? 0;
			const blue = rgbaData[rgbaOffset + 2] ?? 0;
			const luminance = computeFalsecolorPixelLuminanceCpu({
				red,
				green,
				blue,
				multiplier: DEFAULT_FALSECOLOR_MULTIPLIER,
				exposure: viewerData.exposure,
			});

			setHoverLuminanceSample((previousSample) => {
				if (
					previousSample &&
					previousSample.x === pixelX &&
					previousSample.y === pixelY &&
					previousSample.luminance === luminance
				) {
					return previousSample;
				}
				return { x: pixelX, y: pixelY, luminance };
			});
		},
		[
			dimensions,
			isHoverLuminanceVisible,
			viewerData.exposure,
			viewerData.rgbaData,
		],
	);
	const onCanvasPointerLeave = useCallback(() => {
		setHoverLuminanceSample(null);
	}, []);

	useEffect(() => {
		if (!isHoverLuminanceVisible) setHoverLuminanceSample(null);
	}, [isHoverLuminanceVisible]);

	useEffect(() => {
		if (selectedViewType === "luminanceHeatmap" && !isHeatmapAvailable) {
			setSelectedViewType("natural");
		}
	}, [isHeatmapAvailable, selectedViewType]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		let renderer: WebGLRenderer | null = null;
		let geometry: PlaneGeometry | null = null;
		let material: MeshBasicMaterial | null = null;
		const activeTexture = activeViewLayers.texture;

		const dispose = () => {
			material?.dispose();
			geometry?.dispose();
			renderer?.dispose();
		};
		activeTexture.generateMipmaps = false;
		activeTexture.magFilter = LinearFilter;
		activeTexture.minFilter = LinearFilter;
		activeTexture.needsUpdate = true;

		renderer = new WebGLRenderer({ canvas, antialias: false });
		renderer.toneMapping = NoToneMapping;
		renderer.setPixelRatio(1);
		renderer.setSize(viewerData.imageWidth, viewerData.imageHeight, false);

		const scene = new Scene();
		const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
		geometry = new PlaneGeometry(2, 2);

		material = new MeshBasicMaterial({
			map: activeTexture,
			toneMapped: false,
		});
		material.color.setScalar(activeViewLayers.exposureScale);

		scene.add(new Mesh(geometry, material));
		renderer.render(scene, camera);

		return dispose;
	}, [activeViewLayers, viewerData.imageHeight, viewerData.imageWidth]);

	const canInteractWithSelection = isSelectionInputEnabled;
	const hasLuminanceSource = Boolean(viewerData.rgbaData);

	return (
		<div className="size-full grid place-items-center relative">
			<TransformWrapper
				centerOnInit
				limitToBounds={false}
				panning={{ disabled: isSelectionInputEnabled }}
			>
				<TransformComponent
					wrapperStyle={{ width: "100%", height: "100%" }}
					contentStyle={{ position: "relative" }}
				>
					<canvas
						ref={canvasRef}
						onPointerMove={onCanvasPointerMove}
						onPointerLeave={onCanvasPointerLeave}
						className="max-w-full max-h-full cursor-grab"
					/>
					{overlay && (
						<div className="absolute inset-0 pointer-events-none">
							<div
								className={cn(
									"absolute border-2 border-osu-beaver-orange",
									overlay.showTint && "bg-osu-beaver-orange/20",
								)}
								style={{
									left: `${overlay.leftPercent}%`,
									top: `${overlay.topPercent}%`,
									width: `${overlay.widthPercent}%`,
									height: `${overlay.heightPercent}%`,
								}}
							/>
						</div>
					)}
					<div
						className={cn(
							"absolute inset-0 touch-none",
							canInteractWithSelection
								? "pointer-events-auto cursor-crosshair"
								: "pointer-events-none",
						)}
						{...layerPointerHandlers}
					/>
				</TransformComponent>
			</TransformWrapper>
			<div className="absolute top-4 left-4 z-20 pointer-events-none w-56">
				<HdrMetadataDetails metadata={viewerData.hdrMetadata} />
			</div>
			<div className="absolute top-4 right-4 z-20 w-56">
				<SelectionDetails luminanceSummary={luminanceSummary} />
			</div>
			<div className="absolute bottom-4 right-4 z-20 pointer-events-none w-56">
				<HoverLuminanceDetails
					sample={hoverLuminanceSample}
					isVisible={isHoverLuminanceVisible}
					isLuminanceReady={hasLuminanceSource}
				/>
			</div>
			<div className="absolute bottom-4 left-4 z-20 w-64">
				<ViewControlCard
					selectedViewType={selectedViewType}
					onSelectedViewTypeChange={setSelectedViewType}
					exposureEv={exposureEv}
					onExposureEvChange={setExposureEv}
					isHeatmapAvailable={isHeatmapAvailable}
				/>
			</div>
		</div>
	);
}
