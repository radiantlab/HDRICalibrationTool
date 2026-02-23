"use client";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/core";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { redirect } from "next/navigation";
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
import { computeLuminanceAggregates } from "./luminance-aggregates";
import { useImageSelectionLayer } from "./use-image-selection-layer";

const DEFAULT_FALSECOLOR_MULTIPLIER = 179;

type LoadedHdrData = {
	texture: DataTexture;
	rgbaData: Float32Array | null;
	exposure: number;
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
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const hdrRgbaDataRef = useRef<Float32Array | null>(null);
	const luminanceScaleRef = useRef({
		multiplier: DEFAULT_FALSECOLOR_MULTIPLIER,
		exposure: 1,
	});
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isLuminanceLoading, setIsLuminanceLoading] = useState(false);
	const [hasLuminanceSource, setHasLuminanceSource] = useState(false);
	const [hoverLuminanceSample, setHoverLuminanceSample] =
		useState<HoverLuminanceSample | null>(null);
	const [dimensions, setDimensions] = useState<
		[width: number, height: number] | null
	>(null);
	const [luminanceMatrix, setLuminanceMatrix] =
		useState<FalsecolorLuminanceMatrix | null>(null);
	const { selection } = useImageSelection();
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
	const luminanceAggregates = useMemo(
		() => computeLuminanceAggregates(luminanceMatrix, selection),
		[luminanceMatrix, selection]
	);
	const onCanvasPointerMove = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			if (!isHoverLuminanceVisible || !dimensions) return;
			const rgbaData = hdrRgbaDataRef.current;
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
			const { multiplier, exposure } = luminanceScaleRef.current;
			const luminance = computeFalsecolorPixelLuminanceCpu({
				red,
				green,
				blue,
				multiplier,
				exposure,
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
		[dimensions, isHoverLuminanceVisible]
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
		let texture: DataTexture | null = null;
		let isCancelled = false;

		const dispose = () => {
			texture?.dispose();
			material?.dispose();
			geometry?.dispose();
			renderer?.dispose();
		};

		const loadAndRender = async () => {
			setIsLoading(true);
			setIsLuminanceLoading(false);
			setError(null);
			setDimensions(null);
			setLuminanceMatrix(null);
			setHasLuminanceSource(false);
			setHoverLuminanceSample(null);
			hdrRgbaDataRef.current = null;
			luminanceScaleRef.current = {
				multiplier: DEFAULT_FALSECOLOR_MULTIPLIER,
				exposure: 1,
			};

			try {
				const loadedHdrData = await loadHdrData(filePath);
				texture = loadedHdrData.texture;
				if (isCancelled) return;
				texture.generateMipmaps = false;
				texture.magFilter = LinearFilter;
				texture.minFilter = LinearFilter;
				texture.needsUpdate = true;

				renderer = new WebGLRenderer({ canvas, antialias: false });
				// Keep source values untouched by display tone mapping.
				renderer.toneMapping = NoToneMapping;
				renderer.setPixelRatio(1);
				renderer.setSize(texture.image.width, texture.image.height, false);

				const scene = new Scene();
				const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
				geometry = new PlaneGeometry(2, 2);
				material = new MeshBasicMaterial({ map: texture, toneMapped: false });
				scene.add(new Mesh(geometry, material));
				renderer.render(scene, camera);
				const imageWidth = texture.image.width;
				const imageHeight = texture.image.height;
				setDimensions([imageWidth, imageHeight]);

				if (loadedHdrData.rgbaData) {
					hdrRgbaDataRef.current = loadedHdrData.rgbaData;
					luminanceScaleRef.current = {
						multiplier: DEFAULT_FALSECOLOR_MULTIPLIER,
						exposure: loadedHdrData.exposure,
					};
					setHasLuminanceSource(true);
					setIsLuminanceLoading(true);
					try {
						const nextLuminanceMatrix = await computeFalsecolorLuminance({
							rgba: loadedHdrData.rgbaData,
							width: imageWidth,
							height: imageHeight,
							exposure: loadedHdrData.exposure,
						});
						if (!isCancelled) {
							setLuminanceMatrix(nextLuminanceMatrix);
						}
					} catch {
						if (!isCancelled) {
							setLuminanceMatrix(null);
						}
					}
				} else {
					hdrRgbaDataRef.current = null;
					setHasLuminanceSource(false);
				}
			} catch (cause) {
				if (isCancelled) return;
				const errorMessage =
					cause instanceof Error
						? cause.message
						: "Failed to load the HDR image.";
				setError(errorMessage);
			} finally {
				if (!isCancelled) {
					setIsLoading(false);
					setIsLuminanceLoading(false);
				}
			}
		};

		void loadAndRender();
		return () => {
			isCancelled = true;
			dispose();
		};
	}, [filePath]);

	const canInteractWithSelection =
		isSelectionInputEnabled && Boolean(dimensions) && !isLoading && !error;

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
						className={cn(
							"max-w-full max-h-full cursor-grab",
							(isLoading || Boolean(error)) && "hidden"
						)}
					/>
					{overlay && !isLoading && !error && (
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
			<div className="absolute top-4 right-4 z-20 pointer-events-none w-56">
				<SelectionDetails
					luminanceAggregates={luminanceAggregates}
					isLuminanceLoading={isLuminanceLoading}
				/>
			</div>
			<div className="absolute bottom-4 right-4 z-20 pointer-events-none w-56">
				<HoverLuminanceDetails
					sample={hoverLuminanceSample}
					isVisible={isHoverLuminanceVisible}
					isLuminanceReady={hasLuminanceSource}
				/>
			</div>
			{isLoading && (
				<div className="absolute inset-0 grid place-items-center bg-background/60">
					<Spinner />
				</div>
			)}
			{error && (
				<Card className="absolute w-full max-w-md">
					<CardHeader>
						<CardTitle>Failed to load image</CardTitle>
						<CardDescription>{error}</CardDescription>
					</CardHeader>
				</Card>
			)}
		</div>
	);
}
