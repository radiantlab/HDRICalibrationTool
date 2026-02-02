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

import React, { useEffect, useMemo, useState } from "react";
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
import {
	AlertTriangle,
	Eclipse,
	ImageUpscale,
	Rotate3D,
	SwitchCamera,
} from "lucide-react";
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
import { documentDir, join } from "@tauri-apps/api/path";
import { mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useSettingsStore } from "../stores/settings-store";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldContainerAccordionTrigger } from "@/components/ui/field-accordion-trigger";
import { PipelineStatus } from "./pipeline-status";
import { toast } from "sonner";

import { create } from "zustand";

const useGlobalPipelineConfig = create<
	pipelineConfig & { set: (config: pipelineConfig) => void }
>((set) => ({
	inputSets: [],
	cameraResponseLocation: null,
	lensMask: {
		radius: 0,
		x: 0,
		y: 0,
	},
	fisheyeView: {
		horizontalViewDegrees: 180,
		verticalViewDegrees: 180,
	},
	correctionFiles: {
		fisheye: null,
		vignetting: null,
		neutralDensity: null,
		calibrationFactor: null,
	},
	outputSettings: {
		targetRes: 1000,
		filterIrrelevantSrcImages: false,
	},

	set,
}));

type PipelineTrace = {
	createdAt: string;
	input: Record<string, unknown>;
	error: unknown;
};

function normalizePipelineError(error: unknown) {
	if (error instanceof Error) {
		return { message: error.message, stack: error.stack };
	}
	if (typeof error === "string") {
		return { message: error };
	}
	return error;
}

async function writePipelineTrace(
	input: Record<string, unknown>,
	error: unknown,
	outputPath: string
) {
	const createdAt = new Date().toISOString();
	const baseDir =
		outputPath || (await join(await documentDir(), "HDRICalibrationInterface"));
	const traceDir = await join(baseDir, "pipeline-traces");
	await mkdir(traceDir, { recursive: true });
	const safeTimestamp = createdAt.replace(/[:.]/g, "-");
	const tracePath = await join(
		traceDir,
		`pipeline-trace-${safeTimestamp}.json`
	);
	const trace: PipelineTrace = {
		createdAt,
		input,
		error: normalizePipelineError(error),
	};
	await writeTextFile(tracePath, JSON.stringify(trace, null, 2));
	return tracePath;
}

/**
 * Main Home page component for image configuration and processing
 *
 * @returns React component with the main application interface
 */
export default function Home() {
	// since this is at the page level, it id safe to assume this is the only instance of the global pipeline config
	const globalPipelineConfig = useGlobalPipelineConfig();
	const form = useForm<pipelineConfig>({
		defaultValues: globalPipelineConfig,
	});
	const { control, register, setValue, watch } = form;
	const formValues = watch();
	// keep the global pipeline config in sync with the form values
	useEffect(() => {
		globalPipelineConfig.set(formValues);
	}, [
		// avoid infinite re-renders by stringifying the form values (so we only compare the values, not the reference)
		JSON.stringify(formValues),
	]);

	const { settings } = useSettingsStore();

	const inputSets = watch("inputSets");

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
	useEffect(() => {
		const unsub = radius.on("change", (value) => {
			if (!Number.isFinite(value)) return;
			setValue("lensMask.radius", value, {
				shouldValidate: true,
				shouldDirty: true,
			});
		});
		return () => unsub();
	}, [radius, setValue]);

	const [progressVisible, setProgressVisible] = useState(false);

	return (
		<PipelineConfigProvider form={form}>
			<form
				className="flex h-full w-full divide-x overflow-auto"
				onSubmit={form.handleSubmit(
					async (data) => {
						console.log("configForm submitted", data);

						const diameter = Math.round(data.lensMask.radius * 2);
						const xleft = Math.round(data.lensMask.x - data.lensMask.radius);
						const ydown = Math.round(data.lensMask.y - data.lensMask.radius);

						if (!Number.isFinite(diameter) || diameter <= 0) {
							toast.error("Lens mask radius must be greater than 0.");
							return;
						}
						if (
							!Number.isFinite(data.outputSettings.targetRes) ||
							data.outputSettings.targetRes <= 0
						) {
							toast.error("Target resolution must be greater than 0.");
							return;
						}
						if (
							!Number.isFinite(data.fisheyeView.verticalViewDegrees) ||
							!Number.isFinite(data.fisheyeView.horizontalViewDegrees) ||
							data.fisheyeView.verticalViewDegrees <= 0 ||
							data.fisheyeView.horizontalViewDegrees <= 0
						) {
							toast.error("Fisheye view angles must be greater than 0.");
							return;
						}

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
							fisheyeCorrectionCal: data.correctionFiles.fisheye ?? "",
							vignettingCorrectionCal: data.correctionFiles.vignetting ?? "",
							photometricAdjustmentCal:
								data.correctionFiles.calibrationFactor ?? "",
							neutralDensityCal: data.correctionFiles.neutralDensity ?? "",
							diameter,
							xleft,
							ydown,
							xdim: data.outputSettings.targetRes,
							ydim: data.outputSettings.targetRes,
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
							async (error) => {
								setProgressVisible(false);
								let tracePath: string | null = null;
								try {
									tracePath = await writePipelineTrace(
										params,
										error,
										settings.outputPath
									);
								} catch (traceError) {
									toast.error(`Failed to write pipeline trace: ${traceError}`);
								}
								const toastMessage = tracePath
									? "Pipeline failed. Trace saved."
									: "Pipeline failed. Trace could not be saved.";
								toast.error(toastMessage, {
									icon: <AlertTriangle className="size-4 text-red-500" />,
									action: tracePath
										? {
												label: "Show in folder",
												onClick: () =>
													toast.promise(revealItemInDir(tracePath), {
														loading: "Revealing in folder...",
														success: "Revealed in folder",
														error: "Failed to reveal in folder",
													}),
										  }
										: undefined,
								});
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
						<AccordionItem value="item-hdr-gen" className="px-4">
							<FieldContainerAccordionTrigger
								fields={[
									"cameraResponseLocation",
									"lensMask.radius",
									"lensMask.x",
									"lensMask.y",
									"outputSettings.filterIrrelevantSrcImages",
								]}
							>
								HDR Generation
							</FieldContainerAccordionTrigger>
							<AccordionContent
								forceMount
								className="flex flex-col gap-6 text-balance"
							>
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
								<div className="flex flex-col gap-2">
									<Tooltip>
										<TooltipTrigger asChild>
											<FieldLabel className="items-center">
												<SwitchCamera /> Camera response
											</FieldLabel>
										</TooltipTrigger>
										<TooltipContent className="max-w-xs">
											A camera response function is the rule that tells your
											camera how to turn the brightness of a scene into digital
											pixel numbers. (Important for preprocessed image formats
											like JPEG)
										</TooltipContent>
									</Tooltip>
									<FileInput
										// disabled={true}
										disabled={inputSets?.every((set) =>
											set.files.every((file) => {
												const fileextension = file
													.split(".")
													.pop()
													?.toLowerCase();
												return fileextension !== "jpeg";
											})
										)}
										control={control}
										explicitOptional
										name="cameraResponseLocation"
										placeholder="Select or paste a .rsp file…"
										filters={[
											{ name: "Camera response files", extensions: ["rsp"] },
										]}
										rules={{ required: "Camera response file is required" }}
									/>
								</div>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="item-crop-resize" className="px-4">
							<FieldContainerAccordionTrigger
								fields={[
									"cameraResponseLocation",
									"lensMask.radius",
									"lensMask.x",
									"lensMask.y",
									"outputSettings.filterIrrelevantSrcImages",
								]}
							>
								Cropping and Resizing
							</FieldContainerAccordionTrigger>
							<AccordionContent
								forceMount
								className="flex flex-col gap-6 text-balance"
							>
								<Field>
									<FieldLabel>
										<ImageUpscale /> Target width/height
									</FieldLabel>
									<Input
										type="number"
										placeholder="Value in pixels"
										defaultValue={1000}
										{...register("outputSettings.targetRes", {
											valueAsNumber: true,
											min: {
												value: 1,
												message:
													"Target resolution must be greater than 0",
											},
										})}
									/>
								</Field>
								<div className="flex flex-col gap-2">
									<Tooltip>
										<TooltipTrigger asChild>
											<FieldLabel className="items-center">
												<Eclipse /> Lens mask
											</FieldLabel>
										</TooltipTrigger>
										<TooltipContent className="max-w-xs">
											A circular mask applied to remove the parts of the image
											that are obstructed by the lens.
										</TooltipContent>
									</Tooltip>
									<LensMaskInput
										maskPreviewImage={maskPreviewImage}
										centerX={centerX}
										centerY={centerY}
										radiusAjusterCenterX={radiusAjusterCenterX}
										radiusAjusterCenterY={radiusAjusterCenterY}
										register={register}
									/>
								</div>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="item-correction-fisheye" className="px-4">
							<FieldContainerAccordionTrigger
								fields={["correctionFiles.fisheye"]}
							>
								Fisheye correction
							</FieldContainerAccordionTrigger>
							<AccordionContent
								forceMount
								className="flex flex-col gap-4 text-balance"
							>
								<FileInput
									control={control}
									explicitOptional
									name="correctionFiles.fisheye"
									placeholder="Select or paste a .cal file…"
									filters={[{ name: "Radiance CAL", extensions: ["cal"] }]}
									rules={{ required: "Fisheye correction file is required" }}
								/>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="item-correction-vignetting" className="px-4">
							<FieldContainerAccordionTrigger
								fields={["correctionFiles.vignetting"]}
							>
								Vignetting correction
							</FieldContainerAccordionTrigger>
							<AccordionContent
								forceMount
								className="flex flex-col gap-4 text-balance"
							>
								<FileInput
									control={control}
									explicitOptional
									name="correctionFiles.vignetting"
									placeholder="Select or paste a .cal file…"
									filters={[{ name: "Radiance CAL", extensions: ["cal"] }]}
									rules={{ required: "Vignetting correction file is required" }}
								/>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem
							value="item-correction-neutral-density"
							className="px-4"
						>
							<FieldContainerAccordionTrigger
								fields={["correctionFiles.neutralDensity"]}
							>
								Neutral density correction
							</FieldContainerAccordionTrigger>
							<AccordionContent
								forceMount
								className="flex flex-col gap-4 text-balance"
							>
								<FileInput
									control={control}
									explicitOptional
									name="correctionFiles.neutralDensity"
									placeholder="Select or paste a .cal file…"
									filters={[{ name: "Radiance CAL", extensions: ["cal"] }]}
									rules={{
										required: "Neutral density correction file is required",
									}}
								/>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem
							value="item-correction-calibration-factor"
							className="px-4"
						>
							<FieldContainerAccordionTrigger
								fields={["correctionFiles.calibrationFactor"]}
							>
								Calibration factor correction
							</FieldContainerAccordionTrigger>
							<AccordionContent
								forceMount
								className="flex flex-col gap-4 text-balance"
							>
								<FileInput
									control={control}
									explicitOptional
									name="correctionFiles.calibrationFactor"
									placeholder="Select or paste a .cal file…"
									filters={[{ name: "Radiance CAL", extensions: ["cal"] }]}
									rules={{
										required: "Calibration factor correction file is required",
									}}
								/>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="item-post" className="px-4">
							<FieldContainerAccordionTrigger
								fields={[
									"outputSettings.targetRes",
									"fisheyeView.verticalViewDegrees",
									"fisheyeView.horizontalViewDegrees",
								]}
							>
								Output Header Editing
							</FieldContainerAccordionTrigger>
							<AccordionContent
								forceMount
								className="flex flex-col gap-4 text-balance"
							>
								<Field>
									<FieldLabel>
										<Rotate3D /> Fisheye view angles
									</FieldLabel>
									<FieldContent className="flex-row gap-1">
										<Input
											icon={"°"}
											type="number"
											placeholder="Vertical view angle"
											{...register("fisheyeView.verticalViewDegrees", {
												required: "Vertical view angle is required",
												valueAsNumber: true,
												min: {
													value: 1,
													message:
														"Vertical view angle must be greater than 0",
												},
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
												valueAsNumber: true,
												min: {
													value: 1,
													message:
														"Horizontal view angle must be greater than 0",
												},
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
