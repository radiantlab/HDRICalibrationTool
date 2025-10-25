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

import React, { useState, useEffect } from "react";
import { DropzoneInput } from "@/components/ui/dropzone-input";
import { Controller, useForm } from "react-hook-form";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { TauriFileButtonInput } from "@/components/ui/tauri-file-button-input";
import { Input } from "@/components/ui/input";
import { ControlledFormInputField } from "@/components/ui/input-field";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Diameter, MoveHorizontal, MoveVertical, Radius } from "lucide-react";
import {
	pipelineConfig,
	PipelineConfigProvider,
} from "./(pipeline-configuration)/config-provider";
import { ImageMatrixInput } from "@/components/ui/image-matrix-input";

/**
 * Main Home page component for image configuration and processing
 *
 * @returns React component with the main application interface
 */
export default function Home() {
	const form = useForm<pipelineConfig>();
	const { control, register } = form;

	return (
		<PipelineConfigProvider form={form}>
			<form
				className="flex h-full w-full divide-x"
				onSubmit={form.handleSubmit((data) => {
					console.log("configForm submitted", data);
				})}
			>
				{/* <DropzoneInput
					className="w-full h-full flex-grow p-16"
					name="inputSets"
					control={form.control}
					multiple
				/> */}
				<ImageMatrixInput control={control} name="inputSets" />
				<div className="bg-accent w-96">
					<Controller
						name="cameraResponseLocation"
						control={control}
						render={({ field, fieldState }) => (
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
								<div className="space-y-1">
									<div className="aspect-square border border-dashed border-yellow-500 grid place-items-center text-center text-muted-foreground">
										VISUAL PREVIEW/SELECTOR COMING SOON
									</div>
									<Tooltip>
										<TooltipTrigger asChild>
											<div className="flex gap-1">
												<Input
													icon={<Radius />}
													type="number"
													placeholder="Radius"
													{...register("lensMask.diameter")}
												/>
												<Input
													icon={<MoveHorizontal />}
													type="number"
													placeholder="X"
													{...register("lensMask.x")}
												/>
												<Input
													icon={<MoveVertical />}
													type="number"
													// TODO: refactor this to be from the top, not the bottom.
													// thats just more intuitive/standardized.
													placeholder="Y"
													{...register("lensMask.y")}
												/>
											</div>
										</TooltipTrigger>
										<TooltipContent>Values in pixels.</TooltipContent>
									</Tooltip>
								</div>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="item-2" className="px-4">
							<AccordionTrigger>Luminance Mapping</AccordionTrigger>
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
