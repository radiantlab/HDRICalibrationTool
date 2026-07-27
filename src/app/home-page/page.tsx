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

import { invoke } from "@tauri-apps/api/core";
import { documentDir, join } from "@tauri-apps/api/path";
import { mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useMotionValue, useTransform } from "framer-motion";
import {
  AlertTriangle,
  Aperture,
  Eclipse,
  ImageUpscale,
  InfoIcon,
  Rotate3D,
  Sun,
  SwitchCamera,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { FieldContainerAccordionTrigger } from "@/components/ui/field-accordion-trigger";
import { FileInput } from "@/components/ui/file-input";
import {
  ImageMatrixInput,
  type ImageSetIssue,
} from "@/components/ui/image-matrix-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { appendRun, classifyOutcome } from "@/lib/run-history";
import { useMotionValueFormState } from "@/lib/use-motion-value-form-state";
import { usePipelineStatus } from "../pipeline-status-context";
import { useSettingsStore } from "../stores/settings-store";
import {
  PipelineConfigProvider,
  type pipelineConfig,
} from "./(pipeline-configuration)/config-provider";
import { buildPipelineParams } from "./build-pipeline-params";
import { LensMaskInput } from "./lens-mask-input";
import { useGlobalPipelineConfig } from "./pipeline-config-store";
import { PipelineStatus } from "./pipeline-status";
import { RunConsole } from "./run-console";
import { useSelectedImage } from "./selected-image-context";

interface PipelineTrace {
  createdAt: string;
  error: unknown;
  input: Record<string, unknown>;
}

interface CommandNonZeroExitError {
  kind: "non_zero_exit";
  program: string;
  status_code?: number | null;
  stderr?: string;
}

interface PipelineCommandError {
  error: CommandNonZeroExitError;
  kind: "command";
}

const HDRGEN_FAILURE_PATTERNS = [
  "cannot solve for response function",
  "trouble finding hdr patches",
  "needs exposure calibration",
  "insufficient exposures to compute hdr image",
];

const HDRGEN_MERGE_FAILURE_MESSAGE =
  "HDRGen could not merge this image set. The selected exposures likely do not overlap enough, or HDRGen could not determine exposure calibration. Try adding more intermediate exposures or provide a camera response (.rsp) file.";

const PATH_SEPARATOR_REGEX = /[/\\]/;
const EXE_EXTENSION_REGEX = /\.exe$/;

function getProgramBaseName(program: string) {
  return program.split(PATH_SEPARATOR_REGEX).pop()?.toLowerCase() ?? "";
}

function getKnownHdrgenIssue(error: unknown): ImageSetIssue | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const pipelineError = error as Partial<PipelineCommandError>;
  if (pipelineError.kind !== "command") {
    return null;
  }
  if (!pipelineError.error || typeof pipelineError.error !== "object") {
    return null;
  }

  const commandError = pipelineError.error as Partial<CommandNonZeroExitError>;
  if (
    commandError.kind !== "non_zero_exit" ||
    typeof commandError.program !== "string"
  ) {
    return null;
  }

  if (
    getProgramBaseName(commandError.program).replace(
      EXE_EXTENSION_REGEX,
      ""
    ) !== "hdrgen"
  ) {
    return null;
  }

  const stderr =
    typeof commandError.stderr === "string" ? commandError.stderr : "";
  const normalizedStderr = stderr.toLowerCase();
  if (
    !HDRGEN_FAILURE_PATTERNS.some((pattern) =>
      normalizedStderr.includes(pattern)
    )
  ) {
    return null;
  }

  return {
    program: commandError.program,
    statusCode:
      typeof commandError.status_code === "number"
        ? commandError.status_code
        : null,
    stderr,
    summary: HDRGEN_MERGE_FAILURE_MESSAGE,
    title: "HDRGen could not merge this image set.",
  };
}

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
    error: normalizePipelineError(error),
    input,
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally depend on the stringified value rather than the object reference — react-hook-form's watch() returns a new object every render, so depending on formValues/globalPipelineConfig.set directly reruns this effect (and re-renders) every render, causing an infinite loop.
  useEffect(() => {
    globalPipelineConfig.set(formValues);
  }, [JSON.stringify(formValues)]);

  const { settings } = useSettingsStore();

  const inputSets = watch("inputSets");
  const cameraResponseLocation = watch("cameraResponseLocation");

  const { selectedImage } = useSelectedImage();
  const inputSetIssueResetKey = useMemo(
    () =>
      JSON.stringify({
        cameraResponseLocation,
        inputSets: inputSets?.map((set) => ({
          files: set.files,
          name: set.name,
        })),
      }),
    [inputSets, cameraResponseLocation]
  );

  const initialLensMaskX = form.getValues("lensMask.x");
  const initialLensMaskY = form.getValues("lensMask.y");
  const initialLensMaskRadius = form.getValues("lensMask.radius");

  const centerX = useMotionValueFormState(
    initialLensMaskX,
    setValue,
    "lensMask.x"
  );
  const centerY = useMotionValueFormState(
    initialLensMaskY,
    setValue,
    "lensMask.y"
  );

  const radiusAjusterCenterX = useMotionValue(
    initialLensMaskX + initialLensMaskRadius
  );
  const radiusAjusterCenterY = useMotionValue(initialLensMaskY);

  const radius = useTransform<number, number>(
    [centerX, centerY, radiusAjusterCenterX, radiusAjusterCenterY],
    ([cx, cy, rx, ry]) =>
      Math.sqrt(
        ((cx as number) - (rx as number)) ** 2 +
          ((cy as number) - (ry as number)) ** 2
      )
  );
  useEffect(() => {
    const unsub = radius.on("change", (value) => {
      if (!Number.isFinite(value)) {
        return;
      }
      setValue("lensMask.radius", value, {
        shouldDirty: true,
        shouldValidate: true,
      });
    });
    return () => unsub();
  }, [radius, setValue]);

  useEffect(() => {
    const unsub = radius.on("change", (r) => {
      setValue("lensMask.radius", r);
    });
    return () => unsub();
  }, [radius, setValue]);

  const [progressVisible, setProgressVisible] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const { clearLog, log } = usePipelineStatus();
  // The record is written when a run ends, by which time the log has grown.
  // Capturing `log` in the submit closure would persist an empty transcript.
  const logRef = useRef(log);
  useEffect(() => {
    logRef.current = log;
  }, [log]);
  const [imageSetIssues, setImageSetIssues] = useState<
    Partial<Record<number, ImageSetIssue>>
  >({});

  // biome-ignore lint/correctness/useExhaustiveDependencies: inputSetIssueResetKey is a change-detection trigger (a stringified snapshot of the inputs that should reset validation issues), not a value read inside the effect body, so it can't be "added" by inlining its computation here.
  useEffect(() => {
    setImageSetIssues((currentIssues) =>
      Object.keys(currentIssues).length > 0 ? {} : currentIssues
    );
  }, [inputSetIssueResetKey]);

  return (
    <PipelineConfigProvider form={form}>
      <form
        className="flex h-full w-full divide-x overflow-auto"
        onSubmit={form.handleSubmit(
          async (data) => {
            console.log("configForm submitted", data);

            const diameter = Math.round(data.lensMask.radius * 2);
            const startedAt = new Date().toISOString();
            const toolSettings = {
              dcrawEmuPath: settings.dcrawEmuPath,
              hdrgenPath: settings.hdrgenPath,
              outputPath: settings.outputPath,
              radiancePath: settings.radiancePath,
            };

            // Every attempt is recorded, including ones turned away before the
            // backend ran: those are the ones worth looking back at when an
            // evening's work produced nothing. Storage failures are swallowed
            // so history can never break a run.
            const recordAttempt = (
              failure: string | null,
              outputs: string[],
              files: string[]
            ) =>
              appendRun({
                finishedAt: new Date().toISOString(),
                id: startedAt,
                inputs: buildPipelineParams(
                  data,
                  toolSettings,
                  files
                ) as unknown as Record<string, unknown>,
                log: logRef.current,
                outcome: classifyOutcome(logRef.current, failure),
                outputs,
                presetName: null,
                reason: failure,
                startedAt,
                toolPaths: {
                  dcrawEmu: settings.dcrawEmuPath,
                  hdrgen: settings.hdrgenPath,
                  radiance: settings.radiancePath,
                },
              }).catch(() => undefined);

            if (!Number.isFinite(diameter) || diameter <= 0) {
              const message = "Lens mask radius must be greater than 0.";
              toast.error(message);
              recordAttempt(message, [], []);
              return;
            }
            if (
              !Number.isFinite(data.outputSettings.targetRes) ||
              (data.outputSettings.targetRes !== null &&
                data.outputSettings.targetRes <= 0)
            ) {
              const message = "Target resolution must be greater than 0.";
              toast.error(message);
              recordAttempt(message, [], []);
              return;
            }
            if (
              !(
                Number.isFinite(data.fisheyeView.verticalViewDegrees) &&
                Number.isFinite(data.fisheyeView.horizontalViewDegrees)
              ) ||
              (data.fisheyeView.verticalViewDegrees !== null &&
                data.fisheyeView.verticalViewDegrees <= 0) ||
              (data.fisheyeView.horizontalViewDegrees !== null &&
                data.fisheyeView.horizontalViewDegrees <= 0)
            ) {
              const message = "Fisheye view angles must be greater than 0.";
              toast.error(message);
              recordAttempt(message, [], []);
              return;
            }

            // TODO: implement batch processing
            const [imageSet] = data.inputSets;
            if (!imageSet) {
              recordAttempt("No image set selected.", [], []);
              return;
            }

            setImageSetIssues({});
            setProgressVisible(true);
            // A new run starts a fresh transcript.
            clearLog();
            setConsoleOpen(true);
            const params = buildPipelineParams(
              data,
              toolSettings,
              imageSet.files
            );
            console.log("pipeline params", params);
            invoke<string>("pipeline", params)
              .then((outputDirectory) => {
                recordAttempt(null, [outputDirectory], imageSet.files);
              })
              .catch(async (error) => {
                recordAttempt(String(error), [], imageSet.files);
                setProgressVisible(false);

                const knownHdrgenIssue = getKnownHdrgenIssue(error);
                if (knownHdrgenIssue) {
                  setImageSetIssues({ 0: knownHdrgenIssue });
                  toast.error(
                    "HDRGen could not merge the selected image set.",
                    {
                      icon: <AlertTriangle className="size-4 text-red-500" />,
                    }
                  );
                  return;
                }

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
                  ? "Pipeline failed. Trace saved. (Send this file to a maintainer)"
                  : "Pipeline failed. Trace could not be saved.";
                toast.error(toastMessage, {
                  action: tracePath
                    ? {
                        label: "Show in folder",
                        onClick: () =>
                          toast.promise(revealItemInDir(tracePath), {
                            error: "Failed to reveal in folder",
                            loading: "Revealing in folder...",
                            success: "Revealed in folder",
                          }),
                      }
                    : undefined,
                  icon: <AlertTriangle className="size-4 text-red-500" />,
                });
              });
          },
          (errors) => {
            console.log("form errors", errors);
          }
        )}
      >
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="70%">
            <ImageMatrixInput
              className="flex-1 overflow-hidden"
              control={control}
              issuesByIndex={imageSetIssues}
              name="inputSets"
              rules={{
                validate: (v) => {
                  if (!Array.isArray(v) || v.length === 0) {
                    return "At least one image set is required";
                  }

                  const i = v.findIndex((set) => set.files.length < 2);
                  if (i !== -1) {
                    return `"${v[i]?.name}" needs at least 2 images`;
                  }

                  return true;
                },
              }}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel>
            <div className="flex h-full min-h-0 flex-col bg-accent">
              <Accordion
                className="min-h-0 flex-1 overflow-y-auto"
                collapsible
                type="single"
                // defaultValue="item-1"
              >
                <AccordionItem className="px-4" value="item-hdr-gen">
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
                    className="flex flex-col gap-6 text-balance"
                    forceMount
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          <Controller
                            control={control}
                            name="outputSettings.filterIrrelevantSrcImages"
                            render={({ field }) => (
                              <Checkbox
                                checked={field.value ?? false}
                                onBlur={field.onBlur}
                                onCheckedChange={(checked) =>
                                  field.onChange(Boolean(checked))
                                }
                                ref={field.ref}
                              />
                            )}
                          />
                          <Label>Keep only useful exposures</Label>
                          <InfoIcon className="size-4" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Some LDR images do not provide value to the HDR image
                        generation process. Checking this box will filter out
                        those images before generating the HDR image. This
                        increases accuracy but also adds a minor increase in the
                        time it takes to finish the generation process. Keeps
                        the range from the darkest frame with no black pixels
                        through the lightest frame with no white pixels
                        (tutorial §2.4.2).
                      </TooltipContent>
                    </Tooltip>
                    <div className="flex flex-col gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <FieldLabel className="items-center">
                            <SwitchCamera /> Camera response
                            <InfoIcon className="size-4" />
                          </FieldLabel>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          A camera response function is the rule that tells your
                          camera how to turn the brightness of a scene into
                          digital pixel numbers. (Important for preprocessed
                          image formats like JPEG)
                        </TooltipContent>
                      </Tooltip>
                      <FileInput
                        control={control}
                        explicitOptional
                        filters={[
                          {
                            extensions: ["rsp"],
                            name: "Camera response files",
                          },
                        ]}
                        name="cameraResponseLocation"
                        placeholder="Select or paste a .rsp file…"
                        rules={{
                          required: "Camera response file is required",
                        }}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem className="px-4" value="item-crop-resize">
                  <FieldContainerAccordionTrigger
                    fields={[
                      "cameraResponseLocation",
                      "lensMask.radius",
                      "lensMask.x",
                      "lensMask.y",
                      "outputSettings.targetRes",
                      "outputSettings.filterIrrelevantSrcImages",
                    ]}
                  >
                    Cropping and Resizing
                  </FieldContainerAccordionTrigger>
                  <AccordionContent
                    className="flex flex-col gap-6 text-balance"
                    forceMount
                  >
                    <Field>
                      <FieldLabel>
                        <ImageUpscale /> Target width/height
                      </FieldLabel>
                      <Input
                        defaultValue={1000}
                        placeholder="Value in pixels"
                        type="number"
                        {...register("outputSettings.targetRes", {
                          min: {
                            message: "Target resolution must be greater than 0",
                            value: 1,
                          },
                          valueAsNumber: true,
                        })}
                      />
                      <FieldError
                        errors={[
                          form.formState.errors.outputSettings?.targetRes,
                        ]}
                      />
                    </Field>
                    <div className="flex flex-col gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <FieldLabel className="items-center">
                            <Eclipse /> Lens mask
                            <InfoIcon className="size-4" />
                          </FieldLabel>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          A circular mask applied to remove the parts of the
                          image that are obstructed by the lens.
                        </TooltipContent>
                      </Tooltip>
                      <LensMaskInput
                        centerX={centerX}
                        centerY={centerY}
                        maskPreviewImage={selectedImage}
                        radiusAjusterCenterX={radiusAjusterCenterX}
                        radiusAjusterCenterY={radiusAjusterCenterY}
                        register={register}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem className="px-4" value="item-correction-fisheye">
                  <FieldContainerAccordionTrigger
                    fields={["correctionFiles.fisheye"]}
                  >
                    Fisheye correction
                  </FieldContainerAccordionTrigger>
                  <AccordionContent
                    className="flex flex-col gap-4 text-balance"
                    forceMount
                  >
                    <FileInput
                      control={control}
                      explicitOptional
                      filters={[{ extensions: ["cal"], name: "Radiance CAL" }]}
                      name="correctionFiles.fisheye"
                      placeholder="Select or paste a .cal file…"
                      rules={{
                        required: "Fisheye correction file is required",
                      }}
                    />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem
                  className="px-4"
                  value="item-correction-vignetting"
                >
                  <FieldContainerAccordionTrigger
                    fields={["correctionFiles.vignetting"]}
                  >
                    Vignetting correction
                  </FieldContainerAccordionTrigger>
                  <AccordionContent
                    className="flex flex-col gap-4 text-balance"
                    forceMount
                  >
                    <FileInput
                      control={control}
                      explicitOptional
                      filters={[{ extensions: ["cal"], name: "Radiance CAL" }]}
                      name="correctionFiles.vignetting"
                      placeholder="Select or paste a .cal file…"
                      rules={{
                        required: "Vignetting correction file is required",
                      }}
                    />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem
                  className="px-4"
                  value="item-correction-neutral-density"
                >
                  <FieldContainerAccordionTrigger
                    fields={["correctionFiles.neutralDensity"]}
                  >
                    Neutral density correction
                  </FieldContainerAccordionTrigger>
                  <AccordionContent
                    className="flex flex-col gap-4 text-balance"
                    forceMount
                  >
                    <FileInput
                      control={control}
                      explicitOptional
                      filters={[{ extensions: ["cal"], name: "Radiance CAL" }]}
                      name="correctionFiles.neutralDensity"
                      placeholder="Select or paste a .cal file…"
                      rules={{
                        required: "Neutral density correction file is required",
                      }}
                    />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem
                  className="px-4"
                  value="item-correction-calibration-factor"
                >
                  <FieldContainerAccordionTrigger
                    fields={["correctionFiles.calibrationFactor"]}
                  >
                    Calibration factor correction
                  </FieldContainerAccordionTrigger>
                  <AccordionContent
                    className="flex flex-col gap-4 text-balance"
                    forceMount
                  >
                    <FileInput
                      control={control}
                      explicitOptional
                      filters={[{ extensions: ["cal"], name: "Radiance CAL" }]}
                      name="correctionFiles.calibrationFactor"
                      placeholder="Select or paste a .cal file…"
                      rules={{
                        required:
                          "Calibration factor correction file is required",
                      }}
                    />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem className="px-4" value="item-post">
                  <FieldContainerAccordionTrigger
                    fields={[
                      "outputSettings.targetRes",
                      "fisheyeView.projection",
                      "fisheyeView.verticalViewDegrees",
                      "fisheyeView.horizontalViewDegrees",
                    ]}
                  >
                    Output Header Editing
                  </FieldContainerAccordionTrigger>
                  <AccordionContent
                    className="flex flex-col gap-4 text-balance"
                    forceMount
                  >
                    <Field>
                      <FieldLabel>
                        <Aperture /> Projection type
                      </FieldLabel>
                      <FieldContent>
                        <Controller
                          control={control}
                          name="fisheyeView.projection"
                          render={({ field }) => (
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Projection type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="vta">
                                  Equidistant (-vta)
                                </SelectItem>
                                <SelectItem value="vth">
                                  Orthographic (-vth)
                                </SelectItem>
                                <SelectItem value="vtv">
                                  Non-fisheye (-vtv)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </FieldContent>
                      <FieldDescription>
                        Written to the picture header as the view type. A
                        non-fisheye view skips the validity check, because
                        evalglare requires an angular fisheye view.
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel>
                        <Rotate3D /> Fisheye view angles
                      </FieldLabel>
                      <FieldContent className="flex-row gap-1">
                        <Input
                          icon={"°"}
                          placeholder="Vertical view angle"
                          type="number"
                          {...register("fisheyeView.verticalViewDegrees", {
                            min: {
                              message:
                                "Vertical view angle must be greater than 0",
                              value: 1,
                            },
                            required: "Vertical view angle is required",
                            valueAsNumber: true,
                          })}
                          aria-invalid={
                            form.formState.errors.fisheyeView
                              ?.verticalViewDegrees
                              ? "true"
                              : undefined
                          }
                          defaultValue={180}
                        />
                        <Input
                          icon={"°"}
                          // TODO: refactor this to be from the top, not the bottom.
                          // thats just more intuitive/standardized.
                          placeholder="Horizontal view angle"
                          type="number"
                          {...register("fisheyeView.horizontalViewDegrees", {
                            min: {
                              message:
                                "Horizontal view angle must be greater than 0",
                              value: 1,
                            },
                            required: "Horizontal view angle is required",
                            valueAsNumber: true,
                          })}
                          aria-invalid={
                            form.formState.errors.fisheyeView
                              ?.horizontalViewDegrees
                              ? "true"
                              : undefined
                          }
                          defaultValue={180}
                        />
                      </FieldContent>
                      <FieldError
                        errors={[
                          form.formState.errors.fisheyeView
                            ?.verticalViewDegrees,
                          form.formState.errors.fisheyeView
                            ?.horizontalViewDegrees,
                        ]}
                      />
                    </Field>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem className="px-4" value="item-validity">
                  <FieldContainerAccordionTrigger
                    fields={["validityCheck.measuredVerticalIlluminanceLux"]}
                  >
                    Validity Check
                  </FieldContainerAccordionTrigger>
                  <AccordionContent
                    className="flex flex-col gap-4 text-balance"
                    forceMount
                  >
                    <Field>
                      <FieldLabel>
                        <Sun /> Measured vertical illuminance
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          aria-invalid={
                            form.formState.errors.validityCheck
                              ?.measuredVerticalIlluminanceLux
                              ? "true"
                              : undefined
                          }
                          icon={"lx"}
                          placeholder="Optional"
                          type="number"
                          {...register(
                            "validityCheck.measuredVerticalIlluminanceLux",
                            {
                              min: {
                                message:
                                  "Measured illuminance must be greater than 0",
                                value: 1,
                              },
                              setValueAs: (value) =>
                                value === "" || value === null
                                  ? null
                                  : Number(value),
                            }
                          )}
                        />
                      </FieldContent>
                      <FieldDescription>
                        Compared against the illuminance evalglare derives from
                        the finished image. Under 10% error is expected; over
                        25% the tutorial recommends rejecting the image. With a
                        non-fisheye projection the value is recorded in the
                        header but not compared, because evalglare requires an
                        angular fisheye view.
                      </FieldDescription>
                      <FieldError
                        errors={[
                          form.formState.errors.validityCheck
                            ?.measuredVerticalIlluminanceLux,
                        ]}
                      />
                    </Field>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <div className="right-0 bottom-0 left-0 mt-auto w-full border-t bg-background p-4 drop-shadow-lg">
                {progressVisible ? (
                  <PipelineStatus
                    onFinishAcknowledgment={() => setProgressVisible(false)}
                    onShowConsole={() => setConsoleOpen(true)}
                  />
                ) : (
                  <Button className="w-full bg-osu-beaver-orange" type="submit">
                    Generate HDR Image
                  </Button>
                )}
                {consoleOpen || progressVisible ? (
                  <RunConsole
                    onOpenChange={setConsoleOpen}
                    open={consoleOpen}
                  />
                ) : null}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </form>
    </PipelineConfigProvider>
  );
}
