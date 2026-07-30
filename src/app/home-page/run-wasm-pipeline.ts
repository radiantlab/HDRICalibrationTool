/**
 * Runs the image pipeline from the desktop app.
 *
 * This is the adapter between the host and `src/lib/pipeline/`, and the only
 * place the two meet. It lives here rather than under `src/lib/pipeline/`
 * deliberately: that directory must not import `@tauri-apps/*`, because the
 * same code has to run in a browser with no Tauri at all.
 *
 * This is now the only pipeline. It ran alongside the Rust one until both were
 * compared on the reference JPEG and CR2 brackets (#231, #237); the Rust one
 * was removed at #233.
 */

import { emit } from "@tauri-apps/api/event";
import { readAnyFile, writeRealFile } from "@/lib/host-fs-tauri";
import type { DecodedImage } from "@/lib/pipeline/filter-images";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import {
  completionMessage,
  outputStem,
  runTimestamp,
} from "@/lib/pipeline/output-naming";
import type {
  PipelineParams,
  PipelineStatusPayload,
  ToolRunner,
} from "@/lib/pipeline/types";
import { PipelineError } from "@/lib/pipeline/types";
import { urlModuleLoader, WasmToolRunner } from "@/lib/pipeline/wasm-runner";
import { tauriRawIo } from "@/lib/raw-io-tauri";
import { rawToTiff } from "@/lib/raw-preview";

/** A trailing slash or backslash on the output directory. */
const TRAILING_SEPARATOR = /[\\/]+$/;

/** Where the browser builds are served from. See `public/wasm/README.md`. */
const WASM_BASE_URL = "/wasm";

/** The numeric fields the form can leave empty. */
type RequiredNumericField =
  | "diameter"
  | "horizontalAngle"
  | "verticalAngle"
  | "xdim"
  | "xleft"
  | "ydim"
  | "ytop";

export interface BuiltPipelineParams
  extends Omit<PipelineParams, RequiredNumericField> {
  /**
   * Nullable because the form's numeric inputs are, until they are filled in.
   * The Rust command takes f64 and would fail on a null just as surely; the
   * difference is that this fails with the field name attached, so the message
   * says which box to go and fill.
   */
  diameter: number | null;
  filterImages?: boolean;
  horizontalAngle: number | null;
  outputPath: string;
  verticalAngle: number | null;
  xdim: number | null;
  xleft: number | null;
  ydim: number | null;
  ytop: number | null;
}

const REQUIRED_NUMERIC_FIELDS: RequiredNumericField[] = [
  "diameter",
  "horizontalAngle",
  "verticalAngle",
  "xdim",
  "xleft",
  "ydim",
  "ytop",
];

export interface RunWasmPipelineOptions {
  /** Injected in tests; defaults to the real Tauri filesystem. */
  host?: HostFilesystem;
  /**
   * Injected in tests. Module mocking is avoided here because `jest.mock`
   * does not hoist above imports under this project's SWC transform, and
   * because the orchestrator and runner already have their own tests -- this
   * one is about the adapter's contract with the app.
   */
  makeRunner?: () => ToolRunner & { clear?: () => void };
  now?: () => Date;
  params: BuiltPipelineParams;
  run?: typeof runPipeline;
  /** Returning true stops the run before the next stage starts. */
  shouldStop?: () => boolean;
}

/** The host operations this adapter needs, so tests need no Tauri. */
export interface HostFilesystem {
  emitOutput: (path: string) => Promise<void>;
  emitStatus: (payload: PipelineStatusPayload) => Promise<void>;
  read: (path: string) => Promise<Uint8Array>;
  write: (path: string, data: Uint8Array) => Promise<void>;
}

const tauriHost: HostFilesystem = {
  emitOutput: (path) => emit("pipeline-output", { path }),
  // The existing status UI listens for Tauri events, so emitting one here
  // means pipeline-status-context.tsx needs no changes at all: it cannot tell
  // which pipeline produced the event.
  emitStatus: (payload) => emit("pipeline-status", payload),
  // Virtual as well as real: a preset's calibration files have no disk entry,
  // so reading them through Tauri's filesystem would fail with ENOENT on a
  // file that is present and correct.
  read: (path) => readAnyFile(path),
  write: (path, data) => writeRealFile(path, data),
};

/**
 * Narrows the form's nullable numbers to the numbers the pipeline requires.
 *
 * Checked here rather than deep in the pipeline so the failure names the field
 * the user has to go and fill in, instead of surfacing as a NaN in an argument
 * list several stages later.
 */
function requireNumbers(
  params: BuiltPipelineParams
): Record<RequiredNumericField, number> {
  const narrowed = {} as Record<RequiredNumericField, number>;
  for (const field of REQUIRED_NUMERIC_FIELDS) {
    const value = params[field];
    if (value === null || !Number.isFinite(value)) {
      throw new PipelineError({
        field,
        kind: "invalid_input",
        value: String(value),
      });
    }
    narrowed[field] = value;
  }
  return narrowed;
}

/** Files the pipeline reads by path and so must be staged before it starts. */
function referencedFiles(params: BuiltPipelineParams): string[] {
  return [
    ...params.inputImages,
    params.responseFunction,
    params.fisheyeCorrectionCal,
    params.vignettingCorrectionCal,
    params.neutralDensityCal,
    params.photometricAdjustmentCal,
  ].filter((path) => path !== "");
}

/**
 * Runs one image set and writes its two pictures next to the Rust pipeline's.
 *
 * Returns the paths written, in the order the Rust pipeline announces them.
 */
export async function runWasmPipeline({
  params,
  shouldStop,
  host = tauriHost,
  now = () => new Date(),
  makeRunner = () =>
    new WasmToolRunner({ load: urlModuleLoader(WASM_BASE_URL) }),
  run = runPipeline,
}: RunWasmPipelineOptions): Promise<string[]> {
  const runner = makeRunner();
  const numbers = requireNumbers(params);

  // Staged up front rather than lazily: a missing input should fail before any
  // wasm module is instantiated, not eight stages in.
  for (const path of referencedFiles(params)) {
    // biome-ignore lint/performance/noAwaitInLoops: reads are sequential so a missing file fails on its own path rather than inside an aggregate rejection
    await runner.writeFile(path, await host.read(path));
  }

  const result = await run({
    // The thumbnail strip has usually converted every frame in the set
    // already, so this is a cache hit per frame rather than a second pass of
    // dcraw_emu. Same function, same flags, so the bytes hdrgen merges are the
    // bytes the user was shown. See #242.
    convertRaw: (path) => rawToTiff(path, tauriRawIo),
    decodeImage,
    // Deliberately not awaited: a status event is a notification, and making
    // every stage wait on the UI would serialise the run behind rendering.
    emit: (payload) => {
      host.emitStatus(payload).catch(() => {
        // A dropped status line must never fail the run that produced it.
      });
    },
    params: { ...params, ...numbers },
    runner,
    shouldStop,
  });

  const stem = outputStem(params.setName, runTimestamp(now()));
  const written: string[] = [];

  // Only the HDR picture is announced. Rust writes the false-colour image but
  // never emits a pipeline-output for it, and the viewer opens the most
  // recently announced output -- so announcing both opened the false-colour
  // one instead of the picture.
  const outputs: [string, string, boolean][] = [
    [result.outputPath, `${stem}.hdr`, true],
    ...(result.falsecolorPath
      ? ([[result.falsecolorPath, `${stem}_fc.hdr`, false]] as [
          string,
          string,
          boolean,
        ][])
      : []),
  ];

  for (const [source, name, announce] of outputs) {
    const destination = joinOutputPath(params.outputPath, name);
    // biome-ignore lint/performance/noAwaitInLoops: each output is announced only after it is on disk, which is what lets a failed set be attributed correctly
    await host.write(destination, await runner.readFile(source));
    if (announce) {
      // Announced after the write, matching the Rust pipeline: a set that
      // failed has announced no outputs, which is what run history relies on.
      await host.emitOutput(destination);
    }
    written.push(destination);
  }

  await host.emitStatus({
    kind: "done",
    message: completionMessage(params.setName),
    progress: 100,
    step: null,
  });

  // Frees the staged inputs and every intermediate. Without this a batch would
  // accumulate every set's images in JS memory.
  runner.clear?.();

  return written;
}

/**
 * Decodes a JPEG to RGBA using the platform's own decoder.
 *
 * Only the image filter needs pixels; every other stage goes through a wasm
 * tool. `createImageBitmap` hands the work to the browser's decoder rather
 * than shipping one, and `OffscreenCanvas` keeps it off the main thread's
 * rendering path.
 *
 * The bitmap is closed explicitly: a 21-megapixel frame is ~84 MB of RGBA, and
 * eighteen of them held at once would dwarf the pipeline's own working set.
 */
async function decodeImage(path: string): Promise<DecodedImage> {
  const bytes = await tauriHost.read(path);
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(`could not get a 2d context to decode ${path}`);
    }
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { height: bitmap.height, rgba: data, width: bitmap.width };
  } finally {
    bitmap.close();
  }
}

/**
 * Joins an output directory and a filename.
 *
 * `node:path` is not usable here -- next.config.js aliases `path` to
 * path-browserify for tiff.js -- and the separator is whichever the host
 * already used, so a Windows path stays a Windows path.
 */
export function joinOutputPath(directory: string, name: string): string {
  const trimmed = directory.replace(TRAILING_SEPARATOR, "");
  const separator = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${separator}${name}`;
}
