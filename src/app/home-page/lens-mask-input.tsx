import { cn } from "@/lib/utils";
import { ComponentProps, Suspense, use } from "react";
import { Spinner } from "@/components/ui/spinner";
import { ScaledCircularMaskSelection } from "./fs-circular-mas-selection";
import { GenericImage } from "@/components/ui/(image)/generic-image";
import { Input } from "@/components/ui/input";
import { Radius, MoveHorizontal, MoveVertical } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	GenericImageMetadata,
	useGenericImageMetadata,
} from "@/lib/generic-image-metadata";
import { type MotionValue } from "framer-motion";
import { UseFormRegister } from "react-hook-form";
import { pipelineConfig } from "./(pipeline-configuration)/config-provider";

export function LensMaskInput({
	maskPreviewImage,
	...props
}: {
	centerX: MotionValue<number>;
	centerY: MotionValue<number>;
	radiusAjusterCenterX: MotionValue<number>;
	radiusAjusterCenterY: MotionValue<number>;
	maskPreviewImage?: string;

	register: UseFormRegister<pipelineConfig>;
}) {
	return (
		<Suspense fallback={<Spinner />}>
			{maskPreviewImage ? (
				<LensMaskInputInner
					maskPreviewImage={maskPreviewImage}
					maskPreviewImageMetadataPromise={useGenericImageMetadata(
						maskPreviewImage
					)}
					{...props}
				/>
			) : (
				<p className="w-full h-48 border-dashed border-4 text-lg text-muted-foreground grid place-items-center">
					No image selected
				</p>
			)}
		</Suspense>
	);
}

function LensMaskInputInner({
	maskPreviewImage,
	maskPreviewImageMetadataPromise,
	centerX,
	centerY,
	radiusAjusterCenterX,
	radiusAjusterCenterY,
	register,
}: ComponentProps<typeof LensMaskInput> & {
	maskPreviewImage: string;
	maskPreviewImageMetadataPromise: Promise<GenericImageMetadata>;
}) {
	const maskPreviewImageMetadata = use(maskPreviewImageMetadataPromise);
	return (
		<div className="space-y-1">
			<div
				className={cn(
					"size-full grid place-items-center text-center text-muted-foreground",
					{
						"border border-dashed": !maskPreviewImage,
					}
				)}
				style={{
					aspectRatio: `${maskPreviewImageMetadata.size[0]} / ${maskPreviewImageMetadata.size[1]}`,
				}}
			>
				<Suspense fallback={<Spinner />}>
					<ScaledCircularMaskSelection
						className="size-full"
						centerX={centerX}
						centerY={centerY}
						radiusAjusterCenterX={radiusAjusterCenterX}
						radiusAjusterCenterY={radiusAjusterCenterY}
						imagePath={maskPreviewImage}
					>
						<GenericImage fsSrc={maskPreviewImage} />
					</ScaledCircularMaskSelection>
				</Suspense>
			</div>
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="flex gap-1">
						<Input
							icon={<Radius />}
							type="number"
							placeholder="Radius"
							{...register("lensMask.radius", {
								valueAsNumber: true,
								min: {
									value: 1,
									message: "Radius must be greater than 0",
								},
								onChange(e: React.ChangeEvent<HTMLInputElement>) {
									const n = Number(e.target.value);
									if (isNaN(n)) return;
									radiusAjusterCenterX.set(centerX.get() + n);
									radiusAjusterCenterY.set(centerY.get());
								},
							})}
							step="any"
						/>
						<Input
							icon={<MoveHorizontal />}
							type="number"
							placeholder="X"
							{...register("lensMask.x", {
								valueAsNumber: true,
								onChange(e: React.ChangeEvent<HTMLInputElement>) {
									const n = Number(e.target.value);
									if (isNaN(n)) return;
									const deltaX = n - centerX.get();
									centerX.set(n);
									radiusAjusterCenterX.set(radiusAjusterCenterX.get() + deltaX);
								},
							})}
							step="any"
						/>
						<Input
							icon={<MoveVertical />}
							type="number"
							placeholder="Y"
							{...register("lensMask.y", {
								valueAsNumber: true,
								onChange(e: React.ChangeEvent<HTMLInputElement>) {
									const n = Number(e.target.value);
									if (isNaN(n)) return;
									const deltaY = n - centerY.get();
									centerY.set(n);
									radiusAjusterCenterY.set(radiusAjusterCenterY.get() + deltaY);
								},
							})}
							step="any"
						/>
					</div>
				</TooltipTrigger>
				<TooltipContent>Values in pixels.</TooltipContent>
			</Tooltip>
		</div>
	);
}
