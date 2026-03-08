"use client";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
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
	Mesh,
	MeshBasicMaterial,
	NoToneMapping,
	OrthographicCamera,
	PlaneGeometry,
	Scene,
	WebGLRenderer,
} from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { HdrMetadataDetails } from "@/app/image-viewer/view/illuminance-details";
import { ImageSelectionProvider, useImageSelection } from "./image-selection-context";
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
	return new Promise((resolve, reject) => {
		const loader = new RGBELoader().setDataType(FloatType);
		loader.load(
			convertFileSrc(filePath),
			(texture, texData) => {
				const typedTexData = texData as { data?: unknown; exposure?: number };
				const fromTexData = typedTexData.data;
				let rgbaData = fromTexData instanceof Float32Array ? fromTexData : null;

				if (!rgbaData && "data" in texture.image) {
					const fromImage = (texture.image as { data?: unknown }).data;
					rgbaData = fromImage instanceof Float32Array ? fromImage : null;
				}

				resolve({
					texture: texture as DataTexture,
					rgbaData,
					exposure:
						typeof typedTexData.exposure === "number" && typedTexData.exposure > 0
							? typedTexData.exposure
							: 1,
				});
			},
			undefined,
			(cause) => {
				reject(cause);
			}
		);
	});
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
	const viewerDataPromise = useMemo(() => loadImageViewerData(filePath), [filePath]);

	return (
		<ErrorBoundary fallbackRender={(props) => <ImageViewerErrorState {...props} />}>
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
	const { selection } = useImageSelection();
	const dimensions = useMemo<[number, number]>(
		() => [viewerData.imageWidth, viewerData.imageHeight],
		[viewerData.imageHeight, viewerData.imageWidth]
	);
	const {
		overlay,
		isSelectionInputEnabled,
		isSelecting,
		layerPointerHandlers,
	} =
		useImageSelectionLayer({
			imageDimensions: dimensions,
			surfaceRef: canvasRef,
		});
	const isHoverLuminanceVisible = !selection && !isSelecting;
	const luminanceSummary = useMemo(
		() => computeLuminanceSummary(viewerData.luminanceMatrix, selection),
		[selection, viewerData.luminanceMatrix]
	);
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

			const pixelX = clamp(Math.floor(normalizedX * imageWidth), 0, imageWidth - 1);
			const pixelY = clamp(
				Math.floor(normalizedY * imageHeight),
				0,
				imageHeight - 1
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
		[dimensions, isHoverLuminanceVisible, viewerData.exposure, viewerData.rgbaData]
	);
	const onCanvasPointerLeave = useCallback(() => {
		setHoverLuminanceSample(null);
	}, []);

	useEffect(() => {
		if (!isHoverLuminanceVisible) setHoverLuminanceSample(null);
	}, [isHoverLuminanceVisible]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		let renderer: WebGLRenderer | null = null;
		let geometry: PlaneGeometry | null = null;
		let material: MeshBasicMaterial | null = null;
		const texture = viewerData.texture;

		const dispose = () => {
			texture?.dispose();
			material?.dispose();
			geometry?.dispose();
			renderer?.dispose();
		};
		texture.generateMipmaps = false;
		texture.magFilter = LinearFilter;
		texture.minFilter = LinearFilter;
		texture.needsUpdate = true;

		renderer = new WebGLRenderer({ canvas, antialias: false });
		// Keep source values untouched by display tone mapping.
		renderer.toneMapping = NoToneMapping;
		renderer.setPixelRatio(1);
		renderer.setSize(viewerData.imageWidth, viewerData.imageHeight, false);

		const scene = new Scene();
		const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
		geometry = new PlaneGeometry(2, 2);
		material = new MeshBasicMaterial({ map: texture, toneMapped: false });
		scene.add(new Mesh(geometry, material));
		renderer.render(scene, camera);

		return dispose;
	}, [viewerData.imageHeight, viewerData.imageWidth, viewerData.texture]);

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
									overlay.showTint && "bg-osu-beaver-orange/20"
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
								: "pointer-events-none"
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
		</div>
	);
}
