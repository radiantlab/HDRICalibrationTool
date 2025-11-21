/**
 * Home Page Component for the HDRI Calibration Tool.
 *
 * This component serves as the main page for configuring and generating HDR images.
 * It integrates various subcomponents for:
 * - Image selection
 * - View and cropping settings
 * - Response and correction files
 * - Luminance configuration
 * - Process control and execution
 *
 * The component manages the main workflow for generating HDR images using the Tauri backend.
 */
"use client";

import React, { Suspense, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	Field,
	FieldContent,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { TauriFileButtonInput } from "@/components/ui/tauri-file-button-input";
import { Input } from "@/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Rotate3D } from "lucide-react";
import {
	pipelineConfig,
	PipelineConfigProvider,
} from "./(pipeline-configuration)/config-provider";
import { ImageMatrixInput } from "@/components/ui/image-matrix-input";
import { useMotionValue, useTransform } from "framer-motion";
import { useMotionValueFormState } from "@/lib/useMotionValueFormState";
import { LensMaskInput } from "./lens-mask-input";
import { useGenericImageMetadata } from "@/lib/generic-image-metadata";

/**
 * Main Home page component for image configuration and processing
 *
 * @returns React component with the main application interface
 */
export default function Home() {
	const form = useForm<pipelineConfig>();
	const { control, register, setValue } = form;

	const inputSets = form.watch("inputSets");

	const maskPreviewImage = useMemo(() => {
		return inputSets?.[0]?.files?.[0];
	}, [inputSets]);

	const centerX = useMotionValueFormState(0, setValue, "lensMask.x");
	const centerY = useMotionValueFormState(0, setValue, "lensMask.y");

	const radiusAjusterCenterX = useMotionValue(100);
	const radiusAjusterCenterY = useMotionValue(100);

	const radius = useTransform<number, number>(
		[centerX, centerY, radiusAjusterCenterX, radiusAjusterCenterY],
		([cx, cy, rx, ry]) => Math.sqrt((cx! - rx!) ** 2 + (cy! - ry!) ** 2)
	);
	radius.on("change", (value) => setValue("lensMask.radius", value));

	return (
		<PipelineConfigProvider form={form}>
			<form
				className="flex h-full w-screen divide-x"
				onSubmit={form.handleSubmit((data) => {
					console.log("configForm submitted", data);
				})}
			>
				<ImageMatrixInput
					control={control}
					name="inputSets"
					className="flex-1 overflow-hidden"
				/>
				<div className="bg-accent w-96 shrink-0">
					<Controller
						name="cameraResponseLocation"
						control={control}
						render={({ fieldState }) => (
							<Field data-invalid={fieldState.invalid} className="p-4">
								<FieldLabel htmlFor="form-rhf-demo-title">
									Camera response file(s)
								</FieldLabel>
								<TauriFileButtonInput
									control={control}
									name="cameraResponseLocation"
									label="Camera Response Location"
									description="The location of the camera response file"
									filters={[
										{ name: "Camera response files", extensions: ["rsp"] },
									]}
								/>
								{fieldState.invalid && (
									<FieldError errors={[fieldState.error]} />
								)}
							</Field>
						)}
					/>
					<Accordion
						type="single"
						collapsible
						className="border-t"
						// defaultValue="item-1"
					>
						<AccordionItem value="item-1" className="px-4">
							<Tooltip>
								<TooltipTrigger asChild>
									<AccordionTrigger>Lens mask</AccordionTrigger>
								</TooltipTrigger>
								<TooltipContent>
									A circular mask applied to remove the parts of the image that
									are obstructed by the lens.
								</TooltipContent>
							</Tooltip>
							<AccordionContent className="flex flex-col gap-4 text-balance">
								<LensMaskInput
									maskPreviewImage={maskPreviewImage}
									centerX={centerX}
									centerY={centerY}
									radiusAjusterCenterX={radiusAjusterCenterX}
									radiusAjusterCenterY={radiusAjusterCenterY}
									register={register}
								/>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="item-2" className="px-4">
							<AccordionTrigger>Fisheye configuration</AccordionTrigger>
							<AccordionContent className="flex gap-1 text-balance">
								<Field>
									<FieldLabel className="items-center">
										<Rotate3D /> Fisheye view angles
									</FieldLabel>
									<FieldContent className="flex-row gap-1">
										<Input
											icon={"°"}
											type="number"
											placeholder="Vertical view angle"
											{...register("fisheyeView.verticalViewDegrees")}
										/>
										<Input
											icon={"°"}
											type="number"
											// TODO: refactor this to be from the top, not the bottom.
											// thats just more intuitive/standardized.
											placeholder="Horizontal view angle"
											{...register("fisheyeView.horizontalViewDegrees")}
										/>
									</FieldContent>
								</Field>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="item-3" className="px-4">
							<AccordionTrigger>Correction pipeline</AccordionTrigger>
							<AccordionContent className="flex flex-col gap-4 text-balance">
								placeholder
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</div>
			</form>
		</PipelineConfigProvider>
	);
}
