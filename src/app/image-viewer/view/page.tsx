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
import {
	getCenterPosition,
	type ReactZoomPanPinchContentRef,
	TransformComponent,
	TransformWrapper,
} from "react-zoom-pan-pinch";
import {
	CanvasTexture,
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
import {
	buildHeatmapTexture,
	computeAutoScaleRange,
	FALSECOLOR_GRADIENT,
	type HeatmapScaleRange,
} from "./heatmap-texture";
import { Button } from "@/components/ui/button";
import { LocateFixed } from "lucide-react";
import {
	EXPOSURE_DEFAULT,
	type ViewType,
	ViewControlCard,
} from "./view-control-card";

const DEFAULT_FALSECOLOR_MULTIPLIER = 179;
const HEATMAP_LEGEND_WIDTH = 200;
const HEATMAP_LEGEND_LABEL_COUNT = 7;
const LUMINANCE_UNIT_LABEL = "cd/m2";

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

const formatLuminanceLegendValue = (value: number) => {
	if (!Number.isFinite(value)) return `0 ${LUMINANCE_UNIT_LABEL}`;
	if (value === 0) return `0 ${LUMINANCE_UNIT_LABEL}`;

	const absoluteValue = Math.abs(value);
	if (absoluteValue >= 10000 || absoluteValue < 0.01) {
		const formattedValue = value
			.toExponential(1)
			.replace(".0e", "e")
			.replace("e+", "e");
		return `${formattedValue} ${LUMINANCE_UNIT_LABEL}`;
	}

	const fixedValue =
		absoluteValue >= 100
			? value.toFixed(0)
			: absoluteValue >= 10
				? value.toFixed(1)
				: value.toFixed(2);

	const formattedValue = fixedValue
		.replace(/\.0+$/, "")
		.replace(/(\.\d*?[1-9])0+$/, "$1");
	return `${formattedValue} ${LUMINANCE_UNIT_LABEL}`;
};

function buildHeatmapLegendTexture(
	scaleRange: HeatmapScaleRange,
	height: number,
	width = HEATMAP_LEGEND_WIDTH,
) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = Math.max(1, height);

	const context = canvas.getContext("2d");
	if (!context) return new CanvasTexture(canvas);

	const legendHeight = canvas.height;
	const verticalPadding = Math.min(24, Math.max(8, legendHeight * 0.08));
	const barTop = verticalPadding;
	const barBottom = Math.max(barTop + 1, legendHeight - verticalPadding);
	const barHeight = barBottom - barTop;
	const barX = 10;
	const barWidth = 18;
	const tickStartX = barX + barWidth + 3;
	const tickEndX = tickStartX + 5;
	const labelX = tickEndX + 4;

	context.fillStyle = "rgba(2, 6, 23, 0.78)";
	context.fillRect(0, 0, canvas.width, canvas.height);

	const gradient = context.createLinearGradient(0, barTop, 0, barBottom);
	for (const stop of FALSECOLOR_GRADIENT) {
		const red = Math.round(stop.r * 255);
		const green = Math.round(stop.g * 255);
		const blue = Math.round(stop.b * 255);
		gradient.addColorStop(1 - stop.position, `rgb(${red}, ${green}, ${blue})`);
	}

	context.fillStyle = gradient;
	context.fillRect(barX, barTop, barWidth, barHeight);
	context.strokeStyle = "rgba(255, 255, 255, 0.5)";
	context.lineWidth = 1;
	context.strokeRect(barX + 0.5, barTop + 0.5, barWidth - 1, barHeight - 1);

	const logMin = Math.log10(Math.max(scaleRange.minimum, 1e-6));
	const logMax = Math.log10(Math.max(scaleRange.maximum, 1e-6));
	const logRange = logMax - logMin;

	context.fillStyle = "rgba(255, 255, 255, 0.92)";
	context.strokeStyle = "rgba(255, 255, 255, 0.65)";
	context.font =
		'16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
	context.textAlign = "left";
	context.textBaseline = "middle";

	for (let index = 0; index < HEATMAP_LEGEND_LABEL_COUNT; index += 1) {
		const position = index / (HEATMAP_LEGEND_LABEL_COUNT - 1);
		const normalized = 1 - position;
		const y = barTop + position * barHeight;
		const luminance =
			logRange > 0
				? Math.pow(10, logMin + normalized * logRange)
				: scaleRange.minimum;

		context.beginPath();
		context.moveTo(tickStartX, y);
		context.lineTo(tickEndX, y);
		context.stroke();
		context.fillText(formatLuminanceLegendValue(luminance), labelX, y);
	}

	const texture = new CanvasTexture(canvas);
	texture.generateMipmaps = false;
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearFilter;
	texture.needsUpdate = true;

	return texture;
}

const POSITION_EPSILON = 1;
const SCALE_EPSILON = 1e-4;

type PanZoomTransformComparable = {
	scale: number;
	positionX: number;
	positionY: number;
};

function isTransformAwayFromBaseline(
	state: PanZoomTransformComparable,
	baseline: PanZoomTransformComparable | null,
): boolean {
	if (!baseline) return false;
	return (
		Math.abs(state.scale - baseline.scale) > SCALE_EPSILON ||
		Math.abs(state.positionX - baseline.positionX) > POSITION_EPSILON ||
		Math.abs(state.positionY - baseline.positionY) > POSITION_EPSILON
	);
}

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
	return (
		<Suspense>
			<ImageViewerPageContent />
		</Suspense>
	);
}

function ImageViewerPageContent() {
	const [filePath] = useQueryState("filePath", parseAsString);
	console.log({ filePath });
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

type transformState = {
	scale: number;
	positionX: number;
	positionY: number;
};

function ImageViewerCanvasContent({
	viewerDataPromise,
}: {
	viewerDataPromise: Promise<ImageViewerData>;
}) {
	const viewerData = use(viewerDataPromise);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const imageSurfaceRef = useRef<HTMLDivElement>(null);
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
		surfaceRef: imageSurfaceRef,
	});
	const isHoverLuminanceVisible = !selection && !isSelecting;
	const luminanceSummary = useMemo(
		() => computeLuminanceSummary(viewerData.luminanceMatrix, selection),
		[selection, viewerData.luminanceMatrix],
	);

	const heatmapScaleRange = useMemo(() => {
		if (!viewerData.luminanceMatrix) return null;
		return computeAutoScaleRange(viewerData.luminanceMatrix);
	}, [viewerData.luminanceMatrix]);
	const heatmapTexture = useMemo(() => {
		if (!viewerData.luminanceMatrix || !heatmapScaleRange) return null;
		return buildHeatmapTexture(viewerData.luminanceMatrix, heatmapScaleRange);
	}, [heatmapScaleRange, viewerData.luminanceMatrix]);
	const isHeatmapAvailable = Boolean(heatmapTexture);
	const activeViewLayers = useMemo(() => {
		if (selectedViewType === "luminanceHeatmap" && heatmapTexture) {
			return {
				texture: heatmapTexture,
				exposureScale: 1,
				heatmapScaleRange,
			};
		}

		return {
			texture: viewerData.texture,
			exposureScale: Math.pow(2.0, exposureEv),
			heatmapScaleRange: null,
		};
	}, [
		exposureEv,
		heatmapScaleRange,
		heatmapTexture,
		selectedViewType,
		viewerData.texture,
	]);
	const activeLegendWidth = activeViewLayers.heatmapScaleRange
		? HEATMAP_LEGEND_WIDTH
		: 0;
	const canvasRenderWidth = viewerData.imageWidth + activeLegendWidth;
	const imageAreaWidthPercent =
		canvasRenderWidth > 0
			? (viewerData.imageWidth / canvasRenderWidth) * 100
			: 100;

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

			const imageRectWidth =
				rect.width * (imageWidth / Math.max(canvasRenderWidth, 1));
			const relativeX = event.clientX - rect.left;
			const relativeY = event.clientY - rect.top;
			if (
				relativeX < 0 ||
				relativeX > imageRectWidth ||
				relativeY < 0 ||
				relativeY > rect.height
			) {
				setHoverLuminanceSample(null);
				return;
			}
			const normalizedX = relativeX / imageRectWidth;
			const normalizedY = relativeY / rect.height;

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
			canvasRenderWidth,
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
		let legendGeometry: PlaneGeometry | null = null;
		let legendMaterial: MeshBasicMaterial | null = null;
		let legendTexture: CanvasTexture | null = null;
		const activeTexture = activeViewLayers.texture;
		const legendScaleRange = activeViewLayers.heatmapScaleRange;
		const legendWidth = legendScaleRange ? HEATMAP_LEGEND_WIDTH : 0;
		const renderWidth = viewerData.imageWidth + legendWidth;

		const dispose = () => {
			legendTexture?.dispose();
			legendMaterial?.dispose();
			legendGeometry?.dispose();
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
		renderer.setSize(renderWidth, viewerData.imageHeight, false);

		const scene = new Scene();
		const camera = new OrthographicCamera(
			0,
			renderWidth,
			viewerData.imageHeight,
			0,
			0,
			1,
		);
		geometry = new PlaneGeometry(viewerData.imageWidth, viewerData.imageHeight);

		material = new MeshBasicMaterial({
			map: activeTexture,
			toneMapped: false,
		});
		material.color.setScalar(activeViewLayers.exposureScale);

		const imageMesh = new Mesh(geometry, material);
		imageMesh.position.set(
			viewerData.imageWidth / 2,
			viewerData.imageHeight / 2,
			0,
		);
		scene.add(imageMesh);

		if (legendScaleRange) {
			legendTexture = buildHeatmapLegendTexture(
				legendScaleRange,
				viewerData.imageHeight,
				legendWidth,
			);
			legendGeometry = new PlaneGeometry(legendWidth, viewerData.imageHeight);
			legendMaterial = new MeshBasicMaterial({
				map: legendTexture,
				toneMapped: false,
				transparent: true,
			});

			const legendMesh = new Mesh(legendGeometry, legendMaterial);
			legendMesh.position.set(
				viewerData.imageWidth + legendWidth / 2,
				viewerData.imageHeight / 2,
				0,
			);
			scene.add(legendMesh);
		}
		renderer.render(scene, camera);

		return dispose;
	}, [activeViewLayers, viewerData.imageHeight, viewerData.imageWidth]);

	const canInteractWithSelection = isSelectionInputEnabled;
	const hasLuminanceSource = Boolean(viewerData.rgbaData);

	const panZoomControlsRef = useRef<ReactZoomPanPinchContentRef | null>(null);

	const [currentPosition, setCurrentPosition] = useState<transformState | null>(
		null,
	);

	const centerPosition = useMemo(() => {
		const controls = panZoomControlsRef.current;
		if (!controls || !currentPosition) return null;
		const { wrapperComponent, contentComponent } = controls.instance;
		if (!wrapperComponent || !contentComponent) return null;
		return getCenterPosition(
			currentPosition.scale,
			wrapperComponent,
			contentComponent,
		);
	}, [currentPosition]);

	const atDefaultZoomAndCenter =
		centerPosition !== null &&
		currentPosition !== null &&
		Math.abs(currentPosition.scale - 1) <= SCALE_EPSILON &&
		!isTransformAwayFromBaseline(currentPosition, centerPosition);

	const onRecenterView = useCallback(() => {
		panZoomControlsRef.current?.centerView(1, 200);
	}, []);

	return (
		<div className="size-full grid place-items-center relative">
			<TransformWrapper
				key={viewerData.texture.uuid}
				ref={(controls) => {
					panZoomControlsRef.current = controls;
				}}
				centerOnInit
				limitToBounds={false}
				onTransformed={(_, state) => {
					setCurrentPosition(state);
				}}
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
					<div
						ref={imageSurfaceRef}
						className="absolute inset-y-0 left-0 pointer-events-none"
						style={{ width: `${imageAreaWidthPercent}%` }}
					>
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
					</div>
				</TransformComponent>
			</TransformWrapper>
			<div className="absolute top-4 left-4 z-30 flex items-start gap-2">
				<div className="pointer-events-none w-56">
					<HdrMetadataDetails metadata={viewerData.hdrMetadata} />
				</div>
				<Button
					type="button"
					disabled={atDefaultZoomAndCenter}
					size="icon"
					variant="outline"
					className="pointer-events-auto shrink-0 bg-background/80 shadow-sm backdrop-blur-sm"
					onClick={onRecenterView}
					aria-label="Recenter image"
					title="Recenter image"
				>
					<LocateFixed />
				</Button>
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
