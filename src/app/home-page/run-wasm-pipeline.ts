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

import { emitPipelineEvent } from "@/lib/host/events";
import { joinPath, saveOutput } from "@/lib/host/save";
import { readAnyFile } from "@/lib/host-fs-tauri";
import {
  completionMessage,
  outputStem,
  runTimestamp,
} from "@/lib/pipeline/output-naming";
import type {
  PipelineParams,
  PipelineStatusPayload,
} from "@/lib/pipeline/types";
import { PipelineError } from "@/lib/pipeline/types";
import {
  type ExecuteOptions,
  executeInWorker,
  type PipelineRunResult,
} from "./pipeline-worker-client";

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

export type PipelineExecutor = (
  options: ExecuteOptions
) => Promise<PipelineRunResult>;

export interface RunWasmPipelineOptions {
  /**
   * Runs the pipeline. Defaults to a Web Worker.
   *
   * The default matters: `callMain` is synchronous and blocks its thread for a
   * whole tool, so running the pipeline on the main thread froze the page for
   * the length of an hdrgen merge. Tests inject an in-process executor
   * instead, since a worker is exactly what jsdom cannot provide.
   */
  execute?: PipelineExecutor;
  /** Injected in tests; defaults to the real Tauri filesystem. */
  host?: HostFilesystem;
  now?: () => Date;
  params: BuiltPipelineParams;
  /** Returning true stops the run before the next stage starts. */
  shouldStop?: () => boolean;
}

/** The host operations this adapter needs, so tests need no Tauri. */
export interface HostFilesystem {
  emitOutput: (path: string) => Promise<void>;
  emitStatus: (payload: PipelineStatusPayload) => Promise<void>;
  read: (path: string) => Promise<Uint8Array>;
  /** Returns where the output actually went, which a browser decides. */
  save: (
    directory: string,
    name: string,
    data: Uint8Array
  ) => Promise<{ downloaded: boolean; location: string; name: string }>;
}

const tauriHost: HostFilesystem = {
  emitOutput: (path) => {
    emitPipelineEvent("pipeline-output", { path });
    return Promise.resolve();
  },
  // The pipeline runs in the page now, on the same side as the UI listening to
  // it, so these no longer cross a process boundary. The channel is an
  // EventTarget rather than Tauri's event system, which is what makes the
  // status UI work unchanged in a browser.
  emitStatus: (payload) => {
    emitPipelineEvent("pipeline-status", payload);
    return Promise.resolve();
  },
  // Virtual as well as real: a preset's calibration files have no disk entry,
  // so reading them through Tauri's filesystem would fail with ENOENT on a
  // file that is present and correct.
  read: (path) => readAnyFile(path),
  save: (directory, name, data) => saveOutput(directory, name, data),
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
  execute = executeInWorker,
}: RunWasmPipelineOptions): Promise<string[]> {
  const numbers = requireNumbers(params);

  const result = await execute({
    // Deliberately not awaited: a status event is a notification, and making
    // every stage wait on the UI would serialise the run behind rendering.
    onStatus: (payload) => {
      host.emitStatus(payload).catch(() => {
        // A dropped status line must never fail the run that produced it.
      });
    },
    params: { ...params, ...numbers },
    read: (path) => host.read(path),
    shouldStop,
    // Resolved against the document, because a worker's own base URL is the
    // chunk it was loaded from, which is not where the artifacts live.
    wasmBaseUrl: new URL(
      WASM_BASE_URL,
      globalThis.location?.href ?? "http://localhost/"
    ).href,
  });

  const stem = outputStem(params.setName, runTimestamp(now()));
  const written: string[] = [];

  // Only the HDR picture is announced. Rust wrote the false-colour image but
  // never emitted a pipeline-output for it, and the viewer opens the most
  // recently announced output -- so announcing both opened the false-colour
  // one instead of the picture.
  const outputs: [Uint8Array, string, boolean][] = result.outputs.map(
    (output) => [
      output.bytes,
      output.kind === "main" ? `${stem}.hdr` : `${stem}_fc.hdr`,
      output.kind === "main",
    ]
  );

  for (const [bytes, name, announce] of outputs) {
    // biome-ignore lint/performance/noAwaitInLoops: each output is announced only after it has been written, which is what lets a failed set be attributed correctly
    const saved = await host.save(params.outputPath, name, bytes);
    const destination = saved.location;
    if (saved.downloaded) {
      // Said explicitly because a download is invisible: the browser chooses
      // where it lands, and without this the run reports success while the
      // user has no idea whether anything was produced or where it went.
      host
        .emitStatus({
          kind: "step",
          message: `Downloaded ${saved.name} to your browser's downloads folder`,
          progress: null,
          step: "save_output",
        })
        .catch(() => {
          // A dropped status line must never fail the run that produced it.
        });
    }
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

  return written;
}

/** Re-exported: the join moved to `host/save.ts` with the writing. */
export const joinOutputPath = joinPath;
