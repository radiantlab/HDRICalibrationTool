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

import React, { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
} from "@/components/ui/accordion";
import {
	Field,
	FieldContent,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
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
import { FileInput } from "@/components/ui/file-input";
import { useMotionValue, useTransform } from "framer-motion";
import { useMotionValueFormState } from "@/lib/useMotionValueFormState";
import { LensMaskInput } from "./lens-mask-input";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settings-store";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldContainerAccordionTrigger } from "@/components/ui/field-accordion-trigger";
import { PipelineStatus } from "./pipeline-status";
import { toast } from "sonner";

/**
 * Main Home page component for image configuration and processing
 *
 * @returns React component with the main application interface
 */
export default function Home() {
	const { settings } = useSettingsStore();
	const form = useForm<pipelineConfig>();
	const { control, register, setValue } = form;
	console.log("form", form.formState.errors);

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

	const [progressVisible, setProgressVisible] = useState(false);

	return (
		<PipelineConfigProvider form={form}>
			<form
				className="flex h-full w-full divide-x overflow-auto"
				onSubmit={form.handleSubmit(
					async (data) => {
						console.log("configForm submitted", data);

						setProgressVisible(true);
						const imageSet = data.inputSets[0]!; // TODO: implement batch processing
						const params = {
							// Paths to external tools
							radiancePath: settings.radiancePath,
							hdrgenPath: settings.hdrgenPath,
							dcrawEmuPath: settings.dcrawEmuPath,
							outputPath: settings.outputPath,

							// Input images and correction files
							inputImages: imageSet.files,
							responseFunction: data.cameraResponseLocation ?? "",
							fisheyeCorrectionCal: data.correctionFiles.fisheye,
							vignettingCorrectionCal: data.correctionFiles.vignetting,
							photometricAdjustmentCal: data.correctionFiles.calibrationFactor,
							neutralDensityCal: data.correctionFiles.neutralDensity,
							// todo: refactor the backend to accept proper numerical types instead of icky strings that will be coerced later.
							diameter: String(Math.round(data.lensMask.radius * 2)),
							xleft: String(Math.round(data.lensMask.x - data.lensMask.radius)),
							ydown: String(Math.round(data.lensMask.y - data.lensMask.radius)),
							xdim: String(data.outputSettings.targetRes),
							ydim: String(data.outputSettings.targetRes),
							verticalAngle: data.fisheyeView.verticalViewDegrees,
							horizontalAngle: data.fisheyeView.horizontalViewDegrees,
							// todo: remove these from this form completely when we get to refactoring the backend. These should only be exposed on the image viewer, where they are relevant
							scaleLimit: "",
							scaleLabel: "",
							scaleLevels: "",
							legendDimensions: "",
							filterImages: data.outputSettings.filterIrrelevantSrcImages,
						};
						console.log("pipeline params", params);
						const invokePromise = invoke<string>("pipeline", params).catch(
							(error) => {
								setProgressVisible(false);
								toast.error("Error generating HDR image: " + error);
							}
						);
						console.log("invokePromise", invokePromise);
					},
					(errors) => {
						console.log("form errors", errors);
					}
				)}
			>
				<ImageMatrixInput
					control={control}
					name="inputSets"
					className="flex-1 overflow-hidden"
					rules={{
						validate: (v) =>
							(Array.isArray(v) && v.length > 0) ||
							"At least one image set is required",
					}}
				/>
				<div className="bg-accent w-96 h-full flex flex-col min-h-0">
					<Accordion
						type="single"
						collapsible
						className="flex-1 min-h-0 overflow-y-auto"
						// defaultValue="item-1"
					>
						<AccordionItem value="item-0" className="px-4">
							<FieldContainerAccordionTrigger
								fields={["cameraResponseLocation"]}
							>
								Camera Response
							</FieldContainerAccordionTrigger>
							<AccordionContent
								forceMount
								className="flex flex-col gap-4 text-balance"
							>
								<FileInput
									control={control}
									explicitOptional
									name="cameraResponseLocation"
									placeholder="Select or paste a .rsp file…"
									filters={[
										{ name: "Camera response files", extensions: ["rsp"] },
									]}
									rules={{ required: "Camera response file is required" }}
								/>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="item-1" className="px-4">
							<Tooltip>
								<TooltipTrigger asChild>
									<FieldContainerAccordionTrigger
										fields={["lensMask.radius", "lensMask.x", "lensMask.y"]}
									>
										Lens mask
									</FieldContainerAccordionTrigger>
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
							<FieldContainerAccordionTrigger
								fields={[
									"fisheyeView.verticalViewDegrees",
									"fisheyeView.horizontalViewDegrees",
								]}
							>
								Fisheye configuration
							</FieldContainerAccordionTrigger>
							<AccordionContent forceMount className="flex gap-1 text-balance">
								<Field>
									<FieldLabel className="items-center">
										<Rotate3D /> Fisheye view angles
									</FieldLabel>
									<FieldContent className="flex-row gap-1">
										<Input
											icon={"°"}
											type="number"
											placeholder="Vertical view angle"
											{...register("fisheyeView.verticalViewDegrees", {
												required: "Vertical view angle is required",
											})}
											aria-invalid={
												form.formState.errors.fisheyeView?.verticalViewDegrees
													? "true"
													: undefined
											}
											defaultValue={180}
										/>
										<Input
											icon={"°"}
											type="number"
											// TODO: refactor this to be from the top, not the bottom.
											// thats just more intuitive/standardized.
											placeholder="Horizontal view angle"
											{...register("fisheyeView.horizontalViewDegrees", {
												required: "Horizontal view angle is required",
											})}
											aria-invalid={
												form.formState.errors.fisheyeView?.horizontalViewDegrees
													? "true"
													: undefined
											}
											defaultValue={180}
										/>
									</FieldContent>
								</Field>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="item-3" className="px-4">
							<FieldContainerAccordionTrigger
								fields={[
									"correctionFiles.fisheye",
									"correctionFiles.vignetting",
									"correctionFiles.neutralDensity",
									"correctionFiles.calibrationFactor",
								]}
							>
								Correction pipeline
							</FieldContainerAccordionTrigger>
							<AccordionContent
								forceMount
								className="flex flex-col gap-4 text-balance"
							>
								<FileInput
									control={control}
									explicitOptional
									name="correctionFiles.fisheye"
									label="Fisheye correction (.cal)"
									placeholder="Select or paste a .cal file…"
									filters={[{ name: "Radiance CAL", extensions: ["cal"] }]}
									rules={{ required: "Fisheye correction file is required" }}
								/>
								<FileInput
									control={control}
									explicitOptional
									name="correctionFiles.vignetting"
									label="Vignetting correction (.cal)"
									placeholder="Select or paste a .cal file…"
									filters={[{ name: "Radiance CAL", extensions: ["cal"] }]}
									rules={{ required: "Vignetting correction file is required" }}
								/>
								<FileInput
									control={control}
									explicitOptional
									name="correctionFiles.neutralDensity"
									label="Neutral density correction (.cal)"
									placeholder="Select or paste a .cal file…"
									filters={[{ name: "Radiance CAL", extensions: ["cal"] }]}
									rules={{
										required: "Neutral density correction file is required",
									}}
								/>
								<FileInput
									control={control}
									explicitOptional
									name="correctionFiles.calibrationFactor"
									label="Calibration factor correction (.cal)"
									placeholder="Select or paste a .cal file…"
									filters={[{ name: "Radiance CAL", extensions: ["cal"] }]}
									rules={{
										required: "Calibration factor correction file is required",
									}}
								/>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="item-4" className="px-4">
							<FieldContainerAccordionTrigger
								fields={[
									"outputSettings.targetRes",
									"outputSettings.filterIrrelevantSrcImages",
								]}
							>
								Output settings
							</FieldContainerAccordionTrigger>
							<AccordionContent className="flex flex-col gap-4 text-balance">
								<Tooltip>
									<TooltipTrigger asChild>
										<div className="flex items-center gap-2">
											<Controller
												name="outputSettings.filterIrrelevantSrcImages"
												control={control}
												defaultValue={true}
												render={({ field }) => (
													<Checkbox
														checked={!!field.value}
														onCheckedChange={(checked) =>
															field.onChange(Boolean(checked))
														}
														onBlur={field.onBlur}
														ref={field.ref}
													/>
												)}
											/>
											<Label>Filter irrelevant source images</Label>
										</div>
									</TooltipTrigger>
									<TooltipContent className="max-w-xs">
										Some LDR images do not provide value to the HDR image
										generation process. Checking this box will filter out those
										images before generating the HDR image. This increases
										accuracy but also adds a minor increase in the time it takes
										to finish the generation process.
									</TooltipContent>
								</Tooltip>
								<Field>
									<FieldLabel>Target width/height</FieldLabel>
									<Input
										type="number"
										placeholder="Value in pixels"
										defaultValue={1000}
										{...register("outputSettings.targetRes")}
									/>
								</Field>
							</AccordionContent>
						</AccordionItem>
					</Accordion>
					<div className="bottom-0 border-t left-0 right-0 w-full p-4 mt-auto bg-background drop-shadow-lg">
						{progressVisible ? (
							<PipelineStatus
								onFinishAcknowledgment={() => setProgressVisible(false)}
							/>
						) : (
							<Button className="w-full bg-osu-beaver-orange">
								Generate HDR Image
							</Button>
						)}
					</div>
				</div>
			</form>
		</PipelineConfigProvider>
	);
}
