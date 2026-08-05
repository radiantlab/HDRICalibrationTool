/**
 * Port of `pipeline.rs::pipeline` / `process_image_set`.
 *
 * Runs one image set. Batching and cancellation deliberately stay where they
 * already are, in `src/app/pipeline/page.tsx`: the Rust command handles a
 * single set too, and never populates `set_index` / `set_total`. Moving the
 * batch loop in here would duplicate behaviour the app already has.
 *
 * Everything reaches the outside world through a `ToolRunner`, which is what
 * lets the whole sequence be tested without wasm, binaries or a filesystem.
 */

import { falsecolor } from "./falsecolor";
import { type DecodeImage, filterImages } from "./filter-images";
import {
  cropArgs,
  dcrawArgs,
  evalglareArgs,
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
  /**
   * Converts one RAW file to TIFF, if the host has a shared way to do it.
   *
   * Optional, and this module runs `dcraw_emu` itself when it is absent, so
   * nothing here depends on the host having a cache. What it buys when present
   * is that the app's thumbnail strip has usually already converted every
   * frame in the set -- `image-set-preview.tsx` renders one per file -- and
   * without this the merge would convert all of them a second time, ~20 s and
   * 673 MB of repetition on a 10-frame CR2 bracket. See #242.
   *
   * The result must be byte-identical to running `dcrawArgs` here, because it
   * is what hdrgen merges and therefore what the measurement is made of.
   */
  convertRaw?: (path: string) => Promise<Uint8Array>;
  /**
   * Decodes a JPEG to RGBA. Required only when `filterImages` is set, since
   * that is the one stage needing pixels rather than a wasm tool. Injected so
   * this module stays host-agnostic: the app supplies `createImageBitmap`.
   */
  decodeImage?: DecodeImage;
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
  decodeImage,
  convertRaw,
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
  const { images, responseFunction, consumed } = await prepareInputs(
    runner,
    params,
    emit,
    decodeImage,
    convertRaw
  );
  await run(
    runner,
    "hdrgen",
    hdrgenArgs(images, responseFunction, workPath("merge_exposures.hdr"))
  );
  // Everything the merge read is dead here: no later stage names a source
  // image or a converted TIFF. On the RAW path that is the bulk of the run's
  // memory -- ten source frames plus ten 67 MB intermediates, roughly 900 MB
  // of a ~1.1 GB peak -- and without this it would be held to the end. See
  // #232.
  runner.release?.(consumed);
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
  // falsecolor is a TypeScript reimplementation rather than a wasm tool: the
  // original is a Perl script, so it has no wasm build. It drives
  // pcomb/pcompos/psign/pextrem through this same runner. See #230.
  step("falsecolor", "Generating false colour image");
  await falsecolor(runner, {
    argv: falsecolorArgv(params),
    input: workPath("header_editing.hdr"),
    legendHeight: params.legendHeight,
    legendWidth: params.legendWidth,
    output: workPath("falsecolor.hdr"),
    scaleLabel: params.scaleLabel,
    scaleLevels: params.scaleLevels,
    scaleLimit: params.scaleLimit,
  });
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

/**
 * The argument list falsecolor records in the picture header.
 *
 * Only ever written into the header, but it is what tells whoever opens the
 * file later how it was produced, so it mirrors what the Rust pipeline passed
 * on the command line.
 */
function falsecolorArgv(params: PipelineParams): string[] {
  const argv =
    params.scaleLabel === ""
      ? ["-e"]
      : [
          "-s",
          params.scaleLimit,
          "-l",
          params.scaleLabel,
          "-n",
          params.scaleLevels,
          "-e",
        ];
  const width = Number.parseInt(params.legendWidth.trim(), 10);
  const height = Number.parseInt(params.legendHeight.trim(), 10);
  if (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0
  ) {
    argv.push("-lw", String(width), "-lh", String(height));
  }
  return [...argv, "-i"];
}

/**
 * Drops frames that contribute nothing, when asked and when it is possible.
 *
 * Skipped silently without a decoder rather than failing: filtering is an
 * optimisation, and a run that merges every frame is correct, only slower.
 */
async function maybeFilter(
  params: PipelineParams,
  emit: StatusEmitter,
  decodeImage?: DecodeImage
): Promise<string[]> {
  if (
    !(params.filterImages && decodeImage) ||
    params.inputImages.length === 0
  ) {
    return params.inputImages;
  }

  const before = params.inputImages.length;
  const kept = await filterImages(
    params.inputImages,
    { diameter: params.diameter, xleft: params.xleft, ytop: params.ytop },
    decodeImage
  );
  emit({
    kind: "step",
    message: `Filtering images: kept ${kept.length} of ${before}`,
    progress: null,
    step: "filter_images",
  });
  return kept;
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
  params: PipelineParams,
  emit: StatusEmitter,
  decodeImage?: DecodeImage,
  convertRaw?: (path: string) => Promise<Uint8Array>
): Promise<{
  /** Paths the merge reads and nothing after it does. */
  consumed: string[];
  images: string[];
  responseFunction: string;
}> {
  if (!params.inputImages.some(isRawImage)) {
    const images = await maybeFilter(params, emit, decodeImage);
    // The filtered-out frames are consumed too: they were staged before the
    // run started and the merge never names them, so they would otherwise sit
    // in memory untouched for the whole pipeline.
    return {
      consumed: params.inputImages,
      images,
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
    // Already staged by the host, which had it cached from the thumbnail it
    // drew when the file was added. Converting it again would cost ~2 s a
    // frame for bytes we are holding. See #242.
    // biome-ignore lint/performance/noAwaitInLoops: one frame resident at a time, as below
    if (await runner.exists(output)) {
      converted.push(output);
      continue;
    }
    if (convertRaw) {
      // Staged by reference rather than copied, so a frame the host already
      // converted for its thumbnail costs nothing to reuse here.
      // biome-ignore lint/performance/noAwaitInLoops: same reason as below -- one full frame resident at a time
      await runner.writeFile(output, await convertRaw(image));
    } else {
      await run(runner, "dcraw_emu", dcrawArgs(image, output));
    }
    converted.push(output);
  }

  const responsePath = workPath("sqr.rsp");
  await runner.writeFile(responsePath, SQUARE_RESPONSE);
  // Both halves: the source RAW files, which only dcraw_emu read, and the
  // TIFFs it produced, which only hdrgen reads.
  return {
    consumed: [...params.inputImages, ...converted],
    images: converted,
    responseFunction: responsePath,
  };
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
