/**
 * Port of `pipeline.rs::pipeline` / `process_image_set`.
 *
 * Runs one image set. Batching and cancellation deliberately stay where they
 * already are, in `src/app/home-page/page.tsx`: the Rust command handles a
 * single set too, and never populates `set_index` / `set_total`. Moving the
 * batch loop in here would duplicate behaviour the app already has.
 *
 * Everything reaches the outside world through a `ToolRunner`, which is what
 * lets the whole sequence be tested without wasm, binaries or a filesystem.
 */

import {
  cropArgs,
  dcrawArgs,
  evalglareArgs,
  falsecolorArgs,
  hdrgenArgs,
  headerEditingArgs,
  nullifyExposureArgs,
  pcombCalArgs,
  photometricArgs,
  readResolution,
  resizeArgs,
  SQUARE_RESPONSE,
  workPath,
} from "./stages";
import {
  PipelineError,
  type PipelineParams,
  type StatusEmitter,
  SUPPORTED_PROJECTIONS,
  type ToolIo,
  type ToolResult,
  type ToolRunner,
} from "./types";
import {
  calWarning,
  evaluateValidity,
  resolutionDependentConstants,
  validityMessage,
} from "./warnings";

/**
 * Stages that report progress: merge, nullify, crop, header (view), evalglare,
 * header (results), falsecolor. The conditional stages (resize and the four
 * corrections) do not report, so the bar advances unevenly but lands on 100.
 */
const PIPELINE_STAGES = 7;

/** Extensions hdrgen cannot read, which therefore go through dcraw_emu first. */
const RAW_EXTENSIONS = new Set([
  "3fr",
  "arw",
  "cr2",
  "cr3",
  "crw",
  "dng",
  "erf",
  "kdc",
  "mef",
  "mos",
  "mrw",
  "nef",
  "orf",
  "pef",
  "raf",
  "raw",
  "rw2",
  "sr2",
  "srf",
  "x3f",
]);

export function isRawImage(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot !== -1 && RAW_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

interface Correction {
  cal: string;
  /** Label for the resolution check, or null when the file has no geometry. */
  checkResolution: string | null;
  message: string;
  output: string;
  step: string;
  suppressHeader: boolean;
}

export interface PipelineResult {
  /** The value evalglare reported, verbatim. */
  computedVerticalIlluminance: string;
  /** Path of the false-colour picture, when one was produced. */
  falsecolorPath: string | null;
  /** Path of the finished HDR picture in the virtual filesystem. */
  outputPath: string;
}

class Progress {
  private completed = 0;
  private readonly total: number;

  constructor(total: number) {
    this.total = total;
  }

  advance(): number {
    this.completed = Math.min(this.completed + 1, this.total);
    return Math.round((this.completed / this.total) * 100);
  }
}

export interface RunOptions {
  emit?: StatusEmitter;
  params: PipelineParams;
  runner: ToolRunner;
  /** Called between stages; returning true aborts before the next one starts. */
  shouldStop?: () => boolean;
}

export async function runPipeline({
  runner,
  params,
  emit = () => undefined,
  shouldStop = () => false,
}: RunOptions): Promise<PipelineResult> {
  validate(params);

  const progress = new Progress(PIPELINE_STAGES);
  const step = (name: string, message: string) => {
    emit({ kind: "step", message, progress: null, step: name });
  };
  const advance = () => {
    emit({
      kind: "progress",
      message: null,
      progress: progress.advance(),
      step: null,
    });
  };
  const checkStop = () => {
    if (shouldStop()) {
      throw new PipelineError({
        kind: "processing",
        message: "pipeline: stopped before the next stage",
      });
    }
  };

  // ---- merge -------------------------------------------------------------
  step("merge_exposures", "Merging exposures");
  const { images, responseFunction } = await prepareInputs(runner, params);
  await run(
    runner,
    "hdrgen",
    hdrgenArgs(images, responseFunction, workPath("merge_exposures.hdr"))
  );
  advance();
  checkStop();

  // ---- nullify exposure --------------------------------------------------
  step("nullify_exposure_value", "Nullifying exposure value");
  await run(
    runner,
    "ra_xyze",
    nullifyExposureArgs(
      workPath("merge_exposures.hdr"),
      workPath("nullify_exposure_value.hdr")
    )
  );
  advance();
  checkStop();

  // ---- crop --------------------------------------------------------------
  step("crop", "Cropping HDR image");
  const merged = await runner.readFile(workPath("nullify_exposure_value.hdr"));
  const { height } = readResolution(merged);
  await run(
    runner,
    "pcompos",
    cropArgs(
      workPath("nullify_exposure_value.hdr"),
      params.diameter,
      params.xleft,
      params.ytop,
      height
    ),
    { stdout: workPath("crop.hdr") }
  );
  advance();

  let next = "crop.hdr";

  // The resolution the .cal files will be applied at. The geometric ones are
  // checked against this, so it has to follow the resize.
  let workingWidth = params.diameter;
  let workingHeight = params.diameter;

  // ---- resize, only when the mask is larger than the target --------------
  if (params.diameter > 1000) {
    step("resize", "Resizing HDR image");
    await run(
      runner,
      "pfilt",
      resizeArgs(workPath(next), params.xdim, params.ydim),
      {
        stdout: workPath("resize.hdr"),
      }
    );
    next = "resize.hdr";
    workingWidth = params.xdim;
    workingHeight = params.ydim;
  }
  checkStop();

  // ---- the four .cal corrections, each applied only when supplied --------
  const corrections: Correction[] = [
    {
      // Only the two geometric files are resolution-checked: a photometric
      // factor or a neutral density transmittance has no pixel coordinates to
      // get wrong.
      cal: params.fisheyeCorrectionCal,
      checkResolution: "fisheye",
      message: "Applying projection adjustment",
      output: "projection_adjustment.hdr",
      step: "projection_adjustment",
      suppressHeader: false,
    },
    {
      cal: params.vignettingCorrectionCal,
      checkResolution: "vignetting",
      message: "Applying vignetting correction",
      output: "vignetting_correction.hdr",
      step: "vignetting_correction",
      suppressHeader: false,
    },
    {
      cal: params.neutralDensityCal,
      checkResolution: null,
      message: "Applying neutral density correction",
      output: "neutral_density.hdr",
      step: "neutral_density",
      suppressHeader: false,
    },
    {
      cal: params.photometricAdjustmentCal,
      checkResolution: null,
      message: "Applying photometric adjustment",
      output: "photometric_adjustment.hdr",
      step: "photometric_adjustment",
      suppressHeader: true,
    },
  ];

  for (const correction of corrections) {
    if (correction.cal === "") {
      continue;
    }
    step(correction.step, correction.message);

    if (correction.checkResolution) {
      // biome-ignore lint/performance/noAwaitInLoops: this loop is sequential by definition -- each correction consumes the previous one's output, and the check reads the file this iteration is about to apply
      await warnIfResolutionDependent(
        runner,
        emit,
        correction.checkResolution,
        correction.cal,
        workingWidth,
        workingHeight
      );
    }

    const args = correction.suppressHeader
      ? photometricArgs(correction.cal, workPath(next))
      : pcombCalArgs(correction.cal, workPath(next));
    await run(runner, "pcomb", args, { stdout: workPath(correction.output) });
    next = correction.output;
    checkStop();
  }

  // ---- header, then evalglare, then header again -------------------------
  // evalglare reads its view geometry from the header, so the view angles must
  // be written before evalglare runs, not after.
  step("header_editing", "Writing view angles to HDR header");
  await run(
    runner,
    "getinfo",
    headerEditingArgs({
      view: {
        horizontalAngle: params.horizontalAngle,
        projection: params.projection,
        verticalAngle: params.verticalAngle,
      },
    }),
    { stdin: workPath(next), stdout: workPath("header_editing_view.hdr") }
  );
  advance();
  checkStop();

  step("evalglare", "Evaluating glare");
  const computedVerticalIlluminance = await runEvalglare(runner, params);
  advance();
  checkStop();

  reportValidity(
    emit,
    computedVerticalIlluminance,
    params.measuredVerticalIlluminance
  );

  step("header_editing", "Writing results to HDR header");
  await run(
    runner,
    "getinfo",
    headerEditingArgs({
      evalglareValue: computedVerticalIlluminance,
      measuredIlluminance:
        params.measuredVerticalIlluminance === null ||
        params.measuredVerticalIlluminance === undefined
          ? undefined
          : String(params.measuredVerticalIlluminance),
    }),
    {
      stdin: workPath("header_editing_view.hdr"),
      stdout: workPath("header_editing.hdr"),
    }
  );
  advance();

  // ---- false colour ------------------------------------------------------
  step("falsecolor", "Generating false colour image");
  await run(
    runner,
    "falsecolor",
    falsecolorArgs(
      {
        legendHeight: params.legendHeight,
        legendWidth: params.legendWidth,
        scaleLabel: params.scaleLabel,
        scaleLevels: params.scaleLevels,
        scaleLimit: params.scaleLimit,
      },
      workPath("header_editing.hdr")
    ),
    { stdout: workPath("falsecolor.hdr") }
  );
  advance();

  emit({
    kind: "done",
    message: "Pipeline complete",
    progress: 100,
    step: null,
  });

  return {
    computedVerticalIlluminance,
    falsecolorPath: workPath("falsecolor.hdr"),
    outputPath: workPath("header_editing.hdr"),
  };
}

function validate(params: PipelineParams): void {
  if (params.inputImages.length === 0) {
    throw new PipelineError({
      field: "inputImages",
      kind: "invalid_input",
      value: "empty",
    });
  }
  if (
    !(SUPPORTED_PROJECTIONS as readonly string[]).includes(params.projection)
  ) {
    throw new PipelineError({
      field: "projection",
      kind: "invalid_input",
      value: params.projection,
    });
  }
}

/**
 * Converts RAW inputs and picks the response function.
 *
 * RAW is already linear, so a square response is a better assumption than one
 * recovered from the bracket. Non-RAW input keeps whatever the caller supplied,
 * including the empty string, which lets hdrgen recover the curve itself -- the
 * JPEG workflow real users rely on.
 */
async function prepareInputs(
  runner: ToolRunner,
  params: PipelineParams
): Promise<{ images: string[]; responseFunction: string }> {
  if (!params.inputImages.some(isRawImage)) {
    return {
      images: params.inputImages,
      responseFunction: params.responseFunction,
    };
  }

  // Sequential rather than concurrent: each conversion holds a full frame, and
  // the whole point of a fresh module instance per call is that memory is
  // reclaimed between them.
  const converted: string[] = [];
  let index = 0;
  for (const image of params.inputImages) {
    index += 1;
    const output = workPath(`input${index}.tiff`);
    // biome-ignore lint/performance/noAwaitInLoops: each conversion holds a full frame; running them one at a time is what lets each module instance be discarded and its memory reclaimed
    await run(runner, "dcraw_emu", dcrawArgs(image, output));
    converted.push(output);
  }

  const responsePath = workPath("sqr.rsp");
  await runner.writeFile(responsePath, SQUARE_RESPONSE);
  return { images: converted, responseFunction: responsePath };
}

/**
 * `evalglare -V` exits 1 by design: it prints the vertical illuminance and
 * quits. `pipeline/evalglare.rs` accounts for this by treating a nonzero exit
 * with non-empty stdout as success, and so does this. An orchestrator that
 * simply threw on a nonzero code would consider every evalglare run a failure,
 * and the value becomes COMPUTED_VERTICAL_ILLUMINANCE in the finished picture.
 */
async function runEvalglare(
  runner: ToolRunner,
  params: PipelineParams
): Promise<string> {
  const args = evalglareArgs(
    workPath("header_editing_view.hdr"),
    params.projection,
    params.verticalAngle,
    params.horizontalAngle
  );
  const result = await runner.run("evalglare", args, { captureStdout: true });

  if (result.stdout.trim() !== "") {
    return result.stdout.trim();
  }
  throw new PipelineError({
    args,
    code: result.code,
    kind: "command",
    stderr: result.stderr,
    tool: "evalglare",
  });
}

/**
 * Warns when a geometry-dependent .cal file cannot adapt to the resolution it
 * is about to be applied at.
 *
 * Advisory only, exactly as in Rust: a hardcoded file may well match, so this
 * never fails the run. It does not throw even when the file cannot be read --
 * the correction stage that follows will fail on its own if the path is truly
 * bad, and reporting the read failure here is more useful than pre-empting it.
 */
async function warnIfResolutionDependent(
  runner: ToolRunner,
  emit: StatusEmitter,
  label: string,
  calPath: string,
  width: number,
  height: number
): Promise<void> {
  let text: string;
  try {
    text = new TextDecoder().decode(await runner.readFile(calPath));
  } catch (error) {
    emit({
      kind: "warning",
      message: `Could not read the ${label} calibration file ${calPath}: ${error}`,
      progress: null,
      step: "cal_check",
    });
    return;
  }

  const constants = resolutionDependentConstants(text);
  if (constants === null) {
    return;
  }
  emit({
    kind: "warning",
    message: calWarning(label, calPath, width, height, constants),
    progress: null,
    step: "cal_check",
  });
}

/**
 * Compares the HDR-derived vertical illuminance against a measured one.
 *
 * A pass is reported as a `step` rather than a `warning`, so a good result is
 * not shown to the operator as though something were wrong.
 */
function reportValidity(
  emit: StatusEmitter,
  rawEvalglareValue: string,
  measured: number | null | undefined
): void {
  if (measured === null || measured === undefined) {
    return;
  }

  const trimmed = rawEvalglareValue.trim();
  const evHdr = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(evHdr)) {
    emit({
      kind: "warning",
      message:
        `Could not read a vertical illuminance from evalglare output ${JSON.stringify(trimmed)}; ` +
        "the validity check was skipped.",
      progress: null,
      step: "validity_check",
    });
    return;
  }

  const outcome = evaluateValidity(evHdr, measured);
  if (!outcome) {
    return;
  }
  emit({
    kind: outcome.kind === "pass" ? "step" : "warning",
    message: validityMessage(outcome, evHdr, measured),
    progress: null,
    step: "validity_check",
  });
}

async function run(
  runner: ToolRunner,
  tool: string,
  args: string[],
  io?: ToolIo
): Promise<ToolResult> {
  const result = await runner.run(tool, args, io);
  if (result.code !== 0) {
    throw new PipelineError({
      args,
      code: result.code,
      kind: "command",
      stderr: result.stderr,
      tool,
    });
  }
  return result;
}
