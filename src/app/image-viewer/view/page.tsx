"use client";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/core";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useRef, useState } from "react";
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
import { ImageSelectionProvider } from "./image-selection-context";
import { SelectionDetails } from "./selection-details";
import { useImageSelectionLayer } from "./use-image-selection-layer";

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
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [dimensions, setDimensions] = useState<
		[width: number, height: number] | null
	>(null);
	const {
		overlay,
		isSelectionInputEnabled,
		layerPointerHandlers,
	} =
		useImageSelectionLayer({
			imageDimensions: dimensions,
			surfaceRef: canvasRef,
		});

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
			setError(null);
			setDimensions(null);

			try {
				texture = await new RGBELoader()
					.setDataType(FloatType)
					.loadAsync(convertFileSrc(filePath));
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
				setDimensions([texture.image.width, texture.image.height]);
			} catch (cause) {
				if (isCancelled) return;
				const errorMessage =
					cause instanceof Error
						? cause.message
						: "Failed to load the HDR image.";
				setError(errorMessage);
			} finally {
				if (!isCancelled) setIsLoading(false);
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
				<SelectionDetails />
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
