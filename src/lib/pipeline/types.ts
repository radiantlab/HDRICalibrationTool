/**
 * Types for the WebAssembly pipeline.
 *
 * This module and its siblings are a port of `src-tauri/src/pipeline.rs` and
 * `src-tauri/src/pipeline/*.rs` to TypeScript, so the same pipeline can run in
 * the Tauri webview and in a browser with no tools installed.
 *
 * Two rules hold for everything under `src/lib/pipeline/`:
 *
 *  1. **No `@tauri-apps/*` imports.** The point of the port is code that runs
 *     unchanged in both hosts. A Tauri import here would defeat it, and is the
 *     easiest way to break the existing app by accident.
 *  2. **No `node:path` or `fs`.** `next.config.js` aliases `path` to
 *     `path-browserify` and stubs `fs` for `tiff.js` compatibility, so both
 *     resolve to something surprising. Paths here are plain strings under a
 *     virtual `/work` prefix.
 *
 * Nothing imports this module yet. Wiring it into the UI is #232/#233; until
 * then the Rust pipeline remains the only one the app uses.
 *
 * See radiantlab/HDRICalibrationTool#231.
 */

/** Where a tool's stdin comes from and where its stdout goes. */
export interface ToolIo {
  /** Return stdout to the caller instead of writing it to a file. */
  captureStdout?: boolean;
  /** Read stdin from this file in the virtual filesystem. */
  stdin?: string;
  /** Write stdout to this file. Mutually exclusive with `captureStdout`. */
  stdout?: string;
}

export interface ToolResult {
  /** Process exit code. Note `evalglare -V` exits 1 on success -- see below. */
  code: number;
  stderr: string;
  /** Present when `captureStdout` was set. */
  stdout: string;
}

/**
 * The seam that replaces `CommandSpec` / `run_with_io` from the Rust pipeline.
 *
 * One implementation instantiates an Emscripten module per call, stages inputs
 * into its filesystem and calls `callMain`. Another can shell out to native
 * binaries, which is what makes the orchestrator testable without any wasm.
 *
 * Implementations are expected to run each invocation in a **fresh module
 * instance**: `-sEXIT_RUNTIME=1` means one `main()` per instance, and a fresh
 * instance per stage is also what reclaims memory between stages.
 */
export interface ToolRunner {
  exists: (path: string) => Promise<boolean>;
  readFile: (path: string) => Promise<Uint8Array>;
  /**
   * Discards files the pipeline will not read again.
   *
   * Optional because it is an optimisation: an implementation that ignores it
   * is still correct, just heavier. It exists because the RAW path is the one
   * place the working set is large enough to matter. Converting a 10-frame CR2
   * bracket produces ten 67 MB TIFFs, and once `hdrgen` has merged them
   * neither they nor the ten source files are named by any later stage --
   * about 900 MB of a ~1.1 GB peak, held to the end of the run for nothing.
   *
   * Releasing a path that is still needed is a bug in the caller, not
   * something implementations defend against, so it is called only where the
   * orchestrator can name the files it consumed.
   */
  release?: (paths: string[]) => void;
  run: (tool: string, args: string[], io?: ToolIo) => Promise<ToolResult>;
  /** Write a file into the virtual filesystem shared with `run`. */
  writeFile: (path: string, data: Uint8Array | string) => Promise<void>;
}

/**
 * Mirrors the `PipelineError` enum in `pipeline.rs`.
 *
 * `kind` is the serde tag, so these values match what the Rust pipeline
 * already sends and what the frontend already handles.
 */
export type PipelineErrorKind =
  | {
      kind: "command";
      tool: string;
      args: string[];
      code: number;
      stderr: string;
    }
  | { kind: "invalid_input"; field: string; value: string }
  | { kind: "processing"; message: string };

export class PipelineError extends Error {
  readonly detail: PipelineErrorKind;

  constructor(detail: PipelineErrorKind) {
    super(describeError(detail));
    this.name = "PipelineError";
    this.detail = detail;
  }
}

function describeError(detail: PipelineErrorKind): string {
  switch (detail.kind) {
    case "command":
      return `${detail.tool} exited ${detail.code}: ${detail.stderr.trim()}`;
    case "invalid_input":
      return `invalid ${detail.field}: ${detail.value}`;
    default:
      return detail.message;
  }
}

/**
 * Mirrors `PipelineStatusPayload` in `pipeline.rs`.
 *
 * **The keys are snake_case deliberately.** `pipeline-status-context.tsx`
 * validates incoming events with a zod schema built around serde's output
 * (`set_index`, `set_total`). Emitting camelCase here would produce a payload
 * that schema silently rejects, so the shape is kept byte-for-byte compatible
 * and the Tauri event emitter is simply replaced by `postMessage`.
 */
export interface PipelineStatusPayload {
  kind: "step" | "progress" | "warning" | "error" | "done";
  message?: string | null;
  progress?: number | null;
  set_index?: number | null;
  set_total?: number | null;
  step?: string | null;
}

export type StatusEmitter = (payload: PipelineStatusPayload) => void;

/**
 * Parameters for one image set.
 *
 * Field-for-field the payload `buildPipelineParams` already produces, minus
 * the four tool paths, which have no meaning when the tools are wasm modules.
 * Dropping those from Settings is the change that actually resolves the
 * "dependencies are hard to set up" complaint (#232).
 */
export interface PipelineParams {
  diameter: number;
  /**
   * Drop source frames that contribute nothing to the merge.
   *
   * JPEG only, and only when the set is not RAW -- the same condition the Rust
   * pipeline applies.
   */
  filterImages?: boolean;
  fisheyeCorrectionCal: string;
  horizontalAngle: number;
  inputImages: string[];
  legendHeight: string;
  legendWidth: string;
  measuredVerticalIlluminance?: number | null;
  neutralDensityCal: string;
  photometricAdjustmentCal: string;
  projection: string;
  responseFunction: string;
  scaleLabel: string;
  scaleLevels: string;
  scaleLimit: string;
  setName: string;
  verticalAngle: number;
  vignettingCorrectionCal: string;
  xdim: number;
  xleft: number;
  ydim: number;
  ytop: number;
}

/** -vta equidistant, -vth orthographic, -vtv non-fisheye (Radiance tutorial 2.5.7). */
export const SUPPORTED_PROJECTIONS = ["vta", "vth", "vtv"] as const;
